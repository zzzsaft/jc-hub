import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChineseEvidenceCard } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx";
import { addConfigurationField, reconcilePackageAnnotation, removeConfigurationField, toChineseEvidenceCards, toEvidenceSections, validateForSubmit } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts";
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

test("maps structured Excel options to checked and empty choices", () => {
  const [section] = toEvidenceSections([{
    evidence_id: "block:914",
    content: [
      "说明:",
      "[SEL] 表示该选项被选中。",
      "Sheet：配置表",
      "Row 12:",
      "[A12] 模唇调节",
      "[B12] [SEL] 自动",
      "[ ] 手动",
      'option_set: {"options":[{"selected":true,"value":"自动"},{"selected":false,"value":"手动"}],"field":"模唇调节"}',
    ].join("\n"),
  }]);
  assert.equal(section.title, "配置选项");
  assert.deepEqual(section.rows[0], {
    label: "模唇调节", source: "原表 B12", value: null, detail: null,
    choices: [{ label: "自动", selected: true }, { label: "手动", selected: false }],
  });
  assert.doesNotMatch(JSON.stringify(section), /\[SEL\]|未选/u);
});

test("falls back to option marks when option_set is absent", () => {
  const [section] = toEvidenceSections([{
    evidence_id: "block:915",
    content: "Row 27:\n[A27] 阻流棒\n[B27] [SEL] 有\n[ ] 无",
  }]);
  assert.deepEqual(section.rows[0].choices, [
    { label: "有", selected: true },
    { label: "无", selected: false },
  ]);
});

test("maps package and ERP candidates into two-column sections", () => {
  const sections = toEvidenceSections([
    { evidence_id: "package-candidates:914", content: JSON.stringify([{ source: "title", value: "热成型片材模头" }]) },
    { evidence_id: "erp-candidates:914", content: JSON.stringify({ status: "candidates", reason: null, candidates: [{ company: "JC", part_num: "M-1028", product_name: "热成型片材模头", has_bom: true }] }) },
  ]);
  assert.deepEqual(sections[0].rows[0], { label: "配置单标题", source: null, value: "热成型片材模头", detail: null, choices: [] });
  assert.deepEqual(sections[1].rows[0], { label: "JC / M-1028", source: null, value: "热成型片材模头", detail: "有 BOM", choices: [] });
});

test("keeps malformed evidence available through a safe fallback", () => {
  const sections = toEvidenceSections([
    { evidence_id: "package-candidates:914", content: "{" },
    { evidence_id: "erp-candidates:914", content: JSON.stringify({ status: "unresolved", reason: "lookup_timeout", candidates: [] }) },
  ]);
  assert.equal(sections[0].fallbackMessage, "暂时无法结构化展示，请查看原始证据。");
  assert.equal(sections[1].rows[0].value, "ERP 查询超时，暂未取得候选");
});

test("renders structured evidence as semantic tables and read-only checkboxes", () => {
  const evidence = [{
    evidence_id: "block:914",
    content: [
      "Row 12:",
      "[A12] 模唇调节",
      "[B12] [SEL] 自动",
      "[ ] 手动",
      'option_set: {"options":[{"selected":true,"value":"自动"},{"selected":false,"value":"手动"}],"field":"模唇调节"}',
    ].join("\n"),
  }];
  const markup = renderToStaticMarkup(createElement(ChineseEvidenceCard, { evidence }));
  const structuredMarkup = markup.split("<details")[0];
  const inputs = [...structuredMarkup.matchAll(/<input[^>]*>/gu)].map(([input]) => input);

  assert.match(structuredMarkup, /<table[^>]*>.*<thead>.*<th scope="col">配置项<\/th>.*<tbody>.*<th scope="row">/u);
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.includes('type="checkbox"') && input.includes("disabled")));
  assert.equal(inputs.filter((input) => input.includes("checked")).length, 1);
  assert.doesNotMatch(structuredMarkup, /\[SEL\]|\[ \]|option_set/u);
  assert.match(markup, /<details[^>]*>.*查看原始证据.*\[SEL\].*option_set/su);
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

test("adds a default configuration field with a stable unique key and removes it", () => {
  const first = addConfigurationField([]);
  assert.deepEqual(first, [{ field_key: "configuration_field_1", value: null, unit: null, option: null, item_id: null, evidence_refs: [] }]);
  const second = addConfigurationField(first);
  assert.equal(second[1].field_key, "configuration_field_2");
  assert.deepEqual(removeConfigurationField(second, 0), [second[1]]);
  const afterSparseKeys = addConfigurationField([{ ...second[0], field_key: "configuration_field_4" }, second[1]]);
  assert.equal(afterSparseKeys[2].field_key, "configuration_field_5");
  assert.equal(new Set(afterSparseKeys.map((field) => field.field_key)).size, afterSparseKeys.length);
});

test("client validation rejects blank and duplicate configuration field keys", () => {
  const blank = validAnnotation();
  blank.configuration_fields = [{ field_key: " ", value: "1200", unit: "mm", option: null, item_id: null, evidence_refs: ["e-1"] }];
  assert.ok(validateForSubmit(blank).errors.includes("配置字段名不能为空"));

  const duplicate = validAnnotation();
  duplicate.configuration_fields = [
    { field_key: "width", value: "1200", unit: "mm", option: null, item_id: null, evidence_refs: ["e-1"] },
    { field_key: "width", value: "1300", unit: "mm", option: null, item_id: null, evidence_refs: ["e-1"] },
  ];
  assert.ok(validateForSubmit(duplicate).errors.includes("配置字段名不能重复"));
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
