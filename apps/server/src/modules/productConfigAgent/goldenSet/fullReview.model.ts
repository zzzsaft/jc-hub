import { z } from "zod";
import type { ErpGold, PackageGold } from "./model.js";

export const FULL_REVIEW_SCHEMA_VERSION = "product-config-golden-full-review-v2";

export type AdmissionDecision = "auto_archive" | "quarantine" | "reject";

export type FullReviewAnnotation = {
  admission: { decision: AdmissionDecision; reason_codes: string[]; notes: string | null };
  package: PackageGold;
  configuration_fields: Array<{
    field_key: string;
    value: string | null;
    unit: string | null;
    option: string | null;
    item_id: string | null;
    evidence_refs: string[];
  }>;
  erp: ErpGold;
};

export type FullReviewPacket = {
  schema_version: typeof FULL_REVIEW_SCHEMA_VERSION;
  document_id: string;
  cohort: "calibration" | "acceptance";
  v1_sample_ids: string[];
  evidence_hash: string;
  evidence: Array<{ evidence_id: string; content: string }>;
};

const evidenceRefSchema = z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/u, "must be a frozen evidence reference");
const evidenceRefsSchema = z.array(evidenceRefSchema).min(1, "evidence_refs required").refine((refs) => new Set(refs).size === refs.length, "evidence_refs must be unique");
const itemRoleSchema = z.enum(["peer_product", "component", "accessory", "spare_part", "sales_kit", "manufacturing_intermediate", "unknown"]);

const packageSchema = z.object({
  evidence_sufficiency: z.enum(["sufficient", "insufficient_evidence", "legitimate_ambiguity", "abstain"]),
  items: z.array(z.object({
    gold_item_id: z.string().trim().min(1),
    matched_prediction_item_id: z.string().trim().min(1).nullable(),
    item_name: z.string().trim().min(1),
    product_family: z.string().trim().min(1).nullable(),
    product_subtype: z.string().trim().min(1).nullable(),
    item_role: itemRoleSchema,
    model: z.string().trim().min(1).nullable(),
    peer_group_id: z.string().trim().min(1).nullable(),
    related_to_gold_item_id: z.string().trim().min(1).nullable(),
    evidence_refs: evidenceRefsSchema,
  }).strict()),
  notes: z.string().nullable().default(null),
}).strict();

const erpSchema = z.object({
  decision: z.enum(["unique_match", "legitimate_ambiguity", "insufficient_evidence", "abstain"]),
  acceptable_identities: z.array(z.object({
    company: z.string().trim().min(1),
    part_num: z.string().trim().min(1),
    erp_product_name: z.string().trim().min(1),
    evidence_refs: evidenceRefsSchema,
  }).strict()),
  notes: z.string().nullable().default(null),
}).strict();

const annotationSchema = z.object({
  admission: z.object({
    decision: z.enum(["auto_archive", "quarantine", "reject"]),
    reason_codes: z.array(z.string().trim().min(1)).refine((codes) => new Set(codes).size === codes.length, "reason_codes must be unique"),
    notes: z.string().nullable(),
  }).strict(),
  package: packageSchema,
  configuration_fields: z.array(z.object({
    field_key: z.string().trim().min(1),
    value: z.string().trim().min(1).nullable(),
    unit: z.string().trim().min(1).nullable(),
    option: z.string().trim().min(1).nullable().default(null),
    item_id: z.string().trim().min(1).nullable(),
    evidence_refs: evidenceRefsSchema,
  }).strict()),
  erp: erpSchema,
}).strict().superRefine((annotation, context) => {
  const { admission, package: pkg, configuration_fields: fields, erp } = annotation;
  if (["quarantine", "reject"].includes(admission.decision) && !admission.reason_codes.length) {
    context.addIssue({ code: "custom", path: ["admission", "reason_codes"], message: `${admission.decision} requires at least one reason code` });
  }
  if (erp.decision === "unique_match" && erp.acceptable_identities.length !== 1) {
    context.addIssue({ code: "custom", path: ["erp", "acceptable_identities"], message: "unique_match requires exactly one identity" });
  }
  if (admission.decision !== "auto_archive") return;
  if (pkg.evidence_sufficiency !== "sufficient") {
    context.addIssue({ code: "custom", path: ["package", "evidence_sufficiency"], message: "auto_archive requires sufficient package evidence" });
  }
  if (!pkg.items.length) {
    context.addIssue({ code: "custom", path: ["package", "items"], message: "auto_archive requires at least one package item" });
  }
  for (const [index, field] of fields.entries()) {
    if (field.value === null && field.option === null) {
      context.addIssue({ code: "custom", path: ["configuration_fields", index], message: "auto_archive blocks unresolved configuration fields" });
    }
  }
  const sellableItems = pkg.items.filter((item) => !["component", "manufacturing_intermediate"].includes(item.item_role));
  if (erp.decision !== "unique_match" || erp.acceptable_identities.length !== sellableItems.length) {
    context.addIssue({ code: "custom", path: ["erp"], message: "auto_archive requires one unique ERP identity for each sellable item" });
  }
});

const packetSchema = z.object({
  schema_version: z.literal(FULL_REVIEW_SCHEMA_VERSION),
  document_id: z.string().trim().min(1),
  cohort: z.enum(["calibration", "acceptance"]),
  v1_sample_ids: z.array(z.string().trim().min(1)).min(1).refine((ids) => new Set(ids).size === ids.length, "v1_sample_ids must be unique"),
  evidence_hash: z.string().regex(/^[a-f0-9]{64}$/u, "evidence_hash must be a SHA-256 hash"),
  evidence: z.array(z.object({ evidence_id: evidenceRefSchema, content: z.string() }).strict()).min(1).refine((items) => new Set(items.map((item) => item.evidence_id)).size === items.length, "evidence IDs must be unique"),
}).strict();

function validationResult(result: z.ZodSafeParseResult<unknown>) {
  return result.success
    ? { passed: true, errors: [] as string[] }
    : { passed: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || "annotation"}: ${issue.message}`) };
}

export function validateFullReviewAnnotation(annotation: unknown) {
  return validationResult(annotationSchema.safeParse(annotation));
}

export function validateFullReviewPacket(packet: unknown) {
  return validationResult(packetSchema.safeParse(packet));
}
