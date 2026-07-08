import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc101_200_governance_20260708";
const manualModel = "codex-manual-correction";
const manualPrompt = "codex-manual-blocks-20260708";
const rangeDocumentIds = Array.from({ length: 100 }, (_, index) => index + 101);
const manualDocumentIds = [103, 104, 107, 109, 110, 111, 112, 114, 116, 127, 128, 129, 131, 132, 133, 134, 135, 138, 142, 144, 145, 146, 148, 149, 153, 154, 158, 159, 161, 162, 167, 187, 190, 197];
const refreshDocumentIds = [103, 104, 105, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117, 120, 121, 123, 124, 126, 128, 133, 134, 138, 142, 145, 146, 148, 154, 155, 160, 163, 166, 168, 172, 175, 179, 180, 182, 190, 191, 195, 199, 200];
const archiveBuildDocumentIds = [115, 121, 123, 126, 133, 134, 142, 180];
const candidateIds = [3878, 3458, 4292, 4293, 4294, 2895, 3879, 3880, 477, 1892, 445, 1893, 1467, 1428, 1487, 449, 3881, 2883, 757, 3882, 3883, 3884, 3885];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(toJson(value), null, 2);

const reviews = [
  alias(3878, "application", "hollow_board"),
  create(3458, "application", "软质透明桌布"),
  split(4292, [{ termType: "application", value: "流延膜" }, { termType: "application", value: "软质透明桌布" }]),
  split(4293, [{ termType: "lip_adjustment_method", value: "upper_manual_push_fine_adjustment" }, { termType: "lip_adjustment_method", value: "lower_integral_structure" }]),
  split(4294, [{ termType: "feed_inlet_method", value: "other_feed_shape_or_position" }, { termType: "feed_inlet_method", value: "center_round_feed" }, { termType: "feed_inlet_position", value: "侧面" }]),
  alias(2895, "plastic_material", "EVA"),
  split(3879, [{ termType: "lip_adjustment_method", value: "force_reduction_push_pull_mechanism" }, { termType: "lip_adjustment_method", value: "removable_fixed_lip" }]),
  alias(3880, "lip_adjustment_method", "manual_push_fine_adjustment"),
  alias(477, "transmission_system_config", "variable_frequency_motor"),
  move(1892, "hydraulic_valve_type", "double_valve"),
  alias(445, "wiring_method", "fully_enclosed_guarded_wiring"),
  reject(1893),
  alias(1467, "plastic_material", "CPP"),
  split(1428, [{ termType: "connection_drawing_status", value: "customer_provided" }, { termType: "connector_quantity", value: "4" }, { termType: "flange_quantity", value: "4" }]),
  split(1487, [{ termType: "heating_method", value: "other" }, { termType: "wiring_method", value: "aviation_plug_adapter" }]),
  create(449, "hydraulic_valve_type", "exhaust_double_valve"),
  alias(3881, "heating_method", "heating_rod"),
  create(2883, "application", "高分子免漆板材"),
  create(757, "precision_grade", "optical_grade"),
  reject(3882),
  split(3883, [{ termType: "application", value: "超高分子" }, { termType: "application", value: "锂离子电池隔离膜" }]),
  split(3884, [{ termType: "feed_inlet_method", value: "center_square_feed" }, { termType: "compatibility_reference", value: "160969" }]),
  split(3885, [{ termType: "feed_inlet_method", value: "center_square_feed" }, { termType: "compatibility_reference", value: "9859" }]),
];

const termTypeAliases = [
  ["出口国家", "country"],
  ["国内使用", "usage_market"],
  ["产品编号", "product_number"],
  ["模头编号", "product_number"],
  ["客户特别备注", "customer_notes"],
];
const unitAliases = [
  ["set", "套", "套"],
  ["piece", "件", "件"],
];

try {
  const before = await snapshot("before", rangeDocumentIds);
  fs.writeFileSync("tmp/codex-doc101-200-before-snapshot.json", json(before));

  const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
  const hygieneResult = await upsertHygiene();
  dictionaryMatcherService.invalidate();

  const manualCorrections = [];
  for (const documentId of manualDocumentIds) {
    manualCorrections.push(await createManualCorrection(documentId));
  }

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

  const archiveBuilds = [];
  for (const documentId of archiveBuildDocumentIds) {
    archiveBuilds.push(await ensureArchive(documentId));
  }

  const after = await snapshot("after", rangeDocumentIds);
  const checks = await runChecks(rangeDocumentIds, candidateIds, startedAt);
  const report = { reviewedBy, startedAt, reviews, termTypeAliases, unitAliases, governanceResult, hygieneResult, manualCorrections, refreshRuns, archiveBuilds, before, after, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc101-200-governance-refresh-result.json", json(report));
  console.log(json(summarize(report)));
} finally {
  await prisma.$disconnect();
}

function alias(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "value", targetTermType, canonicalValue };
}

function create(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "create-value", candidateType: "value", targetTermType, canonicalValue };
}

function move(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "move-to-term-type", candidateType: "value", targetTermType, canonicalValue };
}

function split(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "value", parts };
}

function reject(candidateId) {
  return { candidateId, action: "reject", candidateType: "value" };
}

async function upsertHygiene() {
  const before = {
    termTypeAliases: await prisma.dictionaryTermTypeAlias.findMany({ where: { normalizedAlias: { in: termTypeAliases.map(([aliasValue]) => normalizeAlias(aliasValue)) } } }),
    unitAliases: await prisma.dictionaryUnitAlias.findMany({ where: { normalizedAlias: { in: unitAliases.map(([aliasValue]) => normalizeAlias(aliasValue)) } } }),
  };
  const existingTermTypes = new Set((await prisma.dictionaryTermType.findMany({ select: { termType: true } })).map((item) => item.termType));
  const termAliasRows = [];
  for (const [aliasValue, termType] of termTypeAliases) {
    if (!existingTermTypes.has(termType)) continue;
    termAliasRows.push(await prisma.dictionaryTermTypeAlias.upsert({
      where: { normalizedAlias: normalizeAlias(aliasValue) },
      create: {
        termType,
        aliasValue,
        normalizedAlias: normalizeAlias(aliasValue),
        source: reviewedBy,
        baselineTrustTier: "provisional",
        baselineRiskLabels: [],
      },
      update: { termType, aliasValue, source: reviewedBy, isActive: true, baselineTrustTier: "provisional" },
    }));
  }
  const unitRows = [];
  for (const [aliasValue, canonicalUnit, displayUnit] of unitAliases) {
    unitRows.push(await prisma.dictionaryUnitAlias.upsert({
      where: { normalizedAlias: normalizeAlias(aliasValue) },
      create: { aliasValue, normalizedAlias: normalizeAlias(aliasValue), canonicalUnit, displayUnit, source: reviewedBy },
      update: { aliasValue, canonicalUnit, displayUnit, source: reviewedBy, isActive: true },
    }));
  }
  const after = { termTypeAliases: termAliasRows, unitAliases: unitRows };
  const version = await bumpDictionaryVersion("doc101-200-hygiene", "dictionary_hygiene", after, before);
  return { before, after, version };
}

async function bumpDictionaryVersion(action, entityType, after, before) {
  const version = await prisma.dictionaryVersion.upsert({
    where: { versionKey: "default" },
    create: { versionKey: "default", versionValue: 1, description: "ProductConfigAgent dictionary" },
    update: { versionValue: { increment: 1 } },
  });
  await prisma.dictionaryChangeLog.create({
    data: {
      dictionaryVersion: version.versionValue,
      source: "governance",
      versionKey: version.versionKey,
      versionValue: version.versionValue,
      action,
      entityType,
      entityId: reviewedBy,
      beforeJson: before,
      afterJson: after,
      beforeJsonb: before,
      afterJsonb: after,
      createdBy: reviewedBy,
      changedBy: reviewedBy,
    },
  });
  return Number(version.versionValue);
}

async function createManualCorrection(documentId) {
  const [latest, document, block] = await Promise.all([
    prisma.extractionResult.findFirst({ where: { documentId: BigInt(documentId) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.productDocument.findUnique({ where: { id: BigInt(documentId) } }),
    prisma.documentBlock.findUnique({ where: { documentId: BigInt(documentId) } }),
  ]);
  if (!latest) throw new Error(`Missing extraction for document ${documentId}`);
  if (!document) throw new Error(`Missing document ${documentId}`);
  const content = contentText(block?.blocksJson);
  const extractionJson = clone(latest.extractionJson);
  const root = extractionRoot(extractionJson);
  root.document_info = { ...(root.document_info ?? {}), ...buildManualDocInfo(content, document.fileName ?? "") };
  root.items = patchItems(root.items, latest.normalizedExtractionJson, document.fileName ?? "");
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
          type: "codex_manual_blocks_correction",
          source: "codex_manual_blocks_read",
          documentId,
          basedOnExtractionResultId: String(latest.id),
          businessLlmCalled: false,
        },
      ],
      llmPlanJson: {
        source: "codex_manual_blocks_read",
        businessLlmCalled: false,
        basedOnExtractionResultId: String(latest.id),
      },
      llmModel: manualModel,
      promptVersion: manualPrompt,
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
    documentInfo: normalized.document_info ?? {},
    items: (normalized.items ?? []).map((item) => ({
      itemIndex: item.item_index,
      itemName: item.item_name,
      itemQuantity: item.item_quantity,
      productType: item.product_type_hint,
    })),
  };
}

function buildManualDocInfo(content, fileName) {
  const info = {};
  set(info, "customer_id", match(content, /客户ID(?:号)?[:：]\s*([0-9A-Za-z-]+)/u), "blocks_cell");
  set(info, "contract_number", match(content, /合同编号[:：]\s*([0-9A-Za-z-]+)/u), "blocks_cell");
  set(info, "contract_delivery_date", date(match(content, /合同规定交货日期[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/u)), "blocks_cell");
  set(info, "order_date", date(match(content, /下单日期[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/u)), "blocks_cell");
  set(info, "delivery_date", date(match(content, /交货日期[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/u)), "blocks_cell");
  set(info, "country", cleanCountry(match(content, /国家[（(]\s*([^）)]*?)\s*[）)]/u)), "blocks_cell");
  if (/\[SEL\]\s*出口使用/u.test(content)) set(info, "usage_market", "出口使用", "blocks_cell");
  if (/\[SEL\]\s*国内使用/u.test(content) || /(^|\n)\s*国内使用\s*($|\n)/u.test(content)) set(info, "usage_market", "国内使用", "blocks_cell");
  const productFromBlock = productNumberFromContent(content);
  set(info, "product_number", productFromBlock || productNumberFromFileName(fileName), productFromBlock ? "blocks_cell" : "fileName");
  return info;
}

function patchItems(itemsValue, normalizedValue, fileName) {
  const items = Array.isArray(itemsValue) ? clone(itemsValue) : [];
  const normalizedItems = Array.isArray(normalizedValue?.items) ? normalizedValue.items : [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] && typeof items[index] === "object" ? items[index] : {};
    const normalized = normalizedItems[index] ?? {};
    if (!scalar(item.item_name ?? item.name ?? item.product_name)) {
      const inferredName = firstValue(normalized.fields?.product_name) || inferItemName(fileName, Number(item.item_index ?? index + 1), normalized.product_type_hint);
      if (inferredName) item.item_name = manualValue(inferredName, "codex_inference", `fileName=${fileName}`);
    }
    if (!scalar(item.item_quantity ?? item.quantity)) {
      const inferredQty = firstValue(normalized.fields?.item_quantity) || firstValue(normalized.fields?.filter_quantity) || firstValue(normalized.fields?.pump_quantity) || firstValue(normalized.fields?.feedblock_quantity);
      if (inferredQty) item.item_quantity = manualValue(inferredQty, "blocks_cell", "quantity field in normalized extraction");
    }
    items[index] = item;
  }
  return items;
}

function inferItemName(fileName, itemIndex, productTypeHint) {
  const type = scalar(productTypeHint?.value ?? productTypeHint);
  const afterDate = fileName.replace(/^.*?\d{4}[-年]?\d{1,2}[-月]?\d{1,2}[-日]?[-\s]*/u, "").replace(/\.xls.*$/iu, "");
  if (type === "filter") return afterDate.match(/GD-[A-Z0-9-]+[^及-]*/u)?.[0] ?? "换网器";
  if (type === "feedblock") return itemIndex > 1 ? "分配器" : "分配器";
  if (type === "metering_pump") return afterDate.match(/GD-[A-Z0-9-]+计量泵[^及-]*/u)?.[0] ?? "计量泵";
  if (type === "hydraulic_station") return "液压站";
  if (type === "flat_die") return afterDate.split(/及|配/u)[0] || "模头";
  return afterDate || null;
}

async function ensureArchive(documentId) {
  const existing = await prisma.contractArchive.findFirst({ where: { documentId: BigInt(documentId) } });
  if (existing?.dirtyReason === null) return { documentId, skipped: true, archiveId: String(existing.id) };
  try {
    const detail = await productConfigAgentService.archiveDocument({ documentId: String(documentId), createdBy: reviewedBy });
    return { documentId, skipped: false, archiveId: String(detail.id ?? detail.archive?.id) };
  } catch (error) {
    return { documentId, skipped: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function snapshot(label, documentIds) {
  const ids = documentIds.map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({ where: { id: { in: candidateIds.map(BigInt) } }, orderBy: { id: "asc" } });
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({ where: { candidateId: { in: candidateIds.map(BigInt) } }, orderBy: [{ candidateId: "asc" }, { documentId: "asc" }, { id: "asc" }] });
  const documents = await prisma.productDocument.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, dictionaryDirty: true, fileName: true }, orderBy: { id: "asc" } });
  const latestExtractions = await Promise.all(ids.map((id) => prisma.extractionResult.findFirst({ where: { documentId: id }, select: { id: true, documentId: true, status: true, promptVersion: true, llmModel: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })));
  const archives = await prisma.contractArchive.findMany({ where: { documentId: { in: ids } }, orderBy: [{ documentId: "asc" }, { id: "asc" }] });
  const archiveItems = await prisma.contractArchiveItem.groupBy({ by: ["documentId", "archiveId"], where: { documentId: { in: ids } }, _count: { _all: true } });
  const version = await prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } });
  return { label, candidates, occurrences, documents, latestExtractions, archives, archiveItems, version };
}

async function runChecks(documentIds, candidateIdsValue, since) {
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
    where: { id: { in: candidateIdsValue.map(BigInt) }, status: "pending" },
    select: { id: true, termType: true, rawValue: true, status: true },
    orderBy: { id: "asc" },
  });
  const archiveItemCounts = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: documentIds.map(BigInt) } },
    _count: { _all: true },
  });
  const manualExtractions = await prisma.extractionResult.findMany({
    where: { documentId: { in: documentIds.map(BigInt) }, llmModel: manualModel, createdAt: { gte: since } },
    select: { id: true, documentId: true, promptVersion: true, status: true, createdAt: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const llmCalls = await prisma.llmCallLog.count({ where: { createdAt: { gte: since } } }).catch(() => null);
  return {
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    archiveItemCounts,
    manualExtractions,
    llmCallsSinceStart: llmCalls,
  };
}

function summarize(report) {
  return {
    governance: {
      requestedCount: report.governanceResult.requestedCount,
      successCount: report.governanceResult.successCount,
      failedCount: report.governanceResult.failedCount,
      failures: report.governanceResult.results.filter((item) => !item.success),
      affectedDocumentIds: report.governanceResult.affectedDocumentIds,
    },
    hygiene: {
      termTypeAliasCount: report.hygieneResult.after.termTypeAliases.length,
      unitAliasCount: report.hygieneResult.after.unitAliases.length,
    },
    manualCorrections: report.manualCorrections.map((item) => ({ documentId: item.documentId, createdExtractionResultId: item.createdExtractionResultId })),
    refresh: {
      requestedCount: report.refreshRuns.length,
      successCount: report.refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: report.refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: report.refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    archiveBuilds: report.archiveBuilds,
    checks: {
      duplicateArchiveCount: report.checks.duplicateArchives.length,
      uniqueIndexPresent: report.checks.uniqueIndexPresent,
      dirtyDocs: report.checks.dirtyDocs,
      dirtyArchives: report.checks.dirtyArchives,
      pendingCandidates: report.checks.pendingCandidates,
      manualExtractions: report.checks.manualExtractions,
      llmCallsSinceStart: report.checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  };
}

function contentText(blocksJson) {
  if (blocksJson && typeof blocksJson === "object" && typeof blocksJson.llm_text === "string") return blocksJson.llm_text;
  if (blocksJson && typeof blocksJson === "object" && Array.isArray(blocksJson.blocks)) return blocksJson.blocks.map((block) => String(block?.text ?? block?.raw_text ?? "")).join("\n");
  return JSON.stringify(blocksJson ?? {});
}

function productNumberFromContent(content) {
  const direct = match(content, /(?:模具编号|模头编号|配件编号)[:：]\s*([0-9A-Za-z][0-9A-Za-z\s/&-]*(?:-E)?(?:-[0-9]+)?(?:\s*[\/&]\s*[0-9A-Za-z-]+)*)/u);
  return direct ? direct.replace(/\s*\/\s*/g, " / ").replace(/\s*&\s*/g, " & ").trim() : null;
}

function productNumberFromFileName(fileName) {
  const inside = fileName.match(/[（(]([^）)]*[0-9][^）)]*)[）)]/u)?.[1];
  return inside ? inside.replace(/[、，]/g, " ").replace(/\s+/g, " ").trim() : null;
}

function match(source, pattern) {
  const value = source.match(pattern)?.[1]?.trim();
  return value || null;
}

function date(value) {
  return value ? value.replace(/[/.]/g, "-").replace(/-(\d)(?=-|$)/g, "-0$1") : null;
}

function cleanCountry(value) {
  const cleaned = String(value ?? "").replace(/\s+/g, "").trim();
  return cleaned || null;
}

function set(target, key, value, source) {
  if (value === null || value === undefined || value === "") return;
  target[key] = { value, evidence: { source }, confidence: source === "blocks_cell" ? 0.95 : 0.8 };
}

function manualValue(value, source, text) {
  return { value, evidence: { source, text }, confidence: source === "blocks_cell" ? 0.9 : 0.75 };
}

function extractionRoot(extractionJson) {
  if (!extractionJson.extraction || typeof extractionJson.extraction !== "object") extractionJson.extraction = {};
  return extractionJson.extraction;
}

function firstValue(value) {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (value && typeof value === "object") return scalar(value.value ?? value.raw_value ?? value.rawValue ?? value.raw_text ?? value.rawText);
  return scalar(value);
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return scalar(value.value ?? value.raw_value ?? value.rawValue);
  const text = String(value).trim();
  return text || null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function normalizeAlias(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
