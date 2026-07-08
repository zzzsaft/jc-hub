import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  ExtractionDetail,
  ReviewOperation,
} from "../types";
import {
  batchResultMessage,
  errorText,
} from "../utils";

type UseQuoteAgentActionsParams = {
  clearSelectedDrafts: () => void;
  currentDocumentId: string | number;
  globalCandidates: boolean;
  loadCandidates: () => Promise<void>;
  loadDocuments: (nextPage?: number, pickFirst?: boolean) => Promise<void>;
  page: number;
  refreshCurrentDocumentCandidates: () => Promise<void>;
  selectedOperations: () => ReviewOperation[];
  setBatchSubmitting: (value: boolean) => void;
  setDetail: (value: ExtractionDetail | null) => void;
  setError: (message: string) => void;
  setGlobalCandidates: (value: boolean | ((current: boolean) => boolean)) => void;
  setLoadingDetail: (value: boolean) => void;
  setMessage: (message: string) => void;
};

export function useQuoteAgentActions({
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
}: UseQuoteAgentActionsParams) {
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

  const submitOperations = async (operations: ReviewOperation[]) => {
    const result = await quoteAgentService.submitBatchReviews(operations, {
      deferCandidateRecheck: true,
    });
    setMessage(batchResultMessage(result));
    if (globalCandidates) setGlobalCandidates(false);
    void refreshCurrentDocumentCandidates();
  };

  const submitBatch = async () => {
    const operations = selectedOperations();
    if (!operations.length) return;
    let shouldRefreshCurrentCandidates = false;
    setBatchSubmitting(true);
    setError("");
    try {
      const result = await quoteAgentService.submitBatchReviews(operations, {
        deferCandidateRecheck: true,
      });
      setMessage(batchResultMessage(result));
      clearSelectedDrafts();
      if (globalCandidates) setGlobalCandidates(false);
      shouldRefreshCurrentCandidates = true;
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBatchSubmitting(false);
    }
    if (shouldRefreshCurrentCandidates) void refreshCurrentDocumentCandidates();
  };

  return {
    documentAction,
    submitBatch,
    submitOperations,
  };
}
