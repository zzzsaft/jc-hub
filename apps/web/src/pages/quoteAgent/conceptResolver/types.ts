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
export type ConceptReviewStatus = "pending" | "reviewed" | "applied" | "all";

export interface ConceptPositiveEvidence {
  aliasExact?: boolean;
  synonymSimilarity?: number;
  sameProductTypeUsage?: number;
  sameItemTogetherCount?: number;
  existingSeparateUsage?: number;
  ruleSignalCount?: number;
  historicalHumanReviewCount?: number;
  [key: string]: unknown;
}

export interface ConceptNegativeEvidence {
  coOccurrenceConflict?: boolean;
  unitConflict?: boolean;
  valueKindConflict?: boolean;
  productTypeMismatch?: boolean;
  sameItemTogetherCount?: number;
  existingSeparateUsage?: number;
  [key: string]: unknown;
}

export interface ConceptRuleSignal {
  ruleId?: string;
  relationType?: ConceptRelationType | string;
  recommendedAction?: ConceptRecommendedAction | string;
  confidence?: number;
  message?: string;
  before?: unknown;
  after?: unknown;
  evidence?: unknown;
  [key: string]: unknown;
}

export interface ConceptEvidence {
  positive?: ConceptPositiveEvidence;
  negative?: ConceptNegativeEvidence;
  ruleSignals?: ConceptRuleSignal[];
  occurrenceCount?: number;
  documentCount?: number;
  sampleOccurrences?: ConceptCandidateSample[];
  dictionaryVersion?: number | string;
  valueKind?: string | null;
  scope?: string | null;
  conceptRole?: string | null;
  [key: string]: unknown;
}

export interface ConceptIssue {
  detector?: string;
  relationType?: ConceptRelationType | string;
  recommendedAction?: ConceptRecommendedAction | string;
  confidence?: number;
  riskLevel?: ConceptRiskLevel | string;
  reason?: string;
  evidence?: unknown;
  blocksAutoApply?: boolean;
  [key: string]: unknown;
}

export interface ConceptMatchTarget {
  targetType?: "term_type" | "term" | "alias" | "unit" | "scope" | string;
  targetKind?: string | null;
  healthTargetKind?: string | null;
  id?: string | null;
  targetId?: string | number | null;
  termType?: string | null;
  canonicalValue?: string | null;
  displayName?: string | null;
  relationType?: ConceptRelationType | string;
  score?: number | string;
  baseScore?: number | string;
  contextAwareScore?: number | string;
  unifiedScore?: number | string;
  scoreBreakdown?: ConceptScoreBreakdown;
  evidence?: unknown;
  [key: string]: unknown;
}

export interface ConceptCandidateSample {
  rawFieldName?: string;
  rawField?: string;
  fieldName?: string;
  rawValue?: string | null;
  normalizedValue?: string | null;
  sourceProductType?: string | null;
  documentId?: string | number | null;
  document?: string | number | null;
  occurrenceCount?: number;
  status?: string;
  historicalStatus?: string;
  [key: string]: unknown;
}

export interface ConceptResolution {
  id?: string;
  runId?: string | null;
  candidateType?: ConceptCandidateType | string;
  candidateId?: string;
  dictionaryVersion?: string | number;
  resolverVersion?: string;
  relationType?: ConceptRelationType | string;
  recommendedAction?: ConceptRecommendedAction | string;
  route?: ConceptResolverRoute | string;
  score?: string | number;
  unifiedScore?: string | number;
  contextAwareScore?: string | number;
  riskLevel?: ConceptRiskLevel | string;
  patternKey?: string;
  rawFieldName?: string | null;
  rawValue?: string | null;
  normalizedFieldName?: string | null;
  normalizedRawValue?: string | null;
  sourceProductType?: string | null;
  occurrenceCount?: number | string | null;
  documentCount?: number | string | null;
  reason?: string;
  evidence?: ConceptEvidence;
  evidenceJsonb?: ConceptEvidence;
  matchedTargets?: ConceptMatchTarget[];
  matchedTargetsJsonb?: ConceptMatchTarget[];
  issues?: ConceptIssue[];
  issuesJsonb?: ConceptIssue[];
  scoreBreakdown?: ConceptScoreBreakdown;
  batchOperationsPreview?: unknown;
  batch_operations_preview?: unknown;
  appliedOperation?: unknown;
  appliedOperationJsonb?: unknown;
  appliedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ConceptScoreBreakdown {
  policyEvaluation?: ConceptPolicyEvaluation;
  policy_evaluation?: ConceptPolicyEvaluation;
  [key: string]: unknown;
}

export interface ConceptPolicyEvaluation {
  scoringVector?: {
    trustScore?: number | string;
    riskScore?: number | string;
    contextScore?: number | string;
    constraintScore?: number | string;
    [key: string]: unknown;
  };
  scoring_vector?: ConceptPolicyEvaluation["scoringVector"];
  unifiedScore?: number | string;
  unified_score?: number | string;
  hardConstraints?: ConceptHardConstraint[];
  hard_constraints?: ConceptHardConstraint[];
  intermediateLabels?: {
    trustTier?: string;
    trust_tier?: string;
    [key: string]: unknown;
  };
  intermediate_labels?: ConceptPolicyEvaluation["intermediateLabels"];
  routeRecommendation?: string;
  route_recommendation?: string;
  [key: string]: unknown;
}

export interface ConceptHardConstraint {
  type?: string;
  reason?: string;
  message?: string;
  blocksAutoAccept?: boolean;
  blocks_auto_accept?: boolean;
  [key: string]: unknown;
}

export interface TargetHealthReport {
  targetKind?: string;
  targetId?: string | number;
  riskScore?: string | number | null;
  riskLabels?: string[];
  targetRiskLabels?: string[];
  trustSignals?: Record<string, unknown>;
  evidenceJson?: {
    dimensions?: Record<string, any>;
    [key: string]: unknown;
  };
  evidence_json?: TargetHealthReport["evidenceJson"];
  recommendedAction?: string | null;
  affectedRecordsCount?: number | string | null;
  lastAuditedAt?: string | null;
  [key: string]: unknown;
}

export interface ConceptPatternReview {
  patternKey: string;
  candidateType?: ConceptCandidateType | string;
  relationType?: ConceptRelationType | string;
  recommendedAction?: ConceptRecommendedAction | string;
  route?: ConceptResolverRoute | string;
  riskLevel?: ConceptRiskLevel | string;
  candidateCount?: number;
  uniqueCandidateCount?: number;
  avgScore?: number;
  sampleField?: string;
  sampleValue?: string;
  sourceProductType?: string;
  reviewId?: string | null;
  reviewStatus?: string | null;
  reviewPayload?: unknown;
  lastResolvedAt?: string;
  primaryResolution?: ConceptResolution | null;
  [key: string]: unknown;
}

export interface ConceptResolverRun {
  id?: string;
  scope?: string;
  mode?: string;
  status?: string;
  dictionaryVersionAtStart?: string | null;
  resolverVersion?: string;
  stats?: Record<string, unknown> | null;
  error?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConceptResolverFilters {
  runId: string;
  status: ConceptReviewStatus;
  route: string;
  relationType: string;
  recommendedAction: string;
  candidateType: "all" | ConceptCandidateType;
  riskLevel: "all" | ConceptRiskLevel;
  search: string;
  limit: number;
  page: number;
  pageSize: number;
  sortKey: "candidateCount" | "riskLevel" | "avgScore" | "lastResolvedAt";
  sortDir: "asc" | "desc";
}

export interface ConceptActionIntent {
  kind: "quickApprove" | "approve" | "reject" | "sendReview";
  resolutions: ConceptResolution[];
  label: string;
  operations: unknown[];
}

export interface ConceptActionResult {
  patternKey?: string;
  operationCount?: number;
  operations?: unknown[];
  [key: string]: unknown;
}
