import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import {
  ArchiveItemSearchService,
  calculateArchiveItemCandidateLimit,
  tokenizeArchiveSearchQuery,
  type ArchiveItemSearchParams,
} from "../../src/modules/productConfigAgent/archive/archiveItemSearch.service.js";
import { normalizeArchiveSearchQuery } from "../../src/modules/productConfigAgent/archive/queryNormalizer.js";
import {
  mapProductConfigMatch,
  ProductConfigSearchService,
  scoreProductConfigMatch,
} from "../../src/modules/productConfigAgent/archive/productConfigSearch.service.js";
import { searchSimilarConfigsTool } from "../../src/modules/productConfigAgent/tools/searchSimilarConfigs.tool.js";

const restoreFns: Array<() => void> = [];

test.afterEach(() => {
  while (restoreFns.length > 0) restoreFns.pop()?.();
  mock.restoreAll();
});

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, implementation: T[K]) {
  const original = target[key];
  Object.defineProperty(target, key, { value: implementation, configurable: true });
  restoreFns.push(() => Object.defineProperty(target, key, { value: original, configurable: true }));
}

test("product config search trims product number and queries archive item bindings", async () => {
  const calls: any[] = [];
  replaceMethod(prisma as any, "$queryRawUnsafe", (async (...args: any[]) => {
    calls.push(args);
    return [];
  }) as any);

  const service = new ProductConfigSearchService();
  const result = await service.searchProductConfigs({
    productNumber: " PN-001 ",
    customerId: "C-001",
    includeErp: true,
  });

  assert.equal(result.productNumber, "PN-001");
  assert.equal(result.includeErp, true);
  assert.equal(result.erpSearchEnabled, false);
  assert.deepEqual(result.sources, { archiveBindings: true, erp: false });
  assert.deepEqual(result.matches, []);
  assert.equal(calls[0][1], "%PN-001%");
  assert.equal(calls[0][2], "C-001");
  assert.match(calls[0][0], /archive\.status = 'archived'/);
  assert.match(calls[0][0], /duplicate_archive_not_refreshed/);
});

test("product config search maps archive binding rows to legacy match shape", () => {
  const match = mapProductConfigMatch({
    binding_id: 7n,
    product_number: "PN-001",
    role: "primary",
    quantity: "2",
    binding_source: "document",
    confidence: 0.9,
    erp_product_id: "ERP-1",
    erp_parent_product_number: "PARENT",
    erp_match_status: "matched",
    evidence_json: { source: "docInfo" },
    note: "ok",
    item_id: 8n,
    item_index: 1,
    item_name: "过滤器",
    product_type_hint: "filter",
    source_product_number: "PN-001",
    fields_json: [{ normalized_name: "model" }],
    archive_id: 9n,
    document_id: 10n,
    extraction_result_id: 11n,
    customer_id: "C-001",
    file_name: "a.xlsx",
  });

  assert.equal(match.archiveId, 9);
  assert.equal(match.itemId, 8);
  assert.equal(match.productBinding.productNumber, "PN-001");
  assert.equal(match.erpProduct?.id, "ERP-1");
  assert.equal(match.matchStatus, "erp_matched");
  assert.deepEqual(match.configFields, [{ normalized_name: "model" }]);
  assert.ok(match.score > 0.9);
  assert.deepEqual(match.warnings, []);
});

test("product config search scoring surfaces archive compatibility warnings", () => {
  const score = scoreProductConfigMatch({
    productBinding: { productNumber: "PN-001", confidence: 0.5 },
    itemProductTypeHint: "unknown",
    customerId: null,
    erpProduct: null,
  });
  const match = mapProductConfigMatch({
    binding_id: 1n,
    product_number: "PN-001",
    confidence: 0.5,
    item_id: 2n,
    item_index: 1,
    product_type_hint: "unknown",
    archive_id: 3n,
  });
  assert.equal(score, match.score);
  assert.deepEqual(match.warnings, [
    "archive match has no customerId",
    "archive match has unknown product type",
    "archive match has no ERP binding",
  ]);
});

test("searchSimilarConfigs tool uses binding search when product number is present", async () => {
  replaceMethod(prisma as any, "$queryRawUnsafe", (async () => [
    {
      binding_id: 1n,
      product_number: "PN-001",
      role: "primary",
      quantity: null,
      binding_source: "document",
      confidence: null,
      erp_product_id: null,
      erp_parent_product_number: null,
      erp_match_status: "unmatched",
      evidence_json: {},
      note: null,
      item_id: 2n,
      item_index: 1,
      item_name: "过滤器",
      product_type_hint: "filter",
      source_product_number: "PN-001",
      fields_json: [],
      archive_id: 3n,
      document_id: 4n,
      extraction_result_id: 5n,
      customer_id: null,
      file_name: "a.xlsx",
    },
  ]) as any);

  const result = await searchSimilarConfigsTool.run(
    { entities: { productNumber: "PN-001" } },
    { toolResults: {}, draftConfig: null, validation: null, savedConfig: null, warnings: [] },
  ) as any;

  assert.equal(result.source, "archive_product_configs");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchStatus, "archive_only");
});

test("archive item search tokenizes natural language query for token keyword matching", () => {
  assert.deepEqual(tokenizeArchiveSearchQuery("PVC 波浪板/模头+1380mm，A"), ["PVC", "波浪板", "模头", "1380mm", "1380"]);
});

test("archive item search uses a broad candidate pool before scoring", () => {
  assert.equal(calculateArchiveItemCandidateLimit(10), 250);
  assert.equal(calculateArchiveItemCandidateLimit(50), 1000);
});

test("archive query normalizer splits compounds and normalizes PVC family", () => {
  const compound = normalizeArchiveSearchQuery("PVC+UPVC 波浪板模头");
  assert.ok(compound.tokens.includes("PVC"));
  assert.ok(compound.tokens.includes("UPVC"));
  assert.ok(compound.tokens.includes("波浪板"));
  assert.ok(compound.tokens.includes("模头"));
  assert.ok(compound.normalizedTokens.includes("PVC"));
  assert.ok(compound.normalizedTokens.includes("UPVC"));
  assert.deepEqual(compound.normalizedMaterials, ["PVC"]);

  assert.deepEqual(normalizeArchiveSearchQuery("UPVC").normalizedMaterials, ["PVC"]);
  assert.deepEqual(normalizeArchiveSearchQuery("CPVC").normalizedMaterials, ["PVC"]);
  assert.deepEqual(normalizeArchiveSearchQuery("RPVC").normalizedMaterials, ["PVC"]);

  const compact = normalizeArchiveSearchQuery("1380mmPVC模头");
  assert.ok(compact.tokens.includes("1380mm"));
  assert.ok(compact.tokens.includes("1380"));
  assert.ok(compact.tokens.includes("PVC"));
  assert.ok(compact.tokens.includes("模头"));
});

test("archive item search ranks item-level results with keyword, material, width reasons, and separated unresolved fields", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 20n,
      item_name: "PVC 波浪板 模头",
      searchable_text: "PVC 波浪板 模头 有效宽度 1400mm",
      similarity_features_json: {
        product_type: "flat_die",
        plastic_material: "PVC",
        application: "波浪板",
        effective_width_mm: 1400,
      },
      confirmed_fields_json: {
        product_type: "flat_die",
        plastic_material: "PVC",
        application: "波浪板",
        effective_width_mm: 1400,
      },
      unresolved_fields_json: [
        { fieldName: "die_width_mm", rawValue: "待确认 1500", reason: "dictionary_candidate_or_value_miss" },
      ],
      agent_readiness_json: { searchable: true, similarityReady: true, quoteReady: false, level: "medium" },
    }),
    archiveItemRow({
      archive_item_id: 19n,
      item_name: "PP 板材 模头",
      searchable_text: "PP 板材 模头 有效宽度 1800mm",
      similarity_features_json: {
        product_type: "flat_die",
        plastic_material: "PP",
        application: "板材",
        effective_width_mm: 1800,
      },
      confirmed_fields_json: {
        product_type: "flat_die",
        plastic_material: "PP",
        application: "板材",
        effective_width_mm: 1800,
      },
      unresolved_fields_json: [],
      agent_readiness_json: { searchable: true, similarityReady: true, quoteReady: true, level: "high" },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "PVC 波浪板 模头",
    productType: "flat_die",
    materials: ["PVC"],
    application: "波浪板",
    widthMm: 1380,
    limit: 10,
  });

  assert.equal(result.source, "archive_item_search");
  assert.equal(result.supported, true);
  assert.equal(result.results[0].archiveItemId, "20");
  assert.equal(result.results[0].archiveId, "3");
  assert.equal(result.results[0].documentId, "4");
  assert.equal(result.results[0].confirmedFields.plastic_material, "PVC");
  assert.equal(result.results[0].unresolvedFieldsSummary[0].fieldName, "die_width_mm");
  assert.equal(Object.prototype.hasOwnProperty.call(result.results[0].confirmedFields, "die_width_mm"), false);
  assert.ok(result.results[0].matchReasons.some((reason) => reason.includes("关键词命中")));
  assert.ok(result.results[0].matchReasons.some((reason) => reason.includes("材料匹配")));
  assert.ok(result.results[0].matchReasons.some((reason) => reason === "宽度接近：目标 1380mm，历史 1400mm，差值 20mm"));
  assert.equal(result.results[0].agentReadiness.quoteReady, false);
  assert.equal(result.results[0].evidence.fileName, "archive.xlsx");
  assert.ok(result.results[0].searchableTextSummary?.includes("PVC 波浪板"));
  assert.match(result.usageRules.unresolvedFields, /reference-only/);
});

test("archive item search scores structure field hints with explainable reasons", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 50n,
      item_name: "自动推拉 PVC 板材模头",
      searchable_text: "自动推拉 PVC 板材模头 外堵铣槽式",
      similarity_features_json: {
        product_type: "flat_die",
        plastic_material: "PVC",
        lip_adjustment_method: "auto_push_pull_fine_adjustment",
        deckle_type: "external_slotted_deckle",
      },
      confirmed_fields_json: {
        product_type: "flat_die",
        plastic_material: "PVC",
        lip_adjustment_method: "auto_push_pull_fine_adjustment",
        deckle_type: "external_slotted_deckle",
      },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "自动推拉 PVC 板材模头",
    productType: "flat_die",
    materials: ["PVC"],
    lipAdjustmentMethod: "auto_push_pull",
    deckleType: "external_slotted",
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.query.lipAdjustmentMethod, "auto_push_pull");
  assert.equal(result.query.deckleType, "external_slotted");
  assert.ok(result.results[0].matchReasons.some((reason) => reason === "模唇调节方式匹配：auto_push_pull_fine_adjustment"));
  assert.ok(result.results[0].matchReasons.some((reason) => reason === "堵边/调幅结构匹配：external_slotted_deckle"));
});

test("archive item search treats structured hints as scoring signals instead of hard filters", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 30n,
      item_name: "PVC 模头",
      searchable_text: "PVC 模头",
      similarity_features_json: { product_type: "flat_die", plastic_material: "PVC" },
      confirmed_fields_json: { product_type: "flat_die", plastic_material: "PVC" },
    }),
    archiveItemRow({
      archive_item_id: 31n,
      item_name: "PVC 过滤器",
      searchable_text: "PVC 过滤器",
      similarity_features_json: { product_type: "filter", plastic_material: "PVC" },
      confirmed_fields_json: { product_type: "filter", plastic_material: "PVC" },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "PVC",
    productType: "flat_die",
    materials: ["PVC"],
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].productType, "flat_die");
  assert.equal(result.results[1].productType, "filter");
});

test("archive item search explains material and width from item text when structured features are missing", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 60n,
      item_name: "1250mm PVC波浪瓦板模头",
      searchable_text: "1250mm PVC波浪瓦板模头",
      similarity_features_json: { product_type: "flat_die", application: "波浪瓦板" },
      confirmed_fields_json: { product_type: "flat_die" },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "1250mm PVC波浪瓦板模头",
    productType: "flat_die",
    materials: ["PVC"],
    application: "波浪瓦板",
    widthMm: 1250,
  });

  assert.equal(result.results.length, 1);
  assert.ok(result.results[0].matchReasons.some((reason) => reason === "材料匹配：PVC"));
  assert.ok(result.results[0].matchReasons.some((reason) => reason === "宽度接近：目标 1250mm，历史 1250mm，差值 0mm"));
});

test("archive item search candidate pool order is stable and independent from updatedAt", async () => {
  const queries: any[] = [];
  replaceMethod(prisma as any, "$queryRaw", (async (query: any) => {
    queries.push(query);
    return [];
  }) as any);

  await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "1250mm PVC波浪瓦板模头",
    productType: "flat_die",
    materials: ["PVC"],
    application: "波浪瓦板",
    widthMm: 1250,
  });

  const sql = String(queries[0]?.sql ?? queries[0]?.text ?? queries[0]);
  assert.doesNotMatch(sql, /order by item\.updated_at/i);
  assert.match(sql, /archive\.status = 'archived'/);
  assert.match(sql, /duplicate_archive_not_refreshed/);
  assert.match(sql, /item\.id asc/i);
  assert.match(sql, /product_type_hint/i);
  assert.match(sql, /plastic_material/i);
  assert.match(sql, /application/i);
});

test("archive item search recalls compound query through normalized token and material signals", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 41n,
      item_name: "波浪板模头",
      searchable_text: "历史配置",
      similarity_features_json: { product_type: "flat_die", plastic_material: "PVC", application: "波浪板" },
      confirmed_fields_json: { product_type: "flat_die", plastic_material: "PVC", application: "波浪板" },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "PVC+UPVC 波浪板模头",
  });

  assert.equal(result.results.length, 1);
  assert.deepEqual(result.query.normalizedMaterials, ["PVC"]);
  assert.ok(result.query.tokens.includes("UPVC"));
  assert.ok(result.query.tokens.includes("波浪板"));
  assert.ok(result.query.tokens.includes("模头"));
  assert.ok(result.results[0].matchReasons.some((reason) => reason.includes("关键词命中")));
});

test("archive item search token scoring can match confirmed and similarity JSON text", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 42n,
      item_name: "历史 item",
      searchable_text: "没有关键词",
      similarity_features_json: { product_type: "flat_die", plastic_material: "PVC" },
      confirmed_fields_json: { product_type: "flat_die", application: "波浪板" },
    }),
  ]) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({
    queryText: "波浪板",
  });

  assert.equal(result.results.length, 1);
  assert.ok(result.results[0].matchReasons.some((reason) => reason.includes("波浪板")));
});

test("archive item search returns supported empty result with warning when nothing matches", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => []) as any);

  const result = await new ArchiveItemSearchService().searchArchiveItems({ queryText: "不存在的配置" });

  assert.equal(result.supported, true);
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.warnings, ["no archive item matches found"]);
});

test("searchSimilarConfigs uses archive item search with only query text when product number is absent", async () => {
  replaceMethod(prisma as any, "$queryRaw", (async () => [
    archiveItemRow({
      archive_item_id: 40n,
      item_name: "PVC 波浪板 模头",
      searchable_text: "PVC 波浪板 模头",
      similarity_features_json: { product_type: "flat_die", plastic_material: "PVC" },
      confirmed_fields_json: { product_type: "flat_die", plastic_material: "PVC" },
    }),
  ]) as any);

  const result = await searchSimilarConfigsTool.run(
    { userMessage: "搜索 PVC 波浪板 模头" },
    { toolResults: {}, draftConfig: null, validation: null, savedConfig: null, warnings: [] },
  ) as any;

  assert.equal(result.source, "archive_item_search");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].itemName, "PVC 波浪板 模头");
});

function archiveItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    archive_item_id: 1n,
    archive_id: 3n,
    document_id: 4n,
    item_index: 1,
    item_name: "PVC 波浪板 模头",
    product_type_hint: "flat_die",
    source_product_number: "PN-001",
    confirmed_fields_json: {},
    unresolved_fields_json: [],
    agent_readiness_json: { searchable: true, similarityReady: true, quoteReady: false, level: "medium" },
    searchable_text: "PVC 波浪板 模头",
    similarity_features_json: {},
    archive_title: "历史合同",
    file_name: "archive.xlsx",
    ...overrides,
  };
}
