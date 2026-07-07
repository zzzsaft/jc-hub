export type ConceptCandidateType = "term_type" | "value";

export type ConceptRelationType =
  | "exact_alias"
  | "synonym_alias"
  | "qualifier_variant"
  | "split_component"
  | "composite_value"
  | "wrong_scope"
  | "value_as_type"
  | "different_concept"
  | "extraction_error"
  | "non_config_noise";

export type ConceptRecommendedAction =
  | "map_to_existing_termtype"
  | "add_alias"
  | "create_new_termtype_candidate"
  | "create_new_enum_value_candidate"
  | "send_to_review"
  | "map_as_qualifier_variant"
  | "split_value"
  | "move_scope"
  | "mark_extraction_error"
  | "mark_non_config"
  | "defer_until_more_occurrences";

export type ConceptResolverRoute =
  | "auto_accept_pending"
  | "auto_pass"
  | "auto_reject_pending"
  | "llm_review"
  | "human_review"
  | "defer_until_more_occurrences";

export type ConceptRiskLevel = "low" | "medium" | "high";

export type ConceptIssue = {
  detector: string;
  relationType: ConceptRelationType;
  recommendedAction: ConceptRecommendedAction;
  confidence: number;
  riskLevel: ConceptRiskLevel;
  reason: string;
  evidence?: unknown;
  blocksAutoApply?: boolean;
};

export type ConceptMatchTarget = {
  targetType: "term_type" | "term" | "alias" | "unit" | "scope";
  id?: string | null;
  termType?: string | null;
  canonicalValue?: string | null;
  displayName?: string | null;
  relationType: ConceptRelationType;
  score: number;
  evidence?: unknown;
};

export type PolicyHardConstraint = {
  id: string;
  blocksAutoAccept?: boolean;
  reason: string;
  evidence?: unknown;
};
