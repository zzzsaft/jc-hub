import crypto from "node:crypto";
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
  erp: FullReviewErpMapping[];
};

export type FullReviewErpMapping = ErpGold & { gold_item_id: string };

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
  gold_item_id: z.string().trim().min(1),
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
  erp: z.array(erpSchema),
}).strict().superRefine((annotation, context) => {
  const { admission, package: pkg, configuration_fields: fields, erp } = annotation;
  const fieldKeys = fields.map((field) => field.field_key);
  if (new Set(fieldKeys).size !== fieldKeys.length) {
    context.addIssue({ code: "custom", path: ["configuration_fields"], message: "configuration field keys must be unique" });
  }
  if (["quarantine", "reject"].includes(admission.decision) && !admission.reason_codes.length) {
    context.addIssue({ code: "custom", path: ["admission", "reason_codes"], message: `${admission.decision} requires at least one reason code` });
  }
  const sellableItemIds = pkg.items
    .filter((item) => !["component", "manufacturing_intermediate"].includes(item.item_role))
    .map((item) => item.gold_item_id);
  const mappedItemIds = erp.map((mapping) => mapping.gold_item_id);
  if (new Set(mappedItemIds).size !== mappedItemIds.length || mappedItemIds.length !== sellableItemIds.length || mappedItemIds.some((id) => !sellableItemIds.includes(id))) {
    context.addIssue({ code: "custom", path: ["erp"], message: "ERP mappings must cover each sellable gold item exactly once" });
  }
  const identityPartNumsByCompany = new Map<string, Set<string>>();
  for (const [index, mapping] of erp.entries()) {
    const count = mapping.acceptable_identities.length;
    if (mapping.decision === "unique_match" && count !== 1) {
      context.addIssue({ code: "custom", path: ["erp", index, "acceptable_identities"], message: "unique_match requires exactly one identity" });
    }
    if (mapping.decision === "legitimate_ambiguity" && count < 2) {
      context.addIssue({ code: "custom", path: ["erp", index, "acceptable_identities"], message: "legitimate_ambiguity requires at least two identities" });
    }
    if (["insufficient_evidence", "abstain"].includes(mapping.decision) && count) {
      context.addIssue({ code: "custom", path: ["erp", index, "acceptable_identities"], message: "insufficient_evidence/abstain cannot assert an identity" });
    }
    for (const identity of mapping.acceptable_identities) {
      const partNums = identityPartNumsByCompany.get(identity.company) ?? new Set<string>();
      if (partNums.has(identity.part_num)) context.addIssue({ code: "custom", path: ["erp", index, "acceptable_identities"], message: "duplicate Company + PartNum ERP identity" });
      partNums.add(identity.part_num);
      identityPartNumsByCompany.set(identity.company, partNums);
    }
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
  if (erp.some((mapping) => mapping.decision !== "unique_match" || mapping.acceptable_identities.length !== 1)) {
    context.addIssue({ code: "custom", path: ["erp"], message: "auto_archive requires one unique ERP identity for each sellable item" });
  }
});

const evidenceSchema = z.array(z.object({ evidence_id: evidenceRefSchema, content: z.string() }).strict()).min(1).refine((items) => new Set(items.map((item) => item.evidence_id)).size === items.length, "evidence IDs must be unique");

export function canonicalFullReviewEvidenceHash(evidence: FullReviewPacket["evidence"]) {
  const canonicalEvidence = evidence
    .map(({ evidence_id, content }) => ({ evidence_id, content }))
    .sort((left, right) => left.evidence_id < right.evidence_id ? -1 : left.evidence_id > right.evidence_id ? 1 : 0);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalEvidence)).digest("hex");
}

const packetSchema = z.object({
  schema_version: z.literal(FULL_REVIEW_SCHEMA_VERSION),
  document_id: z.string().trim().min(1),
  cohort: z.enum(["calibration", "acceptance"]),
  v1_sample_ids: z.array(z.string().trim().min(1)).min(1).refine((ids) => new Set(ids).size === ids.length, "v1_sample_ids must be unique"),
  evidence_hash: z.string().regex(/^[a-f0-9]{64}$/u, "evidence_hash must be a SHA-256 hash"),
  evidence: evidenceSchema,
}).strict().superRefine((packet, context) => {
  if (packet.evidence_hash !== canonicalFullReviewEvidenceHash(packet.evidence)) {
    context.addIssue({ code: "custom", path: ["evidence_hash"], message: "evidence_hash must match canonical frozen evidence" });
  }
});

function validationResult(result: z.ZodSafeParseResult<unknown>) {
  return result.success
    ? { passed: true, errors: [] as string[] }
    : { passed: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || "annotation"}: ${issue.message}`) };
}

export function validateFullReviewAnnotation(annotation: unknown, packet: unknown) {
  const annotationResult = annotationSchema.safeParse(annotation);
  const packetResult = packetSchema.safeParse(packet);
  const errors = [
    ...(!annotationResult.success ? validationResult(annotationResult).errors : []),
    ...(!packetResult.success ? validationResult(packetResult).errors.map((error) => `packet.${error}`) : []),
  ];
  if (!annotationResult.success || !packetResult.success) return { passed: false, errors };
  const frozenEvidenceIds = new Set(packetResult.data.evidence.map((item) => item.evidence_id));
  const evidenceRefs = [
    ...annotationResult.data.package.items.flatMap((item) => item.evidence_refs),
    ...annotationResult.data.configuration_fields.flatMap((field) => field.evidence_refs),
    ...annotationResult.data.erp.flatMap((mapping) => mapping.acceptable_identities.flatMap((identity) => identity.evidence_refs)),
  ];
  errors.push(...evidenceRefs.filter((ref) => !frozenEvidenceIds.has(ref)).map((ref) => `evidence_refs: ${ref} is not in packet frozen evidence`));
  return { passed: errors.length === 0, errors };
}

export function validateFullReviewPacket(packet: unknown) {
  return validationResult(packetSchema.safeParse(packet));
}
