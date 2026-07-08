import { useEffect, useRef, useState } from "react";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  ExtractionDetail,
  PendingLlmUploadJob,
  QuoteAgentDocument,
} from "../types";
import {
  docId,
  errorText,
} from "../utils";

type UseQuoteAgentUploadsParams = {
  loadCandidates: () => Promise<void>;
  loadDocuments: (nextPage?: number, pickFirst?: boolean) => Promise<void>;
  page: number;
  setDetail: (value: ExtractionDetail | null) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  setSelectedDocumentId: (value: string | number) => void;
};

export function useQuoteAgentUploads({
  loadCandidates,
  loadDocuments,
  page,
  setDetail,
  setError,
  setMessage,
  setSelectedDocumentId,
}: UseQuoteAgentUploadsParams) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [llmJob, setLlmJob] = useState<PendingLlmUploadJob | null>(null);
  const [deepSeekOpen, setDeepSeekOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const uploadedId = docId(response.document as QuoteAgentDocument);
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

  return {
    deepSeekOpen,
    fileInputRef,
    llmJob,
    setDeepSeekOpen,
    setUploadOpen,
    startLlmUpload,
    uploadFile,
    uploadOpen,
    uploading,
  };
}
