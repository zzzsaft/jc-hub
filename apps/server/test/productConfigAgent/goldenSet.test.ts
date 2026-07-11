import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateGoldenSet } from "../../src/modules/productConfigAgent/goldenSet/evaluator.js";
import { verifyEvaluationBaseline } from "../../src/modules/productConfigAgent/goldenSet/baseline.js";
import { requiredErpProductKeys, selectErpRows } from "../../src/modules/productConfigAgent/goldenSet/generator.js";
import { ANNOTATION_SCHEMA_VERSION, annotationSchema, validatePackets, type ErpPacket, type PackagePacket } from "../../src/modules/productConfigAgent/goldenSet/model.js";

function packagePacket(id: string, items: any[] = []): PackagePacket {
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION,
    layer: "product_package",
    sample_id: `package:${id}`,
    source: { document_id: id },
    strata: { plan_status: "without_plan", template_cohort: "unplanned_legacy_template_proxy", risk_patterns: ["standard"] },
    selection_reasons: ["test"],
    prediction: { evidence_sufficiency: items.length ? "sufficient" : "insufficient_evidence", items: items.map((item, index) => ({ item_name: `item-${index + 1}`, model: null, peer_group_id: null, ...item })) },
    annotation_status: "pending",
    annotations: { annotator_a: null, annotator_b: null, adjudication: null },
    gold: null,
  };
}

function erpPacket(id: string, status: "matched" | "ambiguous" | "unresolved", candidates: any[] = []): ErpPacket {
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION,
    layer: "erp_identity",
    sample_id: `erp:${id}:1`,
    source: { document_id: id, package_item_order: 1 },
    strata: { plan_status: "without_plan", template_cohort: "unplanned_legacy_template_proxy", risk_patterns: ["standard"] },
    selection_reasons: ["test"],
    prediction: { identity_status: status, confidence: 0.8, top_candidates: candidates, evidence: {} },
    annotation_status: "pending",
    annotations: { annotator_a: null, annotator_b: null, adjudication: null },
    gold: null,
  };
}

const candidate = (company: string, partNum: string) => ({
  company, part_num: partNum, erp_product_name: `${partNum} name`, prod_code: "0910", class_id: "1010",
  has_bom: true, erp_order_num: null, erp_order_line: null,
});

function adjudicate(packet: PackagePacket | ErpPacket) {
  packet.annotations = { annotator_a: packet.gold as any, annotator_b: packet.gold as any, adjudication: { resolution: "test_consensus" } } as any;
}

test("unannotated Golden Set reports prediction distributions without claiming quality", () => {
  const result = evaluateGoldenSet(
    [packagePacket("1", [{ prediction_item_id: "doc:1:item:1", product_family: "flat_die", product_subtype: null, item_role: "peer_product" }])],
    [erpPacket("1", "matched", [candidate("A", "P1")])],
  );
  assert.equal(result.quality_status, "awaiting_human_annotation");
  assert.equal(result.product_package_metrics.item_boundary_f1.value, null);
  assert.equal(result.erp_identity_metrics.top1_precision.value, null);
  assert.equal(result.operational_prediction_baseline.annotation_sample.erp_predicted_coverage.value, 1);
});

test("evaluator computes package boundaries, labels, ERP ranking and abstention metrics from adjudicated gold", () => {
  const first = packagePacket("1", [
    { prediction_item_id: "doc:1:item:1", product_family: "flat_die", product_subtype: null, item_role: "peer_product", peer_group_id: "g1" },
    { prediction_item_id: "doc:1:item:2", product_family: "filter", product_subtype: null, item_role: "peer_product", peer_group_id: "g1" },
  ]);
  first.annotation_status = "adjudicated";
  first.gold = {
    evidence_sufficiency: "sufficient",
    items: [
      { gold_item_id: "g1", matched_prediction_item_id: "doc:1:item:1", item_name: "模头", product_family: "flat_die", product_subtype: "sheet", item_role: "peer_product", model: null, peer_group_id: "peers", related_to_gold_item_id: null, evidence_refs: ["block:A1"] },
      { gold_item_id: "g2", matched_prediction_item_id: null, item_name: "连接器", product_family: "connector", product_subtype: null, item_role: "peer_product", model: null, peer_group_id: "peers", related_to_gold_item_id: null, evidence_refs: ["block:A2"] },
    ],
    notes: null,
  };
  adjudicate(first);
  const second = packagePacket("2");
  second.annotation_status = "adjudicated";
  second.gold = { evidence_sufficiency: "insufficient_evidence", items: [], notes: null };
  adjudicate(second);

  const correct = erpPacket("1", "matched", [candidate("A", "P1")]);
  correct.annotation_status = "adjudicated";
  correct.gold = { decision: "unique_match", acceptable_identities: [{ company: "A", part_num: "P1", erp_product_name: "P1 name", evidence_refs: ["erp:order"] }], notes: null };
  adjudicate(correct);
  const falseAuto = erpPacket("2", "matched", [candidate("A", "P2")]);
  falseAuto.annotation_status = "adjudicated";
  falseAuto.gold = { decision: "insufficient_evidence", acceptable_identities: [], notes: null };
  adjudicate(falseAuto);
  const top3Only = erpPacket("3", "unresolved", [candidate("B", "wrong"), candidate("B", "P3")]);
  top3Only.annotation_status = "adjudicated";
  top3Only.gold = { decision: "unique_match", acceptable_identities: [{ company: "B", part_num: "P3", erp_product_name: "P3 name", evidence_refs: ["erp:part"] }], notes: null };
  adjudicate(top3Only);

  const result = evaluateGoldenSet([first, second], [correct, falseAuto, top3Only]);
  assert.equal(result.product_package_metrics.item_boundary_precision.value, 0.5);
  assert.equal(result.product_package_metrics.item_boundary_recall.value, 0.5);
  assert.equal(result.product_package_metrics.item_boundary_f1.value, 0.5);
  assert.equal(result.product_package_metrics.product_family_accuracy.value, 1);
  assert.equal(result.product_package_metrics.item_role.accuracy.value, 1);
  assert.equal(result.product_package_metrics.package_exact_match.value, 0.5);
  assert.equal(result.erp_identity_metrics.top1_precision.value, 0.5);
  assert.equal(result.erp_identity_metrics.top3_recall.value, 1);
  assert.equal(result.erp_identity_metrics.coverage.value, 2 / 3);
  assert.equal(result.erp_identity_metrics.false_auto_match_rate.value, 0.5);
  assert.equal(result.erp_identity_metrics.abstention_correctness.value, 0);
});

test("annotation validator preserves uncertainty rules and prediction/gold separation", () => {
  const packet = erpPacket("1", "ambiguous", [candidate("A", "P1")]);
  packet.annotation_status = "adjudicated";
  packet.gold = {
    decision: "legitimate_ambiguity",
    acceptable_identities: [{ company: "A", part_num: "P1", erp_product_name: "one", evidence_refs: ["erp:1"] }],
    notes: null,
  };
  adjudicate(packet);
  const validation = validatePackets([], [packet]);
  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /at least two identities/);
});

test("runtime schema rejects unknown status, invalid confidence, cross-layer gold and illegal evidence", () => {
  const packageOnly = packagePacket("1");
  (packageOnly as any).annotation_status = "invented_status";
  const invalidErp = erpPacket("1", "matched", [candidate("A", "P1")]);
  invalidErp.prediction.confidence = 99;
  (invalidErp.annotations as any).annotator_a = { evidence_sufficiency: "sufficient", items: [], notes: null };
  const invalidEvidence = packagePacket("2"); invalidEvidence.annotation_status = "adjudicated";
  invalidEvidence.gold = { evidence_sufficiency: "sufficient", items: [{ gold_item_id: "g1", matched_prediction_item_id: null, item_name: "item", product_family: null, product_subtype: null, item_role: "unknown", model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: [] }], notes: null };
  adjudicate(invalidEvidence);
  const validation = validatePackets([packageOnly, invalidEvidence], [invalidErp]);
  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /annotation_status|confidence|decision|evidence_refs/);
});

test("invalid packet missing required fields returns validation errors without throwing", () => {
  assert.doesNotThrow(() => {
    const validation = validatePackets([{} as PackagePacket], []);
    assert.equal(validation.passed, false);
    assert.ok(validation.errors.some((error) => error.includes("schema")));
  });
});

test("runtime and JSON schemas allow future component roles and non-null subtypes", () => {
  const packet = packagePacket("future", [{ prediction_item_id: "doc:future:item:1", product_family: "filter", product_subtype: "screen_changer", item_role: "component" }]);
  assert.equal(validatePackets([packet], []).passed, true);
  const item = (annotationSchema() as any).$defs.packagePrediction.properties.items.items;
  assert.deepEqual(item.properties.item_role.enum, ["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"]);
  assert.deepEqual(item.properties.product_subtype.type, ["string", "null"]);
});

test("macro F1 includes supported class with no correct prediction as zero", () => {
  const packets = ["flat_die", "coating_die", "round_die"].map((subtype, index) => {
    const packet = packagePacket(String(index + 1), [{ prediction_item_id: `doc:${index + 1}:item:1`, product_family: "die", product_subtype: index === 0 ? "flat_die" : "unknown", item_role: "peer_product" }]);
    packet.annotation_status = "adjudicated";
    packet.gold = { evidence_sufficiency: "sufficient", items: [{ gold_item_id: `g${index}`, matched_prediction_item_id: `doc:${index + 1}:item:1`, item_name: `item-${index + 1}`, product_family: "die", product_subtype: subtype, item_role: "peer_product", model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: ["block:A1"] }], notes: null };
    adjudicate(packet);
    return packet;
  });
  const result = evaluateGoldenSet(packets, []);
  assert.equal(result.product_package_metrics.product_subtype.macro_f1.value, 1 / 3);
});

test("package exact match compares item name and model", () => {
  const packet = packagePacket("1", [{ prediction_item_id: "doc:1:item:1", item_name: "wrong", product_family: "die", product_subtype: null, item_role: "peer_product", model: "wrong-model" }]);
  packet.annotation_status = "adjudicated";
  packet.gold = { evidence_sufficiency: "sufficient", items: [{ gold_item_id: "g1", matched_prediction_item_id: "doc:1:item:1", item_name: "right", product_family: "die", product_subtype: null, item_role: "peer_product", model: "right-model", peer_group_id: null, related_to_gold_item_id: null, evidence_refs: ["block:A1"] }], notes: null };
  adjudicate(packet);
  assert.equal(evaluateGoldenSet([packet], []).product_package_metrics.package_exact_match.value, 0);
});

test("item name exact and normalized accuracy are distinct", () => {
  const packet = packagePacket("1", [{ prediction_item_id: "doc:1:item:1", item_name: "ABC", product_family: "die", product_subtype: null, item_role: "peer_product" }]);
  packet.annotation_status = "adjudicated";
  packet.gold = { evidence_sufficiency: "sufficient", items: [{ gold_item_id: "g1", matched_prediction_item_id: "doc:1:item:1", item_name: "abc", product_family: "die", product_subtype: null, item_role: "peer_product", model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: ["block:A1"] }], notes: null };
  adjudicate(packet);
  const metrics = evaluateGoldenSet([packet], []).product_package_metrics;
  assert.equal(metrics.item_name_exact_accuracy.value, 0);
  assert.equal(metrics.item_name_normalized_accuracy.value, 1);
});

test("ambiguity, insufficient evidence and abstain are evaluated as legitimate outcomes", () => {
  const insufficient = packagePacket("1"); insufficient.annotation_status = "adjudicated";
  insufficient.gold = { evidence_sufficiency: "insufficient_evidence", items: [], notes: null }; adjudicate(insufficient);
  const abstain = packagePacket("2"); abstain.annotation_status = "adjudicated";
  abstain.gold = { evidence_sufficiency: "abstain", items: [], notes: null }; adjudicate(abstain);
  const ambiguous = erpPacket("1", "ambiguous"); ambiguous.annotation_status = "adjudicated";
  ambiguous.gold = { decision: "legitimate_ambiguity", acceptable_identities: [
    { company: "A", part_num: "P1", erp_product_name: "one", evidence_refs: ["erp:1"] }, { company: "A", part_num: "P2", erp_product_name: "two", evidence_refs: ["erp:2"] },
  ], notes: null }; adjudicate(ambiguous);
  const erpAbstain = erpPacket("2", "unresolved"); erpAbstain.annotation_status = "adjudicated";
  erpAbstain.gold = { decision: "abstain", acceptable_identities: [], notes: null }; adjudicate(erpAbstain);
  const result = evaluateGoldenSet([insufficient, abstain], [ambiguous, erpAbstain]);
  assert.equal(result.product_package_metrics.excluded_abstain, 1);
  assert.equal(result.product_package_metrics.evidence_sufficiency_accuracy.value, 1);
  assert.equal(result.product_package_metrics.evidence_sufficiency_accuracy.denominator, 1);
  assert.equal(result.erp_identity_metrics.abstention_correctness.value, 1);
  assert.equal(result.erp_identity_metrics.abstention_correctness.denominator, 1);
  assert.equal(result.erp_identity_metrics.excluded_abstain, 1);
});

test("threshold gating reports package-only and both-layer synthetic adjudication correctly", () => {
  const packet = packagePacket("1", [{ prediction_item_id: "doc:1:item:1", product_family: "die", product_subtype: "sheet", item_role: "peer_product" }]);
  packet.annotation_status = "adjudicated";
  packet.gold = { evidence_sufficiency: "sufficient", items: [{ gold_item_id: "g1", matched_prediction_item_id: "doc:1:item:1", item_name: "item-1", product_family: "die", product_subtype: "sheet", item_role: "peer_product", model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: ["block:A1"] }], notes: null }; adjudicate(packet);
  const match = erpPacket("1", "matched", [candidate("A", "P1")]); match.annotation_status = "adjudicated";
  match.gold = { decision: "unique_match", acceptable_identities: [{ company: "A", part_num: "P1", erp_product_name: "P1 name", evidence_refs: ["erp:1"] }], notes: null }; adjudicate(match);
  const abstention = erpPacket("2", "unresolved"); abstention.annotation_status = "adjudicated";
  abstention.gold = { decision: "insufficient_evidence", acceptable_identities: [], notes: null }; adjudicate(abstention);
  const thresholds = { minimum_adjudicated: { product_package: 1, erp_identity: 1 }, item_boundary_f1: { min: 0 }, product_family_accuracy: { min: 0 }, product_subtype_macro_f1: { min: 0 }, item_role_macro_f1: { min: 0 }, package_exact_match: { min: 0 }, erp_top1_precision: { min: 0 }, erp_top3_recall: { min: 0 }, erp_coverage: { min: 0 }, erp_false_auto_match_rate: { max: 1 }, erp_abstention_correctness: { min: 0 } };
  assert.equal(evaluateGoldenSet([packet], [], { thresholds }).threshold_results.status, "package_only_passed");
  assert.equal(evaluateGoldenSet([packet], [match, abstention], { thresholds }).threshold_results.status, "both_layers_passed");
});

test("baseline verifier rejects immutable prediction changes, added samples and duplicates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-baseline-"));
  const packages = [packagePacket("1")];
  const erp = [erpPacket("1", "unresolved")];
  fs.writeFileSync(path.join(dir, "product-package-annotation-packets.json"), JSON.stringify(packages));
  fs.writeFileSync(path.join(dir, "erp-identity-annotation-packets.json"), JSON.stringify(erp));
  const artifacts = Object.fromEntries(["product-package-annotation-packets.json", "erp-identity-annotation-packets.json"].map((name) => {
    const file = path.join(dir, name); return [name, { sha256: createHash(fs.readFileSync(file)), bytes: fs.statSync(file).size }];
  }));
  fs.writeFileSync(path.join(dir, "artifact-seal.json"), JSON.stringify({ artifacts }));
  const changed = structuredClone(packages); changed[0].prediction.evidence_sufficiency = "sufficient";
  assert.throws(() => verifyEvaluationBaseline(dir, changed, erp), /immutable prediction changed/);
  assert.throws(() => verifyEvaluationBaseline(dir, [...packages, packagePacket("2")], erp), /unexpected sample/);
  assert.throws(() => verifyEvaluationBaseline(dir, [packages[0], packages[0]], erp), /duplicate sample_id/);
  fs.rmSync(dir, { recursive: true, force: true });
});

function createHash(value: Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }

test("ERP annotation sample is deterministic and balanced across all ledger terminal states", () => {
  const rows = [
    ...Array.from({ length: 99 }, (_, index) => ({ document_id: String(index + 1), package_item_order: "1", identity_status: "matched", product_name: "模头", alternatives: "[]" })),
    ...Array.from({ length: 415 }, (_, index) => ({ document_id: String(index + 101), package_item_order: "1", identity_status: "ambiguous", product_name: "模头", alternatives: "[]" })),
    ...Array.from({ length: 134 }, (_, index) => ({ document_id: String(index + 601), package_item_order: "1", identity_status: "unresolved", product_name: "模头", alternatives: "[]" })),
  ];
  const first = selectErpRows({ links: rows } as any);
  const second = selectErpRows({ links: rows } as any);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.fromEntries(["matched", "ambiguous", "unresolved"].map((status) => [status, first.filter((row) => row.identity_status === status).length])), {
    matched: 80, ambiguous: 80, unresolved: 80,
  });
});

test("ERP metadata lookup keys include primary and alternatives once", () => {
  const keys = requiredErpProductKeys([{
    company: "A", part_num: "P1", prod_code: "0910", class_id: "1010", has_bom: "true", erp_order_num: "", erp_order_line: "",
    alternatives: JSON.stringify([{ company: "B", partNum: "P2", prodCode: "0918" }, { company: "A", partNum: "P1", prodCode: "0910" }]),
  }]);
  assert.deepEqual(keys, [{ company: "A", part_num: "P1" }, { company: "B", part_num: "P2" }]);
});
