import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_next20_dictionary_governance_20260708";
const documentIds = Array.from({ length: 20 }, (_, index) => index + 10);
const manualDocumentIds = [16, 24, 29];
const candidateIds = [497, 498, 3858, 3859, 3860, 3861, 3862, 3863, 3864, 703];

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { dictionaryGovernanceService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/governance.service.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");
const { normalizeExtractionWithDictionary } = await import("../apps/server/build/modules/productConfigAgent/normalization/index.js");

const reviews = [
  alias(497, "transmission_system_config", "variable_frequency_motor"),
  alias(498, "transmission_system_brand", "rexnord_changzhou"),
  alias(3858, "transmission_system_config", "gearbox"),
  alias(3859, "application", "soft_opaque_sheet"),
  alias(3860, "application", "rigid_transparent_sheet"),
  alias(3861, "application", "drawn_film"),
  split(3862, [
    { termType: "application", value: "光学级" },
    { termType: "application", value: "片材" },
  ]),
  split(3863, [
    { termType: "application", value: "防静电" },
    { termType: "application", value: "片材" },
  ]),
  alias(3864, "application", "conductive_antistatic"),
  { candidateId: 703, action: "reject", candidateType: "value" },
];

const before = await snapshot("before");
fs.writeFileSync("tmp/codex-next20-governance-before.json", JSON.stringify(toJson(before), null, 2));

const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });

const manualCorrections = [];
for (const documentId of manualDocumentIds) {
  manualCorrections.push(await createManualCorrection(documentId));
}

const refreshDocumentIds = [
  ...new Set([
    ...documentIds,
    ...manualDocumentIds,
    ...(governanceResult.affectedDocumentIds ?? []).map(Number),
  ]),
].sort((a, b) => a - b);

const refreshRuns = [];
for (const documentId of refreshDocumentIds) {
  refreshRuns.push({
    documentId,
    result: await productConfigAgentService.runDictionaryDirtyRefresh({
      documentId: String(documentId),
      source: reviewedBy,
    }),
  });
}

const after = await snapshot("after", refreshDocumentIds);
const checks = await runChecks(refreshDocumentIds);
const report = { reviewedBy, reviews, governanceResult, manualCorrections, refreshDocumentIds, refreshRuns, before, after, checks };
fs.writeFileSync("tmp/codex-next20-governance-and-refresh-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(summarize(report)), null, 2));

await prisma.$disconnect();

function alias(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "value", targetTermType, canonicalValue };
}

function split(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "value", parts };
}

async function createManualCorrection(documentId) {
  const latest = await prisma.extractionResult.findFirst({
    where: { documentId: BigInt(documentId) },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) throw new Error(`Missing extraction for document ${documentId}`);
  const extractionJson = clone(latest.extractionJson);
  const root = extractionJson.extraction && typeof extractionJson.extraction === "object" ? extractionJson.extraction : extractionJson;
  root.document_info = { ...(root.document_info ?? {}), ...manualDocInfo(documentId) };
  if (documentId === 24) {
    const item = (Array.isArray(root.items) ? root.items : []).find((value) => Number(value?.item_index) === 1);
    if (item) {
      item.item_name = {
        value: "1320mm PVC仿结皮发泡板模头",
        evidence: { cell: "B8", text: "PVC仿结皮发泡板模头（产量600KG/每小时）" },
        confidence: 0.95,
      };
      item.item_quantity = {
        value: "1套",
        evidence: { source: "codex_manual_blocks_read", text: "主模头生产明细表单项" },
        confidence: 0.85,
      };
    }
  }
  const normalized = await normalizeExtractionWithDictionary(extractionJson);
  const created = await prisma.extractionResult.create({
    data: {
      documentId: BigInt(documentId),
      extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals ?? {},
      warnings: [
        ...(Array.isArray(latest.warnings) ? latest.warnings : []),
        {
          type: "codex_manual_blocks_correction",
          message: "Codex manually patched fields from document_blocks without business LLM.",
          documentId,
          basedOnExtractionResultId: String(latest.id),
        },
      ],
      llmPlanJson: {
        source: "codex_manual_blocks_read",
        businessLlmCalled: false,
        basedOnExtractionResultId: String(latest.id),
      },
      llmModel: "codex-manual-correction",
      promptVersion: "codex-manual-blocks-correction-20260708",
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
    createdExtractionResultId: String(created.id),
    normalizedDocumentInfo: normalized.document_info ?? {},
    normalizedItems: (normalized.items ?? []).map((item) => ({
      itemIndex: item.item_index,
      itemName: item.item_name,
      itemQuantity: item.item_quantity,
      productType: item.product_type_hint,
    })),
  };
}

function manualDocInfo(documentId) {
  if (documentId === 16) {
    return {
      customer_id: "40218",
      usage_market: "出口使用",
      country: "马其顿",
      contract_number: "7181109",
      product_number: "190465-E",
      order_date: "2019-04-07",
      delivery_date: "2019-05-22",
      contract_delivery_date: "2019-05-22",
    };
  }
  if (documentId === 24) {
    return {
      customer_id: "40223",
      usage_market: "出口使用",
      country: "孟加拉",
      contract_number: "7191007",
      product_number: "191681-E",
      order_date: "2019-11-21",
      delivery_date: "2020-01-04",
      contract_delivery_date: "2020-01-04",
    };
  }
  if (documentId === 29) {
    return {
      customer_id: "40232",
      usage_market: "出口使用",
      contract_number: "7201016",
      product_number: "203131-E",
      order_date: "2020-10-16",
      delivery_date: "2020-12-10",
      contract_delivery_date: "2020-12-10",
    };
  }
  return {};
}

async function snapshot(label, extraDocumentIds = []) {
  const ids = [...new Set([...documentIds, ...manualDocumentIds, ...extraDocumentIds])].map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) } },
    orderBy: { id: "asc" },
  });
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
    where: { candidateId: { in: candidateIds.map(BigInt) } },
    orderBy: [{ candidateId: "asc" }, { documentId: "asc" }, { id: "asc" }],
  });
  const terms = await prisma.dictionaryTerm.findMany({
    where: {
      OR: [
        { canonicalValue: { in: reviews.map((item) => item.canonicalValue).filter(Boolean) } },
        { termType: { in: reviews.map((item) => item.targetTermType).filter(Boolean) } },
      ],
    },
    orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
  });
  const aliases = await prisma.dictionaryAlias.findMany({
    where: {
      aliasValue: { in: candidates.map((item) => item.rawValue) },
    },
    orderBy: [{ termType: "asc" }, { aliasValue: "asc" }],
  });
  const splits = await prisma.dictionarySplit.findMany({
    where: { OR: candidates.map((item) => ({ termType: item.termType, sourceValue: item.rawValue })) },
    orderBy: [{ termType: "asc" }, { sourceValue: "asc" }],
  });
  const documents = await prisma.productDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, dictionaryDirty: true, fileName: true },
    orderBy: { id: "asc" },
  });
  const latestExtractions = await Promise.all(
    ids.map((id) =>
      prisma.extractionResult.findFirst({
        where: { documentId: id },
        select: { id: true, documentId: true, status: true, promptVersion: true, llmModel: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
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
      orderDate: true,
      deliveryDate: true,
      version: true,
    },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const archiveItems = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: ids } },
    _count: { _all: true },
  });
  const version = await prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } });
  return { label, candidates, occurrences, terms, aliases, splits, documents, latestExtractions, archives, archiveItems, version };
}

async function runChecks(ids) {
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
  const targetArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids.map(BigInt) } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const failedRefreshes = await prisma.productDocument.findMany({
    where: { id: { in: ids.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, dictionaryDirty: true, status: true },
    orderBy: { id: "asc" },
  });
  return {
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    targetArchives,
    failedRefreshes,
  };
}

function summarize(report) {
  return {
    reviewedBy,
    governance: {
      requestedCount: report.governanceResult.requestedCount,
      successCount: report.governanceResult.successCount,
      failedCount: report.governanceResult.failedCount,
      affectedDocumentIds: report.governanceResult.affectedDocumentIds,
      failures: report.governanceResult.results.filter((item) => !item.success),
    },
    manualCorrections: report.manualCorrections,
    refresh: {
      documentIds: report.refreshDocumentIds,
      successCount: report.refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: report.refreshRuns
        .filter((item) => item.result.failedCount > 0)
        .map((item) => ({ documentId: item.documentId, result: item.result })),
    },
    candidates: report.after.candidates.map((item) => ({
      id: item.id,
      termType: item.termType,
      rawValue: item.rawValue,
      status: item.status,
      reviewedBy: item.reviewedBy,
    })),
    archives: report.after.archives.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      extractionResultId: item.extractionResultId,
      dirtyReason: item.dirtyReason,
      productNumber: item.productNumber,
      contractNumber: item.contractNumber,
      customerId: item.customerId,
      country: item.country,
      itemCount: report.after.archiveItems.find((group) => String(group.archiveId) === String(item.id))?._count?._all ?? 0,
    })),
    checks: {
      duplicateArchiveCount: report.checks.duplicateArchives.length,
      uniqueIndexPresent: report.checks.uniqueIndexPresent,
      dirtyRefreshLeft: report.checks.failedRefreshes,
    },
    businessLlmTokens: 0,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
