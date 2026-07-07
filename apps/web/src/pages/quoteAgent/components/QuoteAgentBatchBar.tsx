import type { useQuoteAgentPageState } from "../hooks/useQuoteAgentPageState";

type QuoteAgentPageState = ReturnType<typeof useQuoteAgentPageState>;

type Props = Pick<QuoteAgentPageState, "batchSubmitting" | "selectedDraftKeys" | "setSelectedDraftKeys" | "submitBatch">;

export function QuoteAgentBatchBar({ batchSubmitting, selectedDraftKeys, setSelectedDraftKeys, submitBatch }: Props) {
  if (!selectedDraftKeys.length) return null;

  return (
    <div className="sticky bottom-0 z-40 flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-900 px-4 py-3 text-white">
      <div className="text-sm">待批量提交 {selectedDraftKeys.length} 条</div>
      <div className="flex gap-2">
        <button className="qa-btn qa-btn-quiet qa-btn-sm !text-white hover:!bg-slate-800" type="button" onClick={() => setSelectedDraftKeys([])}>
          清空选择
        </button>
        <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={submitBatch} disabled={batchSubmitting}>
          {batchSubmitting ? "提交中" : "批量提交"}
        </button>
      </div>
    </div>
  );
}
