import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeClusterReviewSuggestion,
  normalizeSplitSuggestions,
  normalizeTermTypeReviewSuggestion,
  normalizeValueReviewSuggestion,
  parseSuggestionJson,
  sanitizeTermType,
} from "../../src/modules/productConfigAgent/dictionary/dictionarySuggestion.helpers.js";

test("parseSuggestionJson extracts fenced or prefixed JSON payloads", () => {
  assert.deepEqual(parseSuggestionJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseSuggestionJson("模型输出如下：{\"termType\":\"material\"}"), { termType: "material" });
});

test("suggestion normalization clamps actions, confidence, aliases, and product types", () => {
  assert.equal(sanitizeTermType(" 物料 类型!! ", "fallback"), "fallback");
  assert.equal(sanitizeTermType("Material Type!! ", "fallback"), "material_type");

  const termType = normalizeTermTypeReviewSuggestion(
    {
      recommendedAction: "unsafe_apply",
      confidence: 2,
      suggestedAliases: ["材质", "材质", "原料"],
      suggestedApplicableProductTypes: Array.from({ length: 20 }, (_, index) => `p${index}`),
      splits: [{ termType: "material", canonicalValue: "PVC" }],
    },
    "11",
  );
  assert.equal(termType.recommendedAction, "needs_human_review");
  assert.equal(termType.confidence, 1);
  assert.deepEqual(termType.suggestedAliases, ["材质", "原料"]);
  assert.equal(termType.suggestedApplicableProductTypes.length, 12);
  assert.equal(termType.splits.length, 1);

  const value = normalizeValueReviewSuggestion({ recommendedAction: "move_to_other_term_type", confidence: -1 }, "12");
  assert.equal(value.recommendedAction, "move_to_other_term_type");
  assert.equal(value.confidence, 0);
});

test("split and cluster review suggestions filter unsafe batch operations and expand valid templates", () => {
  assert.deepEqual(
    normalizeSplitSuggestions({
      suggestions: [
        { termType: "material", canonicalValue: "PVC", aliases: ["PVC", "PVC"] },
        { termType: "", canonicalValue: "ignored" },
      ],
    }),
    [{ termType: "material", displayName: undefined, canonicalValue: "PVC", aliases: ["PVC"] }],
  );

  const normalized = normalizeClusterReviewSuggestion(
    {
      recommendedAction: "approve_as_alias",
      confidence: 0.7,
      batchOperationsPreview: [
        { candidateType: "value", candidateId: "1", action: "approve_as_alias", payload: { targetTermId: "9" } },
        { candidateType: "term_type", candidateId: "1", action: "create_term_type" },
        { candidateType: "value", candidateId: "999", action: "reject" },
      ],
    },
    {
      clusterId: "cluster-1",
      candidateType: "value",
      candidateIds: ["1", "2"],
      occurrenceCount: 3,
      documentCount: 2,
    },
  );

  assert.equal(normalized.recommendedAction, "approve_as_alias");
  assert.deepEqual(
    normalized.batchOperationsPreview.map((item) => [item.candidateId, item.action]),
    [
      ["1", "approve_value_as_alias"],
      ["2", "approve_value_as_alias"],
    ],
  );
});
