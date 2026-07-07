import type { UnitCandidate, UnitCandidateReviewSuggestion } from "../types";
import { payloadFromUnitSuggestion, unitCandidateId } from "../unitCandidateReview.utils";

type Props = {
  candidate: UnitCandidate;
  suggestion?: UnitCandidateReviewSuggestion;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

const toneClass = (risk?: string) => {
  if (String(risk).toLowerCase() === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (String(risk).toLowerCase() === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const actionLabel = (action?: string) => {
  if (action === "approve") return "通过为单位 alias";
  if (action === "reject") return "拒绝";
  if (action === "needs_human_review") return "需人工确认";
  return action || "-";
};

const riskLabel = (risk?: string) => {
  const value = String(risk ?? "").toLowerCase();
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return String(risk ?? "-");
};

export function UnitCandidateSuggestionCard({ candidate, suggestion, checked, disabled, onToggle }: Props) {
  if (!suggestion) {
    return <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">尚未生成 AI 建议</div>;
  }

  const action = suggestion.recommendedAction;
  const actionable = action === "approve" || action === "reject";
  const payload = payloadFromUnitSuggestion(candidate, suggestion);
  const needsHumanReview = Boolean(suggestion.needsHumanReview ?? suggestion.needs_human_review);

  return (
    <div className={`min-w-0 border bg-white p-3 ${actionable ? "border-slate-200" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={checked} disabled={disabled || !actionable} onChange={onToggle} />
          {actionLabel(action)}
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">候选 {unitCandidateId(candidate)}</span>
          <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">置信度 {Number(suggestion.confidence ?? 0).toFixed(2)}</span>
          <span className={`border px-2 py-1 ${toneClass(suggestion.riskLevel)}`}>风险 {riskLabel(suggestion.riskLevel)}</span>
          {needsHumanReview && <span className="border border-amber-200 bg-white px-2 py-1 text-amber-700">需要人工确认</span>}
        </div>
      </div>

      {action === "approve" && (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 md:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-slate-400">标准单位</dt>
            <dd className="mt-1 break-words font-medium text-slate-900">{payload.canonicalUnit || "-"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-400">别名值</dt>
            <dd className="mt-1 break-words font-medium text-slate-900">{payload.aliasValue || "-"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-400">展示单位</dt>
            <dd className="mt-1 break-words font-medium text-slate-900">{payload.displayUnit || "-"}</dd>
          </div>
        </dl>
      )}

      {suggestion.reason && <div className="mt-2 break-words text-xs text-slate-600">{suggestion.reason}</div>}
    </div>
  );
}
