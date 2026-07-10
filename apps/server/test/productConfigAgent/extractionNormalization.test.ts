import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryMatcherService } from "../../src/modules/productConfigAgent/dictionary/matcher.service.js";
import {
  normalizeExtraction as normalizeExtractionWithProductTypes,
  normalizeExtractionWithDictionary,
} from "../../src/modules/productConfigAgent/normalization/index.js";
import type { ProductTypeDefinition } from "../../src/modules/productConfigAgent/productType/resolver.js";
import {
  normalizeMasterDataAttribute,
  normalizeMasterDataModel,
  productConfigAgentMasterDataService,
} from "../../src/modules/productConfigAgent/masterData.service.js";

const TEST_PRODUCT_TYPES: ProductTypeDefinition[] = [
  { canonicalValue: "flat_die", displayName: "平模头", aliases: ["模头", "片材模头"] },
  { canonicalValue: "coating_die", displayName: "涂布模头", aliases: ["涂布模头"] },
  { canonicalValue: "blown_film_die", displayName: "吹膜模头", aliases: ["吹膜模头"] },
  { canonicalValue: "filter", displayName: "换网器", aliases: ["过滤器", "换网器"] },
  { canonicalValue: "vacuum_box", displayName: "真空箱", aliases: ["真空箱"] },
];

const normalizeExtraction = (value: unknown) => normalizeExtractionWithProductTypes(value, { productTypes: TEST_PRODUCT_TYPES });

dictionaryMatcherService.getLlmDictionaryContext = async () => ({
  product_types: TEST_PRODUCT_TYPES.map((item) => ({
    canonical_value: item.canonicalValue,
    display_name: item.displayName ?? item.canonicalValue,
    aliases: item.aliases ?? [],
  })),
  term_types: [],
});

test("normalizeExtraction coerces item shape and reindexes duplicate item indexes", () => {
  const normalized = normalizeExtraction({
    extraction: {
      document_info: { " 合同号 ": " C-1 " },
      items: [
        { item_index: 1, item_name: " A ", item_quantity: "壹套", fields: { " 功率 ": " 10kW " } },
        { item_index: 1, item_name: " B ", quantity: "十二件", fields: { "压力": " 20MPa " } },
        { item_index: 3, item_name: " C ", item_quantity: "共（          ）件", fields: {} },
      ],
    },
  }) as any;

  assert.equal(normalized.document_info.合同号, "C-1");
  assert.deepEqual(
    normalized.items.map((item: any) => item.item_index),
    [1, 2, 3],
  );
  assert.equal(normalized.items[0].item_quantity, "1");
  assert.equal(normalized.items[1].item_quantity, "12");
  assert.equal(normalized.items[2].item_quantity, null);
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

test("normalizeExtraction uses database-shaped product types for newly added aliases", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [{ item_index: 1, item_name: "真空箱", product_type_hint: "unknown", raw_fields: [] }],
    },
  }) as any;

  assert.equal(normalized.items[0].product_type_hint.value, "vacuum_box");
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

test("normalizeExtraction treats array fields as raw fields and skips trace-only originals", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          fields: [
            { field_name: "适用塑料原料", value: "PP流延膜模头（产量300-400kg/小时）", original: true },
            { field_name: "加热电压", value: "220V 50Hz 三相 4kW" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items[0].fields.适用塑料原料, undefined);
  assert.deepEqual(normalized.items[0].fields.加热电压, { value: 220, unit: "V", raw_value: "220V" });
  assert.deepEqual(normalized.items[0].fields.加热频率, { value: 50, unit: "Hz", raw_value: "50Hz" });
  assert.equal(normalized.items[0].fields.相, "三相");
  assert.deepEqual(normalized.items[0].fields.加热功率, { value: 4, unit: "kW", raw_value: "4kW" });
});

test("normalizeExtraction routes legacy fastener_type to screw_type", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          fields: {
            fastener_type: "12.9高强度",
          },
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items[0].fields.fastener_type, undefined);
  assert.deepEqual(normalized.items[0].fields.screw_type, { value: 12.9, unit: "高强度", raw_value: "12.9高强度" });
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

test("normalizeExtraction splits indexed instance fields into items when model keys align", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [{ field_name: "型号", value: "EXISTING" }],
        },
        {
          item_index: 12,
          product_type_hint: "过滤器",
          raw_fields: [
            {
              field_name: "过滤器型号",
              value: "filters",
              split_fields: [
                { field_name: "过滤器型号", value: "GD-DP-A-120" },
                { field_name: "过滤器型号", value: "GD-DP-A-145" },
              ],
            },
            { field_name: "尺寸1", value: "120mm" },
            { field_name: "尺寸2", value: "145mm" },
            { field_name: "重量1", value: "20kg" },
            { field_name: "重量2", value: "25kg" },
            { field_name: "备注", value: "共用说明" },
          ],
        },
      ],
    },
  }) as any;

  const first = normalized.items.find((item: any) => item.fields.过滤器型号 === "GD-DP-A-120");
  const second = normalized.items.find((item: any) => item.fields.过滤器型号 === "GD-DP-A-145");
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.item_index, 12);
  assert.equal(second.item_index, 2);
  assert.deepEqual(first.fields.尺寸, { value: 120, unit: "mm", raw_value: "120mm" });
  assert.deepEqual(second.fields.尺寸, { value: 145, unit: "mm", raw_value: "145mm" });
  assert.deepEqual(first.fields.重量, { value: 20, unit: "kg", raw_value: "20kg" });
  assert.deepEqual(second.fields.重量, { value: 25, unit: "kg", raw_value: "25kg" });
  assert.equal(first.fields.备注.value, "共用说明");
  assert.equal(second.fields.备注.value, "共用说明");
  assert.equal(Array.isArray(first.fields.尺寸), false);
  assert.equal(second.raw_fields.some((field: any) => field.evidence?.splitFromItemIndex === 12 && field.evidence?.instanceIndex === 2), true);
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "item_instance_split_from_indexed_fields"));
});

test("normalizeExtraction keeps indexed arrays when no model key is present", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            { field_name: "尺寸1", value: "120mm" },
            { field_name: "尺寸2", value: "145mm" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items.length, 1);
  assert.deepEqual(normalized.items[0].fields.尺寸, [
    { value: 120, unit: "mm", raw_value: "120mm" },
    { value: 145, unit: "mm", raw_value: "145mm" },
  ]);
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "item_instance_split_skipped"));
});

test("normalizeExtraction skips indexed item split when model keys do not match indexes", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            { field_name: "过滤器型号1", value: "GD-DP-A-120" },
            { field_name: "尺寸1", value: "120mm" },
            { field_name: "尺寸2", value: "145mm" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items.length, 1);
  assert.deepEqual(normalized.items[0].fields.过滤器型号, ["GD-DP-A-120"]);
  assert.deepEqual(normalized.items[0].fields.尺寸[1], { value: 145, unit: "mm", raw_value: "145mm" });
  assert.ok(normalized.warnings.some((warning: any) => warning.type === "item_instance_split_skipped"));
});

test("normalizeExtraction preserves area qualifiers and splits audited composites", () => {
  const normalized = normalizeExtraction({
    extraction: {
      document_info: {
        "合同编号": "HT-1",
        "订单号": "",
        "客户ID": "C-1",
        "国家": "越南",
        "下单日期": "2023-07-11",
        "交货日期": "2023-08-10",
      },
      items: [
        {
          item_index: 1,
          product_type_hint: "模头",
          raw_fields: [
            { field_name: "上模唇调节方式", value: "手动推式微调" },
            { field_name: "下模唇调节方式", value: "下模整体结构" },
            { field_name: "侧板加热配置", value: "没有" },
            { field_name: "阻流棒角度", value: "90°阻流棒" },
            { field_name: "适用塑料原料", value: "WPC 自由发泡板模头 （产量600-800KG/每小时）" },
            { field_name: "加热电压", value: "380 V / 50 Hz / 三 相" },
            { field_name: "模头安装方式", value: "45°斜挤出安装（中心距700mm）" },
            { field_name: "模体材质", value: "其他 3Cr13钢材" },
            { field_name: "进料口方式", value: "中央方口进料**按客户要求的进料口尺寸***" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.document_info.order_number, undefined);
  assert.equal(normalized.document_info.customer_id, "C-1");
  assert.equal(normalized.document_info.country, "越南");
  assert.equal(normalized.document_info.order_date, "2023-07-11");
  assert.equal(normalized.document_info.delivery_date, "2023-08-10");
  assert.equal(normalized.items[0].fields.上模唇调节方式.qualifier.position, "上模");
  assert.equal(normalized.items[0].fields.下模唇调节方式.qualifier.position, "下模");
  assert.equal(normalized.items[0].fields.侧板加热配置.qualifier.area, "侧板");
  assert.equal(normalized.items[0].fields.阻流棒角度, "90°阻流棒");
  assert.equal(normalized.items[0].fields.适用塑料原料, "WPC");
  assert.equal(normalized.items[0].fields.应用, "自由发泡板");
  assert.deepEqual(normalized.items[0].fields.产量, { min: 600, max: 800, unit: "kg", raw_value: "600-800kg/h" });
  assert.deepEqual(normalized.items[0].fields.加热电压, { value: 380, unit: "V", raw_value: "380V" });
  assert.deepEqual(normalized.items[0].fields.加热频率, { value: 50, unit: "Hz", raw_value: "50Hz" });
  assert.equal(normalized.items[0].fields.相, "三相");
  assert.equal(normalized.items[0].fields.模头安装方式, "45°斜挤出安装");
  assert.deepEqual(normalized.items[0].fields.安装中心距, { value: 700, unit: "mm", raw_value: "700mm" });
  assert.equal(normalized.items[0].fields.模体材质.value, "3Cr13钢材");
  assert.equal(normalized.items[0].fields.模体材质.qualifier.selector, "其他");
  assert.equal(normalized.items[0].fields.进料口方式, "中央方口进料");
  assert.equal(normalized.items[0].fields.进料口尺寸, "要求的进料口尺寸");
});

test("normalizeExtraction splits material/application/feed reference composites", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            { field_name: "适用塑料原料", value: "EVA膜手动模头" },
            { field_name: "进料口方式", value: "中央方口进料 （与9859互配使用）" },
          ],
        },
      ],
    },
  }) as any;

  assert.equal(normalized.items[0].fields.适用塑料原料, "EVA");
  assert.equal(normalized.items[0].fields.应用, "膜");
  assert.equal(normalized.items[0].fields.唇调节方式, "手动");
  assert.equal(normalized.items[0].fields.进料口方式, "中央方口进料");
  assert.equal(normalized.items[0].fields.参考模头, "9859");
});

test("normalizeExtraction does not turn material process composites into application", () => {
  const normalized = normalizeExtraction({
    extraction: {
      items: [
        {
          item_index: 1,
          raw_fields: [
            { field_name: "适用塑料原料", value: "TPU高低温模内二层共挤手动模头" },
            { field_name: "适用塑料原料", value: "CPP自动控制流延模头" },
            { field_name: "适用塑料原料", value: "1550mm自动三层模内共挤流延模头" },
          ],
        },
      ],
    },
  }) as any;

  assert.deepEqual(normalized.items[0].fields.适用塑料原料, ["TPU", "CPP"]);
  assert.deepEqual(normalized.items[0].fields.复合层次, ["双层模内共挤", "三层模内共挤"]);
  assert.equal(normalized.items[0].fields.层温度, "高低温");
  assert.deepEqual(normalized.items[0].fields.工艺, ["流延", "流延"]);
  assert.deepEqual(normalized.items[0].fields.自动化, ["自动控制", "自动"]);
  assert.equal(normalized.items[0].fields.应用, undefined);
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

test("normalizeExtractionWithDictionary keeps qualifiers and suppresses non-enum value proposals", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  const termTypes: Record<string, string> = {
    上模唇调节方式: "upper_lip_adjustment_method",
    侧板加热配置: "heating_config",
    模头有效宽度: "die_effective_width",
    连接器配置: "connector_config",
    备注: "remark",
    应用: "application",
  };
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: Boolean(termTypes[rawFieldName]),
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: termTypes[rawFieldName] ? [termTypes[rawFieldName]] : [],
    matchMethod: termTypes[rawFieldName] ? "alias_exact" : "none",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind:
      termType === "die_effective_width"
        ? "number_unit"
        : termType === "connector_config"
          ? "boolean"
          : termType === "application"
            ? "enum"
            : "text",
    kind: "value",
    metadata: {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: false,
    termType,
    rawValue,
    normalizedValue: rawValue.trim(),
    matchMethod: "term_type_only",
  }) as any;
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: true,
    rawUnit,
    canonicalUnit: rawUnit,
    displayUnit: rawUnit,
  });
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "上模唇调节方式", value: "手动推式微调" },
              { field_name: "侧板加热配置", value: "没有" },
              { field_name: "模头有效宽度", value: "905mm" },
              { field_name: "连接器配置", value: "没有" },
              { field_name: "备注", value: "普通文本" },
              { field_name: "应用", value: "自由发泡板" },
            ],
          },
        ],
      },
    }) as any;

    assert.equal(normalized.items[0].fields.upper_lip_adjustment_method.qualifier.position, "上模");
    assert.equal(normalized.items[0].fields.heating_config.qualifier.area, "侧板");
    assert.deepEqual(
      normalized.dictionaryProposals.proposals.map((proposal: any) => `${proposal.termType}:${proposal.rawValue}`),
      ["application:自由发泡板"],
    );
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
    dictionaryMatcherService.matchUnit = originalMatchUnit;
  }
});

test("normalizeExtractionWithDictionary maps surface plating fields to base term types with area qualifiers", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  const termTypes: Record<string, string> = {
    表面镀层要求: "surface_plating_type",
    流道表面镀层厚度: "channel_plating_thickness",
    流道表面镀层硬度: "channel_plating_hardness",
    外表面镀层厚度: "external_plating_thickness",
    表面处理备注: "surface_treatment_note",
    流道表面粗糙度: "chanel_roughness",
  };
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: Boolean(termTypes[rawFieldName]),
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: termTypes[rawFieldName] ? [termTypes[rawFieldName]] : [],
    matchMethod: termTypes[rawFieldName] ? "alias_exact" : "none",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: termType.includes("thickness") ? "number_unit" : termType.includes("note") || termType.includes("roughness") ? "text" : "enum",
    kind: "value",
    metadata: {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: termType === "surface_plating_type" && rawValue === "镀铬",
    termType,
    rawValue,
    normalizedValue: rawValue.trim(),
    canonicalValue: rawValue,
    displayName: rawValue,
    termId: 1,
    aliasId: 2,
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: rawUnit === "mm",
    rawUnit,
    canonicalUnit: rawUnit,
    displayUnit: rawUnit,
  });
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              {
                field_name: "电镀",
                value: "组合项",
                raw_text: [
                  "[SEL] 表面镀层要求：镀铬",
                  "[SEL] 流道表面镀层厚度：0.02-0.04mm",
                  "[SEL] 流道表面镀层硬度：HV800-900",
                  "[SEL] 外表面镀层厚度：0.01-0.02mm",
                  "[SEL] 表面处理备注：按图处理",
                ].join("\n"),
              },
              { field_name: "流道表面粗糙度", value: "Ra0.02-0.03" },
            ],
          },
        ],
      },
    }) as any;

    const fields = normalized.items[0].fields;
    assert.equal(fields.unknown_field, undefined);
    assert.equal(fields.surface_plating_type, undefined);
    assert.equal(fields.channel_plating_thickness, undefined);
    assert.equal(fields.channel_plating_hardness, undefined);
    assert.equal(fields.external_plating_thickness, undefined);
    assert.equal(fields.chanel_roughness, undefined);
    assert.equal(fields.plating_type.value.value, "镀铬");
    assert.equal(fields.plating_type.qualifier.area, "surface");
    assert.equal(fields.plating_type.value.dictionary.term_type, "plating_type");
    assert.deepEqual(fields.plating_thickness[0].qualifier, { area: "channel" });
    assert.deepEqual(fields.plating_thickness[0].value, { min: 0.02, max: 0.04, unit: "mm", raw_value: "0.02-0.04mm", display_unit: "mm" });
    assert.deepEqual(fields.plating_thickness[1].qualifier, { area: "external_surface" });
    assert.equal(fields.plating_hardness.qualifier.area, "channel");
    assert.equal(fields.surface_treatment_note.qualifier.area, "surface");
    assert.equal(fields.surface_roughness.qualifier.area, "channel");
    assert.deepEqual(
      normalized.dictionaryProposals.proposals.map((proposal: any) => `${proposal.termType}:${proposal.rawValue}`).sort(),
      ["plating_hardness:HV800-900"],
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

test("normalizeExtractionWithDictionary ignores plastic material test-condition fragments", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  dictionaryMatcherService.matchTermType = async () => ({
    matched: true,
    rawFieldName: "适用塑料原料",
    normalizedFieldName: "适用塑料原料",
    termTypes: ["plastic_material"],
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async () => ({
    termType: "plastic_material",
    valueKind: "enums",
    kind: "enums",
    metadata: {},
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
              {
                field_name: "适用塑料原料",
                value: "PP-Homo MFI0.3-3.0g/10min at 230°C/2.16kg、PVDF",
              },
            ],
          },
        ],
      },
    }) as any;

    assert.deepEqual(normalized.items[0].fields.plastic_material, ["PVDF"]);
    assert.deepEqual(
      normalized.dictionaryProposals.proposals.map((proposal: any) => proposal.rawValue),
      ["PVDF"],
    );
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
  }
});

test("normalizeExtractionWithDictionary cleans wrapped enum values before dictionary match", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const termTypes: Record<string, string> = {
    液压阀类型: "hydraulic_valve_type",
    连接图纸: "connection_drawing_status",
    安装方式: "die_mounting_method",
    感温来源: "sensor_source",
    加热相位: "heating_phase",
  };
  const canonical = new Set(["电磁阀", "需方客户提供图纸", "45°斜挤出安装", "国产", "单相"]);
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: true,
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: [termTypes[rawFieldName]],
    matchMethod: "alias_exact",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: "enum",
    kind: "enum",
    metadata: {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: canonical.has(rawValue),
    termType,
    rawValue,
    normalizedValue: rawValue.trim(),
    canonicalValue: rawValue,
    displayName: rawValue,
    matchMethod: canonical.has(rawValue) ? "alias_exact" : "term_type_only",
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "液压阀类型", value: "电磁阀液压站" },
              { field_name: "连接图纸", value: "需方客户提供图纸　　提供图纸日期：          图纸接收人签名：" },
              { field_name: "安装方式", value: "45°斜挤出安装（微调朝下）" },
              { field_name: "感温来源", value: "国产，按需方提供图纸" },
              { field_name: "加热相位", value: "单" },
            ],
          },
        ],
      },
    }) as any;

    assert.deepEqual(
      Object.values(normalized.items[0].fields).map((value: any) => value.value).sort(),
      ["45°斜挤出安装", "单相", "国产", "电磁阀", "需方客户提供图纸"].sort(),
    );
    assert.deepEqual(normalized.dictionaryProposals.proposals, []);
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
  }
});

test("normalizeExtractionWithDictionary cleans enum composites and drops enum noise", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const termTypes: Record<string, string> = {
    应用: "application",
    模体材质: "product_material",
    加热相位: "heating_phase",
  };
  const canonical = new Set(["中空板材", "1.2714A"]);
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: Boolean(termTypes[rawFieldName]),
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: termTypes[rawFieldName] ? [termTypes[rawFieldName]] : [],
    matchMethod: termTypes[rawFieldName] ? "alias_exact" : "none",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: "enum",
    kind: "enum",
    metadata: {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => ({
    matched: canonical.has(rawValue),
    termType,
    rawValue,
    normalizedValue: rawValue.trim(),
    canonicalValue: rawValue,
    displayName: rawValue,
    matchMethod: canonical.has(rawValue) ? "alias_exact" : "term_type_only",
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "应用", value: "2180mm  中空板材" },
              { field_name: "模体材质", value: "A （1.2714A）" },
              { field_name: "加热相位", value: "（      相 ）" },
              { field_name: "应用", value: "国内使用" },
            ],
          },
        ],
      },
    }) as any;

    const application = normalized.items[0].fields.application;
    assert.equal(Array.isArray(application) ? application[0].value : application.value, "中空板材");
    assert.equal(normalized.items[0].fields.product_material.value, "1.2714A");
    assert.equal(normalized.items[0].fields.heating_phase, undefined);
    assert.deepEqual(normalized.dictionaryProposals.proposals, []);
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
  }
});

test("normalizeExtractionWithDictionary resolves doc100-200 residual enum noise", async () => {
  const originalMatchTermType = dictionaryMatcherService.matchTermType;
  const originalGetTermTypeContext = dictionaryMatcherService.getTermTypeContext;
  const originalMatchValue = dictionaryMatcherService.matchValue;
  const originalMatchUnit = dictionaryMatcherService.matchUnit;
  const termTypes: Record<string, string> = {
    产品材质: "product_material",
    应用: "application",
    进料口方式: "feed_inlet_method",
    "堵边 / 调幅结构": "deckle_type",
    单边挡块宽度: "single_side_deckle_width",
    模头宽度调节方式: "deckle_type",
    堵边调节范围: "deckle_adjustment_range",
    堵边详细说明: "deckle_note",
    接插接要求: "plug_connection_requirement",
    唇调节方式: "lip_adjustment_method",
    模唇厚度调节范围: "lip_thickness_adjustment_range",
    适用塑料原料: "plastic_material",
    复合层次: "layer_count",
    层位作用: "layer_role",
    "45°挤出微调方向": "extrusion_fine_adjustment_direction",
  };
  const valueKinds: Record<string, string> = {
    single_side_deckle_width: "number_unit",
    deckle_adjustment_range: "text",
    deckle_note: "text",
    layer_count: "number",
    layer_role: "text",
    lip_thickness_adjustment_range: "number_unit",
    plug_connection_requirement: "text",
  };
  const canonical: Record<string, string> = {
    "product_material:1.2311A": "1.2311_Forged",
    "application:流延膜": "流延膜",
    "feed_inlet_method:形状或不同位置进料": "other_feed_shape_or_position",
    "deckle_type:外堵式": "external_standard_deckle",
    "lip_adjustment_method:手动推式微调": "manual_push_fine_adjustment",
    "lip_adjustment_method:整体结构": "integral_structure",
    "lip_adjustment_method:自动推、拉式微调": "auto_push_pull_fine_adjustment",
    "plastic_material:PVDF母料": "PVDF母料",
    "plastic_material:配方料": "配方料",
    "extrusion_fine_adjustment_direction:45°挤出微调朝下": "downward",
  };
  dictionaryMatcherService.matchTermType = async (rawFieldName: string) => ({
    matched: Boolean(termTypes[rawFieldName]),
    rawFieldName,
    normalizedFieldName: rawFieldName,
    termTypes: termTypes[rawFieldName] ? [termTypes[rawFieldName]] : [],
    matchMethod: termTypes[rawFieldName] ? "alias_exact" : "none",
  }) as any;
  dictionaryMatcherService.getTermTypeContext = async (termType: string) => ({
    termType,
    valueKind: valueKinds[termType] ?? "enum",
    kind: valueKinds[termType] ?? "enum",
    metadata: {},
  }) as any;
  dictionaryMatcherService.matchValue = async (termType: string, rawValue: string) => {
    const key = `${termType}:${rawValue}`;
    return {
      matched: Boolean(canonical[key]),
      termType,
      rawValue,
      normalizedValue: rawValue.trim(),
      canonicalValue: canonical[key],
      displayName: canonical[key],
      matchMethod: canonical[key] ? "alias_exact" : "term_type_only",
    } as any;
  };
  dictionaryMatcherService.matchUnit = async (rawUnit: string) => ({
    matched: rawUnit === "mm" || rawUnit === "层",
    rawUnit,
    canonicalUnit: rawUnit,
    displayUnit: rawUnit,
  }) as any;
  try {
    const normalized = await normalizeExtractionWithDictionary({
      extraction: {
        items: [
          {
            item_index: 1,
            raw_fields: [
              { field_name: "产品材质", value: "B （2311A钢材）" },
              { field_name: "应用", value: "流延膜（软质透明桌布）" },
              { field_name: "应用", value: "板材" },
              { field_name: "进料口方式", value: "形状" },
              { field_name: "进料口方式", value: "形状或不同位置进料" },
              { field_name: "堵边 / 调幅结构", value: "外堵式（单边挡150mm）" },
              { field_name: "模头宽度调节方式", value: "2520 mm / 模体、模唇配打冷却孔" },
              { field_name: "产品主体加热方式", value: "特殊：用航空插头转接" },
              { field_name: "唇调节方式", value: "模唇厚度调节范围（ 0.7mm可调 ）" },
              { field_name: "唇调节方式", value: "下模唇整体结构" },
              { field_name: "唇调节方式", value: "上模手动推式微调；采用热膨胀螺栓自动推、拉式弹性微调" },
              { field_name: "45°挤出微调方向", value: "45°挤出微调朝下" },
              { field_name: "适用塑料原料", value: "类似沥青（客户提供原料）" },
              { field_name: "适用塑料原料", value: "PVDF自动流延模头\n》》》原料王志已检测，存档编号211617，P1是PVDF母料，P3、P4、P6是配方料，P1、P4是做表面层的，P3是中间层" },
              { field_name: "应用", value: "自由发泡板模头 ，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，螺纹套不要焊接在模体上，配打液压手板孔" },
            ],
          },
        ],
      },
    }) as any;

    const fields = normalized.items[0].fields;
    assert.equal(fields.product_material.value, "1.2311_Forged");
    const applications = Array.isArray(fields.application) ? fields.application : [fields.application];
    assert.equal(applications.some((item: any) => item?.value === "流延膜"), true);
    assert.equal(fields.feed_inlet_method.value, "other_feed_shape_or_position");
    assert.equal(fields.deckle_type.value.value, "external_standard_deckle");
    assert.deepEqual(fields.single_side_deckle_width, { value: 150, unit: "mm", raw_value: "150mm", display_unit: "mm" });
    assert.deepEqual(fields.deckle_adjustment_range, { value: 2520, unit: "mm", raw_value: "2520 mm" });
    assert.deepEqual(fields.deckle_note, { value: "模体及模唇配打冷却孔", kind: "note" });
    assert.equal(fields.plug_connection_requirement, "用航空插头转接");
    assert.equal(fields.lip_thickness_adjustment_range.value.value.value, 0.7);
    assert.match(JSON.stringify(fields.lip_adjustment_method), /integral_structure/);
    assert.match(JSON.stringify(fields.lip_adjustment_method), /auto_push_pull_fine_adjustment/);
    assert.equal(fields.extrusion_fine_adjustment_direction.value, "downward");
    assert.deepEqual(fields.layer_count, { value: 3, unit: "层", raw_value: "3层", display_unit: "层" });
    assert.deepEqual(fields.plastic_material, [
      { value: "PVDF母料", qualifier: { layer: "P1" }, sourceText: "" },
      { value: "配方料", qualifier: { layer: "P3" }, sourceText: "" },
      { value: "配方料", qualifier: { layer: "P4" }, sourceText: "" },
      { value: "配方料", qualifier: { layer: "P6" }, sourceText: "" },
    ]);
    assert.deepEqual(fields.layer_role, [
      { value: "表面层", qualifier: { layer: "P1" }, sourceText: "" },
      { value: "表面层", qualifier: { layer: "P4" }, sourceText: "" },
      { value: "中间层", qualifier: { layer: "P3" }, sourceText: "" },
    ]);
    assert.deepEqual(normalized.dictionaryProposals.proposals, []);
  } finally {
    dictionaryMatcherService.matchTermType = originalMatchTermType;
    dictionaryMatcherService.getTermTypeContext = originalGetTermTypeContext;
    dictionaryMatcherService.matchValue = originalMatchValue;
    dictionaryMatcherService.matchUnit = originalMatchUnit;
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
