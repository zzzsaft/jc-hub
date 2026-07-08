import type {
  CandidateCluster,
  CandidateClusterSuggestion,
  CandidateType,
  ReviewAction,
  ReviewOperation,
} from "./types";
import { asArray } from "./common.utils";

export const clusterIdentity = (cluster: CandidateCluster) =>
  String(cluster.clusterId ?? cluster.id ?? cluster.clusterKey ?? cluster.candidateIds?.join(",") ?? "");

export const safeDecode = (value: unknown) => {
  const text = String(value ?? "");
  if (!text) return "";
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export const clusterIdentityKeys = (cluster: CandidateCluster) =>
  Array.from(new Set([
    clusterIdentity(cluster),
    safeDecode(clusterIdentity(cluster)),
    String(cluster.clusterKey ?? ""),
    safeDecode(cluster.clusterKey),
  ].filter(Boolean)));

const termTypeFromClusterId = (value: unknown) => {
  const parts = safeDecode(value).split(":");
  return parts[0] === "value" ? parts[1] ?? "" : "";
};

export const firstText = (...values: unknown[]) =>
  values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";

export const clusterTermType = (cluster: CandidateCluster) =>
  firstText(
    cluster.termType,
    cluster.term_type,
    cluster.normalizedFieldName,
    cluster.normalized_field_name,
    termTypeFromClusterId(cluster.clusterId ?? cluster.id ?? cluster.clusterKey),
  );

const normalizeReviewAction = (action: unknown, candidateType: unknown): ReviewAction | null => {
  const value = String(action ?? "");
  if (value === "approve_as_alias" || value === "approve_alias" || value === "alias") {
    return candidateType === "term_type" ? "approve_term_type_as_alias" : "approve_value_as_alias";
  }
  if (value === "move_to_other_term_type") return "move_value_to_other_term_type";
  if (
    value === "create_term_type" ||
    value === "approve_term_type_as_alias" ||
    value === "split_term_type" ||
    value === "create_value" ||
    value === "approve_value_as_alias" ||
    value === "split_value" ||
    value === "move_value_to_other_term_type" ||
    value === "update_term_type_value_kind" ||
    value === "reject"
  ) {
    return value;
  }
  return null;
};

export const shouldFillClusterTermType = (operation: ReviewOperation) =>
  operation.candidateType === "value" &&
  (operation.action === "create_value" || operation.action === "update_term_type_value_kind");

export const operationsOf = (value: unknown, defaultTermType = ""): ReviewOperation[] =>
  asArray(value as ReviewOperation[])
    .map((operation) => {
      const candidateType = normalizeCandidateType(operation?.candidateType ?? (operation as any)?.candidate_type);
      const action = normalizeReviewAction(operation?.action ?? (operation as any)?.recommendedAction, candidateType);
      if (!candidateType || !operation?.candidateId || !action) return null;
      const rawPayload = (operation.payload ?? {}) as Record<string, unknown>;
      const normalizedOperation = { ...operation, candidateType, action } as ReviewOperation;
      const termType = firstText(
        rawPayload.termType,
        rawPayload.term_type,
        (rawPayload as any).suggestedTermType,
        (rawPayload as any).suggested_term_type,
        (rawPayload as any).targetTermType,
        (rawPayload as any).target_term_type,
        (operation as any).termType,
        (operation as any).term_type,
        (operation as any).suggestedTermType,
        (operation as any).suggested_term_type,
        (operation as any).targetTermType,
        (operation as any).target_term_type,
        shouldFillClusterTermType(normalizedOperation) ? defaultTermType : "",
      );
      const payload = {
        ...rawPayload,
        termType: termType || undefined,
        displayName:
          rawPayload.displayName ??
          rawPayload.display_name ??
          (rawPayload as any).suggestedDisplayName ??
          (rawPayload as any).suggested_display_name ??
          (operation as any).displayName ??
          (operation as any).display_name ??
          (operation as any).suggestedDisplayName ??
          (operation as any).suggested_display_name,
        quoteDisplayName:
          rawPayload.quoteDisplayName ??
          rawPayload.quote_display_name ??
          (rawPayload as any).suggestedQuoteDisplayName ??
          (rawPayload as any).suggested_quote_display_name ??
          (rawPayload as any).suggestedDisplayName ??
          (rawPayload as any).suggested_display_name ??
          (operation as any).quoteDisplayName ??
          (operation as any).quote_display_name ??
          (operation as any).suggestedQuoteDisplayName ??
          (operation as any).suggested_quote_display_name ??
          (operation as any).suggestedDisplayName ??
          (operation as any).suggested_display_name,
        category:
          rawPayload.category ??
          (rawPayload as any).suggestedCategory ??
          (rawPayload as any).suggested_category ??
          (operation as any).category ??
          (operation as any).suggestedCategory ??
          (operation as any).suggested_category,
        description:
          rawPayload.description ??
          (rawPayload as any).suggestedDescription ??
          (rawPayload as any).suggested_description ??
          (operation as any).description ??
          (operation as any).suggestedDescription ??
          (operation as any).suggested_description,
        applicableProductTypes:
          rawPayload.applicableProductTypes ??
          rawPayload.applicable_product_types ??
          (rawPayload as any).suggestedApplicableProductTypes ??
          (rawPayload as any).suggested_applicable_product_types ??
          (operation as any).applicableProductTypes ??
          (operation as any).applicable_product_types ??
          (operation as any).suggestedApplicableProductTypes ??
          (operation as any).suggested_applicable_product_types,
        termId:
          rawPayload.termId ??
          rawPayload.term_id ??
          (rawPayload as any).targetTermId ??
          (rawPayload as any).target_term_id ??
          (operation as any).termId ??
          (operation as any).term_id ??
          (operation as any).targetTermId ??
          (operation as any).target_term_id,
        aliasNames:
          rawPayload.aliasNames ??
          rawPayload.alias_names ??
          (rawPayload as any).aliases ??
          (rawPayload as any).suggestedAliases ??
          (rawPayload as any).suggested_aliases ??
          (operation as any).aliasNames ??
          (operation as any).alias_names ??
          (operation as any).aliases ??
          (operation as any).suggestedAliases ??
          (operation as any).suggested_aliases,
        valueKind:
          rawPayload.valueKind ??
          rawPayload.value_kind ??
          (rawPayload as any).suggestedValueKind ??
          (rawPayload as any).suggested_value_kind ??
          (operation as any).valueKind ??
          (operation as any).value_kind ??
          (operation as any).suggestedValueKind ??
          (operation as any).suggested_value_kind,
      };
      return {
        ...operation,
        candidateType,
        candidateId: String(operation.candidateId),
        action,
        payload,
      };
    })
    .filter(Boolean) as ReviewOperation[];

export function suggestionOf(cluster: CandidateCluster): CandidateClusterSuggestion | null {
  const raw = cluster.reviewSuggestion ?? cluster.review_suggestion ?? cluster.suggestion ?? null;
  if (!raw) return null;
  const rawOperations = asArray(raw.batchOperationsPreview ?? raw.batch_operations_preview).map((operation: any) => ({
    ...operation,
    payload: {
      ...(operation.payload ?? {}),
      termType:
        operation.payload?.termType ??
        operation.payload?.term_type ??
        operation.payload?.targetTermType ??
        operation.payload?.target_term_type ??
        operation.termType ??
        operation.term_type ??
        raw.targetTermType ??
        raw.target_term_type ??
        raw.termType ??
        raw.term_type ??
        raw.suggestedTermType ??
        raw.suggested_term_type,
      termId:
        operation.payload?.termId ??
        operation.payload?.term_id ??
        operation.payload?.targetTermId ??
        operation.payload?.target_term_id ??
        operation.termId ??
        operation.term_id ??
        raw.targetTermId ??
        raw.target_term_id,
      aliasNames:
        operation.payload?.aliasNames ??
        operation.payload?.alias_names ??
        operation.payload?.aliases ??
        operation.aliasNames ??
        operation.alias_names ??
        operation.aliases ??
        raw.suggestedAliases ??
        raw.suggested_aliases ??
        raw.aliasNames ??
        raw.alias_names,
      valueKind:
        operation.payload?.valueKind ??
        operation.payload?.value_kind ??
        operation.valueKind ??
        operation.value_kind ??
        raw.suggestedValueKind ??
        raw.suggested_value_kind ??
        raw.valueKind ??
        raw.value_kind,
      canonicalValue:
        operation.payload?.canonicalValue ??
        operation.payload?.canonical_value ??
        raw.canonicalValue ??
        raw.canonical_value,
      displayName:
        operation.payload?.displayName ??
        operation.payload?.display_name ??
        raw.displayName ??
        raw.display_name,
      rawValue:
        operation.payload?.rawValue ??
        operation.payload?.raw_value ??
        raw.movedRawValue ??
        raw.moved_raw_value,
      splits: operation.payload?.splits ?? raw.splits,
    },
  }));
  return {
    ...raw,
    recommendedAction: raw.recommendedAction ?? raw.recommended_action,
    confidence: Number(raw.confidence ?? 0),
    riskLevel: raw.riskLevel ?? raw.risk_level,
    needsHumanReview: Boolean(raw.needsHumanReview ?? raw.needs_human_review),
    humanReviewSummary: raw.humanReviewSummary ?? raw.human_review_summary,
    batchOperationsPreview: operationsOf(rawOperations),
  };
}

export function normalizeCandidateType(value: unknown): CandidateType | undefined {
  if (value === "term_type" || value === "term-type") return "term_type";
  if (value === "value") return "value";
  return undefined;
}
