import type { ConceptRecommendedAction, ConceptRelationType, ConceptResolverRoute, ConceptRiskLevel } from "./types";
import { crText } from "./locales";

export const REVIEWER = "Codex";

export const STATUS_OPTIONS = [
  { value: "pending", label: crText.labels.statuses.pending },
  { value: "reviewed", label: crText.labels.statuses.reviewed },
  { value: "applied", label: crText.labels.statuses.applied },
  { value: "all", label: crText.labels.statuses.all },
];

export const ROUTE_OPTIONS: Array<{ value: "" | ConceptResolverRoute; label: string }> = [
  { value: "", label: crText.labels.allRoutes },
  { value: "auto_accept_pending", label: "自动通过待确认" },
  { value: "auto_pass", label: crText.labels.routes.auto_pass },
  { value: "auto_reject_pending", label: crText.labels.routes.auto_reject_pending },
  { value: "llm_review", label: crText.labels.routes.llm_review },
  { value: "human_review", label: crText.labels.routes.human_review },
  { value: "defer_until_more_occurrences", label: crText.labels.routes.defer_until_more_occurrences },
];

export const RELATION_TYPE_OPTIONS: Array<{ value: "" | ConceptRelationType; label: string }> = [
  { value: "", label: crText.labels.allRelations },
  { value: "exact_alias", label: crText.labels.relations.exact_alias },
  { value: "synonym_alias", label: crText.labels.relations.synonym_alias },
  { value: "qualifier_variant", label: crText.labels.relations.qualifier_variant },
  { value: "split_component", label: crText.labels.relations.split_component },
  { value: "composite_value", label: crText.labels.relations.composite_value },
  { value: "wrong_scope", label: crText.labels.relations.wrong_scope },
  { value: "value_as_type", label: crText.labels.relations.value_as_type },
  { value: "different_concept", label: crText.labels.relations.different_concept },
  { value: "extraction_error", label: crText.labels.relations.extraction_error },
  { value: "non_config_noise", label: crText.labels.relations.non_config_noise },
];

export const ACTION_OPTIONS: Array<{ value: "" | ConceptRecommendedAction; label: string }> = [
  { value: "", label: crText.labels.allActions },
  { value: "add_alias", label: crText.labels.actions.add_alias },
  { value: "map_to_existing_termtype", label: crText.labels.actions.map_to_existing_termtype },
  { value: "map_as_qualifier_variant", label: crText.labels.actions.map_as_qualifier_variant },
  { value: "split_value", label: crText.labels.actions.split_value },
  { value: "move_scope", label: crText.labels.actions.move_scope },
  { value: "mark_extraction_error", label: crText.labels.actions.mark_extraction_error },
  { value: "mark_non_config", label: crText.labels.actions.mark_non_config },
  { value: "defer_until_more_occurrences", label: crText.labels.actions.defer_until_more_occurrences },
  { value: "create_new_termtype_candidate", label: crText.labels.actions.create_new_termtype_candidate },
  { value: "create_new_enum_value_candidate", label: crText.labels.actions.create_new_enum_value_candidate },
  { value: "send_to_review", label: crText.labels.actions.send_to_review },
];

export const BULK_ACTIONS = new Set([
  "mark_non_config",
  "mark_extraction_error",
  "split_value",
  "move_scope",
  "map_as_qualifier_variant",
  "defer_until_more_occurrences",
]);

export const RISK_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const PRIORITY_RELATIONS = new Set([
  "wrong_scope",
  "composite_value",
  "split_component",
  "value_as_type",
  "extraction_error",
  "exact_alias",
]);

export const PRIORITY_ACTIONS = new Set([
  "mark_non_config",
  "mark_extraction_error",
  "split_value",
  "move_scope",
  "add_alias",
]);

export const riskLabels: Record<ConceptRiskLevel | string, string> = {
  high: crText.labels.risks.high,
  medium: crText.labels.risks.medium,
  low: crText.labels.risks.low,
};

export const candidateTypeLabels: Record<string, string> = {
  all: crText.labels.candidateTypes.all,
  term_type: crText.labels.candidateTypes.term_type,
  value: crText.labels.candidateTypes.value,
};

export const statusLabels: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((item) => [item.value, item.label]),
);

export const routeLabels: Record<string, string> = Object.fromEntries(
  ROUTE_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

export const relationTypeLabels: Record<string, string> = Object.fromEntries(
  RELATION_TYPE_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

export const recommendedActionLabels: Record<string, string> = Object.fromEntries(
  ACTION_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

export const fieldLabels: Record<string, string> = crText.labels.fields;
export const evidenceKeyLabels: Record<string, string> = crText.labels.evidenceKeys;
