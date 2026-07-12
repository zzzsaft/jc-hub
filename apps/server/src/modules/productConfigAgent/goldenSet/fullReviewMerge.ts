import fs from "node:fs";
import path from "node:path";
import { FULL_REVIEW_SCHEMA_VERSION, validateFullReviewAnnotation, validateFullReviewPacket, type FullReviewAnnotation, type FullReviewPacket } from "./fullReview.model.js";
import { sha256File } from "./model.js";

export type ReviewSlot = "annotator-a" | "annotator-b";
type ExportMetadata = Pick<FullReviewPacket, "schema_version" | "document_id" | "cohort" | "evidence_hash"> & { slot: ReviewSlot };
export type PackageExport = ExportMetadata & Pick<FullReviewAnnotation, "admission" | "package" | "configuration_fields">;
export type ErpExport = ExportMetadata & Pick<FullReviewAnnotation, "erp">;
type ExportSource<T> = string | T[];

export type MergeInputs = {
  baselineDir: string;
  aPackage: ExportSource<PackageExport>;
  bPackage: ExportSource<PackageExport>;
  aErp: ExportSource<ErpExport>;
  bErp: ExportSource<ErpExport>;
  adjudications?: Record<string, FullReviewAnnotation>;
};

export function loadSealedFullReviewPackets(baselineDir: string) {
  const sealFile = path.join(baselineDir, "artifact-seal.json");
  if (!fs.existsSync(sealFile)) throw new Error("missing v2 seal");
  const seal = JSON.parse(fs.readFileSync(sealFile, "utf8")) as { artifacts?: Record<string, { sha256?: string; bytes?: number }> };
  if (!seal.artifacts || typeof seal.artifacts !== "object") throw new Error("invalid v2 seal");
  for (const required of ["packets.json", "manifest.json"]) {
    if (!seal.artifacts[required]) throw new Error(`v2 seal missing required ${required} entry`);
  }
  for (const [name, expected] of Object.entries(seal.artifacts)) {
    const file = path.join(baselineDir, name);
    if (!fs.existsSync(file) || sha256File(file) !== expected.sha256 || fs.statSync(file).size !== expected.bytes) throw new Error(`v2 hash drift: ${name}`);
  }
  const packets = JSON.parse(fs.readFileSync(path.join(baselineDir, "packets.json"), "utf8")) as unknown[];
  for (const packet of packets) {
    const result = validateFullReviewPacket(packet);
    if (!result.passed) throw new Error(`invalid sealed packet: ${result.errors.join("; ")}`);
  }
  const typed = packets as FullReviewPacket[];
  if (new Set(typed.map((packet) => packet.document_id)).size !== typed.length) throw new Error("duplicate sealed document ID");
  return typed;
}

export function mergeFullReviewExports(inputs: MergeInputs) {
  const packets = loadSealedFullReviewPackets(inputs.baselineDir);
  const packetById = new Map(packets.map((packet) => [packet.document_id, packet]));
  const a = combine(readRows(inputs.aPackage), readRows(inputs.aErp), "annotator-a", packetById);
  const b = combine(readRows(inputs.bPackage), readRows(inputs.bErp), "annotator-b", packetById);
  assertComplete(a, packets, "annotator-a");
  assertComplete(b, packets, "annotator-b");
  const differences: Array<{ document_id: string; annotator_a: FullReviewAnnotation; annotator_b: FullReviewAnnotation }> = [];
  const adjudicated: Array<{ document_id: string; annotation: FullReviewAnnotation; resolution: "identical" | "admin" }> = [];
  for (const packet of packets) {
    const left = a.get(packet.document_id)!;
    const right = b.get(packet.document_id)!;
    if (JSON.stringify(left) === JSON.stringify(right)) {
      adjudicated.push({ document_id: packet.document_id, annotation: left, resolution: "identical" });
      continue;
    }
    const explicit = inputs.adjudications?.[packet.document_id];
    if (!explicit) {
      differences.push({ document_id: packet.document_id, annotator_a: left, annotator_b: right });
      continue;
    }
    assertAnnotation(explicit, packet, `adjudication ${packet.document_id}`);
    adjudicated.push({ document_id: packet.document_id, annotation: explicit, resolution: "admin" });
  }
  const unexpected = Object.keys(inputs.adjudications ?? {}).find((id) => !packetById.has(id));
  if (unexpected) throw new Error(`unexpected sample in adjudications: ${unexpected}`);
  return { differences, adjudicated };
}

function readRows<T>(source: ExportSource<T>) {
  if (typeof source === "string") verifyPublishedExport(source);
  const value = typeof source === "string" ? JSON.parse(fs.readFileSync(source, "utf8")) : source;
  if (!Array.isArray(value)) throw new Error("invalid export: expected an array");
  return value;
}

function verifyPublishedExport(file: string) {
  const setDir = path.dirname(file);
  const manifestFile = path.join(setDir, "exports-manifest.json");
  if (!fs.existsSync(manifestFile)) throw new Error("incomplete export set: completion manifest is missing");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { directory?: string; artifacts?: Record<string, { sha256?: string; bytes?: number }> };
  if (manifest.directory !== ".") throw new Error("invalid export completion manifest directory");
  const required = ["annotator-a-package.json", "annotator-b-package.json", "annotator-a-erp.json", "annotator-b-erp.json"];
  for (const name of required) {
    const expected = manifest.artifacts?.[name];
    const artifact = path.join(setDir, name);
    if (!expected || !fs.existsSync(artifact) || sha256File(artifact) !== expected.sha256 || fs.statSync(artifact).size !== expected.bytes) throw new Error(`export hash drift: ${name}`);
  }
  if (!required.includes(path.basename(file))) throw new Error(`unexpected export file: ${file}`);
}

function combine(packageRows: PackageExport[], erpRows: ErpExport[], slot: ReviewSlot, packets: Map<string, FullReviewPacket>) {
  const packageById = validateRows(packageRows, slot, packets, "package");
  const erpById = validateRows(erpRows, slot, packets, "erp");
  const result = new Map<string, FullReviewAnnotation>();
  for (const [documentId, packageRow] of packageById) {
    const erpRow = erpById.get(documentId);
    if (!erpRow) throw new Error(`missing ERP export for ${slot}:${documentId}`);
    const annotation = { admission: packageRow.admission, package: packageRow.package, configuration_fields: packageRow.configuration_fields, erp: erpRow.erp };
    assertAnnotation(annotation, packets.get(documentId)!, `${slot}:${documentId}`);
    result.set(documentId, annotation);
  }
  if (erpById.size !== packageById.size) throw new Error(`package/ERP export mismatch for ${slot}`);
  return result;
}

function validateRows<T extends ExportMetadata>(rows: T[], slot: ReviewSlot, packets: Map<string, FullReviewPacket>, layer: string) {
  const result = new Map<string, T>();
  for (const row of rows) {
    const packet = packets.get(row.document_id);
    if (!packet) throw new Error(`unexpected sample in ${slot} ${layer}: ${row.document_id}`);
    if (row.slot !== slot) throw new Error(`slot mismatch for ${row.document_id}: expected ${slot}`);
    if (row.schema_version !== FULL_REVIEW_SCHEMA_VERSION || row.schema_version !== packet.schema_version) throw new Error(`schema version mismatch for ${row.document_id}`);
    if (row.cohort !== packet.cohort) throw new Error(`cohort mismatch for ${row.document_id}`);
    if (row.evidence_hash !== packet.evidence_hash) throw new Error(`evidence hash mismatch for ${row.document_id}`);
    if (result.has(row.document_id)) throw new Error(`duplicate sample in ${slot} ${layer}: ${row.document_id}`);
    result.set(row.document_id, row);
  }
  return result;
}

function assertComplete(values: Map<string, FullReviewAnnotation>, packets: FullReviewPacket[], slot: ReviewSlot) {
  const missing = packets.find((packet) => !values.has(packet.document_id));
  if (missing) throw new Error(`missing submitted sample for ${slot}: ${missing.document_id}`);
}

function assertAnnotation(annotation: unknown, packet: FullReviewPacket, label: string): asserts annotation is FullReviewAnnotation {
  const result = validateFullReviewAnnotation(annotation, packet);
  if (!result.passed) throw new Error(`invalid ${label}: ${result.errors.join("; ")}`);
}
