import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  annotateClusterSuggestions,
  clusterIdentity,
  clustersFromResponse,
  dictionaryOptionsFromClusterResponse,
  hasClusterListPayload,
  promptDataFromClusterResponse,
  termTypeSetFromClusterResponse,
} from "../candidateCluster.utils";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { useDictionaryOptionsStore } from "../../quoteAgentDictionary/store/useDictionaryOptionsStore";
import { quoteAgentService } from "../services/quoteAgent.service";
import { useCandidateClusterActions } from "./useCandidateClusterActions";
import type {
  CandidateCluster,
  CandidateClusterPromptData,
  CandidateClusterReviewPromptResponse,
  CandidateClustersResponse,
  CandidateStatus,
  CandidateType,
  DictionaryOptions,
} from "../types";
import { errorText } from "../utils";

type CandidateClusterSummary = NonNullable<CandidateClustersResponse["summary"]>;
type CandidateTypeFilter = CandidateType | "";

const defaultCandidateClusterFilters = {
  status: "pending" as CandidateStatus,
  documentId: "",
  limit: 10,
  candidateType: "" as CandidateTypeFilter,
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

  const {
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
  } = useCandidateClusterActions({
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
  });

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
