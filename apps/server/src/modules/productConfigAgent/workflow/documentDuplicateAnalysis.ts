import crypto from "node:crypto";

export type DuplicateDocumentCandidate = {
  documentId: number;
  fileName?: string | null;
  fileHash: string;
  filePath?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  blocksId?: number | null;
  blocksJson?: unknown;
  latestExtractionId?: number | null;
  latestExtractionStatus?: string | null;
};

export function calculateDocumentContentHash(blocksJson: unknown): string | null {
  const content = getDocumentBlocksContentText(blocksJson);
  if (!content) return null;
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function getDocumentBlocksContentText(blocksJson: unknown): string {
  if (!blocksJson || typeof blocksJson !== "object") return "";
  const record = blocksJson as any;
  if (typeof record.llm_text === "string" && record.llm_text.trim()) {
    return normalizeText(record.llm_text);
  }
  if (Array.isArray(record.blocks)) {
    return normalizeText(record.blocks.map(blockText).join("\n"));
  }
  return normalizeText(stableStringify(record));
}

export function chooseCanonicalDocument(documents: DuplicateDocumentCandidate[]): DuplicateDocumentCandidate {
  return [...documents].sort((left, right) => {
    const rankDelta = extractionRank(left) - extractionRank(right);
    if (rankDelta !== 0) return rankDelta;
    return Number(left.documentId) - Number(right.documentId);
  })[0];
}

export function buildDuplicateDocumentReport(candidates: DuplicateDocumentCandidate[]) {
  const byFileName = new Map<string, DuplicateDocumentCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.fileName ?? "";
    byFileName.set(key, [...(byFileName.get(key) ?? []), candidate]);
  }
  return [...byFileName.entries()].flatMap(([fileName, documents]) => {
    const byContentHash = new Map<string, DuplicateDocumentCandidate[]>();
    for (const document of documents) {
      const hash = calculateDocumentContentHash(document.blocksJson);
      if (!hash) continue;
      byContentHash.set(hash, [...(byContentHash.get(hash) ?? []), document]);
    }
    return [...byContentHash.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([contentHash, group]) => {
        const canonical = chooseCanonicalDocument(group);
        return {
          fileName,
          classification: "same_content",
          canonicalDocumentId: canonical.documentId,
          contentHash,
          documents: group.map(({ blocksJson: _blocksJson, ...document }) => ({ ...document, contentHash })),
          duplicateMappings: group
            .filter((document) => document.documentId !== canonical.documentId)
            .map((document) => ({
              duplicateDocumentId: document.documentId,
              canonicalDocumentId: canonical.documentId,
              reason: "same_file_name_same_content",
              contentHash,
            })),
        };
      });
  });
}

function extractionRank(document: DuplicateDocumentCandidate): number {
  if (document.latestExtractionStatus === "normalized") return 0;
  if (document.latestExtractionId) return 1;
  return 2;
}

function blockText(block: any): string {
  const source = block?.source && typeof block.source === "object" ? block.source : {};
  return [source.sheet_name ?? source.sheetName ?? "", source.row ?? "", block?.text ?? block?.raw_text ?? ""]
    .map((item) => String(item ?? ""))
    .join("\t");
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
