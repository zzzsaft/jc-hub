import { ItemBlock } from "./ItemBlock";
import { candidateStatuses } from "../constants";
import type { useQuoteAgentPageState } from "../hooks/useQuoteAgentPageState";
import type { CandidateStatus } from "../types";
import { detailWarnings, docName } from "../utils";

type QuoteAgentPageState = ReturnType<typeof useQuoteAgentPageState>;

type Props = Pick<
  QuoteAgentPageState,
  | "activeFieldKey"
  | "allCandidates"
  | "candidateError"
  | "candidateStatus"
  | "currentDocument"
  | "currentDocumentId"
  | "detail"
  | "detailError"
  | "drafts"
  | "error"
  | "expandedAllFieldItems"
  | "expandedFieldKey"
  | "globalCandidates"
  | "hideNonReviewFields"
  | "hideTasksWithoutCandidates"
  | "items"
  | "loadingCandidates"
  | "loadingDetail"
  | "message"
  | "options"
  | "saveDraft"
  | "selectedDraftKeys"
  | "setActiveFieldKey"
  | "setCandidateStatus"
  | "setExpandedAllFieldItems"
  | "setExpandedFieldKey"
  | "setGlobalCandidates"
  | "setHideNonReviewFields"
  | "setHideTasksWithoutCandidates"
  | "setSelectedDraftKeys"
  | "stats"
  | "submitOperations"
>;

export function QuoteAgentReviewPanel({
  activeFieldKey,
  allCandidates,
  candidateError,
  candidateStatus,
  currentDocument,
  currentDocumentId,
  detail,
  detailError,
  drafts,
  error,
  expandedAllFieldItems,
  expandedFieldKey,
  globalCandidates,
  hideNonReviewFields,
  hideTasksWithoutCandidates,
  items,
  loadingCandidates,
  loadingDetail,
  message,
  options,
  saveDraft,
  selectedDraftKeys,
  setActiveFieldKey,
  setCandidateStatus,
  setExpandedAllFieldItems,
  setExpandedFieldKey,
  setGlobalCandidates,
  setHideNonReviewFields,
  setHideTasksWithoutCandidates,
  setSelectedDraftKeys,
  stats,
  submitOperations,
}: Props) {
  const warnings = detailWarnings(detail);

  return (
    <section className="min-w-0 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-950">字典匹配结果</h1>
            <p className="mt-1 truncate text-sm text-slate-500">{currentDocument ? `${docName(currentDocument)} / 文档 #${currentDocumentId}` : "请选择或上传文档"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">Key {options.termTypes.length}</span>
            <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">字段值 {options.values.length}</span>
            <select className="h-8 border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500" value={candidateStatus} onChange={(event) => setCandidateStatus(event.target.value as CandidateStatus)}>
              {candidateStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <label className="inline-flex h-8 items-center gap-2 border border-slate-200 bg-white px-2 text-xs text-slate-600">
              <input type="checkbox" checked={globalCandidates} onChange={(event) => setGlobalCandidates(event.target.checked)} />
              全局候选
            </label>
            <label className="inline-flex h-8 items-center gap-2 border border-slate-200 bg-white px-2 text-xs text-slate-600">
              <input type="checkbox" checked={hideNonReviewFields} onChange={(event) => setHideNonReviewFields(event.target.checked)} />
              只看需处理字段
            </label>
            <label className="inline-flex h-8 items-center gap-2 border border-slate-200 bg-white px-2 text-xs text-slate-600">
              <input type="checkbox" checked={hideTasksWithoutCandidates} onChange={(event) => setHideTasksWithoutCandidates(event.target.checked)} />
              隐藏无候选任务
            </label>
          </div>
        </div>
      </div>

      {(message || error || detailError || candidateError || loadingCandidates) && (
        <div className="space-y-1 border-b border-slate-200 bg-white px-4 py-2 text-sm">
          {message && <div className="text-blue-700">{message}</div>}
          {error && <div className="text-rose-700">操作失败：{error}</div>}
          {detailError && <div className="text-rose-700">文档详情加载失败：{detailError}</div>}
          {candidateError && <div className="text-amber-700">候选加载失败：{candidateError}。主明细已保留，可稍后刷新候选。</div>}
          {loadingCandidates && <div className="text-slate-500">正在刷新候选，不影响当前明细查看。</div>}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          文档警告 {warnings.length} 条。点击字段“详情”可查看对应 evidence / dictionary / warnings。
        </div>
      )}

      <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["明细", stats.items],
          ["字段", stats.fields],
          ["已匹配", stats.matched],
          ["未匹配", stats.unmatched],
          ["候选", stats.candidates],
          ["警告", stats.warnings],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3">
            <div className="text-xl font-semibold text-slate-950">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 p-3">
        {loadingDetail ? (
          <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">正在加载匹配结果</div>
        ) : !items.length ? (
          <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">{currentDocumentId ? "该文档暂无明细。" : "等待选择任务。"}</div>
        ) : (
          items.map((item) => (
            <ItemBlock
              key={String(item.item_index)}
              item={item}
              candidates={allCandidates}
              currentDocumentId={currentDocumentId}
              extractionResultId={detail?.extraction?.id as string | number | undefined}
              activeFieldKey={activeFieldKey}
              expandedFieldKey={expandedFieldKey}
              drafts={drafts}
              selectedDraftKeys={selectedDraftKeys}
              options={options}
              hideNonReviewFields={hideNonReviewFields}
              expandedAllFieldItems={expandedAllFieldItems}
              onOpenReview={setActiveFieldKey}
              onToggleJson={setExpandedFieldKey}
              onSaveDraft={saveDraft}
              onSubmit={submitOperations}
              onCloseReview={() => setActiveFieldKey("")}
              onToggleAllFields={(itemKey) => setExpandedAllFieldItems((current) => (current.includes(itemKey) ? current.filter((key) => key !== itemKey) : [...current, itemKey]))}
              onToggleDraft={(key) => setSelectedDraftKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))}
            />
          ))
        )}
      </div>
    </section>
  );
}
