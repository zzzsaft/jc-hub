import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc0_100_dictionary_audit_20260708";
const docMin = 0;
const docMax = 100;
const candidateIds = [4400, 4392, 4406, 4452, 4393, 4590, 4591, 4589, 1364, 1363, 1901, 730, 732, 3526, 3628, 2470, 1611, 1531, 1369, 2392, 1970];
const repairAliasIds = [220, 1173, 104, 1019, 1020, 1021, 1022];

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { productConfigAgentRepository } = await import("../apps/server/build/modules/productConfigAgent/db.service.js");
const { dictionaryGovernanceService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/governance.service.js");
const { dictionaryMatcherService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/matcher.service.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const startedAt = new Date();
const json = (value) => JSON.stringify(toJson(value), null, 2);

const termTypes = [
  tt("contract_number", "合同号", "text", "document_info", "合同编号或合同号。"),
  tt("product_number", "产品/模具/配件编号", "text", "document_info", "产品、模具或配件编号。"),
  tt("order_number", "订单号", "text", "document_info", "订单编号。"),
  tt("customer_id", "客户ID", "text", "document_info", "客户编号或客户ID。"),
  tt("country", "国家", "text", "document_info", "使用或出口国家。"),
  tt("usage_market", "使用市场", "text", "document_info", "国内使用或出口使用。"),
  tt("order_date", "下单日期", "date", "document_info", "客户下单日期。"),
  tt("delivery_date", "交货日期", "date", "document_info", "计划交货日期。"),
  tt("contract_delivery_date", "合同规定交货日期", "date", "document_info", "合同规定的交货日期。"),
  tt("item_index", "序号", "number", "item_identity", "配置表 item 序号。"),
  tt("item_name", "项目名称", "text", "item_identity", "配置表 item 名称。"),
  tt("item_quantity", "数量", "number", "item_identity", "配置表 item 数量，归一为数字。"),
  tt("product_type_hint", "产品类型", "text", "item_identity", "归一后的产品类型提示。"),
];

const termTypeAliases = [
  ["接线方式", "wiring_method"],
  ["标志要求/备注", "marking_requirement_note"],
  ["表面镀层要求", "surface_plating_type"],
  ["模具说明书要求", "manual_requirement"],
  ["模头安装方式", "die_mounting_method"],
  ["进料口方式", "feed_inlet_method"],
  ["流道形式", "flow_channel_type"],
  ["层数", "layer_count"],
  ["层结构", "layer_structure"],
  ["电压及加热功率", "heating_voltage"],
  ["数量", "item_quantity"],
  ["国家", "country"],
  ["使用地区", "usage_market"],
  ["客户ID", "customer_id"],
  ["合同编号", "contract_number"],
  ["下单日期", "order_date"],
  ["交货日期", "delivery_date"],
  ["合同规定交货日期", "contract_delivery_date"],
];

const reviews = [
  termTypeAliasReview(4400, "capacity"),
  termTypeAliasReview(4392, "application"),
  termTypeAliasReview(4406, "heating_method"),
  termTypeAliasReview(4452, "screw_type"),
  termTypeAliasReview(4393, "connection_drawing_status"),
  termTypeAliasReview(4590, "usage_market"),
  termTypeAliasReview(4591, "country"),
  termTypeAliasReview(4589, "marking_requirement_note"),
  createValue(1364, "application", "电线电缆"),
  aliasValue(1363, "application", "电线电缆"),
  aliasValue(1901, "hydraulic_valve_type", "solenoid_valve"),
  aliasValue(730, "heating_method", "heating_rod"),
  aliasValue(732, "surface_plating_type", "chrome_plating"),
  aliasValue(3526, "pump_heating_method", "加热棒"),
  aliasValue(3628, "pump_heating_method", "油加温"),
  createValue(2470, "application", "淋膜"),
  createValue(1611, "application", "文具片"),
  splitValue(1531, [
    { termType: "die_mounting_method", value: "45°斜挤出安装" },
    { termType: "die_mounting_method", value: "45° 挤出微调朝下" },
  ]),
  rejectValue(1369),
  rejectValue(2392),
  rejectValue(1970),
];

const aliasRepairs = [
  { aliasId: 220, termType: "metering_pump_model", canonicalValue: "JC-90-E" },
  { aliasId: 1173, termType: "upper_choker_bar_angle", canonicalValue: "45°阻流棒" },
  { aliasId: 104, termType: "upper_lip_adjustment_method", canonicalValue: "手动推式微调" },
];

try {
  const documentIds = await loadScopeDocumentIds();
  const before = await snapshot("before", documentIds);
  fs.writeFileSync("tmp/codex-doc0-100-dictionary-governance-before.json", json(before));

  const termTypeResult = await upsertTermTypes();
  const termTypeAliasResult = await upsertTermTypeAliases(termTypeAliases);
  const aliasRepairResult = await repairValueAliases(aliasRepairs);
  const governanceResult = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
  dictionaryMatcherService.invalidate();

  const directAffectedDocumentIds = await findDocsWithRawFields(termTypeAliases.map(([aliasValue]) => aliasValue));
  const refreshDocumentIds = [...new Set([
    ...documentIds,
    ...directAffectedDocumentIds,
    ...(governanceResult.affectedDocumentIds ?? []).map(Number),
  ])].sort((a, b) => a - b);

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

  const after = await snapshot("after", documentIds);
  const checks = await runChecks(documentIds, startedAt);
  const report = {
    reviewedBy,
    startedAt,
    termTypes,
    termTypeAliases,
    reviews,
    aliasRepairs,
    termTypeResult,
    termTypeAliasResult,
    aliasRepairResult,
    governanceResult,
    refreshDocumentIds,
    refreshRuns,
    before,
    after,
    checks,
    businessLlmTokens: 0,
  };
  fs.writeFileSync("tmp/codex-doc0-100-dictionary-governance-result.json", json(report));
  console.log(json(summarize(report)));
} finally {
  await prisma.$disconnect();
}

function tt(termType, displayName, valueKind, scope, description) {
  return { termType, displayName, valueKind, scope, description };
}

function termTypeAliasReview(candidateId, targetTermType) {
  return { candidateId, action: "approve-as-alias", candidateType: "term_type", targetTermType };
}

function aliasValue(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "value", targetTermType, canonicalValue };
}

function createValue(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "create-value", candidateType: "value", targetTermType, canonicalValue };
}

function splitValue(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "value", parts };
}

function rejectValue(candidateId) {
  return { candidateId, action: "reject", candidateType: "value" };
}

async function loadScopeDocumentIds() {
  const rows = await prisma.productDocument.findMany({
    where: { id: { gte: BigInt(docMin), lte: BigInt(docMax) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => Number(row.id));
}

async function upsertTermTypes() {
  const before = await prisma.dictionaryTermType.findMany({
    where: { termType: { in: termTypes.map((item) => item.termType) } },
    orderBy: { termType: "asc" },
  });
  const items = [];
  for (const item of termTypes) {
    const upserted = await productConfigAgentRepository.upsertTermType({
      termType: item.termType,
      displayName: item.displayName,
      kind: item.valueKind,
      metadata: {
        description: item.description,
        scope: item.scope,
        category: item.scope,
        valueKind: item.valueKind,
        applicableProductTypes: ["common"],
      },
    });
    const updated = await prisma.dictionaryTermType.update({
      where: { termType: item.termType },
      data: {
        scope: item.scope,
        conceptRole: item.scope === "document_info" ? "document_info" : item.scope === "item_identity" ? "item_identity" : "config_attribute",
        riskLevel: "normal",
        baselineTrustTier: "provisional",
        description: item.description,
        metadata: {
          description: item.description,
          scope: item.scope,
          category: item.scope,
          valueKind: item.valueKind,
          applicableProductTypes: ["common"],
          source: reviewedBy,
        },
      },
    });
    items.push({ upserted, updated });
  }
  const after = await prisma.dictionaryTermType.findMany({
    where: { termType: { in: termTypes.map((item) => item.termType) } },
    orderBy: { termType: "asc" },
  });
  const version = await bumpDictionaryVersion("codex_upsert_term_types", "dictionary_term_types", after, before);
  return { count: items.length, version, before, after };
}

async function upsertTermTypeAliases(rows) {
  const aliases = rows.map(([aliasValue]) => normalizeAliasForDb(aliasValue));
  const before = await prisma.dictionaryTermTypeAlias.findMany({
    where: { normalizedAlias: { in: aliases } },
    orderBy: { normalizedAlias: "asc" },
  });
  const after = [];
  for (const [aliasValue, termType] of rows) {
    const normalizedAlias = normalizeAliasForDb(aliasValue);
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
    after.push(row);
  }
  const version = await bumpDictionaryVersion("codex_upsert_term_type_aliases", "dictionary_term_type_aliases", after, before);
  return { count: after.length, version, before, after };
}

async function repairValueAliases(rows) {
  const before = await prisma.dictionaryAlias.findMany({
    where: { id: { in: rows.map((item) => BigInt(item.aliasId)) } },
    orderBy: { id: "asc" },
  });
  const results = [];
  for (const item of rows) {
    const alias = await prisma.dictionaryAlias.findUnique({ where: { id: BigInt(item.aliasId) } });
    if (!alias) throw new Error(`Missing dictionary_alias ${item.aliasId}`);
    const term = await prisma.dictionaryTerm.upsert({
      where: { termType_canonicalValue: { termType: item.termType, canonicalValue: item.canonicalValue } },
      create: {
        termType: item.termType,
        canonicalValue: item.canonicalValue,
        displayName: item.canonicalValue,
        baselineTrustTier: "provisional",
      },
      update: {
        displayName: item.canonicalValue,
        isActive: true,
        baselineTrustTier: "provisional",
      },
    });
    const updatedAlias = await prisma.dictionaryAlias.update({
      where: { id: alias.id },
      data: {
        termId: term.id,
        termType: item.termType,
        aliasValue: alias.aliasValue,
        normalizedAlias: normalizeAliasForDb(alias.aliasValue),
        source: reviewedBy,
        isActive: true,
        baselineTrustTier: "provisional",
      },
    });
    results.push({ term, alias: updatedAlias });
  }
  const after = await prisma.dictionaryAlias.findMany({
    where: { id: { in: rows.map((item) => BigInt(item.aliasId)) } },
    orderBy: { id: "asc" },
  });
  const version = await bumpDictionaryVersion("codex_repair_value_alias_targets", "dictionary_aliases", { rows: results, after }, before);
  return { count: results.length, version, before, after, results };
}

async function findDocsWithRawFields(rawFields) {
  const rows = await prisma.dictionaryCandidateOccurrence.findMany({
    where: {
      documentId: { gte: BigInt(docMin), lte: BigInt(docMax) },
      fieldName: { in: rawFields },
    },
    select: { documentId: true },
  });
  return [...new Set(rows.map((row) => Number(row.documentId)))].sort((a, b) => a - b);
}

async function snapshot(label, documentIds) {
  const ids = documentIds.map(BigInt);
  const termTypeKeys = termTypes.map((item) => item.termType);
  const aliasNorms = termTypeAliases.map(([aliasValue]) => normalizeAliasForDb(aliasValue));
  const candidateRows = await prisma.dictionaryCandidate.findMany({ where: { id: { in: candidateIds.map(BigInt) } }, orderBy: { id: "asc" } });
  const candidateOccurrences = await prisma.dictionaryCandidateOccurrence.findMany({ where: { candidateId: { in: candidateIds.map(BigInt) } }, orderBy: [{ candidateId: "asc" }, { documentId: "asc" }, { id: "asc" }] });
  const termTypeRows = await prisma.dictionaryTermType.findMany({ where: { termType: { in: termTypeKeys } }, orderBy: { termType: "asc" } });
  const termTypeAliasRows = await prisma.dictionaryTermTypeAlias.findMany({ where: { OR: [{ normalizedAlias: { in: aliasNorms } }, { id: { in: [1019n, 1020n, 1021n, 1022n] } }] }, orderBy: [{ termType: "asc" }, { normalizedAlias: "asc" }] });
  const repairedAliases = await prisma.dictionaryAlias.findMany({ where: { id: { in: repairAliasIds.map(BigInt) } }, orderBy: { id: "asc" } });
  const repairedTerms = await prisma.dictionaryTerm.findMany({
    where: { OR: aliasRepairs.map((item) => ({ termType: item.termType, canonicalValue: item.canonicalValue })) },
    orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
  });
  const documents = await prisma.productDocument.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, dictionaryDirty: true, fileName: true }, orderBy: { id: "asc" } });
  const latestExtractions = await Promise.all(ids.map((id) => prisma.extractionResult.findFirst({ where: { documentId: id }, select: { id: true, documentId: true, status: true, promptVersion: true, llmModel: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })));
  const archives = await prisma.contractArchive.findMany({ where: { documentId: { in: ids } }, orderBy: [{ documentId: "asc" }, { id: "asc" }] });
  const archiveItems = await prisma.contractArchiveItem.groupBy({ by: ["documentId", "archiveId"], where: { documentId: { in: ids } }, _count: { _all: true } });
  const version = await prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } });
  return { label, candidateRows, candidateOccurrences, termTypeRows, termTypeAliasRows, repairedAliases, repairedTerms, documents, latestExtractions, archives, archiveItems, version };
}

async function runChecks(documentIds, since) {
  const ids = documentIds.map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) } },
    select: { id: true, termType: true, rawValue: true, status: true, reviewedBy: true, reviewedAt: true },
    orderBy: { id: "asc" },
  });
  const aliases = await prisma.dictionaryAlias.findMany({
    where: { id: { in: repairAliasIds.map(BigInt) } },
    select: { id: true, termType: true, termId: true, aliasValue: true, isActive: true, source: true },
    orderBy: { id: "asc" },
  });
  const termTypeAliases = await prisma.dictionaryTermTypeAlias.findMany({
    where: { OR: [{ normalizedAlias: { in: termTypeAliasesForCheck() } }, { id: { in: [1019n, 1020n, 1021n, 1022n] } }] },
    select: { id: true, termType: true, aliasValue: true, normalizedAlias: true, source: true, isActive: true },
    orderBy: [{ termType: "asc" }, { normalizedAlias: "asc" }],
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
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: since } } }).catch(() => null);
  return {
    candidates,
    pendingCandidates: candidates.filter((item) => item.status === "pending"),
    aliases,
    termTypeAliases,
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    dirtyDocs,
    dirtyArchives,
    archiveItemCounts,
    llmCallsSinceStart,
  };
}

function termTypeAliasesForCheck() {
  return termTypeAliases.map(([aliasValue]) => normalizeAliasForDb(aliasValue));
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

function summarize(report) {
  return {
    termTypes: { count: report.termTypeResult.count, version: report.termTypeResult.version },
    termTypeAliases: { count: report.termTypeAliasResult.count, version: report.termTypeAliasResult.version },
    aliasRepairs: { count: report.aliasRepairResult.count, version: report.aliasRepairResult.version },
    governance: {
      requestedCount: report.governanceResult.requestedCount,
      successCount: report.governanceResult.successCount,
      failedCount: report.governanceResult.failedCount,
      failures: report.governanceResult.results.filter((item) => !item.success),
      affectedDocumentIds: report.governanceResult.affectedDocumentIds,
    },
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
      llmCallsSinceStart: report.checks.llmCallsSinceStart,
    },
    outputs: {
      before: "tmp/codex-doc0-100-dictionary-governance-before.json",
      result: "tmp/codex-doc0-100-dictionary-governance-result.json",
    },
    businessLlmTokens: 0,
  };
}

function normalizeAliasForDb(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:，,、;；/\\_-]+/g, "");
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
}
