import { validateFullReviewAnnotation, type FullReviewAnnotation, type FullReviewPacket } from "./fullReview.model.js";

export type AdmissionContext = { thresholdsPassed: boolean | null };
export type AdmissionPreview = { decision: "auto_archive" | "quarantine"; reason_codes: string[] };

export function decideAdmission(annotation: unknown, packet: unknown, context: AdmissionContext): AdmissionPreview {
  if (!validateFullReviewAnnotation(annotation, packet).passed) return quarantine("invalid_annotation");
  const validatedAnnotation = annotation as FullReviewAnnotation;
  const validatedPacket = packet as FullReviewPacket;
  if (validatedAnnotation.erp.some((mapping) => mapping.decision === "legitimate_ambiguity" || mapping.acceptable_identities.length > 1)) {
    return quarantine("erp_ambiguous");
  }
  if (validatedAnnotation.erp.some((mapping) => mapping.decision !== "unique_match" || mapping.acceptable_identities.length !== 1)) {
    return quarantine("erp_unresolved");
  }
  if (!hasRequiredEvidence(validatedAnnotation)) return quarantine("missing_required_evidence");
  if (validatedAnnotation.admission.decision === "reject") return quarantine("document_rejected");
  if (validatedAnnotation.admission.decision === "quarantine") return quarantine(validatedAnnotation.admission.reason_codes[0] ?? "reviewer_quarantine");
  if (validatedPacket.cohort !== "acceptance") return quarantine("unvalidated_cohort");
  if (context.thresholdsPassed === null) return quarantine("acceptance_threshold_unvalidated");
  if (!context.thresholdsPassed) return quarantine("acceptance_threshold_failed");
  return { decision: "auto_archive", reason_codes: [] };
}

function hasRequiredEvidence(annotation: FullReviewAnnotation) {
  return annotation.package.evidence_sufficiency === "sufficient"
    && annotation.package.items.length > 0
    && annotation.package.items.every((item) => item.evidence_refs.length > 0)
    && annotation.configuration_fields.length > 0
    && annotation.configuration_fields.every((field) => field.evidence_refs.length > 0)
    && annotation.erp.every((mapping) => mapping.acceptable_identities.every((identity) => identity.evidence_refs.length > 0));
}

function quarantine(reason: string): AdmissionPreview {
  return { decision: "quarantine", reason_codes: [reason] };
}
