import { pathToFileURL } from "node:url";
import { prisma } from "../../lib/prisma.js";
import {
  buildAgentReadyInsertGate,
  type InsertGateResult,
} from "../archive/insertGate.js";

export type ExtractionToInsertAuditRow = {
  id: bigint | number | string;
  documentId: bigint | number | string;
  normalizedExtractionJson: unknown;
  dictionaryProposals?: unknown;
};

export type ExtractionStatusCount = {
  status: string;
  count: number;
};

export type ExtractionToInsertCoverage = {
  extractionByStatus: ExtractionStatusCount[];
  totalArchives: number;
  sampleNormalized: number;
  sampleNonEmpty: number;
  sampleEmptyItems: number;
  sampleUnarchivedNonEmpty: number;
};

export type ExtractionToInsertGateSummary = {
  sampleSize: number;
  canInsert: number;
  blocked: number;
  full: number;
  partial: number;
  emptyItems: number;
  itemCount: number;
  blockingReasons: Record<string, number>;
  missingForSearch: Record<string, number>;
  missingForSimilarity: Record<string, number>;
  missingForQuote: Record<string, number>;
  unresolvedReasons: Record<string, number>;
  unresolvedFields: Record<string, number>;
  blockedExamples: Array<{
    extractionResultId: string;
    documentId: string;
    itemCount: number;
    reasons: InsertGateResult["insertability"]["blockingReasons"];
    missingForSearch: string[];
  }>;
};

export type ExtractionToInsertAuditReport = ExtractionToInsertCoverage & ExtractionToInsertGateSummary;

export function summarizeExtractionToInsertGateAudit(rows: ExtractionToInsertAuditRow[]): ExtractionToInsertGateSummary {
  const stats: ExtractionToInsertGateSummary = {
    sampleSize: rows.length,
    canInsert: 0,
    blocked: 0,
    full: 0,
    partial: 0,
    emptyItems: 0,
    itemCount: 0,
    blockingReasons: {},
    missingForSearch: {},
    missingForSimilarity: {},
    missingForQuote: {},
    unresolvedReasons: {},
    unresolvedFields: {},
    blockedExamples: [],
  };

  for (const row of rows) {
    const normalized = objectRecord(row.normalizedExtractionJson);
    const items = Array.isArray(normalized.items) ? normalized.items : [];
    stats.itemCount += items.length;
    if (items.length === 0) stats.emptyItems += 1;
    const gate = buildAgentReadyInsertGate({
      normalizedExtractionJson: row.normalizedExtractionJson,
      dictionaryProposals: row.dictionaryProposals,
    });
    if (gate.insertability.canInsert) stats.canInsert += 1;
    else stats.blocked += 1;
    if (gate.insertability.insertMode === "full_insert") stats.full += 1;
    if (gate.insertability.insertMode === "partial_insert") stats.partial += 1;

    for (const blocker of gate.insertability.blockingReasons) {
      increment(stats.blockingReasons, blocker.itemIndex ? `${blocker.type}@item${blocker.itemIndex}` : blocker.type);
    }
    for (const key of gate.agentReadiness.missingForSearch) increment(stats.missingForSearch, key);
    for (const key of gate.agentReadiness.missingForSimilarity) increment(stats.missingForSimilarity, key);
    for (const key of gate.agentReadiness.missingForQuote) increment(stats.missingForQuote, key);
    for (const item of gate.items) {
      for (const field of item.unresolvedFields) {
        increment(stats.unresolvedReasons, String(field.reason ?? "unknown"));
        increment(stats.unresolvedFields, String(field.fieldName ?? field.termType ?? "unknown"));
      }
    }
    if (!gate.insertability.canInsert && stats.blockedExamples.length < 20) {
      stats.blockedExamples.push({
        extractionResultId: String(row.id),
        documentId: String(row.documentId),
        itemCount: items.length,
        reasons: gate.insertability.blockingReasons,
        missingForSearch: gate.agentReadiness.missingForSearch,
      });
    }
  }

  stats.blockingReasons = topCounts(stats.blockingReasons);
  stats.missingForSearch = topCounts(stats.missingForSearch);
  stats.missingForSimilarity = topCounts(stats.missingForSimilarity);
  stats.missingForQuote = topCounts(stats.missingForQuote);
  stats.unresolvedReasons = topCounts(stats.unresolvedReasons);
  stats.unresolvedFields = topCounts(stats.unresolvedFields);
  return stats;
}

export async function buildExtractionToInsertAuditReport(limit = 500): Promise<ExtractionToInsertAuditReport> {
  const take = Math.min(Math.max(1, Math.floor(limit)), 1000);
  const [statusRows, totalArchives, archivePairs, coverageRows, gateRows] = await Promise.all([
    prisma.extractionResult.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.contractArchive.count(),
    prisma.contractArchive.findMany({ select: { documentId: true, extractionResultId: true }, take: 20000 }),
    prisma.extractionResult.findMany({
      where: { status: "normalized" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.max(take, 1000),
      select: { id: true, documentId: true, normalizedExtractionJson: true },
    }),
    prisma.extractionResult.findMany({
      where: { status: "normalized" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, documentId: true, normalizedExtractionJson: true, dictionaryProposals: true },
    }),
  ]);

  const archivedKeys = new Set((archivePairs as any[])
    .map((row) => `${String(row.documentId)}:${String(row.extractionResultId)}`));
  let sampleNonEmpty = 0;
  let sampleEmptyItems = 0;
  let sampleUnarchivedNonEmpty = 0;
  for (const row of coverageRows as any[]) {
    const items = Array.isArray(row.normalizedExtractionJson?.items) ? row.normalizedExtractionJson.items : [];
    if (items.length === 0) {
      sampleEmptyItems += 1;
      continue;
    }
    sampleNonEmpty += 1;
    if (!archivedKeys.has(`${String(row.documentId)}:${String(row.id)}`)) sampleUnarchivedNonEmpty += 1;
  }

  return {
    extractionByStatus: statusRows
      .map((row) => ({ status: row.status, count: row._count._all }))
      .sort((left, right) => left.status.localeCompare(right.status)),
    totalArchives,
    sampleNormalized: coverageRows.length,
    sampleNonEmpty,
    sampleEmptyItems,
    sampleUnarchivedNonEmpty,
    ...summarizeExtractionToInsertGateAudit(gateRows),
  };
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 500;
  const report = await buildExtractionToInsertAuditReport(limit);
  console.log(JSON.stringify(report, null, 2));
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function topCounts(counts: Record<string, number>, limit = 25): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
      .slice(0, limit),
  );
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
