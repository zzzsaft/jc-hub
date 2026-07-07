import { useMemo, useState } from "react";
import { candidateStatuses } from "../constants";
import { useUnitCandidateReviewState } from "../hooks/useUnitCandidateReviewState";
import type { CandidateStatus, UnitCandidate } from "../types";
import { json } from "../utils";
import { parsedUnitValue, unitCandidateId, unitText } from "../unitCandidateReview.utils";
import { UnitCandidateDeepSeekPromptModal } from "./UnitCandidateDeepSeekPromptModal";
import { UnitCandidateManualReviewPanel } from "./UnitCandidateManualReviewPanel";
import { UnitCandidateSuggestionCard } from "./UnitCandidateSuggestionCard";

const display = (value: unknown) => unitText(value) || "-";

const Field = ({ label, value }: { label: string; value: unknown }) => (
  <div className="min-w-0">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 break-words text-sm font-medium text-slate-900">{display(value)}</div>
  </div>
);

function UnitCandidateCard({
  candidate,
  expanded,
  selected,
  submitting,
  suggestion,
  onToggleExpanded,
  onToggleSelected,
  onOpenManualReview,
}: {
  candidate: UnitCandidate;
  expanded: boolean;
  selected: boolean;
  submitting: boolean;
  suggestion: ReturnType<typeof useUnitCandidateReviewState>["suggestionsById"][string];
  onToggleExpanded: () => void;
  onToggleSelected: () => void;
  onOpenManualReview: () => void;
}) {
  const parsedValue = parsedUnitValue(candidate);

  return (
    <article className="border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">unit</span>
            <h3 className="min-w-0 break-words text-base font-semibold text-slate-950">
              {display(candidate.rawUnit)} → {display(candidate.proposedCanonicalUnit || candidate.normalizedRawUnit)}
            </h3>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-px bg-slate-200 text-sm md:grid-cols-5">
            {[
              ["candidateId", unitCandidateId(candidate)],
              ["documentId", display(candidate.documentId)],
              ["termType", display(candidate.termType)],
              ["status", display(candidate.status)],
              ["normalizedRawUnit", display(candidate.normalizedRawUnit)],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-slate-50 px-3 py-2">
                <div className="break-words font-semibold text-slate-900">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <dl className="mt-3 grid gap-2 text-sm text-slate-700 lg:grid-cols-3">
            <Field label="rawValue" value={candidate.rawValue} />
            <Field label="rawUnit" value={candidate.rawUnit} />
            <Field label="proposedCanonicalUnit" value={candidate.proposedCanonicalUnit} />
          </dl>

          {candidate.reason && <div className="mt-3 text-sm text-slate-600">{candidate.reason}</div>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onToggleExpanded}>
              {expanded ? "收起解析结果" : "展开解析结果"}
            </button>
            <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={onOpenManualReview}>
              手动审核
            </button>
          </div>
        </div>

        <UnitCandidateSuggestionCard
          candidate={candidate}
          suggestion={suggestion}
          checked={selected}
          disabled={submitting}
          onToggle={onToggleSelected}
        />
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">解析结果 / evidence</div>
          <pre className="max-h-80 overflow-auto border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
            {typeof parsedValue === "string" ? parsedValue : json(parsedValue)}
          </pre>
        </div>
      )}
    </article>
  );
}

const promptText = (value: unknown) => {
  if (typeof value === "string") return value;
  const prompt = value as any;
  return String(prompt?.prompt ?? prompt?.promptTemplate ?? prompt?.content ?? prompt?.systemPrompt ?? "");
};

export function UnitCandidateReviewPanel() {
  const state = useUnitCandidateReviewState();
  const [promptOpen, setPromptOpen] = useState(false);
  const [manualCandidate, setManualCandidate] = useState<UnitCandidate | null>(null);
  const prompt = promptText(state.reviewPrompt);
  const actionableSelectedCount = useMemo(
    () =>
      state.selectedCandidates.filter((candidate) => {
        const action = state.suggestionsById[unitCandidateId(candidate)]?.recommendedAction;
        return action === "approve" || action === "reject";
      }).length,
    [state.selectedCandidates, state.suggestionsById],
  );

  return (
    <section className="border-b border-slate-200 bg-white">
        {prompt && (
          <details className="border-b border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">查看单位 AI 审核提示词说明</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{prompt}</pre>
          </details>
        )}

        <div className="space-y-3 p-3">
          <div className="border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[150px_minmax(220px,1fr)_auto_auto_auto]">
              <select
                className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
                value={state.status}
                onChange={(event) => state.setStatus(event.target.value as CandidateStatus)}
              >
                {candidateStatuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <input
                className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
                value={state.keyword}
                placeholder="搜索 rawUnit、normalizedRawUnit、canonicalUnit、termType、documentId"
                onChange={(event) => state.setKeyword(event.target.value)}
              />
              <button className="qa-btn qa-btn-secondary" type="button" disabled={state.loading} onClick={state.load}>
                {state.loading ? "刷新中" : "刷新单位候选"}
              </button>
              <button className="qa-btn qa-btn-secondary" type="button" disabled={state.loading || !state.visibleCandidates.length} onClick={() => setPromptOpen(true)}>
                DeepSeek Prompt
              </button>
              <button className="qa-btn qa-btn-primary" type="button" disabled={!actionableSelectedCount || state.submitting} onClick={state.submitSelected}>
                {state.submitting ? "提交中" : `应用已勾选建议 ${actionableSelectedCount}`}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="border border-slate-200 bg-white px-2 py-1">单位候选 {state.candidates.length}</span>
              <span className="border border-slate-200 bg-white px-2 py-1">当前返回 {state.visibleCandidates.length}</span>
              <span className="border border-slate-200 bg-white px-2 py-1">已勾选 {state.selectedCandidateIds.length}</span>
              <span className="border border-slate-200 bg-white px-2 py-1">现有 alias {state.aliases.length}</span>
            </div>
          </div>

          {(state.message || state.error) && (
            <div className="space-y-1 border border-slate-200 bg-white px-3 py-2 text-sm">
              {state.message && <div className="text-emerald-700">{state.message}</div>}
              {state.error && <div className="text-rose-700">操作失败：{state.error}</div>}
            </div>
          )}

          <div className="space-y-3">
            {state.loading ? (
              <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">正在加载单位候选</div>
            ) : state.visibleCandidates.length ? (
              state.visibleCandidates.map((candidate) => {
                const candidateId = unitCandidateId(candidate);
                return (
                  <UnitCandidateCard
                    key={candidateId}
                    candidate={candidate}
                    expanded={state.expandedCandidateIds.includes(candidateId)}
                    selected={state.selectedCandidateIds.includes(candidateId)}
                    submitting={state.submitting}
                    suggestion={state.suggestionsById[candidateId]}
                    onToggleExpanded={() => state.toggleExpanded(candidateId)}
                    onToggleSelected={() => state.toggleSelected(candidateId)}
                    onOpenManualReview={() => setManualCandidate(candidate)}
                  />
                );
              })
            ) : (
              <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                {state.keyword ? "没有匹配的单位候选。" : "暂无单位候选。"}
              </div>
            )}
          </div>
        </div>

      <UnitCandidateDeepSeekPromptModal
        open={promptOpen}
        aliases={state.aliases}
        candidates={state.visibleCandidates}
        reviewPrompt={state.reviewPrompt}
        onClose={() => setPromptOpen(false)}
        onApply={state.applyManualSuggestions}
      />
      <UnitCandidateManualReviewPanel
        candidate={manualCandidate}
        suggestion={manualCandidate ? state.suggestionsById[unitCandidateId(manualCandidate)] : undefined}
        onClose={() => setManualCandidate(null)}
        onSave={(candidate, suggestion) => {
          state.saveManualSuggestion(candidate, suggestion);
          setManualCandidate(null);
        }}
        onSubmit={async (candidate, suggestion) => {
          await state.submitCandidateSuggestion(candidate, suggestion);
          setManualCandidate(null);
        }}
      />
    </section>
  );
}
