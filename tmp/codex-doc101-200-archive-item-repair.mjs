import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const createdBy = "codex_doc101_200_archive_item_repair_20260708";
const documentIds = [103, 104, 107, 109, 110, 111, 112, 114, 116, 127, 128, 129, 131, 132, 135, 138, 144, 145, 146, 148, 149, 153, 154, 158, 159, 161, 162, 167, 187, 190, 197];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

try {
  const repairs = [];
  for (const documentId of documentIds) {
    try {
      const readiness = await productConfigAgentService.checkArchiveReadiness(String(documentId));
      if (!readiness.canArchive) {
        repairs.push({ documentId, skipped: true, readiness });
        continue;
      }
      const detail = await productConfigAgentService.archiveDocument({ documentId: String(documentId), createdBy });
      repairs.push({ documentId, skipped: false, archiveId: String(detail.id ?? detail.archive?.id), itemCount: Array.isArray(detail.items) ? detail.items.length : null });
    } catch (error) {
      repairs.push({ documentId, skipped: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const checks = await runChecks();
  const report = { createdBy, startedAt, documentIds, repairs, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-archive-item-repair-result.json", json(report));
  console.log(json({
    repairs,
    checks: {
      duplicateArchiveCount: checks.duplicateArchives.length,
      uniqueIndexPresent: checks.uniqueIndexPresent,
      dirtyDocs: checks.dirtyDocs,
      dirtyArchives: checks.dirtyArchives,
      pendingCandidates: checks.pendingCandidates,
      missingArchiveDocs: checks.missingArchiveDocs,
      zeroItemArchives: checks.zeroItemArchives,
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
    where: { id: { gte: 101, lte: 200 }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { gte: 101, lte: 200 }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { gte: 101, lte: 200 }, status: "pending" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const archives = await prisma.$queryRawUnsafe(`
    select ca.document_id, ca.id as archive_id, ca.extraction_result_id, ca.dirty_reason, ca.status, count(cai.id)::int as item_count
    from production_config_agent.contract_archives ca
    left join production_config_agent.contract_archive_items cai on cai.archive_id = ca.id
    where ca.document_id between 101 and 200
    group by ca.document_id, ca.id, ca.extraction_result_id, ca.dirty_reason, ca.status
    order by ca.document_id
  `);
  const missingArchiveDocs = Array.from({ length: 100 }, (_, index) => index + 101).filter((id) => !archives.some((row) => Number(row.document_id) === id));
  const zeroItemArchives = archives.filter((row) => Number(row.item_count) === 0);
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, dirtyDocs, dirtyArchives, pendingCandidates, missingArchiveDocs, zeroItemArchives, llmCallsSinceStart };
}
