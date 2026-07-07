import type { DragEvent } from "react";
import type { useQuoteAgentPageState } from "../hooks/useQuoteAgentPageState";
import { docId, docName } from "../utils";

type QuoteAgentPageState = ReturnType<typeof useQuoteAgentPageState>;

type Props = Pick<
  QuoteAgentPageState,
  | "documents"
  | "fileInputRef"
  | "llmJob"
  | "loadingDocuments"
  | "selectedDocumentId"
  | "setSelectedDocumentId"
  | "setUploadOpen"
  | "startLlmUpload"
  | "uploadFile"
  | "uploadOpen"
  | "uploading"
>;

export function QuoteAgentTaskPanel({
  documents,
  fileInputRef,
  llmJob,
  loadingDocuments,
  selectedDocumentId,
  setSelectedDocumentId,
  setUploadOpen,
  startLlmUpload,
  uploadFile,
  uploadOpen,
  uploading,
}: Props) {
  const uploadDroppedFile = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <aside className="border-b border-slate-200 bg-white p-3 lg:border-b-0 lg:border-r">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">任务工具</h2>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => setUploadOpen((open) => !open)}>
          {uploadOpen ? "收起上传" : "上传文件"}
        </button>
      </div>

      {uploadOpen && (
        <button
          type="button"
          className="mb-3 flex h-16 w-full flex-col items-center justify-center border border-dashed border-blue-300 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          onDrop={uploadDroppedFile}
          onDragOver={(event) => event.preventDefault()}
          disabled={uploading}
        >
          <span>{uploading ? "上传中" : "拖拽或点击上传"}</span>
          <span className="text-xs text-blue-500">合同或生产明细文件</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadFile(file);
          event.currentTarget.value = "";
        }}
      />

      <section className="mb-3">
        <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">当前任务</div>
        {documents.length ? (
          <div className="mt-2 space-y-2">
            {documents.map((document) => {
              const id = docId(document);
              const active = String(id) === String(selectedDocumentId);
              return (
                <button
                  key={String(id)}
                  className={`w-full border px-3 py-2 text-left text-sm ${active ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}
                  type="button"
                  onClick={() => setSelectedDocumentId(id)}
                >
                  <div className="line-clamp-2 font-semibold">{docName(document)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    #{String(id || "-")} · {document.status || "-"} · items {document.itemCount ?? "-"} · warn {document.warningCount ?? "-"} · cand {document.candidateCount ?? "-"}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-5 text-sm text-slate-500">{loadingDocuments ? "正在加载任务" : "没有找到任务。"}</div>
        )}
      </section>

      <section>
        <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">LLM 批处理</div>
        <button className="qa-btn qa-btn-secondary mt-3 w-full" type="button" onClick={startLlmUpload}>
          上传未提取文档到 LLM
        </button>
        <div className="mt-2 text-xs text-slate-500">
          {llmJob ? (
            <div className="space-y-1">
              <div>状态：{llmJob.status || "-"}</div>
              <div>
                进度：{llmJob.processed ?? 0} / {llmJob.total ?? 0}
              </div>
              <div>
                成功 {llmJob.successCount ?? 0}，失败 {llmJob.failedCount ?? 0}
              </div>
              <div>当前文档：{llmJob.currentDocumentIds?.join("、") || "-"}</div>
            </div>
          ) : (
            "LLM 批处理尚未启动。"
          )}
        </div>
      </section>
    </aside>
  );
}
