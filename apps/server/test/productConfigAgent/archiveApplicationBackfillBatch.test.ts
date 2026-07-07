import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedArchiveApplicationBackfillProposal,
  selectArchiveApplicationBackfillBatch,
  summarizeArchiveApplicationBackfillValues,
} from "../../src/modules/productConfigAgent/archive/archiveApplicationBackfillBatch.js";
import type { ArchiveFeatureBackfillProposal } from "../../src/modules/productConfigAgent/archive/archiveFeatureCoverage.js";

describe("archive application backfill batch selection", () => {
  test("selects only high-confidence application proposals recovered from itemName", () => {
    const proposals = [
      proposal({ archiveItemId: "3", missingFeatureKey: "application", sourceFieldPath: "itemName", proposedValue: "流延膜", confidence: 0.78 }),
      proposal({ archiveItemId: "4", missingFeatureKey: "application", sourceFieldPath: "fieldsJson[0]", proposedValue: "片材", confidence: 0.9 }),
      proposal({ archiveItemId: "5", missingFeatureKey: "plastic_material", sourceFieldPath: "itemName", proposedValue: "PVC", confidence: 0.8 }),
      proposal({ archiveItemId: "6", missingFeatureKey: "application", sourceFieldPath: "itemName", proposedValue: "片材", confidence: 0.77 }),
      proposal({ archiveItemId: "7", missingFeatureKey: "application", sourceFieldPath: "itemName", proposedValue: "unknown", confidence: 0.9 }),
      proposal({ archiveItemId: "8", missingFeatureKey: "application", sourceFieldPath: "itemName", proposedValue: "片材", confidence: 0.79 }),
    ];

    const selected = selectArchiveApplicationBackfillBatch(proposals, { minConfidence: 0.78, maxUpdates: 1 });

    assert.deepEqual(selected.map((item) => item.archiveItemId), ["3"]);
    assert.equal(isAllowedArchiveApplicationBackfillProposal(selected[0]), true);
  });

  test("summarizes selected application values by frequency", () => {
    const selected = [
      proposal({ archiveItemId: "1", proposedValue: "片材" }),
      proposal({ archiveItemId: "2", proposedValue: "流延膜" }),
      proposal({ archiveItemId: "3", proposedValue: "片材" }),
    ];

    assert.deepEqual(summarizeArchiveApplicationBackfillValues(selected), [
      { value: "片材", count: 2 },
      { value: "流延膜", count: 1 },
    ]);
  });
});

function proposal(overrides: Partial<ArchiveFeatureBackfillProposal>): ArchiveFeatureBackfillProposal {
  return {
    archiveItemId: "1",
    missingFeatureKey: "application",
    proposedValue: "流延膜",
    sourceTermType: "item_name_application",
    sourceFieldPath: "itemName",
    confidence: 0.78,
    evidence: {},
    ...overrides,
  };
}
