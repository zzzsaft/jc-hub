import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  batchResultHasFailure,
  batchResultText,
  candidateCountOf,
  clusterIdentity,
  failureCandidateIds,
  failureReasonsByCandidateId,
  manualSuggestionFromOperation,
  mergeSuggestionResponse,
  operationsFromClusters,
  annotateClusterSuggestions,
} from "../candidateCluster.utils";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  CandidateCluster,
  CandidateClusterPromptData,
  CandidateStatus,
  RenormalizeBatchParams,
  RenormalizeBatchResponse,
  ReviewOperation,
} from "../types";
import { asArray, errorText } from "../utils";

const renormalizeBatchText = (result: RenormalizeBatchResponse) => {
  const processed = result.processedCount ?? 0;
  const success = result.successCount ?? 0;
  const failed = result.failedCount ?? 0;
  return `归一化重跑完成：处理 ${processed} 条，成功 ${success} 条，失败 ${failed} 条。`;
};

type UseCandidateClusterActionsParams = {
  clusters: CandidateCluster[];
  knownTermTypes: Set<string>;
  loadClusters: () => Promise<void>;
  promptData: CandidateClusterPromptData;
  selectedClusters: CandidateCluster[];
  setClusters: Dispatch<SetStateAction<CandidateCluster[]>>;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  setSelectedClusterIds: Dispatch<SetStateAction<string[]>>;
  status: CandidateStatus;
  visibleClusters: CandidateCluster[];
};

export function useCandidateClusterActions({
  clusters,
  knownTermTypes,
  loadClusters,
  promptData,
  selectedClusters,
  setClusters,
  setError,
  setMessage,
  setSelectedClusterIds,
  status,
  visibleClusters,
}: UseCandidateClusterActionsParams) {
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [renormalizing, setRenormalizing] = useState(false);

  const generateSuggestions = useCallback(async () => {
    setSuggesting(true);
    setError("");
    setMessage("正在按候选簇生成 AI 建议，不按文档逐条生成。");
    try {
      const response =
        await quoteAgentService.suggestCandidateClusterReviewsBatch({
          status,
          clusterIds: visibleClusters.map(clusterIdentity).filter(Boolean),
          priorDecisions: promptData.priorDecisions,
          runPolicy: promptData.runPolicy as Record<string, unknown> | undefined,
        });
      const nextClusters = annotateClusterSuggestions(mergeSuggestionResponse(clusters, response), knownTermTypes);
      setClusters(nextClusters);
      setSelectedClusterIds([]);
      setMessage("AI 建议已生成，请人工勾选确认后再提交。");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSuggesting(false);
    }
  }, [clusters, knownTermTypes, promptData.priorDecisions, promptData.runPolicy, setClusters, setError, setMessage, setSelectedClusterIds, status, visibleClusters]);

  const applyManualSuggestions = useCallback((suggestions: unknown) => {
    const nextClusters = annotateClusterSuggestions(mergeSuggestionResponse(clusters, suggestions), knownTermTypes);
    const suggestedCount = nextClusters.filter((cluster) => cluster.reviewSuggestion).length;
    setClusters(nextClusters);
    setSelectedClusterIds([]);
    setMessage(suggestedCount > 0
      ? `DeepSeek 建议已应用，当前 ${suggestedCount} 个候选簇有建议，请人工勾选确认后再提交。`
      : "未匹配到当前页面候选簇，请检查 JSON 中的 clusterId 是否与当前列表一致。");
    return suggestedCount;
  }, [clusters, knownTermTypes, setClusters, setMessage, setSelectedClusterIds]);

  const submitClusters = useCallback(
    async (targetClusters: CandidateCluster[]) => {
      const invalidCluster = targetClusters.find((cluster) => cluster.invalidSuggestionReason);
      if (invalidCluster) {
        setError(invalidCluster.invalidSuggestionReason || "所选候选簇包含无效建议。");
        return;
      }
      const operations = operationsFromClusters(targetClusters);
      if (!operations.length) {
        setError("所选候选簇没有可提交的审核操作。");
        return;
      }

      const affectedCandidates = candidateCountOf(targetClusters);
      const confirmed = window.confirm(
        `将提交 ${operations.length} 条审核操作，影响 ${affectedCandidates} 个 candidate。是否继续？`,
      );
      if (!confirmed) return;

      setSubmitting(true);
      setError("");
      try {
        const result = await quoteAgentService.submitBatchReviews(operations, {
          deferCandidateRecheck: true,
        });
        const failedIds = failureCandidateIds(result);
        const failureReasons = failureReasonsByCandidateId(result);
        const hasFailures = batchResultHasFailure(result);
        if (failedIds.size || hasFailures) {
          const targetIds = new Set(targetClusters.map(clusterIdentity));
          setClusters((current) =>
            current.flatMap((cluster) => {
              const ids = new Set([
                ...asArray(cluster.candidateIds).map(String),
                ...operationsFromClusters([cluster]).map((operation) =>
                  String(operation.candidateId),
                ),
              ]);
              const selected = targetIds.has(clusterIdentity(cluster));
              const failed = failedIds.size ? Array.from(ids).some((id) => failedIds.has(id)) : selected;
              const reason = Array.from(ids).map((id) => failureReasons.get(id)).find(Boolean);
              if (failed) {
                return [{ ...cluster, submitError: reason || (failedIds.size ? "提交失败，请检查后单独重试。" : "批量提交返回失败，但未标明具体 candidate，请检查后单独重试。") }];
              }
              if (selected) return [];
              return [{ ...cluster, submitError: "" }];
            }),
          );
        }
        setSelectedClusterIds([]);
        if (hasFailures) {
          setError(batchResultText(result));
        } else if (failedIds.size) {
          setError(batchResultText(result));
        } else {
          await loadClusters();
          setMessage(batchResultText(result));
        }
      } catch (err) {
        setError(errorText(err));
      } finally {
        setSubmitting(false);
      }
    },
    [loadClusters, setClusters, setError, setMessage, setSelectedClusterIds],
  );

  const saveManualOperation = useCallback((cluster: CandidateCluster, operation: ReviewOperation) => {
    const clusterId = clusterIdentity(cluster);
    let canSelect = true;
    setClusters((current) => {
      const nextClusters = current.map((item) => {
        if (clusterIdentity(item) !== clusterId) return item;
        const nextCluster = {
          ...item,
          reviewSuggestion: manualSuggestionFromOperation(item, operation),
        };
        return {
          ...nextCluster,
          batchOperationsPreview: nextCluster.reviewSuggestion.batchOperationsPreview,
        };
      });
      const annotated = annotateClusterSuggestions(nextClusters, knownTermTypes);
      canSelect = !annotated.find((item) => clusterIdentity(item) === clusterId)?.invalidSuggestionReason;
      return annotated;
    });
    setSelectedClusterIds((current) => canSelect ? Array.from(new Set([...current, clusterId])) : current.filter((id) => id !== clusterId));
    setMessage("手动审批建议已保存，请勾选后批量提交。");
  }, [knownTermTypes, setClusters, setMessage, setSelectedClusterIds]);

  const submitManualOperation = useCallback(async (cluster: CandidateCluster, operation: ReviewOperation) => {
    const nextCluster = {
      ...cluster,
      reviewSuggestion: manualSuggestionFromOperation(cluster, operation),
    };
    await submitClusters([{
      ...nextCluster,
      batchOperationsPreview: nextCluster.reviewSuggestion.batchOperationsPreview,
    }]);
  }, [submitClusters]);

  const submitSelectedClusters = useCallback(
    () => submitClusters(selectedClusters),
    [selectedClusters, submitClusters],
  );

  const renormalizeBatch = useCallback(async (params: RenormalizeBatchParams) => {
    const batchSize = params.batchSize ? Math.min(params.batchSize, 500) : undefined;
    const payload = {
      ...params,
      limit: params.limit || undefined,
      batchSize,
    };
    const confirmed = window.confirm(
      payload.scope === "all"
        ? "将按当前字典重跑所有匹配 extraction 的 normalization。是否继续？"
        : payload.scope === "with_pending_candidates"
          ? "将只处理仍有 pending candidates 的 extraction。是否继续？"
          : "将只处理还没有 normalized 结果的 extraction。是否继续？",
    );
    if (!confirmed) return;

    setRenormalizing(true);
    setError("");
    setMessage("正在重跑 extraction normalization...");
    try {
      const result = await quoteAgentService.renormalizeBatch(payload);
      await loadClusters();
      const failedCount = result.failedCount ?? 0;
      if (failedCount > 0) {
        setError(renormalizeBatchText(result));
      } else {
        setMessage(renormalizeBatchText(result));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRenormalizing(false);
    }
  }, [loadClusters, setError, setMessage]);

  return {
    applyManualSuggestions,
    generateSuggestions,
    renormalizeBatch,
    renormalizing,
    saveManualOperation,
    submitClusters,
    submitManualOperation,
    submitSelectedClusters,
    submitting,
    suggesting,
  };
}
