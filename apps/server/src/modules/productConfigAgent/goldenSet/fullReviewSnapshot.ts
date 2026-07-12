import { canonicalFullReviewEvidenceHash, FULL_REVIEW_SCHEMA_VERSION, type FullReviewPacket } from "./fullReview.model.js";
import { sha256Text } from "./model.js";

type V1Packet = {
  sample_id: string;
  source?: { document_id?: unknown };
  prediction?: Record<string, unknown>;
};

type DocumentBlock = {
  document_id: string;
  blocks_json?: unknown;
  blocksJson?: unknown;
  text?: unknown;
};

const SENSITIVE = /(?:customer|phone|address|price|file_name|客户|电话|地址|价格|文件名)\s*[:：]?\s*[^\r\n]*/giu;

export function splitCohorts(documentIds: string[], seed: string) {
  const ranked = [...documentIds].sort((left, right) => sha256Text(`${seed}:${left}`).localeCompare(sha256Text(`${seed}:${right}`)));
  return new Map(ranked.map((documentId, index) => [documentId, index < 280 ? "calibration" : "acceptance"] as const));
}

export function buildFullReviewSnapshot(v1Packets: V1Packet[], documentBlocks: DocumentBlock[], seed: string) {
  const packetsByDocument = new Map<string, V1Packet[]>();
  for (const packet of v1Packets) {
    const documentId = String(packet.source?.document_id ?? packet.sample_id.split(":")[1] ?? "").trim();
    if (!documentId) throw new Error(`V1 packet is missing document_id: ${packet.sample_id}`);
    packetsByDocument.set(documentId, [...(packetsByDocument.get(documentId) ?? []), packet]);
  }
  const documentIds = [...packetsByDocument.keys()];
  if (documentIds.length !== 400) throw new Error(`Expected 400 unique v1 document IDs, got ${documentIds.length}`);
  const blocksByDocument = new Map(documentBlocks.map((block) => [String(block.document_id), block]));
  const cohorts = splitCohorts(documentIds, seed);
  const packets = documentIds.sort((left, right) => left.localeCompare(right, undefined, { numeric: true })).map((documentId) => {
    const block = blocksByDocument.get(documentId);
    if (!block) throw new Error(`Missing document block for ${documentId}`);
    const evidence = [
      { evidence_id: `block:${documentId}`, content: redact(blockText(block)) },
      ...packetsByDocument.get(documentId)!.sort((left, right) => left.sample_id.localeCompare(right.sample_id)).map((packet) => ({
        evidence_id: `candidate:${packet.sample_id}`,
        content: redact(JSON.stringify(packet.prediction ?? {})),
      })),
    ];
    const fullPacket: FullReviewPacket = {
      schema_version: FULL_REVIEW_SCHEMA_VERSION,
      document_id: documentId,
      cohort: cohorts.get(documentId)!,
      v1_sample_ids: packetsByDocument.get(documentId)!.map((packet) => packet.sample_id).sort(),
      evidence_hash: canonicalFullReviewEvidenceHash(evidence),
      evidence,
    };
    return fullPacket;
  });
  return { schema_version: FULL_REVIEW_SCHEMA_VERSION, seed, packets };
}

function blockText(block: DocumentBlock) {
  if (typeof block.text === "string") return block.text;
  const value = block.blocks_json ?? block.blocksJson;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const object = value as Record<string, unknown>;
  return [object.llm_text, object.text, ...(Array.isArray(object.blocks) ? object.blocks.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return [record.text, record.content, record.value].find((candidate) => typeof candidate === "string") ?? "";
  }) : [])].filter((item): item is string => typeof item === "string").join("\n");
}

function redact(value: string) { return value.replace(SENSITIVE, "[REDACTED]"); }
