import type { ReviewOperation } from "../types";
import type {
  ConceptHardConstraint,
  ConceptMatchTarget,
  ConceptPolicyEvaluation,
  ConceptResolution,
  TargetHealthReport,
} from "./types";
import { asArray, evidenceOf, textValue } from "./utils";

const highRiskHealthLabels = new Set(["alias_purity", "unit_consistency", "value_kind_consistency", "enum_purity"]);

export const proposalId = (resolution: ConceptResolution) =>
  String(resolution.id ?? `${resolution.candidateType ?? "candidate"}:${resolution.candidateId ?? ""}:${resolution.patternKey ?? ""}`);

export const primaryTarget = (resolution?: ConceptResolution | null) =>
  asArray(resolution?.matchedTargets ?? resolution?.matchedTargetsJsonb)[0] as ConceptMatchTarget | undefined;

export function healthTargetKind(target?: ConceptMatchTarget | null) {
  const direct = textValue(target?.healthTargetKind ?? target?.targetKind, "");
  if (direct) return direct;
  const targetType = String(target?.targetType ?? "");
  if (targetType === "term_type") return "termType";
  if (targetType === "term" || targetType === "alias") return "enumValue";
  if (targetType === "unit") return "unitAlias";
  if (targetType === "scope") return "scope";
  return "";
}

export function healthTargetId(target?: ConceptMatchTarget | null) {
  return textValue(target?.targetId ?? target?.id, "");
}

export function healthReportKey(targetKind: unknown, targetId: unknown) {
  return `${textValue(targetKind, "")}:${textValue(targetId, "")}`;
}

export function reportForTarget(target: ConceptMatchTarget | undefined, reports: Record<string, TargetHealthReport>) {
  const kind = healthTargetKind(target);
  const id = healthTargetId(target);
  return kind && id ? reports[healthReportKey(kind, id)] : undefined;
}

export function policyEvaluationOf(source?: ConceptResolution | ConceptMatchTarget | null): ConceptPolicyEvaluation {
  const scoreBreakdown = source?.scoreBreakdown as any;
  return (scoreBreakdown?.policyEvaluation ?? scoreBreakdown?.policy_evaluation ?? {}) as ConceptPolicyEvaluation;
}

export function scoringVectorOf(policy: ConceptPolicyEvaluation) {
  return policy.scoringVector ?? policy.scoring_vector ?? {};
}

export function hardConstraintsOf(policy: ConceptPolicyEvaluation): ConceptHardConstraint[] {
  return asArray(policy.hardConstraints ?? policy.hard_constraints);
}

export function trustTierOf(policy: ConceptPolicyEvaluation) {
  const labels = policy.intermediateLabels ?? policy.intermediate_labels ?? {};
  return textValue(labels.trustTier ?? labels.trust_tier, "");
}

export function unifiedScoreOf(resolution: ConceptResolution, target?: ConceptMatchTarget) {
  const resolutionPolicy = policyEvaluationOf(resolution);
  const targetPolicy = policyEvaluationOf(target);
  return (
    resolution.unifiedScore ??
    target?.unifiedScore ??
    resolutionPolicy.unifiedScore ??
    resolutionPolicy.unified_score ??
    targetPolicy.unifiedScore ??
    targetPolicy.unified_score ??
    resolution.score ??
    target?.score
  );
}

export function healthRiskLabels(report?: TargetHealthReport | null) {
  return Array.from(new Set([
    ...asArray(report?.riskLabels),
    ...asArray(report?.targetRiskLabels),
  ].map(String).filter(Boolean)));
}

export function operationPreviewFor(resolution: ConceptResolution, kind: "quickApprove" | "approve" | "reject" | "sendReview"): ReviewOperation[] {
  const raw =
    kind === "reject"
      ? ((resolution as any).rejectOperation ?? (resolution as any).rejectOperationsPreview)
      : kind === "sendReview"
        ? ((resolution as any).sendToReviewOperation ?? (resolution as any).sendToReviewOperationsPreview)
        : (resolution.batchOperationsPreview ??
            resolution.batch_operations_preview ??
            resolution.appliedOperation ??
            resolution.appliedOperationJsonb);
  const value = (raw && typeof raw === "object" && "operations" in (raw as any)) ? (raw as any).operations : raw;
  return asArray(Array.isArray(value) ? value : value ? [value] : []) as ReviewOperation[];
}

export function quickApproveBlockReasons(resolution: ConceptResolution, report?: TargetHealthReport | null) {
  const policy = policyEvaluationOf(resolution);
  const constraints = hardConstraintsOf(policy);
  const labels = healthRiskLabels(report);
  const reasons: string[] = [];
  if (trustTierOf(policy) === "suspect") reasons.push("suspect target");
  if (constraints.some((item) => item.blocksAutoAccept === true || item.blocks_auto_accept === true)) {
    reasons.push("hard constraint blocks auto accept");
  }
  if (resolution.route !== "auto_accept_pending") reasons.push("route requires human review");
  if (labels.some((label) => highRiskHealthLabels.has(label))) reasons.push("high audit risk labels");
  if (!operationPreviewFor(resolution, "quickApprove").length) reasons.push("没有后端可执行操作预览");
  return reasons;
}

export function affectedRecordSamples(resolution: ConceptResolution, report?: TargetHealthReport | null) {
  const evidence = evidenceOf(resolution) as any;
  const reportEvidence = (report?.evidenceJson ?? report?.evidence_json ?? {}) as any;
  return [
    ...asArray(evidence.sampleOccurrences),
    ...asArray(evidence.affectedRecords),
    ...asArray(reportEvidence.sampleOccurrences),
    ...asArray(reportEvidence.affectedRecords),
  ];
}

export function candidateRawField(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution) as any;
  const sample = asArray(evidence.sampleOccurrences)[0] as any;
  return textValue(resolution.rawFieldName ?? sample?.rawFieldName ?? sample?.rawField ?? sample?.fieldName, "");
}

export function candidateRawValue(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution) as any;
  const sample = asArray(evidence.sampleOccurrences)[0] as any;
  return textValue(resolution.rawValue ?? sample?.rawValue, "");
}

export function candidateNormalizedField(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution) as any;
  const sample = asArray(evidence.sampleOccurrences)[0] as any;
  return textValue(resolution.normalizedFieldName ?? sample?.normalizedFieldName ?? sample?.normalizedField, "");
}

export function candidateNormalizedValue(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution) as any;
  const sample = asArray(evidence.sampleOccurrences)[0] as any;
  return textValue(resolution.normalizedRawValue ?? sample?.normalizedRawValue ?? sample?.normalizedValue, "");
}

export function occurrenceCountOf(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution);
  return resolution.occurrenceCount ?? evidence.occurrenceCount;
}

export function documentCountOf(resolution: ConceptResolution) {
  const evidence = evidenceOf(resolution);
  return resolution.documentCount ?? evidence.documentCount;
}
