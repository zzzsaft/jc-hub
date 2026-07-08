import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc101_200_residual_candidate_20260708";
const rangeDocumentIds = Array.from({ length: 100 }, (_, index) => index + 101);
const candidateIds = [5839, 5840, 5842, 5855, 5856, 5843, 5859, 5861, 5845, 5846, 5847, 5848, 5849, 5850, 5851, 5852];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const reviews = [
  termAlias(5839, "motor_brand"),
  termAlias(5840, "reducer_brand"),
  createTermType(5842, "connection_method", "连接方式", "text"),
  splitTermType(5855, [{ termType: "product_material", value: "过滤器材质" }, { termType: "heat_treatment_requirement", value: "热处理" }]),
  termAlias(5856, "certification_requirement"),
  createTermType(5843, "hydraulic_cylinder_mounting_method", "油缸安装方式", "text"),
  termAlias(5859, "extruder_count"),
  termAlias(5861, "structure_config"),
  termAlias(5845, "pressure"),
  termAlias(5846, "marking_requirement_note"),
  needsHuman(5847),
  createTermType(5848, "seal_requirement", "密封要求", "text"),
  termAlias(5849, "reference_product"),
  needsHuman(5850),
  needsHuman(5851),
  needsHuman(5852),
];

try {
  const before = await snapshot("before");
  const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
  const affectedInRange = [...new Set((governanceResult.affectedDocumentIds ?? []).map(Number).filter((id) => id >= 101 && id <= 200))].sort((a, b) => a - b);
  const refreshRuns = [];
  for (const documentId of affectedInRange) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }
  const after = await snapshot("after");
  const checks = await runChecks();
  const report = { reviewedBy, startedAt, reviews, governanceResult, affectedInRange, refreshRuns, before, after, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-residual-candidate-governance-result.json", json(report));
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
      needsHumanReview: checks.needsHumanReview,
      llmCallsSinceStart: checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

function termAlias(candidateId, targetTermType) {
  return { candidateId, action: "approve-as-alias", candidateType: "term_type", targetTermType };
}

function createTermType(candidateId, targetTermType, canonicalValue, kind) {
  return { candidateId, action: "create-term-type", candidateType: "term_type", targetTermType, canonicalValue, kind };
}

function splitTermType(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "term_type", parts };
}

function needsHuman(candidateId) {
  return { candidateId, action: "needs-human-review", candidateType: "term_type" };
}

async function snapshot(label) {
  const candidates = await prisma.dictionaryCandidate.findMany({ where: { id: { in: candidateIds.map(BigInt) } }, orderBy: { id: "asc" } });
  const documents = await prisma.productDocument.findMany({ where: { id: { in: rangeDocumentIds.map(BigInt) } }, select: { id: true, dictionaryDirty: true, status: true }, orderBy: { id: "asc" } });
  const archives = await prisma.contractArchive.findMany({ where: { documentId: { in: rangeDocumentIds.map(BigInt) } }, select: { id: true, documentId: true, dirtyReason: true, extractionResultId: true }, orderBy: [{ documentId: "asc" }, { id: "asc" }] });
  return { label, candidates, documents, archives };
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
  const needsHumanReview = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) }, status: "needs_human_review" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
    orderBy: { id: "asc" },
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, indexRows, dirtyDocs, dirtyArchives, pendingCandidates, needsHumanReview, llmCallsSinceStart };
}
