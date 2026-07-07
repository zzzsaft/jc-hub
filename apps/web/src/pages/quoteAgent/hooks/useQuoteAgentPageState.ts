import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { emptyOptions, pageSize } from "../constants";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  Candidate,
  CandidateStatus,
  DictionaryOptions,
  DocumentStatus,
  ExtractionDetail,
  QuoteAgentDocument,
} from "../types";
import {
  asArray,
  detailItems,
  docId,
  errorText,
  responseDocs,
  statsOf,
} from "../utils";
import { useQuoteAgentActions } from "./useQuoteAgentActions";
import { useQuoteAgentDrafts } from "./useQuoteAgentDrafts";
import { useQuoteAgentRouteSync } from "./useQuoteAgentRouteSync";
import { useQuoteAgentTaskLoaders } from "./useQuoteAgentTaskLoaders";
import { useQuoteAgentUploads } from "./useQuoteAgentUploads";
import {
  buildPromptCandidates,
  buildReviewTargets,
  defaultQuoteAgentFilters,
  nextValue,
  type StateUpdate,
} from "./pageState.utils";

export function useQuoteAgentPageState() {
  const navigate = useNavigate();
  const { documentId: routeDocumentId = "" } = useParams<{ documentId?: string }>();
  const previousPageRef = useRef(1);
  const [documents, setDocuments] = useState<QuoteAgentDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | number>(routeDocumentId);
  const [detail, setDetail] = useState<ExtractionDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [options, setOptions] = useState<DictionaryOptions>(emptyOptions);
  const { filters, setFilters } = usePersistentFilterState("quoteAgent.documentReview", defaultQuoteAgentFilters);
  const documentStatus = filters.documentStatus;
  const candidateStatus = filters.candidateStatus;
  const search = filters.search;
  const page = Number(filters.page) || defaultQuoteAgentFilters.page;
  const globalCandidates = Boolean(filters.globalCandidates);
  const hideNonReviewFields = Boolean(filters.hideNonReviewFields);
  const hideTasksWithoutCandidates = Boolean(filters.hideTasksWithoutCandidates);
  const [total, setTotal] = useState(0);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeFieldKey, setActiveFieldKey] = useState("");
  const [expandedFieldKey, setExpandedFieldKey] = useState("");
  const [expandedAllFieldItems, setExpandedAllFieldItems] = useState<string[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const {
    applyDeepSeekDrafts,
    clearSelectedDrafts,
    drafts,
    saveDraft,
    selectedDraftKeys,
    selectedOperations,
    setSelectedDraftKeys,
  } = useQuoteAgentDrafts(setMessage);
  const setDocumentStatus = (value: DocumentStatus | "") => setFilters({ documentStatus: value });
  const setCandidateStatus = (value: CandidateStatus) => setFilters({ candidateStatus: value });
  const setSearch = (value: string) => setFilters({ search: value });
  const setPage = (value: StateUpdate<number>) => setFilters({ page: nextValue(value, page) });
  const setGlobalCandidates = (value: StateUpdate<boolean>) => setFilters({ globalCandidates: nextValue(value, globalCandidates) });
  const setHideNonReviewFields = (value: StateUpdate<boolean>) => setFilters({ hideNonReviewFields: nextValue(value, hideNonReviewFields) });
  const setHideTasksWithoutCandidates = (value: StateUpdate<boolean>) => setFilters({ hideTasksWithoutCandidates: nextValue(value, hideTasksWithoutCandidates) });

  useQuoteAgentRouteSync({
    navigate,
    routeDocumentId,
    selectedDocumentId,
    setActiveFieldKey,
    setCandidates,
    setDetail,
    setExpandedFieldKey,
    setSelectedDocumentId,
  });

  const selectedId = selectedDocumentId || routeDocumentId;
  const detailDocumentId = docId(detail?.document);
  const detailMatchesSelectedDocument = Boolean(detail) && (!detailDocumentId || !selectedId || String(detailDocumentId) === String(selectedId));
  const currentDocument = (detailMatchesSelectedDocument ? detail?.document : null) || documents.find((document) => String(docId(document)) === String(selectedId)) || null;
  const currentDocumentId = selectedId || docId(currentDocument);
  const items = useMemo(
    () => (detailMatchesSelectedDocument ? detailItems(detail) : []),
    [detail, detailMatchesSelectedDocument],
  );
  const allCandidates = [...asArray((candidates as any).termTypeCandidates), ...asArray((candidates as any).valueCandidates), ...candidates].filter(Boolean) as Candidate[];
  const stats = statsOf(items, allCandidates);
  const totalPages = Math.max(1, Math.ceil((total || documents.length || 1) / pageSize));

  const loadDocuments = useCallback(async (nextPage = page, pickFirst = false) => {
    setLoadingDocuments(true);
    setError("");
    try {
      const response = await quoteAgentService.listDocuments({
        page: nextPage,
        pageSize,
        status: documentStatus || undefined,
        q: search || undefined,
      });
      const list = responseDocs(response);
      const visibleList = hideTasksWithoutCandidates || pickFirst
        ? list.filter((document) => Number(document.candidateCount ?? 0) > 0)
        : list;
      setDocuments(visibleList);
      setTotal(Number(response.total ?? list.length));
      if (pickFirst && visibleList[0]) setSelectedDocumentId(docId(visibleList[0]));
      if (!visibleList.length && pickFirst) {
        setSelectedDocumentId("");
        setDetail(null);
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoadingDocuments(false);
    }
  }, [documentStatus, hideTasksWithoutCandidates, page, search]);

  const {
    candidateError,
    detailError,
    loadCandidates,
    loadDetail,
    loadingCandidates,
    loadingDetail,
    refreshCurrentDocumentCandidates,
    refreshCurrentTask,
    setLoadingDetail,
  } = useQuoteAgentTaskLoaders({
    candidateStatus,
    currentDocumentId,
    globalCandidates,
    loadDocuments,
    page,
    setCandidates,
    setDetail,
    setError,
    setMessage,
  });

  const {
    deepSeekOpen,
    fileInputRef,
    llmJob,
    setDeepSeekOpen,
    setUploadOpen,
    startLlmUpload,
    uploadFile,
    uploadOpen,
    uploading,
  } = useQuoteAgentUploads({
    loadCandidates,
    loadDocuments,
    page,
    setDetail,
    setError,
    setMessage,
    setSelectedDocumentId,
  });

  useEffect(() => {
    quoteAgentService.getDictionaryOptions().then(setOptions).catch((error) => setError(errorText(error)));
  }, []);

  useEffect(() => {
    const pageChanged = page !== previousPageRef.current;
    previousPageRef.current = page;
    loadDocuments(page, !routeDocumentId || pageChanged);
  }, [loadDocuments, page, routeDocumentId]);

  useEffect(() => {
    if (selectedDocumentId) loadDetail(selectedDocumentId);
  }, [selectedDocumentId, loadDetail]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const {
    documentAction,
    submitBatch,
    submitOperations,
  } = useQuoteAgentActions({
    clearSelectedDrafts,
    currentDocumentId,
    globalCandidates,
    loadCandidates,
    loadDocuments,
    page,
    refreshCurrentDocumentCandidates,
    selectedOperations,
    setBatchSubmitting,
    setDetail,
    setError,
    setGlobalCandidates,
    setLoadingDetail,
    setMessage,
  });

  const reviewTargets = useMemo(
    () => buildReviewTargets(items, allCandidates, currentDocumentId),
    [allCandidates, currentDocumentId, items],
  );
  const promptCandidates = useMemo(() => buildPromptCandidates(reviewTargets), [reviewTargets]);

  return {
    activeFieldKey,
    allCandidates,
    applyDeepSeekDrafts,
    batchSubmitting,
    candidateError,
    candidateStatus,
    currentDocument,
    currentDocumentId,
    deepSeekOpen,
    detail,
    detailError,
    documentAction,
    documents,
    documentStatus,
    drafts,
    error,
    expandedAllFieldItems,
    expandedFieldKey,
    fileInputRef,
    globalCandidates,
    hideNonReviewFields,
    hideTasksWithoutCandidates,
    items,
    llmJob,
    loadDocuments,
    loadingCandidates,
    loadingDetail,
    loadingDocuments,
    message,
    options,
    page,
    promptCandidates,
    refreshCurrentTask,
    saveDraft,
    search,
    selectedDocumentId,
    selectedDraftKeys,
    setActiveFieldKey,
    setCandidateStatus,
    setDeepSeekOpen,
    setDocumentStatus,
    setExpandedAllFieldItems,
    setExpandedFieldKey,
    setGlobalCandidates,
    setHideNonReviewFields,
    setHideTasksWithoutCandidates,
    setPage,
    setSearch,
    setSelectedDocumentId,
    setSelectedDraftKeys,
    setUploadOpen,
    startLlmUpload,
    stats,
    submitBatch,
    submitOperations,
    totalPages,
    uploadFile,
    uploadOpen,
    uploading,
  };
}
