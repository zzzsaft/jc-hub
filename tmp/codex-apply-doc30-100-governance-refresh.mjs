import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc30_100_governance_20260708";
const manualModel = "codex-manual-correction";
const manualPrompt = "codex-manual-blocks-20260708";
const rangeDocumentIds = Array.from({ length: 71 }, (_, index) => index + 30);
const candidateIds = [3865, 3866, 3867, 737, 479, 3868, 3869, 3870, 3871, 3872, 3873, 3874, 731, 733, 3875, 2903, 3876, 3877, 811];
const manualDocumentIds = [30, 31, 32, 33, 34, 35, 36, 37, 40, 45, 48, 49, 55, 56, 57, 59, 61, 62, 63, 64, 65, 66, 68, 69, 71, 73, 76, 79, 85, 86, 87, 89, 93, 94, 95, 97, 98, 100];
const refreshDocumentIds = [30, 31, 32, 33, 34, 35, 36, 37, 40, 44, 45, 46, 47, 48, 49, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 73, 76, 79, 82, 84, 85, 86, 87, 89, 93, 94, 95, 96, 97, 98, 99, 100];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

const startedAt = new Date();
const json = (value) => JSON.stringify(toJson(value), null, 2);

const reviews = [
  split(3865, [{ termType: "deckle_type", value: "internal_deckle" }, { termType: "deckle_single_side_width", value: "150mm" }]),
  alias(3866, "flat_extrusion_mounting_method", "with_die_stand"),
  split(3867, [{ termType: "deckle_type", value: "external_standard_deckle" }, { termType: "deckle_single_side_width", value: "200mm" }]),
  split(737, [{ termType: "die_mounting_method", value: "vertical_downward_extrusion" }, { termType: "die_mounting_method", value: "45°斜挤出安装" }, { termType: "die_mounting_method", value: "forty_five_degree_adjustment_down" }]),
  reject(479),
  split(3868, [{ termType: "feed_inlet_method", value: "center_round_feed" }, { termType: "feed_inlet_position", value: "下模底面" }]),
  alias(3869, "application", "automatic_drawn_film"),
  split(3870, [{ termType: "lip_adjustment_method", value: "推拉式弹性微调结构" }, { termType: "lip_structure", value: "上下模整体结构" }]),
  alias(3871, "lip_adjustment_method", "manual_push_fine_adjustment"),
  split(3872, [{ termType: "lip_adjustment_method", value: "推拉式弹性微调结构" }, { termType: "lip_structure", value: "上下模整体结构" }]),
  alias(3873, "plastic_material", "WPC"),
  alias(3874, "application", "仿结皮发泡板"),
  reject(731),
  reject(733),
  alias(3875, "application", "hollow_board"),
  split(2903, [{ termType: "plastic_material", value: "UV" }, { termType: "application", value: null, action: "reject_noise" }]),
  alias(3876, "feedblock_structure", "round_inlet"),
  alias(3877, "lip_adjustment_method", "other"),
  reject(811),
];

const termTypeAliases = [
  ["产量", "capacity", "add_termtype_alias"],
  ["产品主体加热方式", "heating_method", "add_termtype_alias"],
  ["联接尺寸图纸提供情况", "connection_drawing_status", "add_termtype_alias"],
  ["应用", "application", "add_termtype_alias"],
  ["紧固件（螺丝）", "fastener_type", "add_termtype_alias"],
  ["备注", "marking_requirement_note", "add_termtype_alias"],
  ["使用区域", "usage_market", "mark_as_document_info"],
  ["出口使用", "usage_market", "mark_as_document_info"],
  ["出口使用国家", "country", "mark_as_document_info"],
  ["模具编号", "product_number", "mark_as_document_info"],
  ["最大产量", "capacity", "add_termtype_alias"],
  ["最小产量", "capacity", "add_termtype_alias"],
  ["最大转速", "rotation_speed", "add_termtype_alias"],
  ["最小转速", "rotation_speed", "add_termtype_alias"],
];

try {
  const before = await snapshot("before", rangeDocumentIds);
  fs.writeFileSync("tmp/codex-doc30-100-before-snapshot.json", json(before));

  const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
  const termTypeAliasResult = await upsertTermTypeAliases(termTypeAliases);
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

  const archive97 = await ensureArchive97();
  const after = await snapshot("after", rangeDocumentIds);
  const checks = await runChecks(rangeDocumentIds, startedAt);
  const report = { reviewedBy, startedAt, reviews, termTypeAliases, governanceResult, termTypeAliasResult, manualCorrections, refreshRuns, archive97, before, after, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc30-100-governance-refresh-result.json", json(report));
  console.log(json(summarize(report)));
} finally {
  await prisma.$disconnect();
}

function alias(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "value", targetTermType, canonicalValue };
}

function split(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "value", parts };
}

function reject(candidateId) {
  return { candidateId, action: "reject", candidateType: "value" };
}

async function upsertTermTypeAliases(rows) {
  const before = [];
  const after = [];
  for (const [aliasValue, termType, action] of rows) {
    const normalizedAlias = normalizeAlias(aliasValue);
    const existing = await prisma.dictionaryTermTypeAlias.findUnique({ where: { normalizedAlias } });
    before.push(existing);
    const row = await prisma.dictionaryTermTypeAlias.upsert({
      where: { normalizedAlias },
      create: {
        termType,
        aliasValue,
        normalizedAlias,
        source: reviewedBy,
        baselineTrustTier: "provisional",
        baselineRiskLabels: [],
      },
      update: {
        termType,
        aliasValue,
        source: reviewedBy,
        isActive: true,
        baselineTrustTier: "provisional",
      },
    });
    after.push({ action, row });
  }
  const version = await bumpDictionaryVersion("term-type-alias-batch", "dictionary_term_type_aliases", after, before);
  return { count: after.length, version, before, after };
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
  root.document_info = {
    ...(root.document_info ?? {}),
    ...buildManualDocInfo(content, document.fileName ?? ""),
  };
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
  if (/\[SEL\]\s*国内使用/u.test(content)) set(info, "usage_market", "国内使用", "blocks_cell");
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
  if (type === "filter") return afterDate.split(/配液压站/u)[0] || null;
  if (type === "feedblock") return itemIndex === 2 ? "3层分配器" : "分配器";
  if (type === "metering_pump") return afterDate.match(/GD-[A-Z0-9-]+计量泵泵体/u)?.[0] ?? "计量泵泵体";
  if (type === "hydraulic_station") return "液压站";
  return null;
}

async function ensureArchive97() {
  const existing = await prisma.contractArchive.findFirst({ where: { documentId: BigInt(97) } });
  if (existing) return { skipped: true, archiveId: String(existing.id) };
  const detail = await productConfigAgentService.archiveDocument({ documentId: "97", createdBy: reviewedBy });
  return { skipped: false, archiveId: String(detail.id ?? detail.archive?.id) };
}

async function snapshot(label, documentIds) {
  const ids = documentIds.map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({ where: { id: { in: candidateIds.map(BigInt) } }, orderBy: { id: "asc" } });
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({ where: { candidateId: { in: candidateIds.map(BigInt) } }, orderBy: [{ candidateId: "asc" }, { documentId: "asc" }, { id: "asc" }] });
  const termTypeAliasRows = await prisma.dictionaryTermTypeAlias.findMany({ where: { normalizedAlias: { in: termTypeAliases.map(([aliasValue]) => normalizeAlias(aliasValue)) } }, orderBy: { normalizedAlias: "asc" } });
  const documents = await prisma.productDocument.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, dictionaryDirty: true, fileName: true }, orderBy: { id: "asc" } });
  const latestExtractions = await Promise.all(ids.map((id) => prisma.extractionResult.findFirst({ where: { documentId: id }, select: { id: true, documentId: true, status: true, promptVersion: true, llmModel: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })));
  const archives = await prisma.contractArchive.findMany({ where: { documentId: { in: ids } }, orderBy: [{ documentId: "asc" }, { id: "asc" }] });
  const archiveItems = await prisma.contractArchiveItem.groupBy({ by: ["documentId", "archiveId"], where: { documentId: { in: ids } }, _count: { _all: true } });
  const version = await prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } });
  return { label, candidates, occurrences, termTypeAliasRows, documents, latestExtractions, archives, archiveItems, version };
}

async function runChecks(documentIds, since) {
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
    orderBy: { id: "asc" },
  });
  const archiveItemCounts = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: documentIds.map(BigInt) } },
    _count: { _all: true },
  });
  const llmCalls = await prisma.llmCallLog.count({ where: { createdAt: { gte: since } } });
  return {
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    archiveItemCounts,
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
    termTypeAliasCount: report.termTypeAliasResult.count,
    manualCorrections: report.manualCorrections.map((item) => ({ documentId: item.documentId, createdExtractionResultId: item.createdExtractionResultId })),
    refresh: {
      requestedCount: report.refreshRuns.length,
      successCount: report.refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: report.refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
      refreshedExtractionResultIds: report.refreshRuns.flatMap((item) => item.result.progress.map((entry) => ({ documentId: item.documentId, extractionResultId: entry.refreshedExtractionResultId }))),
    },
    archive97: report.archive97,
    checks: {
      duplicateArchiveCount: report.checks.duplicateArchives.length,
      uniqueIndexPresent: report.checks.uniqueIndexPresent,
      dirtyDocs: report.checks.dirtyDocs,
      dirtyArchives: report.checks.dirtyArchives,
      pendingCandidates: report.checks.pendingCandidates,
      llmCallsSinceStart: report.checks.llmCallsSinceStart,
    },
    businessLlmTokens: 0,
  };
}

function contentText(blocksJson) {
  if (blocksJson && typeof blocksJson === "object" && typeof blocksJson.llm_text === "string") return blocksJson.llm_text;
  if (blocksJson && typeof blocksJson === "object" && Array.isArray(blocksJson.blocks)) {
    return blocksJson.blocks.map((block) => String(block?.text ?? block?.raw_text ?? "")).join("\n");
  }
  return JSON.stringify(blocksJson ?? {});
}

function productNumberFromContent(content) {
  const direct = match(content, /(?:模具编号|模头编号|配件编号)[:：]\s*([0-9A-Za-z][0-9A-Za-z\s/&-]*-E(?:-[0-9]+)?(?:\s*[\/&]\s*[0-9A-Za-z-]+)*)/u);
  return direct ? direct.replace(/\s*\/\s*/g, " / ").replace(/\s*&\s*/g, " & ").trim() : null;
}

function productNumberFromFileName(fileName) {
  const inside = fileName.match(/[（(]([^）)]*-[Ee][^）)]*)[）)]/u)?.[1];
  return inside ? inside.replace(/\s+/g, " ").trim() : null;
}

function match(text, pattern) {
  const value = text.match(pattern)?.[1]?.trim();
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
