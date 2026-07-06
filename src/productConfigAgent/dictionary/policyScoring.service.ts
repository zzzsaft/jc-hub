import type { ConceptIssue, ConceptMatchTarget, PolicyHardConstraint } from "./conceptResolver.types.js";

export type PolicyEvaluation = {
  policyVersion: string;
  baseScore: number;
  scoreDeltas: Array<{ ruleId: string; delta: number; reason: string; evidence?: unknown }>;
  unifiedScore: number;
  finalScore: number;
  hardConstraints: PolicyHardConstraint[];
  riskLabels: string[];
};

export class PolicyScoringService {
  evaluate(params: {
    target: ConceptMatchTarget;
    baseScore?: number;
    issues?: ConceptIssue[];
    auditSignal?: { riskScore?: number; riskLabels?: string[] } | null;
    matchContext?: { occurrenceCount?: number; candidateStatus?: string | null };
  }): PolicyEvaluation {
    const baseScore = clampScore(params.baseScore ?? params.target.score);
    const scoreDeltas: PolicyEvaluation["scoreDeltas"] = [];
    const hardConstraints: PolicyHardConstraint[] = [];
    const riskLabels = new Set<string>();

    for (const issue of params.issues ?? []) {
      const delta = issue.riskLevel === "high" ? -0.35 : issue.riskLevel === "medium" ? -0.2 : -0.08;
      scoreDeltas.push({ ruleId: `issue.${issue.relationType}`, delta, reason: issue.reason, evidence: issue.evidence });
      riskLabels.add(issue.relationType);
      if (issue.blocksAutoApply) {
        hardConstraints.push({
          id: `issue_blocks_auto_accept.${issue.relationType}`,
          blocksAutoAccept: true,
          reason: issue.reason,
          evidence: issue.evidence,
        });
      }
    }

    const riskScore = Math.max(0, Number(params.auditSignal?.riskScore ?? 0));
    if (riskScore > 0) {
      scoreDeltas.push({
        ruleId: "audit_risk_signal",
        delta: -Math.min(0.4, riskScore / 200),
        reason: `health audit riskScore=${riskScore}`,
      });
    }
    for (const label of params.auditSignal?.riskLabels ?? []) riskLabels.add(label);

    if ((params.matchContext?.occurrenceCount ?? 0) >= 10) {
      scoreDeltas.push({
        ruleId: "occurrence_support",
        delta: 0.04,
        reason: "candidate has repeated occurrences",
      });
    }
    if (params.matchContext?.candidateStatus === "rejected") {
      scoreDeltas.push({ ruleId: "rejected_candidate", delta: -0.4, reason: "candidate was previously rejected" });
      hardConstraints.push({ id: "rejected_candidate", blocksAutoAccept: true, reason: "previous rejection blocks auto accept" });
      riskLabels.add("deprecated_candidate");
    }

    const unifiedScore = clampScore(baseScore + scoreDeltas.reduce((sum, item) => sum + item.delta, 0));
    const finalScore = hardConstraints.some((item) => item.blocksAutoAccept)
      ? Math.min(unifiedScore, 0.69)
      : unifiedScore;
    return {
      policyVersion: "dictionary_policy_prisma_v1",
      baseScore,
      scoreDeltas,
      unifiedScore,
      finalScore: clampScore(finalScore),
      hardConstraints,
      riskLabels: [...riskLabels],
    };
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
