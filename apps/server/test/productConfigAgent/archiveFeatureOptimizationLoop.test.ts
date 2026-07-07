import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFunnelDiagnostics,
  buildArchiveFeatureBatchReport,
  buildRollbackVerificationReport,
  evaluateArchiveFeatureCandidate,
  normalizePolicy,
  selectArchiveFeatureApplyCandidates,
  type SearchEffectSnapshot,
} from "../../src/modules/productConfigAgent/archive/archiveFeatureOptimizationLoop.js";
import type {
  ArchiveFeatureBackfillProposal,
  ArchiveFeatureCoverageAudit,
} from "../../src/modules/productConfigAgent/archive/archiveFeatureCoverage.js";

test("archive feature optimization auto-applies trusted high-confidence non-structure candidates", () => {
  const candidate = evaluateArchiveFeatureCandidate(proposal({
    missingFeatureKey: "product_type",
    proposedValue: "flat_die",
    sourceFieldPath: "confirmedFieldsJson.product_type",
    confidence: 0.92,
  }), { batchId: "batch-1" });

  assert.equal(candidate.decision, "auto_apply");
  assert.deepEqual(candidate.riskFlags, []);
  assert.equal(candidate.status, "pending");
});

test("archive feature optimization holds structure fields from fieldsJson", () => {
  const candidate = evaluateArchiveFeatureCandidate(proposal({
    missingFeatureKey: "deckle_type",
    proposedValue: "external_manual_screw_deckle",
    sourceFieldPath: "fieldsJson[3]",
    confidence: 0.9,
  }), { batchId: "batch-1" });

  assert.equal(candidate.decision, "hold");
  assert.ok(candidate.riskFlags.includes("structure_requires_review"));
});

test("archive feature optimization rejects excluded values", () => {
  const candidate = evaluateArchiveFeatureCandidate(proposal({
    missingFeatureKey: "deckle_type",
    proposedValue: "无",
    sourceFieldPath: "confirmedFieldsJson.deckle_type",
    confidence: 0.99,
  }), { batchId: "batch-1" });

  assert.equal(candidate.decision, "reject");
  assert.ok(candidate.riskFlags.includes("excluded_value"));
});

test("archive feature optimization caps max batch size at 500", () => {
  const policy = normalizePolicy({ maxBatchSize: 800, minConfidence: 0.8 });

  assert.equal(policy.maxBatchSize, 500);
  assert.equal(policy.minConfidence, 0.8);
});

test("archive feature batch report recommends adjustment when risk ratio is high", () => {
  const safe = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "1",
    missingFeatureKey: "application",
    proposedValue: "sheet",
    sourceFieldPath: "itemName",
    confidence: 0.78,
  }), { batchId: "batch-1" });
  const risky = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "2",
    missingFeatureKey: "deckle_type",
    proposedValue: "无",
    sourceFieldPath: "fieldsJson[1]",
    confidence: 0.8,
  }), { batchId: "batch-1" });

  const report = buildArchiveFeatureBatchReport({
    batchId: "batch-1",
    mode: "dry-run",
    policy: normalizePolicy(),
    coverageBefore: audit({ application: 10, deckle_type: 20 }),
    coverageAfter: audit({ application: 10, deckle_type: 20 }),
    candidates: [safe, risky],
    applied: { candidateCount: 0, updatedCount: 0, skippedCount: 0, skippedExistingFeaturePresent: 0 },
    beforeSnapshots: [snapshot(0.5)],
    afterSnapshots: [snapshot(0.5)],
  });

  assert.equal(report.riskSummary.riskCandidateCount, 1);
  assert.equal(report.funnelDiagnostics.filteredOut.genericValue, 1);
  assert.equal(report.decision.action, "adjust");
});

test("archive feature funnel diagnostics reports low confidence, generic, and structure filters", () => {
  const policy = normalizePolicy({ minConfidence: 0.75 });
  const lowConfidence = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "1",
    missingFeatureKey: "application",
    proposedValue: "sheet",
    sourceFieldPath: "confirmedFieldsJson.application",
    confidence: 0.6,
  }), { batchId: "batch-1", policy });
  const generic = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "2",
    missingFeatureKey: "deckle_type",
    proposedValue: "无",
    sourceFieldPath: "confirmedFieldsJson.deckle_type",
    confidence: 0.95,
  }), { batchId: "batch-1", policy });
  const structure = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "3",
    missingFeatureKey: "deckle_type",
    proposedValue: "external_manual_screw_deckle",
    sourceFieldPath: "fieldsJson[3]",
    confidence: 0.95,
  }), { batchId: "batch-1", policy });

  const funnel = buildFunnelDiagnostics({
    scanCount: 500,
    plannerCandidateCount: 3,
    insertedCandidateCount: 3,
    candidates: [lowConfidence, generic, structure],
    applied: { candidateCount: 0, updatedCount: 0, skippedCount: 0, skippedExistingFeaturePresent: 0 },
    policy,
  });

  assert.equal(funnel.scanCount, 500);
  assert.equal(funnel.plannerCandidateCount, 3);
  assert.equal(funnel.insertedCandidateCount, 3);
  assert.equal(funnel.filteredOut.lowConfidence, 1);
  assert.equal(funnel.filteredOut.genericValue, 1);
  assert.equal(funnel.filteredOut.structureRequiresReview, 1);
  assert.equal(funnel.byDecision.reject, 2);
  assert.equal(funnel.byDecision.hold, 1);
});

test("archive feature apply selection respects max batch size", () => {
  const policy = normalizePolicy({ maxBatchSize: 1 });
  const candidates = [1, 2, 3].map((id) => evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: String(id),
    missingFeatureKey: "product_type",
    proposedValue: "flat_die",
    sourceFieldPath: "confirmedFieldsJson.product_type",
    confidence: 0.95,
  }), { batchId: "batch-1", policy }));

  const selected = selectArchiveFeatureApplyCandidates(candidates, policy);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].archiveItemId, "1");
});

test("archive feature rollback verification reports restored items", () => {
  const report = buildRollbackVerificationReport("batch-1", [
    {
      archiveItemId: "1",
      currentSimilarityFeaturesJson: { product_type: "flat_die", plastic_material: "PVC" },
      beforeSimilarityFeaturesJson: { plastic_material: "PVC", product_type: "flat_die" },
      rolledBack: true,
    },
  ]);

  assert.equal(report.restored, true);
  assert.equal(report.checkedCount, 1);
  assert.equal(report.restoredCount, 1);
  assert.deepEqual(report.items, [{ archiveItemId: "1", restored: true, rolledBack: true }]);
});

test("archive feature dry-run report shape has candidates and no archive update logs", () => {
  const policy = normalizePolicy({ limit: 5 });
  const candidate = evaluateArchiveFeatureCandidate(proposal({
    archiveItemId: "1",
    missingFeatureKey: "deckle_type",
    proposedValue: "external_manual_screw_deckle",
    sourceFieldPath: "fieldsJson[3]",
    confidence: 0.95,
  }), { batchId: "batch-1", policy });

  const report = buildArchiveFeatureBatchReport({
    batchId: "batch-1",
    mode: "dry-run",
    policy,
    coverageBefore: audit({ deckle_type: 1 }),
    coverageAfter: audit({ deckle_type: 1 }),
    candidates: [candidate],
    applied: { candidateCount: 0, updatedCount: 0, skippedCount: 0, skippedExistingFeaturePresent: 0 },
    beforeSnapshots: [snapshot(0.5)],
    afterSnapshots: [snapshot(0.5)],
  });

  assert.equal(report.candidateStats.total, 1);
  assert.equal(report.applied.updatedCount, 0);
  assert.equal(report.applied.candidateCount, 0);
  assert.equal(report.funnelDiagnostics.appliedCandidateCount, 0);
  assert.equal(report.searchImpact.delta.averageTop1Score, 0);
});

function proposal(overrides: Partial<ArchiveFeatureBackfillProposal>): ArchiveFeatureBackfillProposal {
  return {
    archiveItemId: "1",
    missingFeatureKey: "product_type",
    proposedValue: "flat_die",
    sourceTermType: "product_type",
    sourceFieldPath: "confirmedFieldsJson.product_type",
    confidence: 0.9,
    evidence: { value: "flat_die" },
    ...overrides,
  };
}

function audit(missing: Partial<Record<string, number>>): ArchiveFeatureCoverageAudit {
  const keys = [
    "similarity_features",
    "confirmed_similarity_features",
    "effective_width_mm_or_die_width_mm",
    "effective_width_mm",
    "die_width_mm",
    "thickness_mm",
    "product_type",
    "plastic_material",
    "application",
    "lip_adjustment_method",
    "deckle_type",
    "plastic_material_or_application",
  ];
  const missingRecord = Object.fromEntries(keys.map((key) => [key, missing[key] ?? 0]));
  return {
    totalArchives: 10,
    totalArchiveItems: 20,
    archivesWithSimilarityFeatures: 5,
    archivesMissingSimilarityFeatures: 15,
    archivesMissingConfirmedSimilarityFeatures: 18,
    missing: missingRecord,
    recoverable: Object.fromEntries(keys.map((key) => [key, 0])),
    topMissingTermTypes: [],
    samples: Object.fromEntries(keys.map((key) => [key, []])),
    dryRunBackfill: { possibleUpdateCount: 0, proposals: [] },
  } as ArchiveFeatureCoverageAudit;
}

function snapshot(score: number): SearchEffectSnapshot {
  return {
    phase: "before",
    query: { name: "q", queryText: "query" },
    topResults: [],
    metrics: {
      resultCount: 1,
      top1Score: score,
      top5AverageScore: score,
      productTypeExplanationCount: 1,
      materialExplanationCount: 0,
      widthExplanationCount: 0,
      applicationExplanationCount: 0,
      lipAdjustmentExplanationCount: 0,
      deckleExplanationCount: 0,
    },
  };
}
