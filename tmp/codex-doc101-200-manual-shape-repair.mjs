import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc101_200_manual_shape_repair_20260708";
const manualDocumentIds = [103, 104, 107, 109, 110, 111, 112, 114, 116, 127, 128, 129, 131, 132, 133, 134, 135, 138, 142, 144, 145, 146, 148, 149, 153, 154, 158, 159, 161, 162, 167, 187, 190, 197];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

try {
  const repaired = [];
  for (const documentId of manualDocumentIds) repaired.push(await repairDocument(documentId));

  const refreshRuns = [];
  for (const item of repaired.filter((entry) => entry.createdExtractionResultId)) {
    refreshRuns.push({
      documentId: item.documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(item.documentId), source: reviewedBy }),
    });
  }

  const archiveRuns = [];
  for (const documentId of manualDocumentIds) {
    try {
      const readiness = await productConfigAgentService.checkArchiveReadiness(String(documentId));
      if (!readiness.canArchive) {
        archiveRuns.push({ documentId, skipped: true, readiness });
        continue;
      }
      const detail = await productConfigAgentService.archiveDocument({ documentId: String(documentId), createdBy: reviewedBy });
      archiveRuns.push({ documentId, skipped: false, archiveId: String(detail.id ?? detail.archive?.id), itemCount: Array.isArray(detail.items) ? detail.items.length : null });
    } catch (error) {
      archiveRuns.push({ documentId, skipped: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const checks = await runChecks();
  const report = { reviewedBy, startedAt, repaired, refreshRuns, archiveRuns, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-manual-shape-repair-result.json", json(report));
  console.log(json({
    repaired,
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    archiveRuns,
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

async function repairDocument(documentId) {
  const rows = await prisma.extractionResult.findMany({
    where: { documentId: BigInt(documentId), status: "normalized" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const latest = rows[0];
  const itemSource = rows.find((row) => Array.isArray(row.normalizedExtractionJson?.items) && row.normalizedExtractionJson.items.length > 0);
  if (!latest) throw new Error(`Missing latest extraction for ${documentId}`);
  if (!itemSource) return { documentId, skipped: true, reason: "no_nonempty_item_source", latestExtractionResultId: String(latest.id) };

  const extractionJson = clone(itemSource.extractionJson);
  const root = extractionJson.extraction && typeof extractionJson.extraction === "object"
    ? extractionJson.extraction
    : (extractionJson.extraction = {});
  if (!Array.isArray(root.items) || root.items.length === 0) {
    root.items = Array.isArray(extractionJson.items) ? extractionJson.items : denormalizeItems(itemSource.normalizedExtractionJson.items);
  }
  const latestRoot = latest.extractionJson?.extraction && typeof latest.extractionJson.extraction === "object" ? latest.extractionJson.extraction : latest.extractionJson ?? {};
  root.document_info = {
    ...(latestRoot.document_info && typeof latestRoot.document_info === "object" ? latestRoot.document_info : {}),
    ...(latest.normalizedExtractionJson?.document_info && typeof latest.normalizedExtractionJson.document_info === "object" ? latest.normalizedExtractionJson.document_info : {}),
  };

  const normalized = await normalizeExtractionWithDictionary(extractionJson);
  const created = await prisma.extractionResult.create({
    data: {
      documentId: BigInt(documentId),
      extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals ?? {},
      warnings: [
        ...array(latest.warnings),
        {
          type: "codex_manual_shape_repair",
          source: reviewedBy,
          documentId,
          basedOnExtractionResultId: String(latest.id),
          itemSourceExtractionResultId: String(itemSource.id),
          businessLlmCalled: false,
        },
      ],
      llmPlanJson: {
        source: "codex_manual_blocks_read",
        repair: "restore_nonempty_items_from_prior_extraction",
        businessLlmCalled: false,
        basedOnExtractionResultId: String(latest.id),
        itemSourceExtractionResultId: String(itemSource.id),
      },
      llmModel: "codex-manual-correction",
      promptVersion: "codex-manual-shape-repair-20260708",
      dictionaryVersion: latest.dictionaryVersion,
      status: "normalized",
    },
  });
  await prisma.productDocument.update({
    where: { id: BigInt(documentId) },
    data: { status: "normalized", dictionaryDirty: true },
  });
  return {
    documentId,
    basedOnExtractionResultId: String(latest.id),
    itemSourceExtractionResultId: String(itemSource.id),
    createdExtractionResultId: String(created.id),
    itemCount: normalized.items?.length ?? 0,
  };
}

function denormalizeItems(items) {
  return items.map((item, index) => ({
    item_index: item.item_index ?? index + 1,
    item_name: item.item_name,
    item_quantity: item.item_quantity,
    product_type_hint: item.product_type_hint,
    raw_fields: item.raw_fields ?? Object.entries(item.fields ?? {}).map(([field_name, value]) => ({ field_name, raw_value: value?.raw_value ?? value?.value ?? value })),
  }));
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
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, indexRows, dirtyDocs, dirtyArchives, pendingCandidates, missingArchiveDocs, zeroItemArchives, llmCallsSinceStart };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}
