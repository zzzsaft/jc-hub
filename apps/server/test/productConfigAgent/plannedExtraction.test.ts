import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryWarningItemIndexes,
  buildBatchItemExtractSystemPrompt,
  buildItemInputText,
  buildItemExtractSystemPrompt,
  filterDictionaryContextForProductType,
  mapExtractionWarnings,
  numberLlmText,
  parseJsonContent,
  reindexDuplicateResultItems,
  selectPlannedExtractionProvider,
  validateLlmExtractionResult,
  validateBatchPlannedExtractionContent,
  validatePlannedExtractionContent,
} from "../../src/modules/productConfigAgent/extraction/plannedExtraction.js";

test("buildItemInputText maps Excel Row ranges to physical llm text lines", () => {
  const llmText = ["文件名：x", "Sheet：S", "Row 7:", "[A7] 模头", "[B7] 宽度 100mm"].join("\n");
  const result = buildItemInputText(llmText, null, {
    item_index: 1,
    item_name: "模头",
    product_type_hint: "flat_die",
    llm_text_ranges: [{ start_line: 7, end_line: 7 }],
  });

  assert.equal(result.rangeSource, "excel_row");
  assert.match(result.text, /模头/);
  assert.equal((result.warnings[0] as any).type, "plan_range_excel_row_mapped");
});

test("reindexDuplicateResultItems assigns unused indexes and emits evidence warning", () => {
  const result = reindexDuplicateResultItems({
    llmResult: {
      extraction: {
        items: [
          { item_index: 1, raw_fields: [{ field_name: "尺寸1", value: "A" }] },
          { item_index: 1, raw_fields: [{ field_name: "尺寸2", value: "B" }] },
        ],
      },
      warnings: [],
    },
  });

  assert.deepEqual(
    result.extraction.items.map((item: any) => item.item_index),
    [1, 2],
  );
  assert.equal(result.warnings[0].type, "item_instance_split_from_indexed_fields");
});

test("boundaryWarningItemIndexes scopes blocking warnings", () => {
  assert.deepEqual([...boundaryWarningItemIndexes([{ type: "current_item_blocks_mismatch", evidence: { item_index: 3 } }], [1, 2])], [3]);
  assert.deepEqual([...boundaryWarningItemIndexes([{ type: "current_item_blocks_mismatch" }], [1, 2])], [1, 2]);
  assert.match(numberLlmText("a\nb"), /0002: b/);
});

test("validateLlmExtractionResult accepts strict raw extraction shape", () => {
  const result = validateLlmExtractionResult({
    extraction: {
      document_info: {
        contract_number: { value: "HT-1", evidence: { row: 1 }, confidence: 0.9 },
      },
      items: [
        {
          item_index: 1,
          item_name: { value: "模头", evidence: {}, confidence: 0.8 },
          product_type_hint: { value: "flat_die", raw_value: "模头", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "两侧板加热",
              value: "220V",
              evidence: { cell: "A1" },
              confidence: 0.82,
              qualifier: { area: "side_plate", layer_index: 2 },
              split_fields: [{ field_name: "电压", value: "220V", confidence: 0.8 }],
            },
          ],
        },
      ],
    },
    warnings: [{ type: "low_confidence", message: "ok", evidence: { item_index: 1 } }],
  }) as any;

  assert.equal(result.extraction.items[0].raw_fields[0].qualifier.layerIndex, 2);
  assert.equal(result.warnings[0].type, "low_confidence");
});

test("validateLlmExtractionResult rejects dictionary-normalized fields in raw_fields", () => {
  assert.throws(
    () =>
      validateLlmExtractionResult({
        extraction: {
          items: [
            {
              item_index: 1,
              raw_fields: [
                {
                  field_name: "材质",
                  value: "POM",
                  canonical_value: "pom",
                  evidence: {},
                  confidence: 0.9,
                },
              ],
            },
          ],
        },
      }),
    /must not include canonical_value/,
  );
  assert.throws(
    () =>
      validateLlmExtractionResult({
        extraction: {
          items: [
            {
              item_index: 1,
              raw_fields: [{ field_name: "材质", value: "POM", term_type: "plastic_material", evidence: {}, confidence: 0.9 }],
            },
          ],
        },
      }),
    /must not include term_type/,
  );
});

test("validatePlannedExtractionContent parses JSON content and enforces evidence/confidence", () => {
  assert.equal(
    validatePlannedExtractionContent(
      JSON.stringify({
        extraction: {
          items: [{ item_index: 1, raw_fields: [{ field_name: "宽度", value: "100mm", evidence: {}, confidence: 0.9 }] }],
        },
      }),
    ).extraction.items[0].raw_fields[0].field_name,
    "宽度",
  );
  assert.throws(
    () =>
      validatePlannedExtractionContent({
        extraction: {
          items: [{ item_index: 1, raw_fields: [{ field_name: "宽度", value: "100mm", confidence: 0.9 }] }],
        },
      }),
    /evidence is required/,
  );
});

test("parseJsonContent recovers fenced and prefixed JSON while reporting malformed content", () => {
  assert.deepEqual(parseJsonContent("prefix```json\n{\"ok\":true}\n```suffix"), { ok: true });
  assert.deepEqual(parseJsonContent("LLM result: {\"ok\":true}\nthanks"), { ok: true });
  assert.throws(() => parseJsonContent("not json"), /Unable to parse LLM JSON content/);
});

test("planned extraction provider selection and warning mapper expose compatibility shape", () => {
  assert.equal(selectPlannedExtractionProvider({ forceSingleStage: true }), "single_stage_fallback");
  assert.equal(selectPlannedExtractionProvider({ llmModel: "deepseek" }), "routed_chat_json");
  assert.deepEqual(mapExtractionWarnings([
    "plain",
    { type: "range_warning", message: "bad range", evidence: { item_index: 2 }, field_path: "items/1" },
  ]), [
    { code: "llm_warning", type: "llm_warning", message: "plain", details: {} },
    {
      code: "range_warning",
      type: "range_warning",
      message: "bad range",
      itemIndex: 2,
      fieldPath: "items/1",
      details: { item_index: 2 },
    },
  ]);
});

test("validateBatchPlannedExtractionContent matches requested items and fills plan product type hint", () => {
  const inputs = [
    {
      documentId: 1,
      extractionResultId: 10,
      plan: {
        items: [
          { item_index: 2, item_name: "分配器", product_type_hint: "feedblock", product_type_raw: "分配器" },
        ],
      },
      item: { item_index: 2, item_name: "分配器", product_type_hint: "feedblock", product_type_raw: "分配器" },
      llmText: "分配器型号 FB-1",
    },
  ];
  const result = validateBatchPlannedExtractionContent(
    {
      results: [
        {
          documentId: 1,
          extractionResultId: 10,
          item_index: 2,
          extraction: {
            items: [
              {
                item_index: 2,
                raw_fields: [{ field_name: "型号", value: "FB-1", evidence: {}, confidence: 0.9 }],
              },
            ],
          },
          warnings: [],
        },
      ],
    },
    inputs,
  ) as any;

  assert.equal(result[0].itemIndex, 2);
  assert.equal(result[0].result.extraction.items[0].product_type_hint.value, "feedblock");
});

test("validateBatchPlannedExtractionContent rejects missing, extra, duplicate, and invalid item results", () => {
  const inputs = [
    {
      documentId: 1,
      extractionResultId: 10,
      plan: { items: [{ item_index: 1 }] },
      item: { item_index: 1 },
      llmText: "A",
    },
  ];
  const validItem = {
    documentId: 1,
    extractionResultId: 10,
    item_index: 1,
    extraction: {
      items: [{ item_index: 1, raw_fields: [{ field_name: "宽度", value: "100mm", evidence: {}, confidence: 0.9 }] }],
    },
    warnings: [],
  };

  assert.throws(() => validateBatchPlannedExtractionContent({ results: [] }, inputs), /missing requested item/);
  assert.throws(
    () =>
      validateBatchPlannedExtractionContent(
        { results: [{ ...validItem, item_index: 2 }] },
        inputs,
      ),
    /does not match any requested batch item/,
  );
  assert.throws(
    () => validateBatchPlannedExtractionContent({ results: [validItem, validItem] }, inputs),
    /Duplicate batch result/,
  );
  assert.throws(
    () =>
      validateBatchPlannedExtractionContent(
        {
          results: [
            {
              ...validItem,
              extraction: {
                items: [
                  {
                    item_index: 1,
                    raw_fields: [{ field_name: "宽度", value: "100mm", parsed_value: 100, evidence: {}, confidence: 0.9 }],
                  },
                ],
              },
            },
          ],
        },
        inputs,
      ),
    /must not include parsed_value/,
  );
});

test("filterDictionaryContextForProductType keeps matching/common/global terms and scores product terms first", () => {
  const context = {
    product_types: [{ canonical_value: "flat_die", display_name: "模头", description: "平模头", aliases: ["模具"] }],
    term_types: [
      { term_type: "pump_only", display_name: "泵字段", value_kind: "text", applicable_product_types: ["metering_pump"], aliases: [] },
      { term_type: "common_note", display_name: "备注", value_kind: "text", applicable_product_types: ["common"], aliases: ["备注"] },
      { term_type: "width", display_name: "宽度", value_kind: "number_unit", applicable_product_types: ["flat_die"], aliases: ["有效宽度", "口模宽度"] },
      { term_type: "global", display_name: "通用", value_kind: "enum", applicable_product_types: [], aliases: [] },
    ],
  } as any;

  const filtered = filterDictionaryContextForProductType(context, "flat_die");

  assert.deepEqual(
    filtered.term_types.map((item) => item.term_type),
    ["width", "common_note", "global"],
  );
});

test("two-stage extraction prompts preserve raw-extraction safety and split-field rules", () => {
  for (const prompt of [
    buildItemExtractSystemPrompt("flat_die", {
      product_types: [{ canonical_value: "flat_die", display_name: "模头", description: "平模头", aliases: ["模具"] }],
      term_types: [],
    }),
    buildBatchItemExtractSystemPrompt("flat_die"),
  ]) {
    assert.match(prompt, /只做 raw extraction，不做 normalization/);
    assert.match(prompt, /禁止出现 term_type、canonical_value、parsed_value/);
    assert.match(prompt, /split_fields .*单一业务属性/);
    assert.match(prompt, /PE\+CaCo3透气膜/);
    assert.match(prompt, /qualifier\.area="side_plate"/);
    assert.match(prompt, /field_name="测温点距内表面"/);
  }
});
