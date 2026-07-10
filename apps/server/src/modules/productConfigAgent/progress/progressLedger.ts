import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { buildAgentReadyInsertGate, type AgentReadinessLevel, type InsertMode } from "../archive/insertGate.js";

export type ProductConfigProgressTerminalState =
  | "pending_blocks"
  | "pending_extraction"
  | "planned"
  | "needs_reextract"
  | "duplicate_reference"
  | "normalized_empty"
  | "normalized_blocked"
  | "normalized_partial"
  | "normalized_full"
  | "archived";

export type ProductConfigProgressLedgerSourceRow = {
  documentId: number;
  fileName: string | null;
  source: string | null;
  documentStatus: string;
  dictionaryDirty: boolean;
  hasBlocks: boolean;
  parserVersion: string | null;
  latestExtractionId: number | null;
  latestExtractionStatus: string | null;
  latestExtractionPlanJson: unknown;
  latestExtractionPromptVersion: string | null;
  latestExtractionDictionaryVersion: number | null;
  latestExtractionCreatedAt: Date | string | null;
  latestNormalizedExtractionId: number | null;
  latestNormalizedExtractionStatus: string | null;
  latestNormalizedExtractionJson: unknown;
  latestNormalizedDictionaryProposals: unknown;
  latestNormalizedPromptVersion: string | null;
  latestNormalizedDictionaryVersion: number | null;
  latestNormalizedCreatedAt: Date | string | null;
  archiveCount: number;
  archivedCount: number;
  archiveExtractionResultIds: number[];
  latestArchiveId: number | null;
  latestArchiveStatus: string | null;
  latestArchiveDirtyReason: string | null;
  latestArchiveExtractionResultId: number | null;
  duplicateCount: number;
  canonicalDocumentId: number | null;
  duplicateTypes: string[];
  pendingCandidateOccurrences: number;
  needsHumanReviewCandidateOccurrences: number;
};

type CountMap = Record<string, number>;

export type ProductConfigProgressLedgerRow = {
  documentId: number;
  fileName: string | null;
  source: string | null;
  documentStatus: string;
  dictionaryDirty: boolean;
  stage: string;
  terminalState: ProductConfigProgressTerminalState;
  blockerCodes: string[];
  warningCodes: string[];
  blocks: { exists: boolean; parserVersion: string | null };
  latestExtraction: {
    id: number | null;
    status: string | null;
    promptVersion: string | null;
    dictionaryVersion: number | null;
    createdAt: string | null;
    hasPlan: boolean;
  };
  latestNormalizedExtraction: {
    id: number | null;
    status: string | null;
    promptVersion: string | null;
    dictionaryVersion: number | null;
    createdAt: string | null;
    itemCount: number;
    stale: boolean;
  };
  archive: {
    count: number;
    archivedCount: number;
    latestId: number | null;
    latestStatus: string | null;
    latestDirtyReason: string | null;
    latestExtractionResultId: number | null;
    linkedToLatestNormalized: boolean;
  };
  duplicate: { count: number; canonicalDocumentId: number | null; types: string[] };
  candidates: { pendingOccurrences: number; needsHumanReviewOccurrences: number };
  readiness: {
    insertMode: InsertMode | null;
    level: AgentReadinessLevel | null;
    searchable: boolean;
    similarityReady: boolean;
    quoteReady: boolean;
  };
};

export type ProductConfigProgressBand = {
  band: string;
  startDocumentId: number;
  endDocumentId: number;
  total: number;
  stageCounts: CountMap;
  terminalCounts: CountMap;
  readinessCounts: CountMap;
  blockerCounts: CountMap;
};

export type ProductConfigProgressLedgerReport = {
  generatedAt: string;
  summary: {
    total: number;
    stageCounts: CountMap;
    terminalCounts: CountMap;
    readinessCounts: CountMap;
    blockerCounts: CountMap;
    warningCounts: CountMap;
  };
  bands: ProductConfigProgressBand[];
  ledger: ProductConfigProgressLedgerRow[];
};

export async function buildProductConfigProgressLedger(options: { bandSize?: number } = {}) {
  return buildProductConfigProgressLedgerFromRows(
    { rows: await loadProductConfigProgressLedgerRows() },
    options,
  );
}

export function buildProductConfigProgressLedgerFromRows(
  input: { rows: ProductConfigProgressLedgerSourceRow[]; generatedAt?: Date | string },
  options: { bandSize?: number } = {},
): ProductConfigProgressLedgerReport {
  const bandSize = positiveInteger(options.bandSize, 1000);
  const ledger = input.rows.map(buildLedgerRow).sort((left, right) => left.documentId - right.documentId);
  const grouped = new Map<number, ProductConfigProgressLedgerRow[]>();
  for (const item of ledger) {
    const start = Math.floor(Math.max(0, item.documentId - 1) / bandSize) * bandSize + 1;
    grouped.set(start, [...(grouped.get(start) ?? []), item]);
  }
  const bands = [...grouped.entries()].sort(([left], [right]) => left - right).map(([start, rows]) => ({
    band: `${start}-${start + bandSize - 1}`,
    startDocumentId: start,
    endDocumentId: start + bandSize - 1,
    ...summarizeRows(rows),
  }));
  const counts = summarizeRows(ledger);
  return {
    generatedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
    summary: { ...counts, warningCounts: countMany(ledger.flatMap((item) => item.warningCodes)) },
    bands,
    ledger,
  };
}

function buildLedgerRow(row: ProductConfigProgressLedgerSourceRow): ProductConfigProgressLedgerRow {
  const normalized = objectRecord(row.latestNormalizedExtractionJson);
  const items = Array.isArray(normalized.items) ? normalized.items : [];
  const gate = row.latestNormalizedExtractionId
    ? buildAgentReadyInsertGate({
        normalizedExtractionJson: row.latestNormalizedExtractionJson,
        dictionaryProposals: row.latestNormalizedDictionaryProposals,
      })
    : null;
  const normalizedStale = Boolean(
    row.latestExtractionId &&
    row.latestNormalizedExtractionId &&
    row.latestExtractionId !== row.latestNormalizedExtractionId,
  );
  const archiveLinked = Boolean(
    row.latestNormalizedExtractionId && row.archiveExtractionResultIds.includes(row.latestNormalizedExtractionId),
  );
  const blockerCodes: string[] = [];
  const warningCodes: string[] = [];
  if (!row.hasBlocks) blockerCodes.push("missing_blocks");
  else if (!row.latestExtractionId) blockerCodes.push("missing_extraction");
  if (row.latestExtractionId && !row.latestNormalizedExtractionId) blockerCodes.push("missing_normalized");
  if (normalizedStale) blockerCodes.push("latest_normalized_stale");
  if (row.latestNormalizedExtractionId && items.length === 0) blockerCodes.push("empty_items");
  if (gate && gate.insertability.insertMode === "blocked") {
    blockerCodes.push(...gate.insertability.blockingReasons.map((reason) => reason.type));
  }
  if (row.pendingCandidateOccurrences > 0) blockerCodes.push("pending_candidates");
  if (row.needsHumanReviewCandidateOccurrences > 0) blockerCodes.push("needs_human_review_candidates");
  if (row.dictionaryDirty) blockerCodes.push("dictionary_dirty");
  if ((row.documentStatus === "dictionary_dirty") !== row.dictionaryDirty) {
    warningCodes.push("dictionary_dirty_status_drift");
  }
  if (row.latestArchiveDirtyReason) warningCodes.push("archive_dirty");
  if (row.archiveCount > 0 && !archiveLinked) warningCodes.push("archive_not_latest_normalized");

  const terminalState = terminalStateOf({ row, items, gate, normalizedStale, archiveLinked });
  return {
    documentId: row.documentId,
    fileName: row.fileName,
    source: row.source,
    documentStatus: row.documentStatus,
    dictionaryDirty: row.dictionaryDirty,
    stage: stageOf(terminalState),
    terminalState,
    blockerCodes: unique(blockerCodes),
    warningCodes: unique(warningCodes),
    blocks: { exists: row.hasBlocks, parserVersion: row.parserVersion },
    latestExtraction: {
      id: row.latestExtractionId,
      status: row.latestExtractionStatus,
      promptVersion: row.latestExtractionPromptVersion,
      dictionaryVersion: row.latestExtractionDictionaryVersion,
      createdAt: isoOrNull(row.latestExtractionCreatedAt),
      hasPlan: hasContent(row.latestExtractionPlanJson),
    },
    latestNormalizedExtraction: {
      id: row.latestNormalizedExtractionId,
      status: row.latestNormalizedExtractionStatus,
      promptVersion: row.latestNormalizedPromptVersion,
      dictionaryVersion: row.latestNormalizedDictionaryVersion,
      createdAt: isoOrNull(row.latestNormalizedCreatedAt),
      itemCount: items.length,
      stale: normalizedStale,
    },
    archive: {
      count: row.archiveCount,
      archivedCount: row.archivedCount,
      latestId: row.latestArchiveId,
      latestStatus: row.latestArchiveStatus,
      latestDirtyReason: row.latestArchiveDirtyReason,
      latestExtractionResultId: row.latestArchiveExtractionResultId,
      linkedToLatestNormalized: archiveLinked,
    },
    duplicate: {
      count: row.duplicateCount,
      canonicalDocumentId: row.canonicalDocumentId,
      types: unique(row.duplicateTypes),
    },
    candidates: {
      pendingOccurrences: row.pendingCandidateOccurrences,
      needsHumanReviewOccurrences: row.needsHumanReviewCandidateOccurrences,
    },
    readiness: {
      insertMode: gate?.insertability.insertMode ?? null,
      level: gate?.agentReadiness.level ?? null,
      searchable: gate?.agentReadiness.searchable ?? false,
      similarityReady: gate?.agentReadiness.similarityReady ?? false,
      quoteReady: gate?.agentReadiness.quoteReady ?? false,
    },
  };
}

function terminalStateOf(params: {
  row: ProductConfigProgressLedgerSourceRow;
  items: unknown[];
  gate: ReturnType<typeof buildAgentReadyInsertGate> | null;
  normalizedStale: boolean;
  archiveLinked: boolean;
}): ProductConfigProgressTerminalState {
  const { row, items, gate, normalizedStale, archiveLinked } = params;
  if (row.duplicateCount > 0 && row.canonicalDocumentId) return "duplicate_reference";
  if (!row.hasBlocks) return "pending_blocks";
  if (!row.latestExtractionId) return "pending_extraction";
  if (String(row.latestExtractionStatus ?? "").includes("needs_reextract")) return "needs_reextract";
  if (!row.latestNormalizedExtractionId) {
    return hasContent(row.latestExtractionPlanJson) || row.latestExtractionStatus === "planned"
      ? "planned"
      : "needs_reextract";
  }
  if (normalizedStale) return "needs_reextract";
  if (items.length === 0) return "normalized_empty";
  if (gate?.insertability.insertMode === "blocked") return "normalized_blocked";
  if (row.dictionaryDirty) return "normalized_partial";
  if (
    archiveLinked &&
    row.latestArchiveStatus === "archived" &&
    !row.latestArchiveDirtyReason
  ) return "archived";
  if (
    gate?.insertability.insertMode === "partial_insert" ||
    row.pendingCandidateOccurrences > 0 ||
    row.needsHumanReviewCandidateOccurrences > 0
  ) return "normalized_partial";
  return "normalized_full";
}

function stageOf(state: ProductConfigProgressTerminalState): string {
  if (state === "pending_blocks") return "uploaded";
  if (state === "pending_extraction") return "blocks_ready";
  if (state === "planned") return "planned";
  if (state === "needs_reextract") return "raw_extracted";
  if (state === "duplicate_reference") return "duplicate";
  if (state === "archived") return "archived";
  return "normalized";
}

function summarizeRows(rows: ProductConfigProgressLedgerRow[]) {
  return {
    total: rows.length,
    stageCounts: countMany(rows.map((item) => item.stage)),
    terminalCounts: countMany(rows.map((item) => item.terminalState)),
    readinessCounts: countMany(rows.map((item) => item.readiness.level ?? "not_evaluated")),
    blockerCounts: countMany(rows.flatMap((item) => item.blockerCodes)),
  };
}

function countMany(values: string[]): CountMap {
  return values.reduce<CountMap>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

async function loadProductConfigProgressLedgerRows(): Promise<ProductConfigProgressLedgerSourceRow[]> {
  const [documents, blocks, latestExtractions, latestNormalizedExtractions, archives, duplicates, candidateCounts] = await Promise.all([
    prisma.productDocument.findMany({
      orderBy: { id: "asc" },
      select: { id: true, fileName: true, source: true, status: true, dictionaryDirty: true },
    }),
    prisma.documentBlock.findMany({ select: { documentId: true, parserVersion: true } }),
    latestExtractionRows(false),
    latestExtractionRows(true),
    prisma.contractArchive.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, documentId: true, extractionResultId: true, status: true, dirtyReason: true },
    }),
    prisma.documentDuplicate.findMany({
      orderBy: { duplicateDocumentId: "asc" },
      select: { documentId: true, duplicateDocumentId: true, duplicateType: true },
    }),
    loadOpenCandidateCounts(),
  ]);

  const blockByDocument = new Map(blocks.map((block) => [String(block.documentId), block]));
  const latestByDocument = new Map(latestExtractions.map((item) => [String(item.document_id), item]));
  const normalizedByDocument = new Map(latestNormalizedExtractions.map((item) => [String(item.document_id), item]));
  const archivesByDocument = groupByDocument(archives.filter((item) => item.documentId), (item) => item.documentId!);
  const duplicatesByDocument = groupByDocument(duplicates, (item) => item.documentId);

  return documents.map((document) => {
    const key = String(document.id);
    const block = blockByDocument.get(key);
    const latest = latestByDocument.get(key);
    const normalized = normalizedByDocument.get(key);
    const documentArchives = archivesByDocument.get(key) ?? [];
    const documentDuplicates = duplicatesByDocument.get(key) ?? [];
    const latestArchive = documentArchives[0];
    const candidates = candidateCounts.get(key) ?? { pending: 0, needsHumanReview: 0 };
    return {
      documentId: numberOf(document.id),
      fileName: document.fileName,
      source: document.source,
      documentStatus: document.status,
      dictionaryDirty: document.dictionaryDirty,
      hasBlocks: Boolean(block),
      parserVersion: block?.parserVersion ?? null,
      latestExtractionId: nullableNumber(latest?.id),
      latestExtractionStatus: latest?.status ?? null,
      latestExtractionPlanJson: latest?.llm_plan_json ?? null,
      latestExtractionPromptVersion: latest?.prompt_version ?? null,
      latestExtractionDictionaryVersion: nullableNumber(latest?.dictionary_version),
      latestExtractionCreatedAt: latest?.created_at ?? null,
      latestNormalizedExtractionId: nullableNumber(normalized?.id),
      latestNormalizedExtractionStatus: normalized?.status ?? null,
      latestNormalizedExtractionJson: normalized?.normalized_extraction_json ?? null,
      latestNormalizedDictionaryProposals: normalized?.dictionary_proposals ?? null,
      latestNormalizedPromptVersion: normalized?.prompt_version ?? null,
      latestNormalizedDictionaryVersion: nullableNumber(normalized?.dictionary_version),
      latestNormalizedCreatedAt: normalized?.created_at ?? null,
      archiveCount: documentArchives.length,
      archivedCount: documentArchives.filter((item) => item.status === "archived").length,
      archiveExtractionResultIds: unique(documentArchives.map((item) => nullableNumber(item.extractionResultId)).filter(isNumber)),
      latestArchiveId: nullableNumber(latestArchive?.id),
      latestArchiveStatus: latestArchive?.status ?? null,
      latestArchiveDirtyReason: latestArchive?.dirtyReason ?? null,
      latestArchiveExtractionResultId: nullableNumber(latestArchive?.extractionResultId),
      duplicateCount: documentDuplicates.length,
      canonicalDocumentId: documentDuplicates.length > 0
        ? Math.min(...documentDuplicates.map((item) => numberOf(item.duplicateDocumentId)))
        : null,
      duplicateTypes: unique(documentDuplicates.map((item) => item.duplicateType)),
      pendingCandidateOccurrences: candidates.pending,
      needsHumanReviewCandidateOccurrences: candidates.needsHumanReview,
    };
  });
}

type ExtractionQueryRow = {
  id: bigint;
  document_id: bigint;
  normalized_extraction_json?: unknown;
  dictionary_proposals?: unknown;
  llm_plan_json: unknown;
  prompt_version: string | null;
  dictionary_version: bigint | null;
  status: string;
  created_at: Date;
};

function latestExtractionRows(normalizedOnly: boolean) {
  return prisma.$queryRaw<ExtractionQueryRow[]>(Prisma.sql`
    select distinct on (document_id)
      id,
      document_id,
      ${normalizedOnly ? Prisma.sql`normalized_extraction_json, dictionary_proposals,` : Prisma.empty}
      llm_plan_json,
      prompt_version,
      dictionary_version,
      status,
      created_at
    from production_config_agent.extraction_results
    ${normalizedOnly ? Prisma.sql`where normalized_extraction_json is not null` : Prisma.empty}
    order by document_id, created_at desc, id desc
  `);
}

async function loadOpenCandidateCounts() {
  const [candidates, units] = await Promise.all([
    prisma.dictionaryCandidate.findMany({
      where: { status: { in: ["pending", "needs_human_review"] } },
      select: { id: true, status: true },
    }),
    prisma.dictionaryUnitCandidate.findMany({
      where: { status: { in: ["pending", "needs_human_review"] }, documentId: { not: null } },
      select: { documentId: true, status: true },
    }),
  ]);
  const candidateStatus = new Map(candidates.map((candidate) => [String(candidate.id), candidate.status]));
  const occurrences = candidates.length > 0
    ? await prisma.dictionaryCandidateOccurrence.findMany({
        where: { candidateId: { in: candidates.map((candidate) => candidate.id) } },
        select: { candidateId: true, documentId: true },
      })
    : [];
  const result = new Map<string, { pending: number; needsHumanReview: number }>();
  for (const occurrence of occurrences) {
    addCandidateCount(result, occurrence.documentId, candidateStatus.get(String(occurrence.candidateId)));
  }
  for (const unit of units) addCandidateCount(result, unit.documentId!, unit.status);
  return result;
}

function addCandidateCount(
  counts: Map<string, { pending: number; needsHumanReview: number }>,
  documentId: bigint,
  status?: string,
) {
  const key = String(documentId);
  const current = counts.get(key) ?? { pending: 0, needsHumanReview: 0 };
  if (status === "pending") current.pending += 1;
  if (status === "needs_human_review") current.needsHumanReview += 1;
  counts.set(key, current);
}

function groupByDocument<T>(rows: T[], documentId: (row: T) => bigint) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(documentId(row));
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return String(value).trim().length > 0;
}

function isoOrNull(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function nullableNumber(value: bigint | number | null | undefined): number | null {
  return value === null || value === undefined ? null : numberOf(value);
}

function numberOf(value: bigint | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Unsafe numeric identifier: ${String(value)}`);
  return result;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
