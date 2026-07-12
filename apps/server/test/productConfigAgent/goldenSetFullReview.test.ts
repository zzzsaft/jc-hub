import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalFullReviewEvidenceHash, FULL_REVIEW_SCHEMA_VERSION, validateFullReviewAnnotation, validateFullReviewPacket } from "../../src/modules/productConfigAgent/goldenSet/fullReview.model.js";
import { assertV2OutputDirWritable, buildFullReviewSnapshot, verifyV1ArtifactSeal } from "../../src/modules/productConfigAgent/goldenSet/fullReviewSnapshot.js";

const evidence = [
  { evidence_id: "block:1", content: "width 1200 mm" },
  { evidence_id: "erp:P1", content: "Company A Part P1" },
  { evidence_id: "erp:P2", content: "Company A Part P2" },
];

function evidenceHash(items = evidence) {
  return crypto.createHash("sha256").update(JSON.stringify([...items].sort((left, right) => left.evidence_id < right.evidence_id ? -1 : left.evidence_id > right.evidence_id ? 1 : 0))).digest("hex");
}

function packet() {
  return {
    schema_version: FULL_REVIEW_SCHEMA_VERSION,
    document_id: "1",
    cohort: "acceptance",
    v1_sample_ids: ["package:1", "erp:1:1"],
    evidence_hash: evidenceHash(),
    evidence,
  };
}

function item(id: string, itemRole: "peer_product" | "component" = "peer_product") {
  return {
    gold_item_id: id, matched_prediction_item_id: null, item_name: id, product_family: "die", product_subtype: null,
    item_role: itemRole, model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: ["block:1"],
  };
}

function annotation(items = [item("item-1")]) {
  return {
    admission: { decision: "auto_archive" as const, reason_codes: [], notes: null },
    package: { evidence_sufficiency: "sufficient" as const, items, notes: null },
    configuration_fields: [{ field_key: "width", value: "1200", unit: "mm", option: null, item_id: items[0]?.gold_item_id ?? null, evidence_refs: ["block:1"] }],
    erp: items.filter((value) => value.item_role !== "component").map((value, index) => ({
      gold_item_id: value.gold_item_id,
      decision: "unique_match" as const,
      acceptable_identities: [{ company: "A", part_num: `P${index + 1}`, erp_product_name: `P${index + 1}`, evidence_refs: [`erp:P${index + 1}`] }],
      notes: null,
    })),
  };
}

test("full review requires evidence-backed configuration and blocks unsafe auto archive", () => {
  const invalid = annotation();
  invalid.configuration_fields[0].evidence_refs = [];
  invalid.erp[0].acceptable_identities = [];
  const result = validateFullReviewAnnotation(invalid, packet());
  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /evidence_refs/);
  assert.match(result.errors.join("\n"), /auto_archive/);
  assert.match(result.errors.join("\n"), /unique_match/);
});

test("canonical evidence hashing uses fixed ordinal evidence-ID ordering", () => {
  const unordered = [{ evidence_id: "ä", content: "umlaut" }, { evidence_id: "z", content: "zed" }];
  assert.equal(canonicalFullReviewEvidenceHash(unordered), evidenceHash(unordered));
});

test("packet evidence hash is canonical and annotation references must belong to that packet", () => {
  assert.equal(validateFullReviewPacket(packet()).passed, true);
  assert.equal(validateFullReviewPacket({ ...packet(), evidence: [{ ...evidence[0], content: "tampered" }, ...evidence.slice(1)] }).passed, false);

  assert.equal(validateFullReviewAnnotation(annotation(), packet()).passed, true);
  const foreign = annotation();
  foreign.configuration_fields[0].evidence_refs = ["block:foreign"];
  const validation = validateFullReviewAnnotation(foreign, packet());
  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /frozen evidence|evidence_refs/);
});

test("per-sellable ERP mappings require unique identities and quarantine reasons", () => {
  const multiSellable = annotation([item("item-1"), item("item-2")]);
  assert.equal(validateFullReviewAnnotation(multiSellable, packet()).passed, true);

  const duplicate = annotation([item("item-1"), item("item-2")]);
  duplicate.erp[1].acceptable_identities[0].part_num = "P1";
  assert.equal(validateFullReviewAnnotation(duplicate, packet()).passed, false);
  assert.match(validateFullReviewAnnotation(duplicate, packet()).errors.join("\n"), /duplicate.*Company.*PartNum/i);

  const quarantine = annotation();
  quarantine.admission.decision = "quarantine";
  quarantine.erp[0].decision = "insufficient_evidence";
  quarantine.erp[0].acceptable_identities = [];
  const validation = validateFullReviewAnnotation(quarantine, packet());
  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /reason code/);
});

test("Company and PartNum identity tuples cannot collide on separators", () => {
  const tupleSafe = annotation([item("item-1"), item("item-2")]);
  tupleSafe.erp[0].acceptable_identities[0] = { company: "A:B", part_num: "C", erp_product_name: "first", evidence_refs: ["erp:P1"] };
  tupleSafe.erp[1].acceptable_identities[0] = { company: "A", part_num: "B:C", erp_product_name: "second", evidence_refs: ["erp:P2"] };
  assert.equal(validateFullReviewAnnotation(tupleSafe, packet()).passed, true);
});

test("snapshot keeps 400 unique document IDs, a 280/120 split and no sensitive keys", () => {
  const documentIds = Array.from({ length: 400 }, (_, index) => String(index + 1));
  const documentBlocks = Array.from({ length: 400 }, (_, index) => ({
    document_id: String(index + 1),
    blocks_json: { llm_text: `customer: Ada\nwidth: ${index + 1} mm\nprice: 100` },
  }));
  const candidates = new Map(documentIds.map((documentId) => [documentId, {
    package: { evidence_id: `package:${documentId}`, content: `package candidate ${documentId}` },
    erp: { evidence_id: `erp:${documentId}`, content: `ERP candidate ${documentId}` },
  }]));

  const snapshot = buildFullReviewSnapshot(documentIds, documentBlocks, candidates, "full-review-v2-2026-07-12");

  assert.equal(snapshot.packets.length, 400);
  assert.equal(snapshot.packets.filter((value) => value.cohort === "calibration").length, 280);
  assert.equal(snapshot.packets.filter((value) => value.cohort === "acceptance").length, 120);
  assert.equal(JSON.stringify(snapshot).match(/customer|phone|address|price|file_name/i), null);
});

test("snapshot rejects a non-400 canonical document list and never imports legacy payloads", () => {
  const ids = Array.from({ length: 399 }, (_, index) => String(index + 1));
  assert.throws(() => buildFullReviewSnapshot(ids, [], new Map(), "seed"), /400 unique/);

  const documentIds = Array.from({ length: 400 }, (_, index) => String(index + 1));
  const blocks = documentIds.map((document_id) => ({ document_id, blocks_json: { llm_text: "width: 1200 mm" } }));
  const candidates = new Map(documentIds.map((documentId) => [documentId, {
    package: { evidence_id: `package:${documentId}`, content: "derived package candidate" },
    erp: { evidence_id: `erp:${documentId}`, content: "explicit unresolved ERP candidate result" },
  }]));
  const snapshot = buildFullReviewSnapshot(documentIds, blocks, candidates, "seed");
  assert.doesNotMatch(JSON.stringify(snapshot), /prediction|legacy-v1-payload/i);
});

test("snapshot requires explicit package and ERP evidence for every canonical document", () => {
  const documentIds = Array.from({ length: 400 }, (_, index) => String(index + 1));
  const blocks = documentIds.map((document_id) => ({ document_id, blocks_json: { llm_text: "width: 1200 mm" } }));
  const candidates = new Map(documentIds.map((documentId) => [documentId, {
    package: { evidence_id: `package:${documentId}`, content: "explicit insufficient package result" },
    erp: { evidence_id: `erp:${documentId}`, content: "explicit unresolved ERP result" },
  }]));
  candidates.delete("400");
  assert.throws(() => buildFullReviewSnapshot(documentIds, blocks, candidates, "seed"), /missing derived evidence.*400/i);

  candidates.set("400", { package: { evidence_id: "package:400", content: "explicit insufficient package result" } } as never);
  assert.throws(() => buildFullReviewSnapshot(documentIds, blocks, candidates, "seed"), /missing derived evidence.*400/i);
});

test("v1 seal drift and existing v2 artifacts are refused", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-seal-"));
  try {
    const source = path.join(directory, "source-metadata.json");
    fs.writeFileSync(source, "{}\n");
    const bytes = fs.statSync(source).size;
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
    fs.writeFileSync(path.join(directory, "artifact-seal.json"), JSON.stringify({ artifacts: { "source-metadata.json": { sha256, bytes } } }));
    verifyV1ArtifactSeal(directory);
    fs.writeFileSync(source, "{\"drift\":true}\n");
    assert.throws(() => verifyV1ArtifactSeal(directory), /seal drift/);

    const output = path.join(directory, "v2");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "artifact-seal.json"), "{}");
    assert.throws(() => assertV2OutputDirWritable(output), /overwrite/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
