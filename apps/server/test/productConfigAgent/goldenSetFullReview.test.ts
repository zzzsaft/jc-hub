import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalFullReviewEvidenceHash, FULL_REVIEW_SCHEMA_VERSION, validateFullReviewAnnotation, validateFullReviewPacket } from "../../src/modules/productConfigAgent/goldenSet/fullReview.model.js";
import { assertV2OutputDirWritable, buildFullReviewSnapshot, createErpCandidateEvidenceCircuit, deriveErpCandidateEvidence, verifyV1ArtifactSeal } from "../../src/modules/productConfigAgent/goldenSet/fullReviewSnapshot.js";
import { mergeFullReviewExports } from "../../src/modules/productConfigAgent/goldenSet/fullReviewMerge.js";
import { FullReviewStore } from "../../src/modules/productConfigAgent/goldenSet/fullReviewStore.js";
import { decideAdmission } from "../../src/modules/productConfigAgent/goldenSet/fullReviewAdmission.js";
import { ProductConfigAgentRoutes } from "../../src/modules/productConfigAgent/routes/productConfigAgent.routes.js";
import { fullReviewTasks, previewFullReviewAdmission } from "../../src/modules/productConfigAgent/routes/handlers/goldenSetFullReviewHandlers.js";
import { assertFullReviewAdjudicatorPermissions, FULL_REVIEW_PERMISSIONS, resolveFullReviewAccount, resolveFullReviewSlot } from "../../src/modules/productConfigAgent/routes/auth.js";

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

test("admission quarantines ambiguity and permits only validated acceptance cohorts", () => {
  const ambiguousIdentity = annotation();
  ambiguousIdentity.admission = { decision: "quarantine", reason_codes: ["erp_ambiguous"], notes: null };
  ambiguousIdentity.erp[0].decision = "legitimate_ambiguity";
  ambiguousIdentity.erp[0].acceptable_identities.push({ company: "A", part_num: "P2", erp_product_name: "P2", evidence_refs: ["erp:P2"] });
  assert.deepEqual(decideAdmission(ambiguousIdentity, packet(), { thresholdsPassed: true }), {
    decision: "quarantine", reason_codes: ["erp_ambiguous"],
  });
  assert.equal(decideAdmission(annotation(), packet(), { thresholdsPassed: true }).decision, "auto_archive");
});

test("admission quarantines missing evidence, rejection, failed thresholds and unvalidated cohorts", () => {
  const missingEvidence = annotation();
  missingEvidence.configuration_fields[0].evidence_refs = [];
  assert.deepEqual(decideAdmission(missingEvidence, packet(), { thresholdsPassed: true }).reason_codes, ["invalid_annotation"]);

  const rejected = annotation();
  rejected.admission.decision = "reject";
  rejected.admission.reason_codes = ["document_rejected"];
  assert.deepEqual(decideAdmission(rejected, packet(), { thresholdsPassed: true }).reason_codes, ["document_rejected"]);
  const reviewerQuarantine = annotation();
  reviewerQuarantine.admission.decision = "quarantine";
  reviewerQuarantine.admission.reason_codes = ["reviewer_quarantine"];
  assert.deepEqual(decideAdmission(reviewerQuarantine, packet(), { thresholdsPassed: true }).reason_codes, ["reviewer_quarantine"]);
  assert.deepEqual(decideAdmission(annotation(), packet(), { thresholdsPassed: false }).reason_codes, ["acceptance_threshold_failed"]);
  assert.deepEqual(decideAdmission(annotation(), { ...packet(), cohort: "calibration" }, { thresholdsPassed: true }).reason_codes, ["unvalidated_cohort"]);
});

test("admission fails closed for malformed annotations, empty ERP and foreign evidence", () => {
  assert.deepEqual(decideAdmission(null, packet(), { thresholdsPassed: true }).reason_codes, ["invalid_annotation"]);
  assert.deepEqual(decideAdmission({ ...annotation(), erp: [] }, packet(), { thresholdsPassed: true }).reason_codes, ["invalid_annotation"]);
  const foreign = annotation();
  foreign.configuration_fields[0].evidence_refs = ["foreign:evidence"];
  assert.deepEqual(decideAdmission(foreign, packet(), { thresholdsPassed: true }).reason_codes, ["invalid_annotation"]);
});

test("v2 full-review routes expose annotator tasks and adjudicator-only review surfaces", () => {
  const methods = new Map(ProductConfigAgentRoutes.map((route) => [`${route.method} ${route.path}`, route.action]));
  for (const route of [
    "get /productConfigAgent/golden-set-v2/tasks",
    "put /productConfigAgent/golden-set-v2/tasks/:documentId/draft",
    "post /productConfigAgent/golden-set-v2/tasks/:documentId/submit",
    "get /productConfigAgent/golden-set-v2/adjudications",
    "post /productConfigAgent/golden-set-v2/adjudications/:documentId",
    "get /productConfigAgent/golden-set-v2/export",
    "post /productConfigAgent/golden-set-v2/admission-preview",
  ]) assert.equal(typeof methods.get(route), "function", `missing ${route}`);
  assert.equal([...methods.keys()].some((route) => route.includes("golden-set-v2") && /archive/i.test(route)), false);
  const auth = new Map(ProductConfigAgentRoutes.map((route) => [`${route.method} ${route.path}`, "auth" in route ? route.auth : undefined]));
  assert.equal(auth.get("get /productConfigAgent/golden-set-v2/tasks"), "annotator");
  assert.equal(auth.get("post /productConfigAgent/golden-set-v2/admission-preview"), "adjudicator");
});

test("personal permissions derive exactly one annotation slot and fail closed", () => {
  assert.equal(resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.annotateA]), "annotator-a");
  assert.equal(resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.annotateB]), "annotator-b");
  assert.throws(() => resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.annotateA, FULL_REVIEW_PERMISSIONS.annotateB]), /exactly one|conflicting/i);
  assert.throws(() => resolveFullReviewSlot([]), /exactly one|permission/i);
  assert.throws(() => resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.adjudicate]), /separation|adjudicat/i);
  assert.throws(() => resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.annotateA, FULL_REVIEW_PERMISSIONS.adjudicate]), /separation|adjudicat/i);
  assert.throws(() => resolveFullReviewSlot([FULL_REVIEW_PERMISSIONS.annotateB, FULL_REVIEW_PERMISSIONS.adjudicate]), /separation|adjudicat/i);
  assert.doesNotThrow(() => assertFullReviewAdjudicatorPermissions([FULL_REVIEW_PERMISSIONS.adjudicate]));
  assert.throws(() => assertFullReviewAdjudicatorPermissions([FULL_REVIEW_PERMISSIONS.adjudicate, FULL_REVIEW_PERMISSIONS.annotateA]), /separation|annotat/i);
  assert.throws(() => assertFullReviewAdjudicatorPermissions([FULL_REVIEW_PERMISSIONS.adjudicate, FULL_REVIEW_PERMISSIONS.annotateB]), /separation|annotat/i);
});

test("local and production auth use database-derived permissions and ignore permission headers", async () => {
  const old = { nodeEnv: process.env.NODE_ENV, port: process.env.PORT };
  process.env.NODE_ENV = "test";
  process.env.PORT = "2030";
  try {
    let permissionUser: unknown;
    const account = await resolveFullReviewAccount(
      { headers: { "x-user-id": "personal-user", "x-permission-codes": FULL_REVIEW_PERMISSIONS.annotateB } } as never,
      async (user) => { permissionUser = user; return [FULL_REVIEW_PERMISSIONS.annotateA]; },
    );
    assert.deepEqual(permissionUser, { id: "personal-user", roles: [] });
    assert.deepEqual(account, { userId: "personal-user", permissionCodes: [FULL_REVIEW_PERMISSIONS.annotateA] });
    assert.equal(resolveFullReviewSlot(account.permissionCodes), "annotator-a");
  } finally {
    restoreEnv("NODE_ENV", old.nodeEnv);
    restoreEnv("PORT", old.port);
  }
});

test("Golden Set review permissions are additively upserted and enabled", () => {
  const migration = fs.readFileSync(path.join(process.cwd(), "apps/server/prisma/migrations/20260713010000_golden_set_review_permissions/migration.sql"), "utf8");
  assert.match(migration, /product-config-agent\.golden-set\.annotate-a/);
  assert.match(migration, /product-config-agent\.golden-set\.annotate-b/);
  assert.match(migration, /product-config-agent\.golden-set\.adjudicate/);
  assert.match(migration, /ON CONFLICT \("code"\) DO UPDATE/i);
  assert.match(migration, /"enabled" = TRUE/i);
});

test("preview uses sealed adjudication and server thresholds, ignoring forged caller policy inputs", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-preview-"));
  const old = { baseline: process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR, store: process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE, evaluation: process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EVALUATION_FILE };
  try {
    const baseline = path.join(directory, "baseline");
    const stateFile = path.join(directory, "store.json");
    const evaluation = path.join(directory, "evaluation.json");
    writeBaseline(baseline);
    fs.writeFileSync(stateFile, JSON.stringify({ revision: 1, drafts: {}, submitted: {}, adjudications: { "1": annotation() }, audit: [] }));
    fs.writeFileSync(evaluation, JSON.stringify({ threshold_results: { status: "failed" } }));
    process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR = baseline;
    process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE = stateFile;
    process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EVALUATION_FILE = evaluation;
    const result = await invoke(previewFullReviewAdmission, { body: { documentId: "1", annotation: annotation(), cohort: "acceptance", thresholdsPassed: true } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { decision: "quarantine", reason_codes: ["acceptance_threshold_failed"] });
    assert.equal(fs.readdirSync(directory).some((name) => /archive/i.test(name)), false);
    delete process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EVALUATION_FILE;
    assert.deepEqual((await invoke(previewFullReviewAdmission, { body: { documentId: "1" } })).body, { decision: "quarantine", reason_codes: ["acceptance_threshold_unvalidated"] });
    fs.writeFileSync(stateFile, JSON.stringify({ revision: 0, drafts: {}, submitted: {}, adjudications: {}, audit: [] }));
    assert.equal((await invoke(previewFullReviewAdmission, { body: { documentId: "1" } })).status, 409);
    assert.equal((await invoke(previewFullReviewAdmission, { body: {} })).status, 400);
  } finally {
    restoreEnv("PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR", old.baseline);
    restoreEnv("PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE", old.store);
    restoreEnv("PRODUCT_CONFIG_GOLDEN_SET_V2_EVALUATION_FILE", old.evaluation);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("task listing derives the caller slot server-side and never returns the other submission", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-isolation-"));
  const old = { baseline: process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR, store: process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE };
  try {
    const baseline = path.join(directory, "baseline");
    const stateFile = path.join(directory, "store.json");
    writeBaseline(baseline);
    const a = annotation();
    const b = annotation();
    b.configuration_fields[0].value = "secret-b";
    fs.writeFileSync(stateFile, JSON.stringify({ revision: 2, drafts: {}, submitted: { "annotator-a:1": a, "annotator-b:1": b }, adjudications: {}, audit: [] }));
    process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR = baseline;
    process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE = stateFile;
    const result = await invoke(fullReviewTasks, { userId: "user-a", fullReviewSlot: "annotator-a", body: { slot: "annotator-b" } });
    assert.equal(result.body.items[0].submission.configuration_fields[0].value, "1200");
    assert.doesNotMatch(JSON.stringify(result.body), /secret-b/);
  } finally {
    restoreEnv("PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR", old.baseline);
    restoreEnv("PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE", old.store);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function invoke(handler: (request: never, response: never) => Promise<void>, request: Record<string, unknown>) {
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
  await handler({ params: {}, body: {}, query: {}, headers: {}, ...request } as never, response as never);
  return { status, body };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
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

test("full review rejects blank and duplicate configuration field keys", () => {
  const blank = annotation();
  blank.configuration_fields[0].field_key = " ";
  const blankResult = validateFullReviewAnnotation(blank, packet());
  assert.equal(blankResult.passed, false);
  assert.match(blankResult.errors.join("\n"), /field_key/);

  const duplicate = annotation();
  duplicate.configuration_fields.push({ ...duplicate.configuration_fields[0] });
  const duplicateResult = validateFullReviewAnnotation(duplicate, packet());
  assert.equal(duplicateResult.passed, false);
  assert.match(duplicateResult.errors.join("\n"), /configuration.*field.*unique/i);
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

test("ERP candidate timeout and errors become explicit unresolved evidence", async () => {
  const started = Date.now();
  const timedOut = await deriveErpCandidateEvidence("15", () => new Promise(() => {}), 10);
  assert.ok(Date.now() - started < 250);
  assert.match(timedOut.content, /unresolved/);
  assert.match(timedOut.content, /timeout/);

  const failed = await deriveErpCandidateEvidence("16", async () => { throw new Error("ERP offline"); }, 10);
  assert.match(failed.content, /unresolved/);
  assert.match(failed.content, /lookup_error/);
});

test("ERP timeout opens a circuit and prevents accumulating hanging lookups", async () => {
  let lookupCalls = 0;
  const circuit = createErpCandidateEvidenceCircuit(10);
  const hangingLookup = () => { lookupCalls += 1; return new Promise<unknown[]>(() => {}); };

  assert.match((await circuit.resolve("15", hangingLookup)).content, /lookup_timeout/);
  assert.match((await circuit.resolve("16", hangingLookup)).content, /circuit_open/);
  assert.equal(lookupCalls, 1);
});

function writeBaseline(directory: string, packets = [packet()]) {
  fs.mkdirSync(directory, { recursive: true });
  const packetsFile = path.join(directory, "packets.json");
  const manifestFile = path.join(directory, "manifest.json");
  fs.writeFileSync(packetsFile, `${JSON.stringify(packets, null, 2)}\n`);
  fs.writeFileSync(manifestFile, `${JSON.stringify({ schema_version: "product-config-golden-full-review-manifest-v2", immutable: true })}\n`);
  fs.writeFileSync(path.join(directory, "artifact-seal.json"), JSON.stringify({
    artifacts: Object.fromEntries([packetsFile, manifestFile].map((file) => [path.basename(file), {
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      bytes: fs.statSync(file).size,
    }])),
  }));
}

test("store validates drafts, revisions and one-time submissions before guarded exports", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-store-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    const exportDir = path.join(directory, "exports");
    writeBaseline(baselineDir);
    const store = new FullReviewStore({ baselineDir, storeFile: path.join(directory, "store.json"), exportDir });
    const invalid = annotation();
    invalid.configuration_fields[0].evidence_refs = [];
    assert.throws(() => store.draft("annotator-a", "user-a", "1", 0, invalid), /evidence_refs/);
    assert.equal(store.draft("annotator-a", "user-a", "1", 0, annotation()).revision, 1);
    assert.throws(() => store.submit("annotator-a", "user-a", "1", 0, annotation()), /stale revision/);
    assert.equal(store.submit("annotator-a", "user-a", "1", 1, annotation()).revision, 2);
    assert.throws(() => store.submit("annotator-a", "user-a", "1", 2, annotation()), /already submitted/);
    store.submit("annotator-b", "user-b", "1", 2, annotation());
    const exports = store.exportSubmitted();
    assert.deepEqual(Object.keys(exports).sort(), ["annotator-a-erp.json", "annotator-a-package.json", "annotator-b-erp.json", "annotator-b-package.json"]);
    assert.equal(JSON.parse(fs.readFileSync(exports["annotator-a-package.json"], "utf8")).length, 1);
    assert.throws(() => store.exportSubmitted(), /immutable export/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("store serializes competing same-revision mutations across instances", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-lock-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    const storeFile = path.join(directory, "store.json");
    writeBaseline(baselineDir);
    const first = new FullReviewStore({ baselineDir, storeFile, exportDir: path.join(directory, "exports") });
    const second = new FullReviewStore({ baselineDir, storeFile, exportDir: path.join(directory, "exports") });
    fs.mkdirSync(`${storeFile}.lock`);
    assert.throws(() => first.draft("annotator-a", "user-a", "1", 0, annotation()), /store is locked/);
    assert.equal(fs.existsSync(storeFile), false);
    fs.rmSync(`${storeFile}.lock`, { recursive: true });
    assert.equal(first.submit("annotator-a", "user-a", "1", 0, annotation()).revision, 1);
    assert.throws(() => second.submit("annotator-b", "user-b", "1", 0, annotation()), /stale revision/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("store preserves a live owner but reclaims a crashed owner and retries export cleanup", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-stale-lock-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    const storeFile = path.join(directory, "store.json");
    const exportDir = path.join(directory, "exports");
    const lockDir = `${storeFile}.lock`;
    writeBaseline(baselineDir);
    const store = new FullReviewStore({ baselineDir, storeFile, exportDir });
    store.submit("annotator-a", "user-a", "1", 0, annotation());
    store.submit("annotator-b", "user-b", "1", 1, annotation());
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: "live-owner", at: new Date().toISOString() }));
    assert.throws(() => store.exportSubmitted(), /store is locked/);
    fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "crashed-owner", at: "2000-01-01T00:00:00.000Z" }));
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, "annotator-a-package.json"), "partial");
    const exported = store.exportSubmitted();
    assert.equal(fs.existsSync(lockDir), false);
    assert.equal(fs.existsSync(path.join(exportDir, "exports-manifest.json")), true);
    assert.equal(mergeFullReviewExports({
      baselineDir,
      aPackage: exported["annotator-a-package.json"], bPackage: exported["annotator-b-package.json"],
      aErp: exported["annotator-a-erp.json"], bErp: exported["annotator-b-erp.json"],
    }).adjudicated.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sealed baseline requires packets and manifest entries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-required-seal-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    writeBaseline(baselineDir);
    const sealFile = path.join(baselineDir, "artifact-seal.json");
    const seal = JSON.parse(fs.readFileSync(sealFile, "utf8"));
    delete seal.artifacts["packets.json"];
    fs.writeFileSync(sealFile, JSON.stringify(seal));
    assert.throws(() => mergeFullReviewExports({ baselineDir, aPackage: [], bPackage: [], aErp: [], bErp: [] }), /seal.*packets\.json/i);
    writeBaseline(baselineDir);
    const secondSeal = JSON.parse(fs.readFileSync(sealFile, "utf8"));
    delete secondSeal.artifacts["manifest.json"];
    fs.writeFileSync(sealFile, JSON.stringify(secondSeal));
    assert.throws(() => mergeFullReviewExports({ baselineDir, aPackage: [], bPackage: [], aErp: [], bErp: [] }), /seal.*manifest\.json/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("four exports stay invisible after failure and retry as one verified immutable set", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-export-set-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    const exportDir = path.join(directory, "exports");
    writeBaseline(baselineDir);
    let writes = 0;
    const store = new FullReviewStore({
      baselineDir, storeFile: path.join(directory, "store.json"), exportDir,
      writeExportFile(file, value) {
        writes += 1;
        if (writes === 3) throw new Error("injected export failure");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
      },
    });
    store.submit("annotator-a", "user-a", "1", 0, annotation());
    store.submit("annotator-b", "user-b", "1", 1, annotation());
    assert.throws(() => store.exportSubmitted(), /injected export failure/);
    assert.equal(fs.existsSync(path.join(exportDir, "exports-manifest.json")), false);
    const exported = store.exportSubmitted();
    assert.equal(fs.existsSync(path.join(exportDir, "exports-manifest.json")), true);
    assert.equal(exported["annotator-a-package.json"], path.join(exportDir, "annotator-a-package.json"));
    assert.equal(mergeFullReviewExports({
      baselineDir,
      aPackage: exported["annotator-a-package.json"], bPackage: exported["annotator-b-package.json"],
      aErp: exported["annotator-a-erp.json"], bErp: exported["annotator-b-erp.json"],
    }).adjudicated.length, 1);
    fs.appendFileSync(exported["annotator-a-package.json"], " ");
    assert.throws(() => mergeFullReviewExports({
      baselineDir,
      aPackage: exported["annotator-a-package.json"], bPackage: exported["annotator-b-package.json"],
      aErp: exported["annotator-a-erp.json"], bErp: exported["annotator-b-erp.json"],
    }), /export.*hash drift/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merge rejects foreign samples and seal drift, and leaves A/B differences pending", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-merge-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    writeBaseline(baselineDir);
    const common = { schema_version: FULL_REVIEW_SCHEMA_VERSION, document_id: "1", cohort: "acceptance", evidence_hash: evidenceHash() };
    const packageRow = (slot: "annotator-a" | "annotator-b", value = annotation()) => ({ ...common, slot, admission: value.admission, package: value.package, configuration_fields: value.configuration_fields });
    const erpRow = (slot: "annotator-a" | "annotator-b", value = annotation()) => ({ ...common, slot, erp: value.erp });
    const different = annotation();
    different.admission = { decision: "quarantine", reason_codes: ["manual_review"], notes: null };
    const inputs = { baselineDir, aPackage: [packageRow("annotator-a")], bPackage: [packageRow("annotator-b", different)], aErp: [erpRow("annotator-a")], bErp: [erpRow("annotator-b", different)] };
    assert.equal(mergeFullReviewExports(inputs).differences.length, 1);
    assert.equal(mergeFullReviewExports(inputs).adjudicated.length, 0);
    assert.throws(() => mergeFullReviewExports({ ...inputs, bErp: [{ ...erpRow("annotator-b"), document_id: "foreign" }] }), /unexpected sample/);
    fs.appendFileSync(path.join(baselineDir, "packets.json"), " ");
    assert.throws(() => mergeFullReviewExports(inputs), /hash drift/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merge auto-resolves only byte-identical answers and requires explicit valid adjudication", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "full-review-adjudicate-"));
  try {
    const baselineDir = path.join(directory, "baseline");
    writeBaseline(baselineDir);
    const common = { schema_version: FULL_REVIEW_SCHEMA_VERSION, document_id: "1", cohort: "acceptance", evidence_hash: evidenceHash() };
    const packageRow = (slot: "annotator-a" | "annotator-b", value = annotation()) => ({ ...common, slot, admission: value.admission, package: value.package, configuration_fields: value.configuration_fields });
    const erpRow = (slot: "annotator-a" | "annotator-b", value = annotation()) => ({ ...common, slot, erp: value.erp });
    const identical = { baselineDir, aPackage: [packageRow("annotator-a")], bPackage: [packageRow("annotator-b")], aErp: [erpRow("annotator-a")], bErp: [erpRow("annotator-b")] };
    assert.equal(mergeFullReviewExports(identical).adjudicated.length, 1);
    const different = annotation();
    different.admission = { decision: "quarantine", reason_codes: ["manual_review"], notes: null };
    const split = { ...identical, bPackage: [packageRow("annotator-b", different)], bErp: [erpRow("annotator-b", different)] };
    const invalid = annotation();
    invalid.configuration_fields[0].evidence_refs = [];
    assert.throws(() => mergeFullReviewExports({ ...split, adjudications: { "1": invalid } }), /evidence_refs/);
    const explicit = annotation();
    explicit.admission = { decision: "quarantine", reason_codes: ["admin_decision"], notes: null };
    const result = mergeFullReviewExports({ ...split, adjudications: { "1": explicit } });
    assert.equal(result.differences.length, 0);
    assert.deepEqual(result.adjudicated[0].annotation, explicit);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
