import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc0_100_dictionary_audit_20260708";
const docMin = 0;
const docMax = 100;
const candidateIds = [4400, 4392, 4406, 4452, 4393, 4590, 4591, 4589, 1364, 1363, 1901, 730, 732, 3526, 3628, 2470, 1611, 1531, 1369, 2392, 1970];
const aliasIds = [220, 1173, 104, 1019, 1020, 1021, 1022];

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const startedAt = new Date();
const json = (value) => JSON.stringify(toJson(value), null, 2);

try {
  const documentIds = await loadScopeDocumentIds();
  const dirtyDocumentIds = await loadDirtyDocumentIds(documentIds);
  const refreshDocumentIds = dirtyDocumentIds.length ? dirtyDocumentIds : documentIds;
  console.log(`refreshDocumentIds=${refreshDocumentIds.join(",")}`);

  const refreshRuns = [];
  for (const documentId of refreshDocumentIds) {
    process.stdout.write(`refresh ${documentId} ... `);
    const result = await productConfigAgentService.runDictionaryDirtyRefresh({
      documentId: String(documentId),
      source: reviewedBy,
    });
    console.log(result.failedCount === 0 ? "ok" : `failed ${result.failedCount}`);
    refreshRuns.push({ documentId, result });
  }

  const checks = await runChecks(documentIds, startedAt);
  const report = {
    reviewedBy,
    startedAt,
    refreshDocumentIds,
    refreshRuns,
    checks,
    businessLlmTokens: 0,
  };
  fs.writeFileSync("tmp/codex-doc0-100-dictionary-governance-refresh-postcheck.json", json(report));
  console.log(json(summarize(report)));
} finally {
  await prisma.$disconnect();
}

async function loadScopeDocumentIds() {
  const rows = await prisma.productDocument.findMany({
    where: { id: { gte: BigInt(docMin), lte: BigInt(docMax) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => Number(row.id));
}

async function loadDirtyDocumentIds(documentIds) {
  const rows = await prisma.productDocument.findMany({
    where: { id: { in: documentIds.map(BigInt) }, dictionaryDirty: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => Number(row.id));
}

async function runChecks(documentIds, since) {
  const ids = documentIds.map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) } },
    select: { id: true, termType: true, rawValue: true, status: true, reviewedBy: true, reviewedAt: true },
    orderBy: { id: "asc" },
  });
  const valueAliases = await prisma.dictionaryAlias.findMany({
    where: { id: { in: aliasIds.slice(0, 3).map(BigInt) } },
    select: { id: true, termType: true, termId: true, aliasValue: true, source: true, isActive: true },
    orderBy: { id: "asc" },
  });
  const termTypeAliases = await prisma.dictionaryTermTypeAlias.findMany({
    where: { OR: [{ id: { in: aliasIds.slice(3).map(BigInt) } }, { source: reviewedBy }] },
    select: { id: true, termType: true, aliasValue: true, normalizedAlias: true, source: true, isActive: true },
    orderBy: [{ id: "asc" }],
  });
  const repairedTerms = await prisma.dictionaryTerm.findMany({
    where: {
      OR: [
        { termType: "metering_pump_model", canonicalValue: "JC-90-E" },
        { termType: "upper_choker_bar_angle", canonicalValue: "45°阻流棒" },
        { termType: "upper_lip_adjustment_method", canonicalValue: "手动推式微调" },
      ],
    },
    select: { id: true, termType: true, canonicalValue: true, isActive: true },
    orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
  });
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
    where: { id: { in: ids }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const archiveItemCounts = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: ids } },
    _count: { _all: true },
  });
  const refreshedExtractions = await prisma.extractionResult.findMany({
    where: { documentId: { in: ids }, createdAt: { gte: since } },
    select: { id: true, documentId: true, promptVersion: true, llmModel: true, createdAt: true },
    orderBy: [{ documentId: "asc" }, { createdAt: "desc" }],
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: since } } }).catch(() => null);
  return {
    candidates,
    pendingCandidates: candidates.filter((item) => item.status === "pending"),
    valueAliases,
    repairedTerms,
    termTypeAliases,
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    archiveItemCounts,
    refreshedExtractions,
    llmCallsSinceStart,
  };
}

function summarize(report) {
  return {
    refresh: {
      requestedCount: report.refreshRuns.length,
      successCount: report.refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: report.refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: report.refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    checks: {
      duplicateArchiveCount: report.checks.duplicateArchives.length,
      uniqueIndexPresent: report.checks.uniqueIndexPresent,
      dirtyDocs: report.checks.dirtyDocs,
      dirtyArchives: report.checks.dirtyArchives,
      pendingCandidates: report.checks.pendingCandidates,
      refreshedExtractionCount: report.checks.refreshedExtractions.length,
      llmCallsSinceStart: report.checks.llmCallsSinceStart,
    },
    output: "tmp/codex-doc0-100-dictionary-governance-refresh-postcheck.json",
    businessLlmTokens: 0,
  };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
}
