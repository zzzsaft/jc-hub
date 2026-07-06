import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import {
  getArchiveFeatureKeysForTermType,
  getTermTypesForArchiveFeatureKey,
  normalizeArchiveFeatureKey,
} from "../../src/productConfigAgent/archive/archiveFeatureKeys.js";
import { getLegacyArchiveSearchFieldConfig } from "../../src/productConfigAgent/archive/insertGate.js";
import {
  buildSearchPolicyDiagnostics,
  buildTermTypeSearchPolicy,
  loadTermTypeSearchPolicy,
} from "../../src/productConfigAgent/archive/searchPolicy.js";

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

test("term type search policy groups valid metadata by tier and space", () => {
  const policy = buildTermTypeSearchPolicy([
    {
      termType: "plastic_material",
      metadata: { searchPolicy: { tier: "primary", spaces: ["similarity", "keyword", "quote"] } },
      isActive: true,
    },
    {
      termType: "customer_note",
      metadata: { searchPolicy: { tier: "context", spaces: ["context"] } },
      isActive: true,
    },
  ]);

  assert.equal(policy.byTermType.plastic_material.tier, "primary");
  assert.deepEqual(policy.byTermType.plastic_material.spaces, ["similarity", "keyword", "quote"]);
  assert.deepEqual(policy.byTier.primary, ["plastic_material"]);
  assert.deepEqual(policy.byTier.context, ["customer_note"]);
  assert.deepEqual(policy.bySpace.similarity, ["plastic_material"]);
  assert.deepEqual(policy.bySpace.context, ["customer_note"]);
  assert.deepEqual(policy.warnings, []);
});

test("term type search policy falls back and reports invalid metadata without throwing", () => {
  const policy = buildTermTypeSearchPolicy([
    {
      termType: "mystery_field",
      metadata: { searchPolicy: { tier: "important", spaces: ["keyword", "unknown_space"] } },
      isActive: true,
    },
  ]);

  assert.equal(policy.byTermType.mystery_field.tier, "tertiary");
  assert.deepEqual(policy.byTermType.mystery_field.spaces, ["keyword"]);
  assert.deepEqual(policy.byTier.tertiary, ["mystery_field"]);
  assert.deepEqual(policy.bySpace.keyword, ["mystery_field"]);
  assert.equal(policy.warnings.length, 2);
  assert.ok(policy.warnings.some((warning) => warning.type === "invalid_tier"));
  assert.ok(policy.warnings.some((warning) => warning.type === "invalid_space"));
});

test("term type search policy treats excluded as readable and space-free by default", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "internal_noise", metadata: { searchPolicy: { tier: "excluded" } }, isActive: true },
    { termType: "evidence_note", metadata: { searchPolicy: { tier: "excluded", spaces: ["context"] } }, isActive: true },
  ]);

  assert.equal(policy.byTermType.internal_noise.tier, "excluded");
  assert.deepEqual(policy.byTermType.internal_noise.spaces, []);
  assert.deepEqual(policy.byTermType.evidence_note.spaces, ["context"]);
  assert.deepEqual(policy.byTier.excluded, ["evidence_note", "internal_noise"]);
  assert.deepEqual(policy.bySpace.context, ["evidence_note"]);
});

test("term type search policy applies current-behavior defaults for missing metadata", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "plastic_material", metadata: {}, isActive: true },
    { termType: "unknown_active_term", metadata: {}, isActive: true },
  ]);

  assert.equal(policy.byTermType.plastic_material.source, "default");
  assert.ok(policy.byTermType.plastic_material.spaces.includes("similarity"));
  assert.ok(policy.byTermType.plastic_material.spaces.includes("keyword"));
  assert.ok(policy.byTermType.plastic_material.spaces.includes("context"));
  assert.equal(policy.byTermType.unknown_active_term.tier, "tertiary");
  assert.deepEqual(policy.byTermType.unknown_active_term.spaces, ["keyword", "context"]);
});

test("loadTermTypeSearchPolicy reads active dictionary term types", async () => {
  replaceMethod(prisma.dictionaryTermType as any, "findMany", async (args: any) => {
    assert.deepEqual(args.where, { isActive: true });
    assert.deepEqual(args.select, { termType: true, metadata: true, isActive: true });
    return [
      {
        termType: "application",
        metadata: { searchPolicy: { tier: "primary", spaces: ["similarity", "keyword"] } },
        isActive: true,
      },
    ];
  });

  const policy = await loadTermTypeSearchPolicy();

  assert.equal(policy.byTermType.application.tier, "primary");
  assert.deepEqual(policy.bySpace.similarity, ["application"]);
});

test("term type search policy keeps grouped entries unique for duplicate input rows", () => {
  const policy = buildTermTypeSearchPolicy([
    {
      termType: "application",
      metadata: { searchPolicy: { tier: "primary", spaces: ["similarity", "keyword"] } },
      isActive: true,
    },
    {
      termType: "application",
      metadata: { searchPolicy: { tier: "context", spaces: ["context"] } },
      isActive: true,
    },
  ]);

  assert.equal(policy.byTermType.application.tier, "context");
  assert.deepEqual(policy.byTier.primary, []);
  assert.deepEqual(policy.byTier.context, ["application"]);
  assert.deepEqual(policy.bySpace.similarity, []);
  assert.deepEqual(policy.bySpace.context, ["application"]);
});

test("search policy diagnostics groups configured and default policies", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "z_default", metadata: {}, isActive: true },
    { termType: "a_configured", metadata: { searchPolicy: { tier: "primary", spaces: ["keyword"] } }, isActive: true },
    { termType: "b_configured", metadata: { searchPolicy: { tier: "context", spaces: ["context"] } }, isActive: true },
  ]);

  const diagnostics = buildSearchPolicyDiagnostics(policy, {
    similarityKeys: [],
    keywordTextFields: ["a_configured"],
    searchableTextFields: ["a_configured"],
  });

  assert.equal(diagnostics.activeTermTypeCount, 3);
  assert.equal(diagnostics.configuredPolicyCount, 2);
  assert.equal(diagnostics.defaultPolicyCount, 1);
  assert.deepEqual(diagnostics.byTier.primary, { count: 1, termTypes: ["a_configured"] });
  assert.deepEqual(diagnostics.byTier.context, { count: 1, termTypes: ["b_configured"] });
  assert.deepEqual(diagnostics.byTier.tertiary, { count: 1, termTypes: ["z_default"] });
  assert.deepEqual(diagnostics.bySpace.keyword, { count: 2, termTypes: ["a_configured", "z_default"] });
  assert.deepEqual(diagnostics.bySpace.context, { count: 2, termTypes: ["b_configured", "z_default"] });
});

test("search policy diagnostics detects legacy-only and policy-only similarity fields", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "matched_similarity", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
    { termType: "policy_similarity", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
  ]);

  const diagnostics = buildSearchPolicyDiagnostics(policy, {
    similarityKeys: ["matched_similarity", "legacy_similarity"],
    keywordTextFields: [],
    searchableTextFields: [],
  });

  assert.deepEqual(diagnostics.diff.legacySimilarityOnly, ["legacy_similarity"]);
  assert.deepEqual(diagnostics.diff.policySimilarityOnly, ["policy_similarity"]);
  assert.deepEqual(diagnostics.diff.matchedSimilarity, ["matched_similarity"]);
});

test("archive feature key bridge maps dictionary term types to canonical archive feature keys", () => {
  assert.deepEqual(getArchiveFeatureKeysForTermType("product_effective_width"), ["effective_width_mm"]);
  assert.deepEqual(getArchiveFeatureKeysForTermType("die_effective_width"), ["effective_width_mm"]);
  assert.deepEqual(getArchiveFeatureKeysForTermType("die_width"), ["die_width_mm"]);
  assert.deepEqual(getArchiveFeatureKeysForTermType("product_effective_thickness"), ["thickness_mm"]);
  assert.deepEqual(getArchiveFeatureKeysForTermType("product_material"), ["product_material"]);
  assert.equal(normalizeArchiveFeatureKey("effective_width_mm"), "effective_width_mm");
  assert.ok(getTermTypesForArchiveFeatureKey("effective_width_mm").includes("product_effective_width"));
});

test("search policy diagnostics separates direct, bridged, and unmapped similarity fields", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "product_type", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
    { termType: "product_effective_width", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
    { termType: "die_width", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
    { termType: "policy_unmapped", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity"] } }, isActive: true },
  ]);

  const diagnostics = buildSearchPolicyDiagnostics(policy, {
    similarityKeys: ["product_type", "effective_width_mm", "die_width_mm", "legacy_unmapped"],
    keywordTextFields: [],
    searchableTextFields: [],
  });

  assert.deepEqual(diagnostics.diff.matchedDirect, ["product_type"]);
  assert.deepEqual(diagnostics.diff.matchedViaFeatureKeyBridge, [
    { featureKey: "die_width_mm", legacyKeys: ["die_width_mm"], policyTermTypes: ["die_width"] },
    { featureKey: "effective_width_mm", legacyKeys: ["effective_width_mm"], policyTermTypes: ["product_effective_width"] },
  ]);
  assert.deepEqual(diagnostics.diff.legacyOnlyUnmapped, ["legacy_unmapped"]);
  assert.deepEqual(diagnostics.diff.policyOnlyUnmapped, ["policy_unmapped"]);
  assert.deepEqual(diagnostics.diff.legacySimilarityOnly, ["legacy_unmapped"]);
  assert.deepEqual(diagnostics.diff.policySimilarityOnly, ["policy_unmapped"]);
});

test("search policy diagnostics detects keyword differences and excluded legacy searchable fields", () => {
  const policy = buildTermTypeSearchPolicy([
    { termType: "matched_keyword", metadata: { searchPolicy: { tier: "secondary", spaces: ["keyword"] } }, isActive: true },
    { termType: "policy_keyword", metadata: { searchPolicy: { tier: "secondary", spaces: ["keyword"] } }, isActive: true },
    { termType: "legacy_keyword", metadata: { searchPolicy: { tier: "excluded" } }, isActive: true },
    { termType: "legacy_searchable_only", metadata: { searchPolicy: { tier: "excluded" } }, isActive: true },
    { termType: "policy_context", metadata: { searchPolicy: { tier: "context", spaces: ["context"] } }, isActive: true },
  ]);

  const diagnostics = buildSearchPolicyDiagnostics(policy, {
    similarityKeys: [],
    keywordTextFields: ["legacy_keyword", "matched_keyword"],
    searchableTextFields: ["legacy_searchable_only"],
  });

  assert.deepEqual(diagnostics.diff.legacyKeywordOnly, ["legacy_keyword"]);
  assert.deepEqual(diagnostics.diff.policyKeywordOnly, ["policy_keyword"]);
  assert.deepEqual(diagnostics.diff.matchedKeyword, ["matched_keyword"]);
  assert.deepEqual(diagnostics.diff.excludedButLegacySearchable, ["legacy_keyword", "legacy_searchable_only"]);
  assert.deepEqual(diagnostics.diff.policySearchableButNotLegacy, ["policy_context", "policy_keyword"]);
});

test("search policy diagnostics includes parser warnings", () => {
  const policy = buildTermTypeSearchPolicy([
    {
      termType: "bad_policy",
      metadata: { searchPolicy: { tier: "loud", spaces: ["keyword", "strange"] } },
      isActive: true,
    },
  ]);

  const diagnostics = buildSearchPolicyDiagnostics(policy, {
    similarityKeys: [],
    keywordTextFields: [],
    searchableTextFields: [],
  });

  assert.equal(diagnostics.warningCount, 2);
  assert.deepEqual(diagnostics.warnings, policy.warnings);
  assert.ok(diagnostics.warnings.some((warning) => warning.type === "invalid_tier"));
  assert.ok(diagnostics.warnings.some((warning) => warning.type === "invalid_space"));
});

test("search policy diagnostics is deterministic", () => {
  const leftPolicy = buildTermTypeSearchPolicy([
    { termType: "z_policy", metadata: { searchPolicy: { tier: "primary", spaces: ["keyword", "similarity"] } }, isActive: true },
    { termType: "a_policy", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity", "keyword"] } }, isActive: true },
  ]);
  const rightPolicy = buildTermTypeSearchPolicy([
    { termType: "a_policy", metadata: { searchPolicy: { tier: "primary", spaces: ["keyword", "similarity"] } }, isActive: true },
    { termType: "z_policy", metadata: { searchPolicy: { tier: "primary", spaces: ["similarity", "keyword"] } }, isActive: true },
  ]);

  const left = buildSearchPolicyDiagnostics(leftPolicy, {
    similarityKeys: ["z_legacy", "a_policy", "z_legacy"],
    keywordTextFields: ["z_policy", "a_legacy"],
    searchableTextFields: ["z_legacy", "a_legacy"],
  });
  const right = buildSearchPolicyDiagnostics(rightPolicy, {
    similarityKeys: ["z_legacy", "z_legacy", "a_policy"],
    keywordTextFields: ["a_legacy", "z_policy"],
    searchableTextFields: ["a_legacy", "z_legacy"],
  });

  assert.deepEqual(left, right);
});

test("legacy archive search field config exposes current insert gate sets", () => {
  const legacyConfig = getLegacyArchiveSearchFieldConfig();

  assert.deepEqual(legacyConfig.similarityKeys, [
    "application",
    "deckle_type",
    "die_width_mm",
    "effective_width_mm",
    "heating_zone_count",
    "layer_count",
    "lip_adjustment_method",
    "plastic_material",
    "product_type",
    "thickness_mm",
  ]);
  assert.deepEqual(legacyConfig.keywordTextFields, [
    "application",
    "deckle_type",
    "filter_model",
    "lip_adjustment_method",
    "metering_pump_model",
    "model",
    "note",
    "plastic_material",
    "remarks",
  ]);
  assert.deepEqual(legacyConfig.searchableTextFields, legacyConfig.keywordTextFields);
});
