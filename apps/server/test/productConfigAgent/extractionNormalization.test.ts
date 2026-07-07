import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryMatcherService } from "../../src/modules/productConfigAgent/dictionary/matcher.service.js";
import {
  normalizeExtraction,
  normalizeExtractionWithDictionary,
} from "../../src/modules/productConfigAgent/normalization/index.js";
import {
  normalizeMasterDataAttribute,
  normalizeMasterDataModel,
  productConfigAgentMasterDataService,
} from "../../src/modules/productConfigAgent/masterData.service.js";

test("normalizeExtraction coerces item shape and reindexes duplicate item indexes", () => {
  const normalized = normalizeExtraction({
    extraction: {
      document_info: { " 合同号 ": " C-1 " },
      items: [
        { item_index: 1, item_name: " A ", fields: { " 功率 ": " 10kW " } },
        { item_index: 1, item_name: " B ", fields: { "压力": " 20MPa " } },
      ],
    },
  }) as any;

  assert.equal(normalized.document_info.合同号, "C-1");
  assert.deepEqual(
    normalized.items.map((item: any) => item.item_index),
    [1, 2],
  );
  assert.deepEqual(normalized.items[0].fields.功率, { value: 10, unit: "kW", raw_value: "10kW" });
});

test("normalizeExtraction applies number unit, range, selection, and product type rules", () => {
  const normalized = normalizeExtraction({
    extraction: {
      document_info: { " 合同编号 ": { value: " C-2 " } },
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "模头" },
          raw_fields: [
            { field_name: "功率", value: "10KW" },
            { field_name: "压力范围", value: "10-20MPA" },
            { field_name: "模唇调节", value: "[SEL] 自动\n[ ] 手动" },
            { field_name: "温度1", value: "180℃" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.document_info.contract_number, "C-2");
  assert.equal(normalized.items[0].product_type_hint.value, "flat_die");
  assert.deepEqual(normalized.items[0].fields.功率, { value: 10, unit: "kW", raw_value: "10KW" });
  assert.deepEqual(normalized.items[0].fields.压力范围, { min: 10, max: 20, unit: "MPa", raw_value: "10-20MPA" });
  assert.deepEqual(normalized.items[0].fields.模唇调节, ["自动"]);
  assert.deepEqual(normalized.items[0].fields.温度[0], { value: 180, unit: "°C", raw_value: "180℃" });
});

test("normalizeExtraction infers product type from item name when hint is missing or unknown", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          item_name: "一号过滤器组件",
          product_type_hint: { value: "unknown" },
          raw_fields: [{ field_name: "型号", value: "F-1" }],
        },
        {
          item_index: 2,
          item_name: "涂布模头",
          raw_fields: [{ field_name: "模头有效宽度", value: "800mm" }],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items[0].product_type_hint.value, "filter");
  assert.equal(normalized.items[0].product_type_hint.source, "item_name");
  assert.equal(normalized.items[1].product_type_hint.value, "coating_die");
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "product_type_inferred_from_item_name"));
});

test("normalizeExtraction preserves split_fields and ignores explicit unselected options", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            {
              field_name: "调节方式",
              value: "选项组",
              split_fields: [
                { field_name: "自动（选中）", value: "自动", confidence: 0.91 },
                { field_name: "手动（未选中）", value: "手动" },
              ],
            },
            {
              field_name: "未选中备用配置",
              value: "备用",
              selected: false,
              raw_text: "□ 备用配置",
            },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items[0].raw_fields[0].field_name, "调节方式");
  assert.equal(normalized.items[0].fields.调节方式, "自动");
  assert.equal(normalized.items[0].fields.未选中备用配置, undefined);
  assert.equal(
    normalized.warnings.filter((warning: any) => warning.type === "unchecked_option_ignored").length,
    2,
  );
});

test("normalizeExtraction routes document info aliases without conflating order and contract numbers", () => {
  const normalized = normalizeExtraction({
    extraction: {
      document_info: {
        "合同号": "HT-9",
        "订单号": "SO-9",
        "客户ID": "C-9",
        "交期": "2026-08-01",
        "产品编号": "PN-9",
      },
      items: [],
    },
  }) as any;

  assert.equal(normalized.document_info.contract_number, "HT-9");
  assert.equal(normalized.document_info.order_number, "SO-9");
  assert.equal(normalized.document_info.customer_id, "C-9");
  assert.equal(normalized.document_info.delivery_date, "2026-08-01");
  assert.equal(normalized.document_info.product_number, "PN-9");
});

test("normalizeExtraction merges number-unit and range part fields", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            { field_name: "产量数值", value: "20" },
            { field_name: "产量单位", value: "kg/h" },
            { field_name: "转速最小值", value: "10rpm" },
            { field_name: "转速最大值", value: "30rpm" },
          ],
        },
      ],
    },
  }) as any;

  assert.deepEqual(normalized.items[0].fields.产量, { value: 20, unit: "kg/h", raw_value: "20kg/h" });
  assert.deepEqual(normalized.items[0].fields.转速, { min: 10, max: 30, unit: "rpm", raw_value: "10rpm - 30rpm" });
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "number_unit_part_fields_merged"));
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "range_bound_fields_merged"));
});

test("normalizeExtraction applies indexed, structured label, qualifier, hole, layer, redirect, and note rules", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          product_type_hint: "过滤器",
          raw_fields: [
            { field_name: "温度1", value: "180℃" },
            { field_name: "A层原料", value: "PP" },
            { field_name: "泵后压力", value: "0.5MPA" },
            { field_name: "测温孔及压力孔", value: "M14x1.5" },
            { field_name: "客户备注", value: "上下模加热棒角度45度，测温孔方向朝上" },
            { field_name: "模头有效宽度", value: "1200mm" },
          ],
        },
        {
          item_index: 2,
          product_type_hint: "模头",
          raw_fields: [{ field_name: "A主机产量", value: "20kg/h" }],
        },
      ],
    },
  }) as any;

  const filter = normalized.items[0];
  const die = normalized.items[1];
  assert.deepEqual(filter.fields.温度[0], { value: 180, unit: "°C", raw_value: "180℃" });
  assert.deepEqual(filter.fields.A层原料, { label: "A层原料", value: "PP" });
  assert.equal((filter.fields.泵后压力 as any).qualifier.position, "后");
  assert.equal(filter.fields.热电偶孔规格, "M14x1.5");
  assert.equal(filter.fields.压力传感器孔配置, "M14x1.5");
  assert.deepEqual(filter.fields.上模加热棒角度.value, { value: 45, unit: "°", raw_value: "45°" });
  assert.equal(filter.fields.上模加热棒角度.qualifier.position, "上模");
  assert.equal(filter.fields.测温孔方向, "上");
  assert.deepEqual(die.fields.模头有效宽度, { value: 1200, unit: "mm", raw_value: "1200mm" });
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "raw_field_product_redirected"));
});

test("normalizeExtractionWithDictionary routes aliases and emits missing value proposals", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: rawFieldName !== "未知字段",
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: rawFieldName === "泵型号" ? ["metering_pump_model"] : [],
    matchMethod: rawFieldName === "泵型号" ? "alias_exact" : "none",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async () => ({
    termType: "metering_pump_model",
    valueKind: "enum",
    kind: "value",
    metadata: {},
  });
  dictionaryMatcherService.matchValue = async () => ({
    matched: false,
    termType: "metering_pump_model",
    rawValue: " ZB-12 ",
    normalizedValue: "zb12",
    matchMethod: "term_type_only",
  }) as any;
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: false,
    rawUnit,
    canonicalUnit: rawUnit,
  });
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "泵型号", value: " ZB-12 " },
              { field_name: "未知字段", value: "abc" },
            ],
          },
        ],
      },
    }) as any;

    assert.ok(normalized.items[0].fields.metering_pump_model);
    assert.equal(normalized.dictionaryProposals.proposals.length, 2);
    assert.deepEqual(
      normalized.dictionaryProposals.proposals.map((proposal: any) => proposal.reason).sort(),
      ["missing_field_alias", "missing_value_alias"],
    );
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
    dictionaryMatcherService.matchUnit = originalMatchUnit;
  }
});

test("normalizeExtractionWithDictionary only emits text value proposals when explicitly collectable", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: true,
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes:
      rawFieldName === "应用"
        ? ["application"]
        : rawFieldName === "可采集文本"
          ? ["collectable_text"]
          : ["remark"],
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: termType === "application" ? "enum" : "text",
    kind: termType === "application" ? "enum" : "text",
    metadata: termType === "collectable_text" ? { collectCandidates: true } : {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: false,
    termType,
    rawValue,
    normalizedValue: rawValue.trim(),
    matchMethod: "term_type_only",
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "备注", value: "普通文本" },
              { field_name: "可采集文本", value: "需要候选" },
              { field_name: "应用", value: "透气膜" },
            ],
          },
        ],
      },
    }) as any;

    assert.deepEqual(
      normalized.dictionaryProposals.proposals.map((proposal: any) => `${proposal.termType}:${proposal.rawValue}`).sort(),
      ["application:透气膜", "collectable_text:需要候选"],
    );
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
  }
});

test("normalizeExtractionWithDictionary attaches master-data model matches", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  const originalMatchModel = productConfigAgentMasterDataService.matchModel;
  const originalMatchModelByAttributes = productConfigAgentMasterDataService.matchModelByAttributes;
  dictionaryMatcherService.matchTermType = async () => ({
    matched: true,
    rawFieldName: "泵型号",
    normalizedFieldName: "泵型号",
    termTypes: ["metering_pump_model"],
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async () => ({
    termType: "metering_pump_model",
    valueKind: "text",
    kind: "value",
    metadata: {},
  });
  dictionaryMatcherService.matchValue = async (_termType: string, rawValue: string) => ({
    matched: true,
    termType: "metering_pump_model",
    rawValue,
    canonicalValue: rawValue.trim(),
    matchMethod: "exact",
  }) as any;
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: false,
    rawUnit,
    canonicalUnit: rawUnit,
  });
  productConfigAgentMasterDataService.matchModel = async (params: any) => ({
    matched: true,
    source: "crm_products_pump",
    id: "99",
    model: params.rawValue.trim(),
    rawValue: params.rawValue,
    matchMethod: "model_trim_exact",
  });
  productConfigAgentMasterDataService.matchModelByAttributes = async () => ({
    masterDataMatch: { matched: false, source: "crm_products_pump", rawValue: "" },
    matchedAttributes: [],
    candidateCount: 0,
    candidates: [],
    reason: "insufficient_attributes",
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [{ field_name: "泵型号", value: " ZB-12 " }],
          },
        ],
      },
    }) as any;

    assert.equal(normalized.items[0].fields.metering_pump_model.masterDataMatch.matched, true);
    assert.equal(normalized.items[0].fields.metering_pump_model.masterDataMatch.id, "99");
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
    dictionaryMatcherService.matchUnit = originalMatchUnit;
    productConfigAgentMasterDataService.matchModel = originalMatchModel;
    productConfigAgentMasterDataService.matchModelByAttributes = originalMatchModelByAttributes;
  }
});

test("normalizeExtractionWithDictionary applies unit aliases and reports master-data no-match", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  const originalMatchModel = productConfigAgentMasterDataService.matchModel;
  const originalMatchModelByAttributes = productConfigAgentMasterDataService.matchModelByAttributes;
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: true,
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: rawFieldName === "泵型号" ? ["metering_pump_model"] : ["heating_power"],
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: termType === "heating_power" ? "number_unit" : "text",
    kind: "value",
    metadata: {},
  });
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: true,
    termType,
    rawValue,
    canonicalValue: rawValue.trim(),
    matchMethod: "exact",
  }) as any;
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: rawUnit === "KW",
    rawUnit,
    canonicalUnit: "kW",
    displayUnit: "kW",
  });
  productConfigAgentMasterDataService.matchModel = async (params: any) => ({
    matched: false,
    source: "crm_products_pump",
    rawValue: params.rawValue,
  });
  productConfigAgentMasterDataService.matchModelByAttributes = async () => ({
    masterDataMatch: { matched: false, source: "crm_products_pump", rawValue: "" },
    matchedAttributes: [],
    candidateCount: 0,
    candidates: [],
    reason: "no_match",
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "泵型号", value: "UNKNOWN-PUMP" },
              { field_name: "加热功率", value: "10KW" },
            ],
          },
        ],
      },
    }) as any;

    assert.equal(normalized.items[0].fields.heating_power.unit, "kW");
    assert.equal(normalized.items[0].fields.metering_pump_model.masterDataMatch.matched, false);
    assert.ok(normalized.warnings.some((warning: any) => warning.type === "master_data_attribute_no_match"));
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
    dictionaryMatcherService.matchUnit = originalMatchUnit;
    productConfigAgentMasterDataService.matchModel = originalMatchModel;
    productConfigAgentMasterDataService.matchModelByAttributes = originalMatchModelByAttributes;
  }
});

test("master-data normalization folds model punctuation and Chinese units", () => {
  assert.equal(normalizeMasterDataModel(" ZB-12 / A "), "zb12a");
  assert.equal(normalizeMasterDataAttribute("１０ 平方厘米/小时"), "10cm2/h");
});
