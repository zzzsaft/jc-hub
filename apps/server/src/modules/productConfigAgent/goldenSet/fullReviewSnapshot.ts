import fs from "node:fs";
import path from "node:path";
import { canonicalFullReviewEvidenceHash, FULL_REVIEW_SCHEMA_VERSION, type FullReviewPacket } from "./fullReview.model.js";
import { sha256File, sha256Text } from "./model.js";

export type CandidateEvidence = { evidence_id: string; content: string };

type DocumentBlock = {
  document_id: string;
  blocks_json?: unknown;
  blocksJson?: unknown;
  text?: unknown;
};

const SENSITIVE = /(?:customer|phone|address|price|file_name|file path|客户|联系人|电话|手机|地址|价格|文件名|路径)\s*[:：]?\s*[^\r\n]*/giu;

export function splitCohorts(documentIds: string[], seed: string) {
  const ranked = [...documentIds].sort((left, right) => sha256Text(`${seed}:${left}`).localeCompare(sha256Text(`${seed}:${right}`)));
  return new Map(ranked.map((documentId, index) => [documentId, index < 280 ? "calibration" : "acceptance"] as const));
}

export function verifyV1ArtifactSeal(directory: string) {
  const sealPath = path.join(directory, "artifact-seal.json");
  if (!fs.existsSync(sealPath)) throw new Error(`Missing v1 artifact seal: ${sealPath}`);
  const seal = JSON.parse(fs.readFileSync(sealPath, "utf8")) as { artifacts?: Record<string, { sha256?: string; bytes?: number }> };
  if (!seal.artifacts || typeof seal.artifacts !== "object") throw new Error("Invalid v1 artifact seal");
  for (const [name, expected] of Object.entries(seal.artifacts)) {
    const artifact = path.join(directory, name);
    if (!fs.existsSync(artifact) || sha256File(artifact) !== expected.sha256 || fs.statSync(artifact).size !== expected.bytes) {
      throw new Error(`v1 seal drift: ${name}`);
    }
  }
}

export function assertV2OutputDirWritable(directory: string) {
  if (["packets.json", "manifest.json", "artifact-seal.json"].some((name) => fs.existsSync(path.join(directory, name)))) {
    throw new Error(`Refusing to overwrite sealed v2 artifacts: ${directory}`);
  }
}

export function buildFullReviewSnapshot(documentIds: string[], documentBlocks: DocumentBlock[], candidatesByDocument: Map<string, CandidateEvidence[]>, seed: string) {
  const uniqueDocumentIds = [...new Set(documentIds.map(String))];
  if (uniqueDocumentIds.length !== 400 || uniqueDocumentIds.length !== documentIds.length) throw new Error(`Expected 400 unique v1 document IDs, got ${uniqueDocumentIds.length}`);
  const blocksByDocument = new Map(documentBlocks.map((block) => [String(block.document_id), block]));
  const cohorts = splitCohorts(uniqueDocumentIds, seed);
  const packets = uniqueDocumentIds.sort((left, right) => left.localeCompare(right, undefined, { numeric: true })).map((documentId) => {
    const block = blocksByDocument.get(documentId);
    if (!block) throw new Error(`Missing document block for ${documentId}`);
    const evidence = [
      { evidence_id: `block:${documentId}`, content: redact(blockText(block)) },
      ...(candidatesByDocument.get(documentId) ?? []).map(({ evidence_id, content }) => ({ evidence_id, content: redact(content) })),
    ];
    if (new Set(evidence.map((item) => item.evidence_id)).size !== evidence.length) throw new Error(`Duplicate evidence ID for ${documentId}`);
    const packet: FullReviewPacket = {
      schema_version: FULL_REVIEW_SCHEMA_VERSION,
      document_id: documentId,
      cohort: cohorts.get(documentId)!,
      v1_sample_ids: [`source-metadata:${documentId}`],
      evidence_hash: canonicalFullReviewEvidenceHash(evidence),
      evidence,
    };
    return packet;
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
