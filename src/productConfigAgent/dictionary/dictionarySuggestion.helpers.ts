export const TERM_TYPE_REVIEW_ACTIONS = [
  "create_term_type",
  "approve_as_alias",
  "split_term_type",
  "reject",
  "needs_human_review",
] as const;

export const VALUE_REVIEW_ACTIONS = [
  "create_value",
  "approve_as_alias",
  "move_to_other_term_type",
  "split_value",
  "reject",
  "needs_human_review",
] as const;

export const CLUSTER_REVIEW_ACTIONS = [...new Set([...TERM_TYPE_REVIEW_ACTIONS, ...VALUE_REVIEW_ACTIONS])] as const;

export type CandidateClusterInput = {
  clusterId: string;
  candidateType: "term_type" | "value";
  candidateIds: string[];
  sourceProductType?: string | null;
  occurrenceCount: number;
  documentCount: number;
};

export function sanitizeTermType(input: unknown, fallback: string) {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return value || fallback;
}

export function parseSuggestionJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = fenced?.[1] ?? trimmed;
  const jsonText = unfenced.match(/\{[\s\S]*\}/)?.[0] ?? unfenced;
  return JSON.parse(jsonText);
}

export function uniqueAliases(values: unknown[], rawFieldName = "") {
  return uniqueLimited(
    values.filter((value) => String(value ?? "").trim() !== rawFieldName),
    5,
  );
}

export function normalizeSplitSuggestions(value: unknown) {
  const rawSuggestions = Array.isArray((value as any)?.suggestions) ? (value as any).suggestions : [];
  return rawSuggestions
    .map((item: any) => ({
      termType: String(item?.termType ?? "").trim(),
      displayName: asStringOrNull(item?.displayName) ?? undefined,
      canonicalValue: String(item?.canonicalValue ?? "").trim(),
      aliases: Array.isArray(item?.aliases) ? uniqueAliases(item.aliases) : [],
    }))
    .filter((item: any) => item.termType && item.canonicalValue)
    .slice(0, 8);
}

export function normalizeTermTypeReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: TERM_TYPE_REVIEW_ACTIONS.includes(action as any) ? action : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
    sourceProductType: asStringOrNull(value?.sourceProductType),
    itemIndex: asIntegerOrNull(value?.itemIndex),
    suggestedTermType: asStringOrNull(value?.suggestedTermType),
    suggestedDisplayName: asStringOrNull(value?.suggestedDisplayName),
    suggestedQuoteDisplayName: asStringOrNull(value?.suggestedQuoteDisplayName),
    suggestedDescription: asStringOrNull(value?.suggestedDescription),
    suggestedCategory: asStringOrNull(value?.suggestedCategory),
    suggestedSortOrder: asIntegerOrNull(value?.suggestedSortOrder),
    suggestedValueKind: asStringOrNull(value?.suggestedValueKind),
    suggestedApplicableProductTypes: normalizeStringArray(value?.suggestedApplicableProductTypes, 12),
    suggestedAliases: normalizeStringArray(value?.suggestedAliases, 10),
    suggestedValues: normalizeSuggestedValues(value?.suggestedValues),
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(value?.targetTermTypeApplicableMismatch),
    suggestedApplicableProductTypesToAdd: normalizeStringArray(value?.suggestedApplicableProductTypesToAdd, 12),
    splits: normalizeReviewSplits(value?.splits),
  };
}

export function normalizeValueReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: VALUE_REVIEW_ACTIONS.includes(action as any) ? action : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
    sourceProductType: asStringOrNull(value?.sourceProductType),
    itemIndex: asIntegerOrNull(value?.itemIndex),
    canonicalValue: asStringOrNull(value?.canonicalValue),
    displayName: asStringOrNull(value?.displayName),
    suggestedAliases: normalizeStringArray(value?.suggestedAliases, 10),
    targetTermId: asStringOrNull(value?.targetTermId),
    targetCanonicalValue: asStringOrNull(value?.targetCanonicalValue),
    targetDisplayName: asStringOrNull(value?.targetDisplayName),
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(value?.targetTermTypeApplicableMismatch),
    suggestedApplicableProductTypesToAdd: normalizeStringArray(value?.suggestedApplicableProductTypesToAdd, 12),
    movedFieldName: asStringOrNull(value?.movedFieldName),
    movedRawValue: asStringOrNull(value?.movedRawValue),
    splits: normalizeReviewSplits(value?.splits),
  };
}

export function normalizeClusterReviewSuggestion(value: any, cluster: CandidateClusterInput) {
  const rawAction = String(value?.recommendedAction ?? "").trim();
  const allowedActions = cluster.candidateType === "term_type" ? TERM_TYPE_REVIEW_ACTIONS : VALUE_REVIEW_ACTIONS;
  const recommendedAction =
    allowedActions.includes(rawAction as any) && CLUSTER_REVIEW_ACTIONS.includes(rawAction as any)
      ? rawAction
      : "needs_human_review";
  const normalizedPreview =
    recommendedAction === "needs_human_review"
      ? []
      : normalizeBatchOperationsPreview(value?.batchOperationsPreview, {
          candidateType: cluster.candidateType,
          candidateIds: cluster.candidateIds,
        });
  return {
    clusterId: cluster.clusterId,
    candidateType: cluster.candidateType,
    candidateIds: cluster.candidateIds,
    recommendedAction,
    confidence: asNumberOrNull(value?.confidence),
    riskLevel: ["low", "medium", "high"].includes(String(value?.riskLevel)) ? String(value?.riskLevel) : "medium",
    needsHumanReview: recommendedAction === "needs_human_review",
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
    humanReviewSummary: asStringOrNull(value?.humanReviewSummary) ?? "需要人工确认该候选簇",
    sourceProductType: asStringOrNull(value?.sourceProductType) ?? cluster.sourceProductType ?? null,
    occurrenceCount: cluster.occurrenceCount,
    documentCount: cluster.documentCount,
    targetTermType: asStringOrNull(value?.targetTermType),
    suggestedTermType: asStringOrNull(value?.suggestedTermType),
    canonicalValue: asStringOrNull(value?.canonicalValue),
    suggestedAliases: normalizeStringArray(value?.suggestedAliases, 10),
    splits: normalizeReviewSplits(value?.splits),
    batchOperationsPreview: expandClusterBatchOperationsPreview(normalizedPreview, cluster),
  };
}

export function uniqueLimited(values: unknown[], limit: number): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, limit);
}

export function clusterKey(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("\u0000");
}

export function clusterId(parts: Array<string | null | undefined>): string {
  return parts.map((part) => encodeURIComponent(String(part ?? ""))).join(":");
}

function asStringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function asIntegerOrNull(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? uniqueLimited(value, limit) : [];
}

function normalizeSuggestedValues(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      canonicalValue: asStringOrNull(item?.canonicalValue),
      displayName: asStringOrNull(item?.displayName),
      aliases: normalizeStringArray(item?.aliases, 10),
    }))
    .filter((item) => item.canonicalValue)
    .slice(0, 12);
}

function normalizeReviewSplits(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      termType: asStringOrNull(item?.termType),
      rawValue: asStringOrNull(item?.rawValue),
      canonicalValue: asStringOrNull(item?.canonicalValue),
      confidence: asNumberOrNull(item?.confidence),
    }))
    .filter((item) => item.termType || item.rawValue || item.canonicalValue)
    .slice(0, 20);
}

function normalizeBatchOperationsPreview(
  value: unknown,
  expected?: { candidateType: "term_type" | "value"; candidateIds: string[] },
) {
  const expectedCandidateIds = new Set(expected?.candidateIds ?? []);
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const candidateType = String(item?.candidateType ?? "").trim();
      const candidateId = String(item?.candidateId ?? "").trim();
      const action = normalizeBatchOperationAction(candidateType, String(item?.action ?? "").trim());
      if (
        (candidateType !== "term_type" && candidateType !== "value") ||
        (expected && candidateType !== expected.candidateType) ||
        (expected && !expectedCandidateIds.has(candidateId)) ||
        !candidateId ||
        !action ||
        !isAllowedBatchOperationAction(candidateType, action)
      ) {
        return null;
      }
      return {
        candidateType: candidateType as "term_type" | "value",
        candidateId,
        action,
        payload: item?.payload && typeof item.payload === "object" ? item.payload : {},
      };
    })
    .filter(Boolean)
    .slice(0, 100) as Array<{ candidateType: "term_type" | "value"; candidateId: string; action: string; payload: any }>;
}

function expandClusterBatchOperationsPreview(
  operations: Array<{ candidateType: "term_type" | "value"; candidateId: string; action: string; payload: any }>,
  cluster: CandidateClusterInput,
) {
  if (operations.length === 0 || operations.length >= cluster.candidateIds.length) return operations;
  const actionSet = new Set(operations.map((operation) => operation.action));
  if (actionSet.size !== 1) return operations;
  const operationByCandidateId = new Map(operations.map((operation) => [operation.candidateId, operation]));
  const template = operations[0];
  return cluster.candidateIds.slice(0, 100).map((candidateId) => {
    const existing = operationByCandidateId.get(candidateId);
    if (existing) return existing;
    return {
      candidateType: cluster.candidateType,
      candidateId,
      action: template.action,
      payload: cloneJsonObject(template.payload),
    };
  });
}

function cloneJsonObject(value: unknown): any {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeBatchOperationAction(candidateType: string, action: string): string {
  if (candidateType === "term_type" && action === "approve_as_alias") return "approve_term_type_as_alias";
  if (candidateType === "value" && action === "approve_as_alias") return "approve_value_as_alias";
  if (candidateType === "value" && action === "move_to_other_term_type") return "move_value_to_other_term_type";
  return action;
}

function isAllowedBatchOperationAction(candidateType: string, action: string): boolean {
  if (candidateType === "term_type") {
    return ["create_term_type", "approve_term_type_as_alias", "split_term_type", "reject"].includes(action);
  }
  if (candidateType === "value") {
    return [
      "create_value",
      "approve_value_as_alias",
      "split_value",
      "move_value_to_other_term_type",
      "update_term_type_value_kind",
      "reject",
    ].includes(action);
  }
  return false;
}
