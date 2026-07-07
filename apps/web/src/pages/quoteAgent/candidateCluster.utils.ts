import type {
  BatchReviewResponse,
  CandidateCluster,
  CandidateClusterSuggestion,
  CandidateClusterPromptData,
  CandidateType,
  DictionaryOptions,
  ReviewAction,
  ReviewOperation,
} from "./types";
import { asArray } from "./utils";

export const clusterIdentity = (cluster: CandidateCluster) =>
  String(cluster.clusterId ?? cluster.id ?? cluster.clusterKey ?? cluster.candidateIds?.join(",") ?? "");

const safeDecode = (value: unknown) => {
  const text = String(value ?? "");
  if (!text) return "";
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const clusterIdentityKeys = (cluster: CandidateCluster) =>
  Array.from(new Set([
    clusterIdentity(cluster),
    safeDecode(clusterIdentity(cluster)),
    String(cluster.clusterKey ?? ""),
    safeDecode(cluster.clusterKey),
  ].filter(Boolean)));

const stringArray = (value: unknown): string[] => asArray(value as string[]).map((item) => String(item)).filter(Boolean);

const termTypeFromClusterId = (value: unknown) => {
  const parts = safeDecode(value).split(":");
  return parts[0] === "value" ? parts[1] ?? "" : "";
};

const firstText = (...values: unknown[]) =>
  values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";

const clusterTermType = (cluster: CandidateCluster) =>
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

const shouldFillClusterTermType = (operation: ReviewOperation) =>
  operation.candidateType === "value" &&
  (operation.action === "create_value" || operation.action === "update_term_type_value_kind");

const operationsOf = (value: unknown, defaultTermType = ""): ReviewOperation[] =>
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

export function normalizeCluster(value: CandidateCluster): CandidateCluster {
  const suggestion = suggestionOf(value);
  const defaultTermType = clusterTermType(value);
  return {
    ...value,
    id: value.id ?? value.clusterId ?? value.cluster_id,
    clusterId: value.clusterId ?? value.cluster_id ?? value.id,
    clusterKey: value.clusterKey ?? value.cluster_key,
    candidateType: normalizeCandidateType(value.candidateType ?? value.candidate_type),
    termType: defaultTermType,
    normalizedFieldName: value.normalizedFieldName ?? value.normalized_field_name,
    normalizedRawValue: value.normalizedRawValue ?? value.normalized_raw_value,
    candidateIds: asArray(value.candidateIds ?? value.candidate_ids),
    documentCount: Number(value.documentCount ?? value.document_count ?? 0),
    occurrenceCount: Number(value.occurrenceCount ?? value.occurrence_count ?? 0),
    sourceProductType: value.sourceProductType ?? value.source_product_type,
    rawFieldNameSamples: stringArray(value.rawFieldNameSamples ?? value.raw_field_name_samples),
    rawValueSamples: stringArray(value.rawValueSamples ?? value.raw_value_samples),
    commonContexts: stringArray(value.commonContexts ?? value.common_contexts),
    sampleOccurrences: asArray(value.sampleOccurrences ?? value.sample_occurrences),
    reviewSuggestion: suggestion,
    batchOperationsPreview: operationsOf(
      value.batchOperationsPreview ?? value.batch_operations_preview ?? suggestion?.batchOperationsPreview ?? suggestion?.batch_operations_preview,
      defaultTermType,
    ),
  };
}

export function clustersFromResponse(response: unknown): CandidateCluster[] {
  const value = response as any;
  const raw = Array.isArray(value) ? value : value?.candidateClusters ?? value?.clusters ?? value?.items ?? value?.data ?? [];
  return asArray(raw as CandidateCluster[]).map(normalizeCluster).sort((a, b) => {
    const documentDelta = Number(b.documentCount ?? 0) - Number(a.documentCount ?? 0);
    if (documentDelta !== 0) return documentDelta;
    return Number(b.occurrenceCount ?? 0) - Number(a.occurrenceCount ?? 0);
  });
}

export function termTypeSetFromClusterResponse(response: unknown) {
  const value = response as any;
  const termTypes = asArray(value?.options?.termTypes ?? value?.termTypes);
  return new Set(
    termTypes
      .map((item: any) => String(item?.termType ?? item?.term_type ?? ""))
      .filter(Boolean),
  );
}

const aliasText = (alias: unknown) => {
  if (typeof alias === "string" || typeof alias === "number") return String(alias).trim();
  const value = alias as Record<string, unknown> | null | undefined;
  return String(value?.aliasValue ?? value?.aliasName ?? value?.value ?? value?.name ?? "").trim();
};

const aliasTextList = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map(aliasText)
    .filter(Boolean);

export function dictionaryOptionsFromClusterResponse(response: unknown): DictionaryOptions {
  const value = response as any;
  const enumValues = asArray(value?.options?.enumValues ?? value?.enumValues).map((item: any) => ({
    ...item,
    id: item.id ?? item.termId ?? item.term_id ?? item.valueId ?? item.value_id,
    termType: item.termType ?? item.term_type ?? item.normalizedFieldName ?? item.normalized_field_name ?? item.fieldName ?? item.field_name,
    canonicalValue: item.canonicalValue ?? item.canonical_value ?? item.value ?? item.enumValue ?? item.enum_value,
    displayName: item.displayName ?? item.display_name ?? item.label ?? item.canonicalValue ?? item.canonical_value ?? item.value,
    aliasNames: aliasTextList(item.aliasNames ?? item.alias_names ?? item.aliases),
  }));
  return {
    termTypes: asArray(value?.options?.termTypes ?? value?.termTypes),
    values: enumValues,
    productTypes: asArray(value?.options?.productTypes ?? value?.productTypes),
  };
}

export function promptDataFromClusterResponse(response: unknown): CandidateClusterPromptData {
  const value = response as any;
  return {
    productTypes: asArray(value?.options?.productTypes ?? value?.productTypes),
    termTypes: asArray(value?.options?.termTypes ?? value?.termTypes),
    enumValues: asArray(value?.options?.enumValues ?? value?.enumValues),
    priorDecisions: asArray(value?.priorDecisions ?? value?.prior_decisions),
    runPolicy: value?.options?.runPolicy ?? value?.runPolicy ?? value?.run_policy,
  };
}

const targetTermTypeOf = (operation: ReviewOperation) => {
  const payload = operation.payload as any;
  return String(payload?.termType ?? payload?.term_type ?? "");
};

const requiresTermType = (action: ReviewAction) =>
  action === "approve_term_type_as_alias" ||
  action === "create_value" ||
  action === "move_value_to_other_term_type" ||
  action === "update_term_type_value_kind";

const allowedActionsByCandidateType: Record<CandidateType, Set<ReviewAction>> = {
  term_type: new Set(["create_term_type", "approve_term_type_as_alias", "split_term_type", "reject"]),
  value: new Set([
    "create_value",
    "approve_value_as_alias",
    "split_value",
    "move_value_to_other_term_type",
    "update_term_type_value_kind",
    "reject",
  ]),
};

const actionCompatibilityReason = (operation: ReviewOperation) => {
  const allowedActions = allowedActionsByCandidateType[operation.candidateType];
  if (!allowedActions?.has(operation.action)) {
    const allowedText = Array.from(allowedActions ?? []).join(" / ");
    return `${operation.candidateType} 候选不能使用 ${operation.action}。可用动作：${allowedText || "-"}`;
  }
  return "";
};

export function invalidClusterSuggestionReason(cluster: CandidateCluster, knownTermTypes: Set<string>) {
  const operations = operationsOf(cluster.batchOperationsPreview);
  for (const operation of operations) {
    const incompatibleReason = actionCompatibilityReason(operation);
    if (incompatibleReason) return incompatibleReason;

    const targetTermType = targetTermTypeOf(operation);
    if (requiresTermType(operation.action) && !targetTermType) {
      return `动作 ${operation.action} 缺少目标字段 Key termType，请在建议 payload 中补充 termType，或用手动审批重新选择字段 Key。`;
    }
    if (
      operation.action === "approve_term_type_as_alias" &&
      targetTermType &&
      !knownTermTypes.has(targetTermType)
    ) {
      return `目标字段 Key「${targetTermType}」不存在，不能作为别名提交。请改为 create_term_type 新建字段 Key，或选择一个已存在的字段 Key。`;
    }
    if (
      (operation.action === "create_value" ||
        operation.action === "move_value_to_other_term_type" ||
        operation.action === "update_term_type_value_kind") &&
      targetTermType &&
      !knownTermTypes.has(targetTermType)
    ) {
      return `目标字段 Key「${targetTermType}」不存在，请先新建该字段 Key 或改用已存在字段 Key。`;
    }
  }
  return "";
}

export function annotateClusterSuggestions(clusters: CandidateCluster[], knownTermTypes: Set<string>) {
  return clusters.map((cluster) => ({
    ...cluster,
    invalidSuggestionReason: invalidClusterSuggestionReason(cluster, knownTermTypes),
  }));
}

export function expandOperationToCluster(cluster: CandidateCluster, operation: ReviewOperation): ReviewOperation[] {
  const candidateIds = asArray(cluster.candidateIds).length ? asArray(cluster.candidateIds) : [operation.candidateId];
  const defaultTermType = clusterTermType(cluster);
  const effectiveOperation = {
    ...operation,
    candidateType: cluster.candidateType || operation.candidateType,
  } as ReviewOperation;
  return candidateIds.map((candidateId) => ({
    ...operation,
    candidateId: String(candidateId),
    candidateType: effectiveOperation.candidateType,
    payload: {
      ...(operation.payload ?? {}),
      termType:
        firstText(
          (operation.payload as any)?.termType,
          (operation.payload as any)?.term_type,
          shouldFillClusterTermType(effectiveOperation) ? defaultTermType : "",
        ) || undefined,
    },
  }));
}

export function manualSuggestionFromOperation(cluster: CandidateCluster, operation: ReviewOperation): CandidateClusterSuggestion {
  return {
    recommendedAction: operation.action,
    confidence: 1,
    riskLevel: "low",
    needsHumanReview: false,
    humanReviewSummary: "人工手动审批建议",
    reason: "由审核员在候选簇页面手动填写。",
    batchOperationsPreview: expandOperationToCluster(cluster, operation),
  };
}

export function hasClusterListPayload(response: unknown) {
  const value = response as any;
  return (
    Array.isArray(value) ||
    Array.isArray(value?.candidateClusters) ||
    Array.isArray(value?.clusters) ||
    Array.isArray(value?.items) ||
    Array.isArray(value?.data)
  );
}

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

export function shouldAutoSelectSuggestion(cluster: CandidateCluster) {
  const suggestion = cluster.reviewSuggestion;
  if (!suggestion) return false;
  if (suggestion.needsHumanReview || suggestion.needs_human_review) return false;
  if (String(suggestion.riskLevel ?? "").toLowerCase() === "high") return false;
  if (Number(suggestion.confidence ?? 0) < 0.85) return false;
  return operationsOf(cluster.batchOperationsPreview).length > 0;
}

export function mergeSuggestionResponse(clusters: CandidateCluster[], response: unknown): CandidateCluster[] {
  const suggestedClusters = clustersFromResponse(response);
  const value = response as any;
  const rawSuggestions = Array.isArray(value)
    ? value
    : asArray(
        value?.suggestions ??
          value?.clusterSuggestions ??
          value?.candidateClusterSuggestions ??
          value?.reviews ??
          value?.candidateClusters ??
          value?.items ??
          value?.data,
      );
  const suggestionById = new Map<string, CandidateClusterSuggestion>();
  const suggestionByCandidateId = new Map<string, CandidateClusterSuggestion>();

  const setSuggestion = (id: unknown, suggestion: CandidateClusterSuggestion | null | undefined) => {
    const key = String(id ?? "");
    if (key && suggestion) suggestionById.set(key, suggestion);
  };

  suggestedClusters.forEach((cluster) => {
    const suggestion = suggestionOf(cluster) ?? suggestionOf({ reviewSuggestion: cluster });
    clusterIdentityKeys(cluster).forEach((key) => setSuggestion(key, suggestion));
    asArray(cluster.candidateIds).forEach((candidateId) => {
      if (suggestion) suggestionByCandidateId.set(String(candidateId), suggestion);
    });
  });

  rawSuggestions.forEach((item: any) => {
    const suggestion = suggestionOf({ reviewSuggestion: item }) ?? item;
    [
      item.clusterId,
      item.cluster_id,
      item.candidateClusterId,
      item.candidate_cluster_id,
      item.id,
      item.clusterKey,
      item.cluster_key,
    ].forEach((key) => {
      setSuggestion(key, suggestion);
      setSuggestion(safeDecode(key), suggestion);
    });
    asArray(item.candidateIds ?? item.candidate_ids).forEach((candidateId) => {
      suggestionByCandidateId.set(String(candidateId), suggestion);
    });
    asArray(item.batchOperationsPreview ?? item.batch_operations_preview).forEach((operation: any) => {
      const candidateId = operation?.candidateId ?? operation?.candidate_id;
      if (candidateId !== undefined && candidateId !== null) suggestionByCandidateId.set(String(candidateId), suggestion);
    });
  });

  return clusters.map((cluster) => {
    const id = clusterIdentity(cluster);
    const candidateSuggestion = asArray(cluster.candidateIds)
      .map((candidateId) => suggestionByCandidateId.get(String(candidateId)))
      .find(Boolean);
    const idKeys = clusterIdentityKeys(cluster);
    const fullCluster = suggestedClusters.find((item) => clusterIdentityKeys(item).some((key) => idKeys.includes(key)));
    const suggestion =
      idKeys.map((key) => suggestionById.get(key)).find(Boolean) ??
      candidateSuggestion ??
      fullCluster?.reviewSuggestion ??
      cluster.reviewSuggestion ??
      null;
    return normalizeCluster({
      ...cluster,
      ...fullCluster,
      reviewSuggestion: suggestion,
      batchOperationsPreview: fullCluster?.batchOperationsPreview ?? suggestion?.batchOperationsPreview ?? cluster.batchOperationsPreview,
    });
  });
}

export function operationsFromClusters(clusters: CandidateCluster[]): ReviewOperation[] {
  return clusters.flatMap((cluster) => operationsOf(cluster.batchOperationsPreview));
}

export function candidateCountOf(clusters: CandidateCluster[]) {
  const ids = new Set<string>();
  clusters.forEach((cluster) => {
    asArray(cluster.candidateIds).forEach((id) => ids.add(String(id)));
    operationsOf(cluster.batchOperationsPreview).forEach((operation) => ids.add(String(operation.candidateId)));
  });
  return ids.size;
}

export function failureCandidateIds(result: BatchReviewResponse) {
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const ids = new Set<string>();
  failedItems.forEach((item: any) => {
    const id = item.candidateId ?? item.candidate_id ?? item.operation?.candidateId ?? item.operation?.candidate_id;
    if (id !== undefined && id !== null) ids.add(String(id));
  });
  return ids;
}

export function failureReasonsByCandidateId(result: BatchReviewResponse) {
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const reasons = new Map<string, string>();
  failedItems.forEach((item: any) => {
    const id = item.candidateId ?? item.candidate_id ?? item.operation?.candidateId ?? item.operation?.candidate_id;
    const reason = item.error ?? item.message ?? item.reason ?? item.detail ?? item.details ?? item.response?.data?.message;
    if (id !== undefined && id !== null && reason) reasons.set(String(id), String(reason));
  });
  return reasons;
}

export function firstFailureReason(result: BatchReviewResponse) {
  const reasons = Array.from(failureReasonsByCandidateId(result).values());
  if (reasons.length) return reasons[0];
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const item = failedItems.find(Boolean) as any;
  return String(item?.error ?? item?.message ?? item?.reason ?? "");
}

export function normalizeCandidateType(value: unknown): CandidateType | undefined {
  if (value === "term_type" || value === "term-type") return "term_type";
  if (value === "value") return "value";
  return undefined;
}

export function clusterKeySummary(cluster: CandidateCluster) {
  if (cluster.candidateType === "term_type") return cluster.normalizedFieldName || cluster.clusterKey || "-";
  return [cluster.termType, cluster.normalizedRawValue].filter(Boolean).join(" / ") || cluster.clusterKey || "-";
}

export function batchResultText(result: BatchReviewResponse) {
  const affected = Array.isArray(result.affectedDocumentIds) ? result.affectedDocumentIds.length : 0;
  const successCount = result.successCount ?? 0;
  const failedCount = result.failedCount ?? 0;
  if (failedCount > 0 && successCount > 0) {
    const reason = firstFailureReason(result);
    return `部分提交失败：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。${reason ? `原因：${reason}` : "失败行已保留，可单独重试。"}`;
  }
  if (failedCount > 0) {
    const reason = firstFailureReason(result);
    return `提交失败：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。${reason ? `原因：${reason}` : "请检查失败行后单独重试。"}`;
  }
  return `提交成功：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。`;
}

export function batchResultHasFailure(result: BatchReviewResponse) {
  return Number(result.failedCount ?? 0) > 0;
}
