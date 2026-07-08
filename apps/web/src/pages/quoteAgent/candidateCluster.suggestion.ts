import type {
  CandidateCluster,
  CandidateClusterSuggestion,
  CandidateType,
  ReviewAction,
  ReviewOperation,
} from "./types";
import { asArray } from "./common.utils";
import {
  clusterIdentity,
  clusterIdentityKeys,
  clusterTermType,
  firstText,
  operationsOf,
  safeDecode,
  shouldFillClusterTermType,
  suggestionOf,
} from "./candidateCluster.core";
import { clustersFromResponse, normalizeCluster } from "./candidateCluster.response";

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
