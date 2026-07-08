import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc101_200_final_pending_20260708";
const rangeDocumentIds = Array.from({ length: 100 }, (_, index) => index + 101);
const candidateIds = [5865, 5867, 5868, 5869, 5870];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const reviews = [
  createTermType(5865, "filter_material_heat_treatment", "过滤器材质/热处理", "text"),
  createTermType(5867, "back_pressure_valve_config", "可更换倍压阀", "text"),
  createTermType(5868, "temperature_hole_config", "测温孔配置", "text"),
  createTermType(5869, "lower_mold_temperature_hole_distance", "下模测温点距内表面距离", "text"),
  createTermType(5870, "plug_connection_requirement", "接插接要求", "text"),
];

try {
  const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
  const affectedInRange = [...new Set((governanceResult.affectedDocumentIds ?? []).map(Number).filter((id) => id >= 101 && id <= 200))].sort((a, b) => a - b);
  const refreshRuns = [];
  for (const documentId of affectedInRange) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }
  const checks = await runChecks();
  const report = { reviewedBy, startedAt, reviews, governanceResult, affectedInRange, refreshRuns, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-final-pending-governance-result.json", json(report));
  console.log(json({
    governance: {
      requestedCount: governanceResult.requestedCount,
      successCount: governanceResult.successCount,
      failedCount: governanceResult.failedCount,
      failures: governanceResult.results.filter((item) => !item.success),
      affectedInRange,
    },
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    checks: {
      duplicateArchiveCount: checks.duplicateArchives.length,
      uniqueIndexPresent: checks.uniqueIndexPresent,
      dirtyDocs: checks.dirtyDocs,
      dirtyArchives: checks.dirtyArchives,
      pendingCandidates: checks.pendingCandidates,
      llmCallsSinceStart: checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

function createTermType(candidateId, targetTermType, canonicalValue, kind) {
  return { candidateId, action: "create-term-type", candidateType: "term_type", targetTermType, canonicalValue, kind };
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
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, indexRows, dirtyDocs, dirtyArchives, pendingCandidates, llmCallsSinceStart };
}
