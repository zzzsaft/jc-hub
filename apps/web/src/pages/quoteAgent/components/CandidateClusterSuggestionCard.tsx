import type { CandidateCluster } from "../types";

interface Props {
  cluster: CandidateCluster;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

const toneClass = (risk?: string) => {
  if (String(risk).toLowerCase() === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (String(risk).toLowerCase() === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

export function CandidateClusterSuggestionCard({ cluster, checked, disabled, onToggle }: Props) {
  const suggestion = cluster.reviewSuggestion;
  if (!suggestion) {
    return <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">尚未生成 AI 建议</div>;
  }

  const operations = cluster.batchOperationsPreview ?? [];
  const riskLevel = String(suggestion.riskLevel ?? "-");
  const needsHumanReview = Boolean(suggestion.needsHumanReview ?? suggestion.needs_human_review);
  const invalidReason = cluster.invalidSuggestionReason;

  return (
    <div className={`border bg-white p-3 ${invalidReason ? "border-rose-200 bg-rose-50" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={checked} disabled={disabled || !operations.length || Boolean(invalidReason)} onChange={onToggle} />
          {String(suggestion.recommendedAction ?? "-")}
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">confidence {Number(suggestion.confidence ?? 0).toFixed(2)}</span>
          <span className={`border px-2 py-1 ${toneClass(riskLevel)}`}>risk {riskLevel}</span>
          {needsHumanReview && <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">needs human review</span>}
          {invalidReason && <span className="border border-rose-200 bg-white px-2 py-1 text-rose-700">无效建议</span>}
          <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">操作 {operations.length}</span>
        </div>
      </div>
      {invalidReason && <div className="mt-2 border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700">{invalidReason}</div>}
      {suggestion.humanReviewSummary && <div className="mt-2 text-sm text-slate-700">{suggestion.humanReviewSummary}</div>}
      {suggestion.reason && <div className="mt-1 text-xs text-slate-500">{suggestion.reason}</div>}
    </div>
  );
}
