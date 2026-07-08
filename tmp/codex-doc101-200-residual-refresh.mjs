import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const source = "codex_doc101_200_residual_refresh_20260708";
const rangeDocumentIds = Array.from({ length: 100 }, (_, index) => index + 101);
const residualDocumentIds = [106, 127, 129, 131, 132, 135, 144, 147, 149, 150, 153, 156, 158, 159, 161, 162, 164, 167, 170, 187, 192, 197];
const archiveCheckDocumentIds = [133, 134, 142];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

try {
  const refreshRuns = [];
  for (const documentId of residualDocumentIds) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({
        documentId: String(documentId),
        source,
      }),
    });
  }

  const readiness = [];
  for (const documentId of archiveCheckDocumentIds) {
    try {
      readiness.push({ documentId, result: await productConfigAgentService.checkArchiveReadiness(String(documentId)) });
    } catch (error) {
      readiness.push({ documentId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const checks = await runChecks();
  const report = { source, startedAt, residualDocumentIds, refreshRuns, readiness, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-residual-refresh-result.json", json(report));
  console.log(json({
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    readiness,
    checks: {
      duplicateArchiveCount: checks.duplicateArchives.length,
      uniqueIndexPresent: checks.uniqueIndexPresent,
      dirtyDocs: checks.dirtyDocs,
      dirtyArchives: checks.dirtyArchives,
      pendingCandidates: checks.pendingCandidates,
      archiveItemCounts: checks.archiveItemCounts,
      llmCallsSinceStart: checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

async function runChecks() {
  const duplicateArchives = await prisma.$queryRawUnsafe(`
    select document_id, count(*)::int as count
    from production_config_agent.contract_archives
    where document_id is not null
    group by document_id
    having count(*) > 1
    order by document_id
  `);
  const indexRows = await prisma.$queryRawUnsafe(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: rangeDocumentIds.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: rangeDocumentIds.map(BigInt) }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { in: rangeDocumentIds.map(BigInt) }, status: "pending" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const archiveItemCounts = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: rangeDocumentIds.map(BigInt) } },
    _count: { _all: true },
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return {
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    archiveItemCounts,
    llmCallsSinceStart,
  };
}
