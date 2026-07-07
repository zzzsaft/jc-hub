import { documentStatuses } from "../constants";
import type { useQuoteAgentPageState } from "../hooks/useQuoteAgentPageState";
import type { DocumentStatus } from "../types";

type QuoteAgentPageState = ReturnType<typeof useQuoteAgentPageState>;

type Props = Pick<
  QuoteAgentPageState,
  | "currentDocumentId"
  | "documentAction"
  | "documentStatus"
  | "loadDocuments"
  | "loadingCandidates"
  | "loadingDetail"
  | "loadingDocuments"
  | "page"
  | "promptCandidates"
  | "refreshCurrentTask"
  | "search"
  | "setDeepSeekOpen"
  | "setDocumentStatus"
  | "setPage"
  | "setSearch"
  | "totalPages"
>;

export function QuoteAgentToolbar({
  currentDocumentId,
  documentAction,
  documentStatus,
  loadDocuments,
  loadingCandidates,
  loadingDetail,
  loadingDocuments,
  page,
  promptCandidates,
  refreshCurrentTask,
  search,
  setDeepSeekOpen,
  setDocumentStatus,
  setPage,
  setSearch,
  totalPages,
}: Props) {
  const searchDocuments = () => {
    setPage(1);
    loadDocuments(1, true);
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(260px,1fr)_180px_auto]">
        <input
          className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
          value={search}
          placeholder="搜索文件名"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") searchDocuments();
          }}
        />
        <select
          className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
          value={documentStatus}
          onChange={(event) => {
            setPage(1);
            setDocumentStatus(event.target.value as DocumentStatus | "");
          }}
        >
          {documentStatuses.map((status) => (
            <option key={status.value || "all"} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <button className="qa-btn qa-btn-primary" type="button" onClick={searchDocuments} disabled={loadingDocuments}>
          查找下一个任务
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={page <= 1 || loadingDocuments} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          上一页
        </button>
        <span className="min-w-16 text-center text-xs text-slate-500">
          {page} / {totalPages}
        </span>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={page >= totalPages || loadingDocuments} onClick={() => setPage((current) => current + 1)}>
          下一页
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={!currentDocumentId || loadingDetail || loadingCandidates} onClick={refreshCurrentTask}>
          刷新本任务
        </button>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={!currentDocumentId || loadingDetail} onClick={() => documentAction("renormalize")}>
          重归一化
        </button>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={!currentDocumentId || loadingDetail} onClick={() => documentAction("reextract")}>
          重新解析
        </button>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={!promptCandidates.length} onClick={() => setDeepSeekOpen(true)}>
          DeepSeek Prompt
        </button>
      </div>
    </div>
  );
}
