import assert from "node:assert/strict";
import test from "node:test";
import { splitMultiValueText, buildMultiValueSplitSuggestion } from "../../src/modules/productConfigAgent/dictionary/multiValue.js";
import { matchQualifierText } from "../../src/modules/productConfigAgent/dictionary/qualifierMatcher.js";
import { detectValueLikeFieldName, isLikelyValueLikeFieldName } from "../../src/modules/productConfigAgent/dictionary/valueLikeFieldName.js";
import { PolicyScoringService } from "../../src/modules/productConfigAgent/dictionary/policyScoring.service.js";
import { ConceptTargetScoringService } from "../../src/modules/productConfigAgent/dictionary/conceptTargetScoring.service.js";

test("multi-value parser splits business lists without splitting rate units", () => {
  assert.deepEqual(splitMultiValueText("PVC、PET/PP"), ["PVC", "PET", "PP"]);
  assert.deepEqual(splitMultiValueText("kg/h"), ["kg/h"]);
  assert.deepEqual(buildMultiValueSplitSuggestion("plastic_material", "PVC、PET"), [
    { termType: "plastic_material", rawValue: "PVC", canonicalValue: "PVC", confidence: 0.76 },
    { termType: "plastic_material", rawValue: "PET", canonicalValue: "PET", confidence: 0.76 },
  ]);
});

test("qualifier matcher extracts scoped variants", () => {
  assert.deepEqual(matchQualifierText("上模温度"), {
    qualifier: "上模",
    normalizedQualifier: "upper_die",
    baseText: "温度",
    confidence: 0.82,
  });
  assert.equal(matchQualifierText("普通温度"), null);
});

test("value-like field name detector flags values but not stable field keys", () => {
  assert.equal(isLikelyValueLikeFieldName("PVC自由发泡板"), true);
  assert.equal(isLikelyValueLikeFieldName("材料类型"), false);
  assert.deepEqual(detectValueLikeFieldName("双柱液压"), {
    type: "value_like_field_name",
    severity: "warning",
    rawFieldName: "双柱液压",
    matchedKnownAlias: null,
    message: "Field name looks like a dictionary value rather than a stable term type",
  });
});

test("policy scoring penalizes blocking issues and rejected candidates", () => {
  const evaluation = new PolicyScoringService().evaluate({
    target: {
      targetType: "term",
      relationType: "exact_alias",
      score: 0.94,
      canonicalValue: "PVC",
    },
    issues: [{
      detector: "CompositeValueDetector",
      relationType: "composite_value",
      recommendedAction: "split_value",
      confidence: 0.8,
      riskLevel: "high",
      reason: "must split",
      blocksAutoApply: true,
    }],
    matchContext: { candidateStatus: "rejected", occurrenceCount: 20 },
  });

  assert.equal(evaluation.hardConstraints.length, 2);
  assert.ok(evaluation.finalScore < 0.7);
  assert.ok(evaluation.riskLabels.includes("composite_value"));
  assert.ok(evaluation.riskLabels.includes("deprecated_candidate"));
});

test("concept target scoring attaches policy-adjusted score and breakdown", () => {
  const service = new ConceptTargetScoringService();
  const scored = service.scoreTargets({
    targets: [
      { targetType: "term", relationType: "exact_alias", score: 0.9, canonicalValue: "A" },
      { targetType: "term", relationType: "exact_alias", score: 0.8, canonicalValue: "B" },
    ],
    auditSignal: { riskScore: 80, riskLabels: ["alias_purity"] },
  });

  assert.equal(scored[0].canonicalValue, "A");
  assert.ok(scored[0].contextAwareScore < 0.9);
  assert.ok(scored[0].scoreBreakdown);
});
