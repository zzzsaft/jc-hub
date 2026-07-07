import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { quoteAgentService } from "../../services/quoteAgent.service";
import type { ContractArchiveReadinessResponse, ExtractionDetail } from "../../types";
import { detailItems, detailWarnings, docName, errorText } from "../../utils";

export function useContractDetailState() {
  const navigate = useNavigate();
  const { documentId = "" } = useParams<{ documentId?: string }>();
  const operatorName = useAuthStore((state) => state.name) || "Codex";
  const [detail, setDetail] = useState<ExtractionDetail | null>(null);
  const [readiness, setReadiness] = useState<ContractArchiveReadinessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setReadinessLoading(true);
    setError("");
    try {
      const [nextDetail, nextReadiness] = await Promise.all([
        quoteAgentService.getContract(documentId),
        quoteAgentService.getContractArchiveReadiness(documentId),
      ]);
      setDetail(nextDetail);
      setReadiness(nextReadiness);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
      setReadinessLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async () => {
    if (!documentId || archiving) return;
    setArchiving(true);
    setError("");
    setMessage("");
    try {
      const currentReadiness = readiness ?? await quoteAgentService.getContractArchiveReadiness(documentId);
      setReadiness(currentReadiness);
      const force = currentReadiness.forceRequired;
      if (!currentReadiness.canArchive && !force) {
        const reason = currentReadiness.blockers.map((item) => item.message).filter(Boolean).join("；");
        throw new Error(reason || "当前文档暂不满足归档条件。");
      }
      if (force) {
        const blockerText = currentReadiness.blockers.map((item) => `- ${item.message}`).join("\n");
        const warningText = currentReadiness.warnings.map((item) => `- ${item.message}`).join("\n");
        const confirmed = window.confirm(
          [
            "当前文档需要强制归档确认。",
            blockerText ? `阻断项：\n${blockerText}` : "",
            warningText ? `警告：\n${warningText}` : "",
            "确认后将以 force=true 归档。",
          ].filter(Boolean).join("\n\n"),
        );
        if (!confirmed) return;
      }
      const response = await quoteAgentService.archiveContract(documentId, {
        archivedBy: operatorName,
        reviewedBy: operatorName,
        force,
      });
      const archiveId = response.archive?.id;
      setMessage("归档成功");
      if (archiveId) navigate(`/agent/archive/archives/${archiveId}`);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setArchiving(false);
    }
  };

  const document = detail?.document;
  const title = docName(document);
  const status = String(document?.status ?? detail?.extraction?.status ?? "");
  const normalizedInfo = useMemo(
    () =>
      (detail?.extraction as any)?.normalized?.document_info ||
      (detail?.extraction as any)?.document_info ||
      (detail as any)?.dictionary?.document_info ||
      (detail as any)?.document_info ||
      {},
    [detail],
  );

  return {
    archive,
    archiving,
    detail,
    document,
    documentId,
    error,
    items: detailItems(detail),
    load,
    loading,
    message,
    normalizedInfo,
    readiness,
    readinessLoading,
    status,
    title,
    warnings: detailWarnings(detail),
  };
}
