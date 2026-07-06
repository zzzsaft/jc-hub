import type {
  ConceptIssue,
  ConceptMatchTarget,
  ConceptRecommendedAction,
  ConceptRelationType,
  ConceptResolverRoute,
  ConceptRiskLevel,
  PolicyHardConstraint,
} from "./conceptResolver.types.js";

export const AUTO_ACCEPT_PENDING_THRESHOLD = 0.92;
export const LLM_REVIEW_THRESHOLD = 0.55;

export type ResolverRoutingInput = {
  candidateType: "term_type" | "value";
  termType?: string | null;
  topTarget?: ConceptMatchTarget | null;
  topIssue?: ConceptIssue | null;
  occurrenceCount: number;
  aliasExact: boolean;
  issues: ConceptIssue[];
  negative?: {
    productTypeMismatch?: boolean;
    valueKindConflict?: boolean;
    unitConflict?: boolean;
  };
  valueKind?: string | null;
  unifiedScore: number;
  hardConstraints?: PolicyHardConstraint[];
  config?: {
    llmEnabled?: boolean;
    thresholds?: {
      autoAcceptPending?: number;
      llmReview?: number;
    };
  };
};

export type ResolverRoutingResult = {
  relationType: ConceptRelationType;
  recommendedAction: ConceptRecommendedAction;
  route: ConceptResolverRoute;
  score: number;
  riskLevel: ConceptRiskLevel;
  reason: string;
};

const AUTO_PASS_VALUE_TERM_TYPES = new Set(["plastic_material", "application"]);

export class ResolverRoutingService {
  route(params: ResolverRoutingInput): ResolverRoutingResult {
    const topIssue = params.topIssue ?? null;
    const topTarget = params.topTarget ?? null;
    const relationType = topIssue?.relationType ?? topTarget?.relationType ?? "different_concept";
    let recommendedAction = this.resolveRecommendedAction(params.candidateType, relationType, topIssue, topTarget, params.valueKind ?? null);
    const negative = params.negative ?? {};
    const riskLevel = pickHighestRisk(
      negative.productTypeMismatch || negative.valueKindConflict || negative.unitConflict ? "high" : "low",
      params.issues,
    );
    const score = topIssue?.confidence ?? params.unifiedScore ?? topTarget?.score ?? 0.45;
    const hardConstraints = params.hardConstraints ?? [];
    const blocksAutoAccept = hardConstraints.some((constraint) => constraint.blocksAutoAccept === true);
    const thresholds = {
      autoAcceptPending: params.config?.thresholds?.autoAcceptPending ?? AUTO_ACCEPT_PENDING_THRESHOLD,
      llmReview: params.config?.thresholds?.llmReview ?? LLM_REVIEW_THRESHOLD,
    };
    let route: ConceptResolverRoute = "human_review";
    let reason = topIssue?.reason ?? "候选需要人工确认概念关系";

    if (relationType === "extraction_error" || relationType === "non_config_noise") {
      route = "auto_reject_pending";
      reason = topIssue?.reason ?? "候选疑似抽取错误或非配置噪声，等待人工确认拒绝";
    } else if (params.candidateType === "value" && params.termType && AUTO_PASS_VALUE_TERM_TYPES.has(params.termType) && riskLevel === "low") {
      route = "auto_pass";
      reason = "材料/应用 value 低风险候选自动通过，后续由 audit 兜底";
    } else if (params.occurrenceCount < 2 && !params.aliasExact && params.issues.length === 0) {
      route = "defer_until_more_occurrences";
      recommendedAction = "defer_until_more_occurrences";
      reason = "出现次数不足且没有强匹配证据，延后到更多样本后再审核";
    } else if (relationType === "split_component") {
      route = "human_review";
      recommendedAction = "split_value";
      reason = "候选命中已有值作为复合值组成部分，应人工确认拆分";
    } else if (
      params.candidateType === "value" &&
      relationType === "exact_alias" &&
      recommendedAction === "add_alias" &&
      riskLevel === "low" &&
      !blocksAutoAccept
    ) {
      route = "auto_accept_pending";
      reason = "字段值精确命中已有 enum value，自动进入 alias 待确认";
    } else if (
      params.candidateType === "term_type" &&
      relationType === "exact_alias" &&
      recommendedAction === "map_to_existing_termtype" &&
      params.issues.length === 0 &&
      params.unifiedScore >= thresholds.autoAcceptPending &&
      !blocksAutoAccept
    ) {
      route = "auto_pass";
      reason = "字段名精确命中已有 termType alias，自动通过为已知概念";
    } else if (params.candidateType === "term_type" && params.unifiedScore >= thresholds.autoAcceptPending) {
      route = "human_review";
      reason = "v1 禁止 termType 自动 apply";
    } else if (params.unifiedScore >= thresholds.autoAcceptPending && blocksAutoAccept) {
      route = "human_review";
      reason = "Routing hard constraints block auto-accept; routing falls back to review";
    } else if (
      params.candidateType === "value" &&
      (relationType === "exact_alias" || relationType === "synonym_alias") &&
      recommendedAction === "add_alias" &&
      params.unifiedScore >= thresholds.autoAcceptPending &&
      !blocksAutoAccept
    ) {
      route = "auto_accept_pending";
      reason = "字段值统一评分达到自动接受待确认阈值";
    } else if (params.unifiedScore >= thresholds.llmReview && params.issues.length === 0) {
      route = params.config?.llmEnabled ? "llm_review" : "human_review";
      reason = params.config?.llmEnabled ? "中置信候选进入 LLM 预审" : "中置信候选保持人工审核，LLM 预审开关未开启";
    }

    if (params.candidateType === "term_type" && route === "auto_accept_pending") {
      route = "human_review";
      reason = "v1 禁止 termType 自动 apply";
    }
    if (["qualifier_variant", "composite_value", "wrong_scope", "different_concept"].includes(relationType) && route === "auto_accept_pending") {
      route = "human_review";
      reason = "v1 禁止 qualifier/composite/scope/cross-term 自动 apply";
    }
    if (route === "auto_accept_pending" && blocksAutoAccept) {
      route = "human_review";
      reason = "Routing hard constraints block auto-accept; routing falls back to review";
    }

    return { relationType, recommendedAction, route, score, riskLevel, reason };
  }

  private resolveRecommendedAction(
    candidateType: "term_type" | "value",
    relationType: ConceptRelationType,
    topIssue: ConceptIssue | null,
    topTarget: ConceptMatchTarget | null,
    valueKind: string | null,
  ): ConceptRecommendedAction {
    if (topIssue) return topIssue.recommendedAction;
    if (topTarget) {
      if (relationType === "split_component") return "split_value";
      return candidateType === "term_type" ? "map_to_existing_termtype" : "add_alias";
    }
    if (candidateType === "term_type") return "create_new_termtype_candidate";
    return valueKind === "enum" || valueKind === "enums" ? "create_new_enum_value_candidate" : "send_to_review";
  }
}

export const resolverRoutingService = new ResolverRoutingService();

function pickHighestRisk(base: ConceptRiskLevel, issues: ConceptIssue[]): ConceptRiskLevel {
  return issues.reduce((current, issue) => (riskRank(issue.riskLevel) > riskRank(current) ? issue.riskLevel : current), base);
}

function riskRank(risk: ConceptRiskLevel): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}
