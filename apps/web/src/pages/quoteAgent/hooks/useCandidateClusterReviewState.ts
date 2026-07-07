import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  batchResultText,
  batchResultHasFailure,
  annotateClusterSuggestions,
  candidateCountOf,
  clusterIdentity,
  clustersFromResponse,
  dictionaryOptionsFromClusterResponse,
  failureCandidateIds,
  failureReasonsByCandidateId,
  hasClusterListPayload,
  manualSuggestionFromOperation,
  mergeSuggestionResponse,
  operationsFromClusters,
  promptDataFromClusterResponse,
  shouldAutoSelectSuggestion,
  termTypeSetFromClusterResponse,
} from "../candidateCluster.utils";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { useDictionaryOptionsStore } from "../../quoteAgentDictionary/store/useDictionaryOptionsStore";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  CandidateCluster,
  CandidateClusterPromptData,
  CandidateClusterReviewPromptResponse,
  CandidateClustersResponse,
  CandidateStatus,
  CandidateType,
  DictionaryOptions,
  RenormalizeBatchParams,
  RenormalizeBatchResponse,
  ReviewOperation,
} from "../types";
import { asArray, errorText } from "../utils";

type CandidateClusterSummary = NonNullable<CandidateClustersResponse["summary"]>;
type CandidateTypeFilter = CandidateType | "";

const defaultCandidateClusterFilters = {
  status: "pending" as CandidateStatus,
  documentId: "",
  limit: 10,
  candidateType: "" as CandidateTypeFilter,
};

const renormalizeBatchText = (result: RenormalizeBatchResponse) => {
  const processed = result.processedCount ?? 0;
  const success = result.successCount ?? 0;
  const failed = result.failedCount ?? 0;
  return `归一化重跑完成：处理 ${processed} 条，成功 ${success} 条，失败 ${failed} 条。`;
};

const clusterSummaryFromResponse = (response: CandidateClustersResponse): CandidateClusterSummary =>
  response.summary ?? {};

const termTypeSetFromOptions = (termTypes: DictionaryOptions["termTypes"]) =>
  new Set(termTypes.map((item) => String(item.termType ?? "")).filter(Boolean));

export function useCandidateClusterReviewState() {
  const requestIdRef = useRef(0);
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.candidateClusterReview",
    defaultCandidateClusterFilters,
  );
  const status = filters.status;
  const documentId = filters.documentId;
  const limit = Number(filters.limit) || defaultCandidateClusterFilters.limit;
  const candidateType = filters.candidateType;
  const [clusters, setClusters] = useState<CandidateCluster[]>([]);
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [renormalizing, setRenormalizing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reviewPrompt, setReviewPrompt] = useState<CandidateClusterReviewPromptResponse | string>("");
  const [clusterSummary, setClusterSummary] = useState<CandidateClusterSummary>({});
  const [knownTermTypes, setKnownTermTypes] = useState<Set<string>>(() => new Set());
  const termTypes = useDictionaryOptionsStore((state) => state.termTypes);
  const values = useDictionaryOptionsStore((state) => state.values);
  const productTypes = useDictionaryOptionsStore((state) => state.productTypes);
  const loadDictionaryOptions = useDictionaryOptionsStore((state) => state.load);
  const mergeDictionaryOptions = useDictionaryOptionsStore((state) => state.mergeOptions);
  const options = useMemo<DictionaryOptions>(
    () => ({ termTypes, values, productTypes }),
    [productTypes, termTypes, values],
  );
  const [promptData, setPromptData] = useState<CandidateClusterPromptData>({
    productTypes: [],
    termTypes: [],
    enumValues: [],
    priorDecisions: [],
  });

  const visibleClusters = useMemo(() => {
    if (!candidateType) return clusters;
    return clusters.filter(
      (cluster) => cluster.candidateType === candidateType,
    );
  }, [candidateType, clusters]);

  const selectedClusters = useMemo(
    () =>
      visibleClusters.filter((cluster) =>
        selectedClusterIds.includes(clusterIdentity(cluster)),
      ),
    [selectedClusterIds, visibleClusters],
  );

  const loadReviewPrompt = useCallback(async () => {
    try {
      const response =
        await quoteAgentService.getCandidateClusterReviewPrompt();
      setReviewPrompt(response);
    } catch {
      setReviewPrompt("");
    }
  }, []);

  const loadClusters = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    setMessage("正在刷新候选簇...");
    try {
      const response = await quoteAgentService.getCandidateClusters({
        status,
        candidateType: candidateType || "all",
        documentId: documentId.trim() || undefined,
        limit,
      });
      if (requestId !== requestIdRef.current) return;
      if (!hasClusterListPayload(response)) {
        throw new Error(
          "候选簇接口返回结构不正确，未找到 clusters/items/data 列表。请检查后端 /productConfigAgent/candidates/clusters 路由。",
        );
      }
      mergeDictionaryOptions(dictionaryOptionsFromClusterResponse(response));
      const storeTermTypes = useDictionaryOptionsStore.getState().termTypes;
      const nextKnownTermTypes = new Set([
        ...Array.from(termTypeSetFromClusterResponse(response)),
        ...Array.from(termTypeSetFromOptions(storeTermTypes)),
      ]);
      setKnownTermTypes(nextKnownTermTypes);
      setPromptData(promptDataFromClusterResponse(response));
      setClusterSummary(clusterSummaryFromResponse(response));
      setClusters(annotateClusterSuggestions(clustersFromResponse(response), nextKnownTermTypes));
      setSelectedClusterIds([]);
      setExpandedClusterIds([]);
      setMessage("候选簇已刷新。");
    } catch (err) {
      if (requestId === requestIdRef.current) setError(errorText(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [candidateType, documentId, limit, mergeDictionaryOptions, status]);

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
  }, [clusters, knownTermTypes, promptData.priorDecisions, promptData.runPolicy, status, visibleClusters]);

  const applyManualSuggestions = useCallback((suggestions: unknown) => {
    const nextClusters = annotateClusterSuggestions(mergeSuggestionResponse(clusters, suggestions), knownTermTypes);
    const suggestedCount = nextClusters.filter((cluster) => cluster.reviewSuggestion).length;
    setClusters(nextClusters);
    setSelectedClusterIds([]);
    setMessage(suggestedCount > 0
      ? `DeepSeek 建议已应用，当前 ${suggestedCount} 个候选簇有建议，请人工勾选确认后再提交。`
      : "未匹配到当前页面候选簇，请检查 JSON 中的 clusterId 是否与当前列表一致。");
    return suggestedCount;
  }, [clusters, knownTermTypes]);

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
    [loadClusters],
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
  }, [knownTermTypes]);

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
  }, [loadClusters]);

  const toggleExpanded = useCallback((clusterId: string) => {
    setExpandedClusterIds((current) =>
      current.includes(clusterId)
        ? current.filter((id) => id !== clusterId)
        : [...current, clusterId],
    );
  }, []);

  const toggleSelected = useCallback((clusterId: string) => {
    setSelectedClusterIds((current) =>
      current.includes(clusterId)
        ? current.filter((id) => id !== clusterId)
        : [...current, clusterId],
    );
  }, []);

  useEffect(() => {
    void loadReviewPrompt();
  }, [loadReviewPrompt]);

  useEffect(() => {
    void loadDictionaryOptions();
  }, [loadDictionaryOptions]);

  useEffect(() => {
    setKnownTermTypes((current) => new Set([...Array.from(current), ...Array.from(termTypeSetFromOptions(termTypes))]));
  }, [termTypes]);

  useEffect(() => {
    void loadClusters();
  }, [loadClusters]);

  return {
    candidateType,
    clusterSummary,
    documentId,
    error,
    expandedClusterIds,
    limit,
    loading,
    message,
    options,
    promptData,
    reviewPrompt,
    selectedClusterIds,
    selectedClusters,
    status,
    renormalizing,
    submitting,
    suggesting,
    visibleClusters,
    generateSuggestions,
    applyManualSuggestions,
    loadClusters,
    renormalizeBatch,
    saveManualOperation,
    setCandidateType: (value: CandidateType | "") => setFilters({ candidateType: value }),
    setDocumentId: (value: string) => setFilters({ documentId: value }),
    setLimit: (value: number) => setFilters({ limit: value }),
    setStatus: (value: CandidateStatus) => setFilters({ status: value }),
    submitClusters,
    submitManualOperation,
    submitSelectedClusters,
    toggleExpanded,
    toggleSelected,
  };
}
