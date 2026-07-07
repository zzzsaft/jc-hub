import assert from "node:assert/strict";
import test from "node:test";
import { conceptIssueDetectorService } from "../../src/modules/productConfigAgent/dictionary/conceptIssueDetector.service.js";
import { AUTO_ACCEPT_PENDING_THRESHOLD, ResolverRoutingService } from "../../src/modules/productConfigAgent/dictionary/resolverRouting.service.js";

const routing = new ResolverRoutingService();

test("concept issue detector flags composite, document-scope, placeholder, and cross-term risks", () => {
  const composite = conceptIssueDetectorService.detect({
    candidateType: "value",
    termType: "material",
    rawValue: "PVC/ABS",
  });
  assert.equal(composite[0].relationType, "composite_value");
  assert.equal(composite[0].recommendedAction, "split_value");

  const scope = conceptIssueDetectorService.detect({
    candidateType: "value",
    termType: "material",
    rawFieldName: "客户",
    rawValue: "ABC",
  });
  assert.equal(scope[0].relationType, "wrong_scope");
  assert.equal(scope[0].riskLevel, "high");

  const placeholder = conceptIssueDetectorService.detect({
    candidateType: "value",
    termType: "color",
    rawValue: "未选",
  });
  assert.equal(placeholder[0].relationType, "non_config_noise");

  const crossTerm = conceptIssueDetectorService.detect({
    candidateType: "value",
    termType: "color",
    rawValue: "PVC",
    knownValueAliasTermTypes: ["plastic_material"],
  });
  assert.equal(crossTerm[0].relationType, "different_concept");
});

test("resolver routing preserves old threshold and safety semantics", () => {
  const target = {
    targetType: "term" as const,
    id: "1",
    termType: "material",
    canonicalValue: "PVC",
    relationType: "exact_alias" as const,
    score: 0.95,
  };

  assert.equal(
    routing.route({
      candidateType: "value",
      termType: "deckle_type",
      topTarget: target,
      occurrenceCount: 2,
      aliasExact: true,
      issues: [],
      valueKind: "enum",
      unifiedScore: AUTO_ACCEPT_PENDING_THRESHOLD,
      config: { llmEnabled: true },
    }).route,
    "auto_accept_pending",
  );

  assert.equal(
    routing.route({
      candidateType: "term_type",
      topTarget: null,
      occurrenceCount: 2,
      aliasExact: false,
      issues: [],
      valueKind: "enum",
      unifiedScore: 0.99,
      config: { llmEnabled: true },
    }).route,
    "human_review",
  );

  assert.equal(
    routing.route({
      candidateType: "value",
      topTarget: { ...target, relationType: "synonym_alias", score: 0.8 },
      occurrenceCount: 2,
      aliasExact: false,
      issues: [],
      valueKind: "enum",
      unifiedScore: 0.8,
      config: { llmEnabled: true },
    }).route,
    "llm_review",
  );
});
