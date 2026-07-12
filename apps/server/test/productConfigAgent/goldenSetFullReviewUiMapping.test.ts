import assert from "node:assert/strict";
import test from "node:test";
import { toChineseEvidenceCards, validateForSubmit } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts";
import type { FullReviewAnnotation } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/types.ts";

test("maps frozen English evidence to Chinese cards without exposing predictions", () => {
  const cards = toChineseEvidenceCards({
    source: { document_id: "914", product_name: "Flat die" },
    prediction: { hidden: true },
  });

  assert.ok(cards.some((card) => card.label === "产品名称" && card.value === "Flat die" && card.originalKey === "product_name"));
  assert.doesNotMatch(JSON.stringify(cards), /prediction/u);
});

test("blocks auto archive when a field has no evidence", () => {
  const annotation: FullReviewAnnotation = {
    admission: { decision: "auto_archive", reason_codes: [], notes: null },
    package: { evidence_sufficiency: "sufficient", items: [], notes: null },
    configuration_fields: [{ field_key: "width", value: "1200", unit: "mm", option: null, item_id: null, evidence_refs: [] }],
    erp: [],
  };

  assert.ok(validateForSubmit(annotation).errors.includes("关键配置必须关联证据"));
});
