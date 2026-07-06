import type { ConceptIssue, ConceptMatchTarget } from "./conceptResolver.types.js";
import { PolicyScoringService } from "./policyScoring.service.js";

export class ConceptTargetScoringService {
  constructor(private readonly policyScoring = new PolicyScoringService()) {}

  scoreTarget(params: {
    target: ConceptMatchTarget;
    issues?: ConceptIssue[];
    auditSignal?: { riskScore?: number; riskLabels?: string[] } | null;
    matchContext?: { occurrenceCount?: number; candidateStatus?: string | null };
  }): ConceptMatchTarget & {
    contextAwareScore: number;
    targetRiskLabels: string[];
    scoreBreakdown: unknown;
  } {
    const evaluation = this.policyScoring.evaluate({
      target: params.target,
      issues: params.issues,
      auditSignal: params.auditSignal,
      matchContext: params.matchContext,
    });
    return {
      ...params.target,
      score: evaluation.finalScore,
      contextAwareScore: evaluation.finalScore,
      targetRiskLabels: evaluation.riskLabels,
      scoreBreakdown: {
        policyEvaluation: evaluation,
        baseSimilarity: evaluation.baseScore,
        unifiedScore: evaluation.unifiedScore,
        finalScore: evaluation.finalScore,
      },
    };
  }

  scoreTargets(params: {
    targets: ConceptMatchTarget[];
    issues?: ConceptIssue[];
    auditSignal?: { riskScore?: number; riskLabels?: string[] } | null;
    matchContext?: { occurrenceCount?: number; candidateStatus?: string | null };
  }) {
    return params.targets
      .map((target) => this.scoreTarget({ ...params, target }))
      .sort((left, right) => right.contextAwareScore - left.contextAwareScore);
  }
}

export const conceptTargetScoringService = new ConceptTargetScoringService();
