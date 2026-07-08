import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const source = "codex_next20_dictionary_governance_20260708";
const baseDocumentIds = Array.from({ length: 20 }, (_, index) => index + 10);
const candidateIds = [497, 498, 3858, 3859, 3860, 3861, 3862, 3863, 3864, 703];

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
  where: { candidateId: { in: candidateIds.map(BigInt) } },
  select: { documentId: true },
});
const dirtyDocs = await prisma.productDocument.findMany({
  where: { dictionaryDirty: true },
  select: { id: true },
});
const documentIds = [
  ...new Set([
    ...baseDocumentIds,
    ...occurrences.map((item) => Number(item.documentId)),
    ...dirtyDocs.map((item) => Number(item.id)).filter((id) => id >= 10 && id <= 60),
  ]),
].sort((a, b) => a - b);

const before = await snapshot(documentIds);
const runs = [];
for (const documentId of documentIds) {
  runs.push({
    documentId,
    result: await productConfigAgentService.runDictionaryDirtyRefresh({
      documentId: String(documentId),
      source,
    }),
  });
}
const after = await snapshot(documentIds);
const checks = await runChecks(documentIds);
const report = { source, documentIds, before, runs, after, checks, businessLlmTokens: 0 };

fs.writeFileSync("tmp/codex-next20-refresh-and-check-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(summarize(report)), null, 2));
await prisma.$disconnect();

async function snapshot(documentIds) {
  const ids = documentIds.map(BigInt);
  const docs = await prisma.productDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, dictionaryDirty: true, fileName: true },
    orderBy: { id: "asc" },
  });
  const extractions = await Promise.all(ids.map((id) => prisma.extractionResult.findFirst({
    where: { documentId: id },
    select: { id: true, documentId: true, promptVersion: true, llmModel: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })));
  const archives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids } },
    select: {
      id: true,
      documentId: true,
      extractionResultId: true,
      status: true,
      dirtyReason: true,
      productNumber: true,
      contractNumber: true,
      customerId: true,
      country: true,
      version: true,
    },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const items = await prisma.contractArchiveItem.findMany({
    where: { documentId: { in: ids } },
    select: { archiveId: true, documentId: true, itemIndex: true, itemName: true, itemQuantity: true, productTypeHint: true },
    orderBy: [{ documentId: "asc" }, { itemIndex: "asc" }],
  });
  return { docs, extractions, archives, items };
}

async function runChecks(documentIds) {
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
    where: { id: { in: documentIds.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: documentIds.map(BigInt) }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) }, status: "pending" },
    select: { id: true, termType: true, rawValue: true, status: true },
  });
  return {
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
  };
}

function summarize(report) {
  return {
    documentIds: report.documentIds,
    refresh: {
      successCount: report.runs.filter((item) => item.result.failedCount === 0).length,
      failures: report.runs.filter((item) => item.result.failedCount > 0).map((item) => ({
        documentId: item.documentId,
        progress: item.result.progress,
      })),
    },
    archives: report.after.archives.map((archive) => ({
      id: archive.id,
      documentId: archive.documentId,
      extractionResultId: archive.extractionResultId,
      productNumber: archive.productNumber,
      contractNumber: archive.contractNumber,
      customerId: archive.customerId,
      country: archive.country,
      dirtyReason: archive.dirtyReason,
      itemCount: report.after.items.filter((item) => String(item.archiveId) === String(archive.id)).length,
    })),
    checks: {
      duplicateArchiveCount: report.checks.duplicateArchives.length,
      uniqueIndexPresent: report.checks.uniqueIndexPresent,
      dirtyDocs: report.checks.dirtyDocs,
      dirtyArchives: report.checks.dirtyArchives,
      pendingCandidates: report.checks.pendingCandidates,
    },
    businessLlmTokens: 0,
  };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
