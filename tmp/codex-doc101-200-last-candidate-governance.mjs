import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc101_200_last_candidates_20260708";
const rangeDocumentIds = Array.from({ length: 100 }, (_, index) => index + 101);

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const reviews = [
  aliasTermType(5872, "drawing_note", "备注/设计依据"),
  createTermType(5873, "lip_tip_angle", "模唇尖角", "text"),
  aliasTermType(5874, "layer_structure", "面层"),
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
  fs.writeFileSync("tmp/codex-doc101-200-last-candidate-governance-result.json", json(report));
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
      zeroItemArchives: checks.zeroItemArchives,
      missingArchiveDocs: checks.missingArchiveDocs,
      pendingCandidates: checks.pendingCandidates,
      outsideDirtyDocs: checks.outsideDirtyDocs,
      llmCallsSinceStart: checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

function aliasTermType(candidateId, targetTermType, aliasValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "term_type", targetTermType, aliasValue };
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
  const archiveRows = await prisma.$queryRawUnsafe(`
    select a.document_id, count(i.id)::int as item_count
    from production_config_agent.contract_archives a
    left join production_config_agent.contract_archive_items i on i.archive_id = a.id
    where a.document_id = any($1::bigint[])
    group by a.document_id
    order by a.document_id
  `, rangeDocumentIds);
  const archivedIds = new Set(archiveRows.map((row) => Number(row.document_id)));
  const missingArchiveDocs = rangeDocumentIds.filter((id) => !archivedIds.has(id));
  const zeroItemArchives = archiveRows.filter((row) => Number(row.item_count) === 0);
  const outsideDirtyDocs = await prisma.productDocument.findMany({
    where: { id: { notIn: rangeDocumentIds.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, indexRows, dirtyDocs, dirtyArchives, zeroItemArchives, missingArchiveDocs, pendingCandidates, outsideDirtyDocs, llmCallsSinceStart };
}
