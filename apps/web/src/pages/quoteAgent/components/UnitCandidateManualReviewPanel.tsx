import { useEffect, useMemo, useState } from "react";
import type { UnitCandidate, UnitCandidateReviewAction, UnitCandidateReviewSuggestion } from "../types";
import { defaultUnitAliasPayload, payloadFromUnitSuggestion, unitCandidateId, unitText } from "../unitCandidateReview.utils";

type Props = {
  candidate: UnitCandidate | null;
  suggestion?: UnitCandidateReviewSuggestion;
  onClose: () => void;
  onSave: (candidate: UnitCandidate, suggestion: UnitCandidateReviewSuggestion) => void;
  onSubmit: (candidate: UnitCandidate, suggestion: UnitCandidateReviewSuggestion) => Promise<void>;
};

const actions: Array<{ value: UnitCandidateReviewAction; label: string; description: string }> = [
  {
    value: "approve",
    label: "通过为单位 alias",
    description: "确认原始单位只是标准单位的另一种写法，提交后会创建或确认这一条单位 alias。",
  },
  {
    value: "reject",
    label: "拒绝",
    description: "确认这不是同一单位的别名，例如单位含义不同、疑似需要换算，或原文无法判断。",
  },
  {
    value: "needs_human_review",
    label: "暂不提交，需人工确认",
    description: "只把这条建议保存在页面上用于讨论，不会调用后端审核接口。",
  },
];

const fieldClass = "box-border h-9 w-full max-w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500";
const textClass = "box-border min-h-20 w-full max-w-full resize-y border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500";

export function UnitCandidateManualReviewPanel({ candidate, suggestion, onClose, onSave, onSubmit }: Props) {
  const fallbackPayload = useMemo(
    () => candidate ? defaultUnitAliasPayload(candidate) : null,
    [candidate],
  );
  const [action, setAction] = useState<UnitCandidateReviewAction>("approve");
  const [canonicalUnit, setCanonicalUnit] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [displayUnit, setDisplayUnit] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!candidate || !fallbackPayload) return;
    const payload = payloadFromUnitSuggestion(candidate, suggestion);
    setAction(suggestion?.recommendedAction ?? "approve");
    setCanonicalUnit(payload.canonicalUnit || fallbackPayload.canonicalUnit);
    setAliasValue(payload.aliasValue || fallbackPayload.aliasValue);
    setDisplayUnit(payload.displayUnit || fallbackPayload.displayUnit);
    setReason(suggestion?.reason || candidate.reason || "");
  }, [candidate, fallbackPayload, suggestion]);

  if (!candidate || !fallbackPayload) return null;

  const selectedAction = actions.find((item) => item.value === action);

  const buildSuggestion = (): UnitCandidateReviewSuggestion => ({
    candidateId: unitCandidateId(candidate),
    recommendedAction: action,
    canonicalUnit,
    aliasValue,
    displayUnit,
    confidence: 1,
    riskLevel: action === "needs_human_review" ? "medium" : "low",
    needsHumanReview: action === "needs_human_review",
    reason,
  });

  const save = () => onSave(candidate, buildSuggestion());

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(candidate, buildSuggestion());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1050] bg-slate-950/30 p-3">
      <div className="ml-auto flex h-full w-full max-w-xl min-w-0 flex-col border border-slate-300 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">单位 alias 手动审核</div>
            <div className="mt-1 break-words text-xs text-slate-500">
              候选 ID {unitCandidateId(candidate)}：{unitText(candidate.rawUnit) || "-"}
            </div>
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm shrink-0" type="button" onClick={onClose}>关闭</button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-auto p-4">
          <div className="grid min-w-0 gap-3 text-sm md:grid-cols-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-400">原始值</div>
              <div className="mt-1 break-words font-medium text-slate-900">{unitText(candidate.rawValue) || "-"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-400">系统建议标准单位</div>
              <div className="mt-1 break-words font-medium text-slate-900">{unitText(candidate.proposedCanonicalUnit) || "-"}</div>
            </div>
          </div>

          <label className="block min-w-0">
            <span className="text-xs font-medium text-slate-500">审核动作</span>
            <select className={`${fieldClass} mt-1`} value={action} onChange={(event) => setAction(event.target.value as UnitCandidateReviewAction)}>
              {actions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          {selectedAction && (
            <div className="border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              {selectedAction.description}
            </div>
          )}

          <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            当前后端审核动作只有“通过 alias”和“拒绝”。如果需要新增一个新的标准单位，可以在“标准单位”里填写新单位，并把原文写法放到“别名值”；提交后会按单位 alias 记录保存。
          </div>

          {action === "approve" && (
            <div className="grid min-w-0 gap-3">
              <label className="block min-w-0">
                <span className="text-xs font-medium text-slate-500">标准单位</span>
                <input className={`${fieldClass} mt-1`} value={canonicalUnit} onChange={(event) => setCanonicalUnit(event.target.value)} />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-medium text-slate-500">别名值</span>
                <input className={`${fieldClass} mt-1`} value={aliasValue} onChange={(event) => setAliasValue(event.target.value)} />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-medium text-slate-500">展示单位</span>
                <input className={`${fieldClass} mt-1`} value={displayUnit} onChange={(event) => setDisplayUnit(event.target.value)} />
              </label>
            </div>
          )}

          <label className="block min-w-0">
            <span className="text-xs font-medium text-slate-500">原因 / 备注</span>
            <textarea className={`${textClass} mt-1`} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button className="qa-btn qa-btn-secondary" type="button" onClick={save}>保存建议</button>
          <button className="qa-btn qa-btn-primary" type="button" disabled={submitting || action === "needs_human_review"} onClick={submit}>
            {submitting ? "提交中" : "提交本条"}
          </button>
        </div>
      </div>
    </div>
  );
}
