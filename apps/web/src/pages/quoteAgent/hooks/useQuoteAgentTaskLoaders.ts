import { useCallback, useRef, useState } from "react";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  Candidate,
  CandidateStatus,
  ExtractionDetail,
} from "../types";
import { errorText } from "../utils";

type UseQuoteAgentTaskLoadersParams = {
  candidateStatus: CandidateStatus;
  currentDocumentId: string | number;
  globalCandidates: boolean;
  loadDocuments: (nextPage?: number, pickFirst?: boolean) => Promise<void>;
  page: number;
  setCandidates: (value: Candidate[]) => void;
  setDetail: (value: ExtractionDetail | null) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
};

export function useQuoteAgentTaskLoaders({
  candidateStatus,
  currentDocumentId,
  globalCandidates,
  loadDocuments,
  page,
  setCandidates,
  setDetail,
  setError,
  setMessage,
}: UseQuoteAgentTaskLoadersParams) {
  const detailRequestIdRef = useRef(0);
  const candidateRequestIdRef = useRef(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [candidateError, setCandidateError] = useState("");

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
  }, [setDetail]);

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
  }, [candidateStatus, currentDocumentId, globalCandidates, setCandidates]);

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
  }, [currentDocumentId, loadCandidates, loadDetail, loadDocuments, page, setError, setMessage]);

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
  }, [candidateStatus, currentDocumentId, loadDocuments, page, setCandidates]);

  return {
    candidateError,
    detailError,
    loadCandidates,
    loadDetail,
    loadingCandidates,
    loadingDetail,
    refreshCurrentDocumentCandidates,
    refreshCurrentTask,
    setLoadingDetail,
  };
}
