import assert from "node:assert/strict";
import test from "node:test";
import { validateFullReviewAnnotation } from "../../src/modules/productConfigAgent/goldenSet/fullReview.model.js";

test("full review requires evidence-backed configuration and blocks unsafe auto archive", () => {
  const result = validateFullReviewAnnotation({
    admission: { decision: "auto_archive", reason_codes: [], notes: null },
    package: { evidence_sufficiency: "sufficient", items: [] },
    configuration_fields: [{ field_key: "width", value: "1200", unit: "mm", option: null, item_id: "item-1", evidence_refs: [] }],
    erp: { decision: "unique_match", acceptable_identities: [] },
  });
  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /evidence_refs|auto_archive|unique_match/);
});
