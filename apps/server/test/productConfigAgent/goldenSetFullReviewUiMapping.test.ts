import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePackageAnnotation, toChineseEvidenceCards, validateForSubmit } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts";
import type { FullReviewAnnotation } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/types.ts";
import { createRevisionedAutosaveCoordinator } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/revisionedAutosave.ts";

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

const validAnnotation = (): FullReviewAnnotation => ({
  admission: { decision: "auto_archive", reason_codes: [], notes: null },
  package: { evidence_sufficiency: "sufficient", notes: null, items: [{
    gold_item_id: "item-1", matched_prediction_item_id: null, item_name: "平模", product_family: null,
    product_subtype: null, item_role: "peer_product", model: null, peer_group_id: null,
    related_to_gold_item_id: null, evidence_refs: ["e-1"],
  }] },
  configuration_fields: [],
  erp: [{ gold_item_id: "item-1", decision: "unique_match", notes: null, acceptable_identities: [
    { company: "JC", part_num: "P1", erp_product_name: "平模", evidence_refs: ["e-1"] },
  ] }],
});

test("removing a product also removes its ERP mapping", () => {
  const annotation = validAnnotation();
  const reconciled = reconcilePackageAnnotation(annotation, { ...annotation.package, items: [] });
  assert.deepEqual(reconciled.erp, []);
});

test("changing a product to a non-sellable role removes its ERP mapping", () => {
  const annotation = validAnnotation();
  const items = annotation.package.items.map((item) => ({ ...item, item_role: "component" as const }));
  const reconciled = reconcilePackageAnnotation(annotation, { ...annotation.package, items });
  assert.deepEqual(reconciled.erp, []);
});

test("validates ERP coverage, cardinality and duplicate identities", () => {
  const missing = validAnnotation();
  missing.erp = [];
  assert.ok(validateForSubmit(missing).errors.includes("每个可销售项必须且只能有一个 ERP 映射"));

  const ambiguous = validAnnotation();
  ambiguous.admission.decision = "quarantine";
  ambiguous.admission.reason_codes = ["erp_ambiguous"];
  ambiguous.erp[0] = { ...ambiguous.erp[0], decision: "legitimate_ambiguity", acceptable_identities: ambiguous.erp[0].acceptable_identities };
  assert.ok(validateForSubmit(ambiguous).errors.includes("ERP 歧义必须至少包含两个身份"));

  const duplicate = validAnnotation();
  duplicate.erp.push({ ...duplicate.erp[0] });
  duplicate.erp[0].acceptable_identities.push({ ...duplicate.erp[0].acceptable_identities[0] });
  const errors = validateForSubmit(duplicate).errors;
  assert.ok(errors.includes("每个可销售项必须且只能有一个 ERP 映射"));
  assert.ok(errors.includes("ERP 身份不能重复"));
});

test("serializes drafts and queues edits made during an in-flight save", async () => {
  let releaseFirst: ((revision: number) => void) | undefined;
  const calls: number[] = [];
  const coordinator = createRevisionedAutosaveCoordinator({
    save: (_documentId, revision) => {
      calls.push(revision);
      if (calls.length === 1) return new Promise<{ revision: number }>((resolve) => { releaseFirst = (next) => resolve({ revision: next }); });
      return Promise.resolve({ revision: revision + 1 });
    },
  });
  coordinator.activate("doc-1", 4);
  const first = coordinator.flush(validAnnotation());
  coordinator.queue(validAnnotation());
  releaseFirst?.(5);
  await first;
  await coordinator.flush();
  assert.deepEqual(calls, [4, 5]);
  assert.equal(coordinator.revision(), 6);
});

test("flushes drafts before submit and ignores a late save from the previous task", async () => {
  let releaseSave: ((revision: number) => void) | undefined;
  const states: string[] = [];
  const coordinator = createRevisionedAutosaveCoordinator({
    save: () => new Promise<{ revision: number }>((resolve) => { releaseSave = (next) => resolve({ revision: next }); }),
    onState: (state) => states.push(state),
  });
  coordinator.activate("doc-1", 2);
  const annotation = validAnnotation();
  const saving = coordinator.flush(annotation);
  const submittedRevisions: number[] = [];
  const submitting = coordinator.submit(annotation, async (_documentId, revision) => {
    submittedRevisions.push(revision);
    return { revision: revision + 1 };
  });
  assert.ok(releaseSave);
  releaseSave(3);
  await saving;
  await submitting;
  assert.deepEqual(submittedRevisions, [3]);

  let releaseLate: ((revision: number) => void) | undefined;
  const late = createRevisionedAutosaveCoordinator({
    save: () => new Promise<{ revision: number }>((resolve) => { releaseLate = (next) => resolve({ revision: next }); }),
    onState: (state) => states.push(state),
  });
  late.activate("doc-1", 4);
  const lateSave = late.flush(annotation);
  assert.ok(releaseLate);
  late.activate("doc-2", 10);
  const oldStates = states.length;
  releaseLate(99);
  await lateSave;
  assert.equal(late.revision(), 10);
  assert.equal(states.length, oldStates);
});
