import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { emptyOptions, pageSize } from "../constants";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  Candidate,
  CandidateStatus,
  CandidateType,
  DictionaryOptions,
  DocumentStatus,
  ExtractionDetail,
  PendingLlmUploadJob,
  QuoteAgentDocument,
  ReviewDraft,
  ReviewOperation,
} from "../types";
import {
  asArray,
  candidateTypeOf,
  detailItems,
  docId,
  draftKey,
  errorText,
  matchCandidate,
  responseDocs,
  batchResultMessage,
  statsOf,
} from "../utils";

type StateUpdate<T> = T | ((current: T) => T);

const defaultQuoteAgentFilters = {
  documentStatus: "dictionary_dirty" as DocumentStatus | "",
  candidateStatus: "pending" as CandidateStatus,
  search: "",
  page: 1,
  globalCandidates: false,
  hideNonReviewFields: true,
  hideTasksWithoutCandidates: true,
};

const nextValue = <T>(value: StateUpdate<T>, current: T) =>
  typeof value === "function" ? (value as (current: T) => T)(current) : value;

export function useQuoteAgentPageState() {
  const navigate = useNavigate();
  const { documentId: routeDocumentId = "" } = useParams<{ documentId?: string }>();
  const previousRouteDocumentIdRef = useRef(routeDocumentId);
  const previousPageRef = useRef(1);
  const detailRequestIdRef = useRef(0);
  const candidateRequestIdRef = useRef(0);
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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [candidateError, setCandidateError] = useState("");
  const [activeFieldKey, setActiveFieldKey] = useState("");
  const [expandedFieldKey, setExpandedFieldKey] = useState("");
  const [expandedAllFieldItems, setExpandedAllFieldItems] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [selectedDraftKeys, setSelectedDraftKeys] = useState<string[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [llmJob, setLlmJob] = useState<PendingLlmUploadJob | null>(null);
  const [deepSeekOpen, setDeepSeekOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setDocumentStatus = (value: DocumentStatus | "") => setFilters({ documentStatus: value });
  const setCandidateStatus = (value: CandidateStatus) => setFilters({ candidateStatus: value });
  const setSearch = (value: string) => setFilters({ search: value });
  const setPage = (value: StateUpdate<number>) => setFilters({ page: nextValue(value, page) });
  const setGlobalCandidates = (value: StateUpdate<boolean>) => setFilters({ globalCandidates: nextValue(value, globalCandidates) });
  const setHideNonReviewFields = (value: StateUpdate<boolean>) => setFilters({ hideNonReviewFields: nextValue(value, hideNonReviewFields) });
  const setHideTasksWithoutCandidates = (value: StateUpdate<boolean>) => setFilters({ hideTasksWithoutCandidates: nextValue(value, hideTasksWithoutCandidates) });

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

  useEffect(() => {
    if (routeDocumentId === previousRouteDocumentIdRef.current) return;
    previousRouteDocumentIdRef.current = routeDocumentId;
    setSelectedDocumentId(routeDocumentId);
    setDetail(null);
    setCandidates([]);
    setActiveFieldKey("");
    setExpandedFieldKey("");
  }, [routeDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId || String(selectedDocumentId) === String(routeDocumentId)) return;
    navigate(`/agent/review/${selectedDocumentId}`);
  }, [navigate, routeDocumentId, selectedDocumentId]);

  const loadDetail = useCallback(async (documentId: string | number) => {
    if (!documentId) return;
    const requestId = ++detailRequestIdRef.current;
    setLoadingDetail(true);
    setDetailError("");
    setDetail(null);
    try {
      const response = await quoteAgentService.getExtraction(documentId);
      if (requestId === detailRequestIdRef.current) setDetail(response);
    } catch (error) {
      if (requestId === detailRequestIdRef.current) setDetailError(errorText(error));
    } finally {
      if (requestId === detailRequestIdRef.current) setLoadingDetail(false);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    const requestId = ++candidateRequestIdRef.current;
    setLoadingCandidates(true);
    setCandidateError("");
    try {
      const response = await quoteAgentService.getCandidates({
        status: candidateStatus,
        documentId: globalCandidates ? undefined : currentDocumentId || undefined,
      });
      if (requestId === candidateRequestIdRef.current) {
        setCandidates([...(response.termTypeCandidates || []), ...(response.valueCandidates || [])]);
      }
    } catch (error) {
      if (requestId === candidateRequestIdRef.current) setCandidateError(errorText(error));
    } finally {
      if (requestId === candidateRequestIdRef.current) setLoadingCandidates(false);
    }
  }, [candidateStatus, currentDocumentId, globalCandidates]);

  const refreshCurrentTask = useCallback(async () => {
    if (!currentDocumentId) return;
    setMessage("");
    setError("");
    await Promise.all([
      loadDetail(currentDocumentId),
      loadCandidates(),
      loadDocuments(page, false),
    ]);
    setMessage("已刷新本任务。");
  }, [currentDocumentId, loadCandidates, loadDetail, loadDocuments, page]);

  const refreshCurrentDocumentCandidates = useCallback(async () => {
    if (!currentDocumentId) return;
    setLoadingCandidates(true);
    setCandidateError("");
    try {
      const [response] = await Promise.all([
        quoteAgentService.getCandidates({
          status: candidateStatus,
          documentId: currentDocumentId,
        }),
        loadDocuments(page, false),
      ]);
      setCandidates([...(response.termTypeCandidates || []), ...(response.valueCandidates || [])]);
    } catch (error) {
      setCandidateError(errorText(error));
    } finally {
      setLoadingCandidates(false);
    }
  }, [candidateStatus, currentDocumentId, loadDocuments, page]);

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

  useEffect(() => {
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await quoteAgentService.getPendingLlmUploadStatus();
        setLlmJob(response.job);
      } catch {
        /* ignore polling errors */
      }
      timer = window.setTimeout(poll, 5000);
    };
    poll();
    return () => window.clearTimeout(timer);
  }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const response = await quoteAgentService.uploadContract(file);
      const uploadedId = docId(response.document);
      setDetail(response);
      if (uploadedId) setSelectedDocumentId(uploadedId);
      setMessage(`上传完成：${uploadedId ? `文档 #${uploadedId}` : file.name}`);
      await loadDocuments(page, false);
      await loadCandidates();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setUploading(false);
    }
  };

  const startLlmUpload = async () => {
    setError("");
    try {
      const response = await quoteAgentService.startPendingLlmUpload();
      setLlmJob(response.job);
      setMessage("LLM 批处理已启动。");
    } catch (error) {
      setError(errorText(error));
    }
  };

  const documentAction = async (type: "renormalize" | "reextract") => {
    if (!currentDocumentId) return;
    setLoadingDetail(true);
    setError("");
    try {
      const response = type === "renormalize"
        ? await quoteAgentService.renormalize(currentDocumentId)
        : await quoteAgentService.reextract(currentDocumentId);
      setDetail(response);
      setMessage(type === "renormalize" ? "已按当前字典重归一化。" : "已重新 LLM 解析当前文档。");
      await loadDocuments(page, false);
      await loadCandidates();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveDraft = (draft: ReviewDraft) => {
    const key = draftKey(draft.candidateType, draft.candidateId);
    setDrafts((current) => ({ ...current, [key]: draft }));
    setSelectedDraftKeys((current) => (current.includes(key) ? current : [...current, key]));
    setMessage("已保存为待提交草稿。");
  };

  const submitOperations = async (operations: ReviewOperation[]) => {
    const result = await quoteAgentService.submitBatchReviews(operations, {
      deferCandidateRecheck: true,
    });
    setMessage(batchResultMessage(result));
    if (globalCandidates) setGlobalCandidates(false);
    void refreshCurrentDocumentCandidates();
  };

  const submitBatch = async () => {
    const operations = selectedDraftKeys.map((key) => drafts[key]).filter(Boolean);
    if (!operations.length) return;
    let shouldRefreshCurrentCandidates = false;
    setBatchSubmitting(true);
    setError("");
    try {
      const result = await quoteAgentService.submitBatchReviews(operations, {
        deferCandidateRecheck: true,
      });
      setMessage(batchResultMessage(result));
      setDrafts((current) => {
        const next = { ...current };
        selectedDraftKeys.forEach((key) => delete next[key]);
        return next;
      });
      setSelectedDraftKeys([]);
      if (globalCandidates) setGlobalCandidates(false);
      shouldRefreshCurrentCandidates = true;
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBatchSubmitting(false);
    }
    if (shouldRefreshCurrentCandidates) void refreshCurrentDocumentCandidates();
  };

  const reviewTargets = useMemo(() => {
    return items.flatMap((item) =>
      asArray(item.fields).map((field) => {
        const candidate = matchCandidate(field, item, allCandidates, currentDocumentId);
        const type = candidateTypeOf(field, candidate);
        return { item, field, candidate, candidateType: type, fieldKey: `${item.item_index ?? "x"}:${field.field_name ?? ""}:${field.raw_value ?? ""}:${candidate?.id ?? ""}` };
      }),
    );
  }, [allCandidates, currentDocumentId, items]);

  const promptCandidates = reviewTargets
    .filter((target) => target.candidate && target.candidateType)
    .map((target) => ({
      candidate: target.candidate as Candidate,
      candidateType: target.candidateType as CandidateType,
      fieldName: String(target.field.field_name || target.candidate?.rawFieldName || ""),
      rawValue: String(target.field.raw_value || target.candidate?.rawValue || ""),
    }));

  const applyDeepSeekDrafts = useCallback((nextDrafts: ReviewDraft[]) => {
    setDrafts((current) => {
      const next = { ...current };
      nextDrafts.forEach((draft) => { next[draftKey(draft.candidateType, draft.candidateId)] = draft; });
      return next;
    });
    setSelectedDraftKeys((current) => Array.from(new Set([...current, ...nextDrafts.map((draft) => draftKey(draft.candidateType, draft.candidateId))])));
  }, []);

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
