import crypto from "node:crypto";
import fs from "node:fs";
import { z } from "zod";

export const GOLDEN_SET_VERSION = "product-config-golden-set-v1";
export const ANNOTATION_SCHEMA_VERSION = "product-config-golden-annotation-v1";
export const SOURCE_METADATA_SCHEMA_VERSION = "product-config-golden-source-metadata-v1";
export const PACKAGE_SAMPLE_TARGET = 160;
export const ERP_SAMPLE_TARGET = 240;
export const GOLDEN_SET_SEED = "product-config-golden-set-v1-2026-07-10";

export type InputRow = Record<string, string>;

export type DocumentSourceMetadata = {
  document_id: string;
  parser_version: string;
  source_text_length: number;
  source_block_count: number;
  has_accessory_signal: boolean;
  has_spare_signal: boolean;
  has_component_signal: boolean;
};

export type ErpProductMetadata = {
  company: string;
  part_num: string;
  erp_product_name: string | null;
  prod_code: string | null;
};

export type SourceMetadataSnapshot = {
  schema_version: typeof SOURCE_METADATA_SCHEMA_VERSION;
  read_only: true;
  document_source: "production_config_agent.document_blocks";
  erp_source: "ERP Part plus latest OrderDtl description";
  documents: DocumentSourceMetadata[];
  erp_products: ErpProductMetadata[];
  safeguards: Record<string, number>;
};

export type ErpCandidate = {
  company: string;
  part_num: string;
  erp_product_name: string | null;
  prod_code: string | null;
  class_id: string | null;
  has_bom: boolean | null;
  erp_order_num: string | null;
  erp_order_line: string | null;
};

export type PackageGoldItem = {
  gold_item_id: string;
  matched_prediction_item_id: string | null;
  item_name: string;
  product_family: string | null;
  product_subtype: string | null;
  item_role: "peer_product" | "component" | "accessory" | "spare_part" | "sales_kit" | "manufacturing_intermediate" | "unknown";
  model: string | null;
  peer_group_id: string | null;
  related_to_gold_item_id: string | null;
  evidence_refs: string[];
};

export type PackageGold = {
  evidence_sufficiency: "sufficient" | "insufficient_evidence" | "legitimate_ambiguity" | "abstain";
  items: PackageGoldItem[];
  notes: string | null;
};

export type ErpGold = {
  decision: "unique_match" | "legitimate_ambiguity" | "insufficient_evidence" | "abstain";
  acceptable_identities: Array<{
    company: string;
    part_num: string;
    erp_product_name: string;
    evidence_refs: string[];
  }>;
  notes: string | null;
};

export type PackagePacket = {
  schema_version: typeof ANNOTATION_SCHEMA_VERSION;
  layer: "product_package";
  sample_id: string;
  source: Record<string, unknown>;
  strata: Record<string, string | string[]>;
  selection_reasons: string[];
  prediction: {
    evidence_sufficiency: "sufficient" | "insufficient_evidence";
    items: Array<Record<string, unknown> & {
      prediction_item_id: string;
      product_family: string;
      product_subtype: string | null;
      item_role: PackageGoldItem["item_role"];
    }>;
  };
  annotation_status: "pending" | "in_progress" | "reviewed" | "adjudicated";
  annotations: { annotator_a: PackageGold | null; annotator_b: PackageGold | null; adjudication: Record<string, unknown> | null };
  gold: PackageGold | null;
};

export type ErpPacket = {
  schema_version: typeof ANNOTATION_SCHEMA_VERSION;
  layer: "erp_identity";
  sample_id: string;
  source: Record<string, unknown>;
  strata: Record<string, string | string[]>;
  selection_reasons: string[];
  prediction: {
    identity_status: "matched" | "ambiguous" | "unresolved";
    confidence: number;
    top_candidates: ErpCandidate[];
    evidence: Record<string, unknown>;
  };
  annotation_status: "pending" | "in_progress" | "reviewed" | "adjudicated";
  annotations: { annotator_a: ErpGold | null; annotator_b: ErpGold | null; adjudication: Record<string, unknown> | null };
  gold: ErpGold | null;
};

export function readTsv(filePath: string): InputRow[] {
  const lines = fs.readFileSync(filePath, "utf8").trimEnd().split(/\r?\n/u);
  const headers = lines.shift()?.split("\t") ?? [];
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableRank(value: string): string {
  return sha256Text(`${GOLDEN_SET_SEED}:${value}`).slice(0, 20);
}

export function annotationSchema() {
  const identity = {
    type: "object", additionalProperties: false,
    required: ["company", "part_num", "erp_product_name", "evidence_refs"],
    properties: {
      company: { type: "string", minLength: 1 }, part_num: { type: "string", minLength: 1 },
      erp_product_name: { type: "string", minLength: 1 },
      evidence_refs: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
    },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: ANNOTATION_SCHEMA_VERSION,
    title: "ProductConfigAgent Golden Set v1 annotation packets",
    description: "Predictions are immutable source fields. Human truth is written only under annotations and gold after adjudication.",
    $defs: {
      evidenceDecision: { enum: ["sufficient", "insufficient_evidence", "legitimate_ambiguity", "abstain"] },
      erpDecision: { enum: ["unique_match", "legitimate_ambiguity", "insufficient_evidence", "abstain"] },
      identity,
      packageGold: {
        type: "object", additionalProperties: false, required: ["evidence_sufficiency", "items", "notes"],
        properties: {
          evidence_sufficiency: { $ref: "#/$defs/evidenceDecision" }, notes: { type: ["string", "null"] },
          items: { type: "array", items: {
            type: "object", additionalProperties: false,
            required: ["gold_item_id", "matched_prediction_item_id", "item_name", "product_family", "product_subtype", "item_role", "model", "peer_group_id", "related_to_gold_item_id", "evidence_refs"],
            properties: {
              gold_item_id: { type: "string", minLength: 1 }, matched_prediction_item_id: { type: ["string", "null"] },
              item_name: { type: "string", minLength: 1 }, product_family: { type: ["string", "null"] }, product_subtype: { type: ["string", "null"] },
              item_role: { enum: ["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"] },
              model: { type: ["string", "null"] }, peer_group_id: { type: ["string", "null"] }, related_to_gold_item_id: { type: ["string", "null"] },
              evidence_refs: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
            },
          } },
        },
      },
      erpGold: {
        type: "object", additionalProperties: false, required: ["decision", "acceptable_identities", "notes"],
        properties: { decision: { $ref: "#/$defs/erpDecision" }, acceptable_identities: { type: "array", items: identity }, notes: { type: ["string", "null"] } },
      },
      packagePrediction: {
        type: "object", additionalProperties: true, required: ["evidence_sufficiency", "items"],
        properties: {
          evidence_sufficiency: { enum: ["sufficient", "insufficient_evidence"] },
          items: { type: "array", items: {
            type: "object", required: ["prediction_item_id", "item_name", "product_family", "product_subtype", "item_role", "model", "peer_group_id"],
            properties: {
              prediction_item_id: { type: "string", minLength: 1 }, item_name: { type: "string", minLength: 1 }, product_family: { type: "string" },
              product_subtype: { type: ["string", "null"] }, item_role: { enum: ["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"] },
              model: { type: ["string", "null"] }, peer_group_id: { type: ["string", "null"] },
            },
          } },
        },
      },
      erpPrediction: {
        type: "object", additionalProperties: false, required: ["identity_status", "confidence", "top_candidates", "evidence"],
        properties: { identity_status: { enum: ["matched", "ambiguous", "unresolved"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, top_candidates: { type: "array", maxItems: 3 }, evidence: { type: "object" } },
      },
    },
    type: "object",
    required: ["schema_version", "layer", "sample_id", "source", "strata", "selection_reasons", "prediction", "annotation_status", "annotations", "gold"],
    properties: {
      schema_version: { const: ANNOTATION_SCHEMA_VERSION }, layer: { enum: ["product_package", "erp_identity"] },
      sample_id: { type: "string", minLength: 1 }, source: { type: "object" }, strata: { type: "object" },
      selection_reasons: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
      prediction: { type: "object" }, annotation_status: { enum: ["pending", "in_progress", "reviewed", "adjudicated"] },
      annotations: {
        type: "object", additionalProperties: false, required: ["annotator_a", "annotator_b", "adjudication"],
        properties: {
          annotator_a: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }, { $ref: "#/$defs/erpGold" }] },
          annotator_b: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }, { $ref: "#/$defs/erpGold" }] },
          adjudication: { type: ["object", "null"] },
        },
      },
      gold: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }, { $ref: "#/$defs/erpGold" }] },
    },
    allOf: [
      { if: { properties: { layer: { const: "product_package" } } }, then: { properties: { prediction: { $ref: "#/$defs/packagePrediction" }, annotations: { type: "object", properties: { annotator_a: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }] }, annotator_b: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }] } } }, gold: { oneOf: [{ type: "null" }, { $ref: "#/$defs/packageGold" }] } } } },
      { if: { properties: { layer: { const: "erp_identity" } } }, then: { properties: { prediction: { $ref: "#/$defs/erpPrediction" }, annotations: { type: "object", properties: { annotator_a: { oneOf: [{ type: "null" }, { $ref: "#/$defs/erpGold" }] }, annotator_b: { oneOf: [{ type: "null" }, { $ref: "#/$defs/erpGold" }] } } }, gold: { oneOf: [{ type: "null" }, { $ref: "#/$defs/erpGold" }] } } } },
    ],
  };
}

export function validatePackets(packages: PackagePacket[], erp: ErpPacket[], expected?: { package_packets: number; erp_packets: number; no_product_evidence: number }) {
  const errors: string[] = [];
  const validPackages = packages.filter((packet) => validateRuntimePacket(packet, "product_package", errors));
  const validErp = erp.filter((packet) => validateRuntimePacket(packet, "erp_identity", errors));
  if (expected) {
    if (packages.length !== expected.package_packets) errors.push(`expected ${expected.package_packets} product-package packets, got ${packages.length}`);
    if (erp.length !== expected.erp_packets) errors.push(`expected ${expected.erp_packets} ERP packets, got ${erp.length}`);
    const noEvidence = validPackages.filter((packet) => packet.prediction.evidence_sufficiency === "insufficient_evidence" && packet.prediction.items.length === 0).length;
    if (noEvidence !== expected.no_product_evidence) errors.push(`expected all ${expected.no_product_evidence} no-product-evidence packets, got ${noEvidence}`);
  }
  const ids = new Set<string>();
  for (const packet of [...validPackages, ...validErp]) {
    if (packet.schema_version !== ANNOTATION_SCHEMA_VERSION) errors.push(`${packet.sample_id}: wrong schema_version`);
    if (!packet.sample_id || ids.has(packet.sample_id)) errors.push(`${packet.sample_id || "missing"}: duplicate or missing sample_id`);
    ids.add(packet.sample_id);
    if (!packet.selection_reasons.length) errors.push(`${packet.sample_id}: missing selection reason`);
    if (packet.annotation_status === "adjudicated" && !packet.gold) errors.push(`${packet.sample_id}: adjudicated packet has no gold`);
    if (packet.annotation_status !== "adjudicated" && packet.gold) errors.push(`${packet.sample_id}: gold requires adjudicated status`);
    if (packet.annotation_status === "adjudicated" && (!packet.annotations.annotator_a || !packet.annotations.annotator_b || !packet.annotations.adjudication)) errors.push(`${packet.sample_id}: adjudicated gold requires two annotations and an adjudication record`);
  }
  for (const packet of validPackages) {
    validatePackageGold(packet, errors);
    if (packet.annotations.annotator_a) validatePackageGold({ ...packet, gold: packet.annotations.annotator_a }, errors);
    if (packet.annotations.annotator_b) validatePackageGold({ ...packet, gold: packet.annotations.annotator_b }, errors);
  }
  for (const packet of validErp) {
    validateErpGold(packet, errors);
    if (packet.annotations.annotator_a) validateErpGold({ ...packet, gold: packet.annotations.annotator_a }, errors);
    if (packet.annotations.annotator_b) validateErpGold({ ...packet, gold: packet.annotations.annotator_b }, errors);
  }
  const sensitiveKeys: string[] = [];
  scanSensitiveKeys({ packages, erp }, "", sensitiveKeys);
  errors.push(...sensitiveKeys.map((key) => `sensitive field is not allowed: ${key}`));
  return { passed: errors.length === 0, errors, counts: { package_packets: packages.length, erp_packets: erp.length, unique_sample_ids: ids.size } };
}

const evidenceRef = z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/u, "must be a single-line reference");
const packageGoldSchema = z.object({
  evidence_sufficiency: z.enum(["sufficient", "insufficient_evidence", "legitimate_ambiguity", "abstain"]),
  items: z.array(z.object({
    gold_item_id: z.string().trim().min(1), matched_prediction_item_id: z.string().trim().min(1).nullable(),
    item_name: z.string().trim().min(1), product_family: z.string().trim().min(1).nullable(), product_subtype: z.string().trim().min(1).nullable(),
    item_role: z.enum(["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"]),
    model: z.string().trim().min(1).nullable(), peer_group_id: z.string().trim().min(1).nullable(), related_to_gold_item_id: z.string().trim().min(1).nullable(),
    evidence_refs: z.array(evidenceRef).min(1).refine((items) => new Set(items).size === items.length, "must be unique"),
  }).strict()), notes: z.string().nullable(),
}).strict();
const erpGoldSchema = z.object({
  decision: z.enum(["unique_match", "legitimate_ambiguity", "insufficient_evidence", "abstain"]),
  acceptable_identities: z.array(z.object({
    company: z.string().trim().min(1), part_num: z.string().trim().min(1), erp_product_name: z.string().trim().min(1),
    evidence_refs: z.array(evidenceRef).min(1).refine((items) => new Set(items).size === items.length, "must be unique"),
  }).strict()), notes: z.string().nullable(),
}).strict();
const commonPacketSchema = z.object({
  schema_version: z.literal(ANNOTATION_SCHEMA_VERSION), sample_id: z.string().trim().min(1), source: z.record(z.string(), z.unknown()),
  strata: z.record(z.string(), z.union([z.string(), z.array(z.string())])), selection_reasons: z.array(z.string().trim().min(1)).min(1),
  annotation_status: z.enum(["pending", "in_progress", "reviewed", "adjudicated"]),
}).strict();
const annotationsSchema = <T extends z.ZodTypeAny>(gold: T) => z.object({ annotator_a: gold.nullable(), annotator_b: gold.nullable(), adjudication: z.record(z.string(), z.unknown()).nullable() }).strict();
const packagePacketSchema = commonPacketSchema.extend({
  layer: z.literal("product_package"),
  prediction: z.object({ evidence_sufficiency: z.enum(["sufficient", "insufficient_evidence"]), items: z.array(z.object({ prediction_item_id: z.string().trim().min(1), item_name: z.string().trim().min(1), product_family: z.string(), product_subtype: z.string().nullable(), item_role: z.enum(["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"]), model: z.string().nullable(), peer_group_id: z.string().nullable() }).passthrough()) }).strict(),
  annotations: annotationsSchema(packageGoldSchema), gold: packageGoldSchema.nullable(),
});
const erpPacketSchema = commonPacketSchema.extend({
  layer: z.literal("erp_identity"),
  prediction: z.object({ identity_status: z.enum(["matched", "ambiguous", "unresolved"]), confidence: z.number().min(0).max(1), top_candidates: z.array(z.object({ company: z.string().trim().min(1), part_num: z.string().trim().min(1), erp_product_name: z.string().nullable(), prod_code: z.string().nullable(), class_id: z.string().nullable(), has_bom: z.boolean().nullable(), erp_order_num: z.string().nullable(), erp_order_line: z.string().nullable() }).strict()).max(3), evidence: z.record(z.string(), z.unknown()) }).strict(),
  annotations: annotationsSchema(erpGoldSchema), gold: erpGoldSchema.nullable(),
});

function validateRuntimePacket(packet: unknown, layer: "product_package" | "erp_identity", errors: string[]) {
  const result = (layer === "product_package" ? packagePacketSchema : erpPacketSchema).safeParse(packet);
  if (!result.success) {
    const id = packet && typeof packet === "object" && "sample_id" in packet ? String((packet as Record<string, unknown>).sample_id) : "unknown";
    errors.push(...result.error.issues.map((issue) => `${id}: schema ${issue.path.join(".") || "packet"} ${issue.message}`));
  }
  return result.success;
}

function validatePackageGold(packet: PackagePacket, errors: string[]) {
  const gold = packet.gold;
  if (!gold || !Array.isArray((gold as any).items)) return;
  const goldIds = new Set(gold.items.map((item) => item.gold_item_id));
  if (goldIds.size !== gold.items.length || goldIds.has("")) errors.push(`${packet.sample_id}: gold item ids must be non-empty and unique`);
  const predictionIds = new Set(packet.prediction.items.map((item) => item.prediction_item_id));
  const matched = gold.items.map((item) => item.matched_prediction_item_id).filter(Boolean) as string[];
  if (new Set(matched).size !== matched.length) errors.push(`${packet.sample_id}: one prediction cannot match multiple gold items`);
  for (const id of matched) if (!predictionIds.has(id)) errors.push(`${packet.sample_id}: unknown matched prediction ${id}`);
  for (const item of gold.items) {
    if (item.related_to_gold_item_id && !goldIds.has(item.related_to_gold_item_id)) errors.push(`${packet.sample_id}: unknown related gold item`);
    if (!item.evidence_refs.length) errors.push(`${packet.sample_id}:${item.gold_item_id}: evidence_refs required`);
  }
  if (gold.evidence_sufficiency === "sufficient" && !gold.items.length) errors.push(`${packet.sample_id}: sufficient package needs at least one gold item`);
  if (["legitimate_ambiguity", "abstain"].includes(gold.evidence_sufficiency) && gold.items.length) errors.push(`${packet.sample_id}: ambiguous/abstain package is excluded from item metrics and must not assert one gold item set`);
}

function validateErpGold(packet: ErpPacket, errors: string[]) {
  const gold = packet.gold;
  if (!gold || !Array.isArray((gold as any).acceptable_identities)) return;
  const count = gold.acceptable_identities.length;
  if (gold.decision === "unique_match" && count !== 1) errors.push(`${packet.sample_id}: unique_match requires exactly one identity`);
  if (gold.decision === "legitimate_ambiguity" && count < 2) errors.push(`${packet.sample_id}: legitimate_ambiguity requires at least two identities`);
  if (["insufficient_evidence", "abstain"].includes(gold.decision) && count) errors.push(`${packet.sample_id}: insufficient/abstain cannot assert an identity`);
  const keys = gold.acceptable_identities.map((item) => `${item.company}:${item.part_num}`);
  if (new Set(keys).size !== keys.length) errors.push(`${packet.sample_id}: duplicate acceptable ERP identity`);
  for (const item of gold.acceptable_identities) if (!item.company || !item.part_num || !item.erp_product_name || !item.evidence_refs.length) errors.push(`${packet.sample_id}: ERP identity needs Company + PartNum + name + evidence`);
}

function scanSensitiveKeys(value: unknown, path: string, found: string[]) {
  if (Array.isArray(value)) return value.forEach((item, index) => scanSensitiveKeys(item, `${path}[${index}]`, found));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    if (/^(?:customer|customer_name|customer_id|contact|phone|address|amount|price|file_name|file_path)$/iu.test(key)) found.push(next);
    scanSensitiveKeys(item, next, found);
  }
}
