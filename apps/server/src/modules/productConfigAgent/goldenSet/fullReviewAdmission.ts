import type { FullReviewAnnotation } from "./fullReview.model.js";

export type AdmissionContext = { cohort: string; thresholdsPassed: boolean };
export type AdmissionPreview = { decision: "auto_archive" | "quarantine"; reason_codes: string[] };

export function decideAdmission(annotation: FullReviewAnnotation, context: AdmissionContext): AdmissionPreview {
  if (annotation.erp.some((mapping) => mapping.decision === "legitimate_ambiguity" || mapping.acceptable_identities.length > 1)) {
    return quarantine("erp_ambiguous");
  }
  if (annotation.erp.some((mapping) => mapping.decision !== "unique_match" || mapping.acceptable_identities.length !== 1)) {
    return quarantine("erp_unresolved");
  }
  if (!hasRequiredEvidence(annotation)) return quarantine("missing_required_evidence");
  if (annotation.admission.decision === "reject") return quarantine("document_rejected");
  if (annotation.admission.decision === "quarantine") return quarantine(annotation.admission.reason_codes[0] ?? "reviewer_quarantine");
  if (context.cohort !== "acceptance") return quarantine("unvalidated_cohort");
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
