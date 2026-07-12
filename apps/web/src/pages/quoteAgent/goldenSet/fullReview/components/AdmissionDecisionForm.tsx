import type { FullReviewAnnotation } from "../types";

const reasons = [["insufficient_evidence", "证据不足"], ["legitimate_ambiguity", "存在合理歧义"], ["unresolved_configuration", "配置未解决"], ["erp_unresolved", "ERP 身份未解决"], ["outside_rule_cohort", "不在验证规则范围"]];

export function AdmissionDecisionForm({ value, onChange }: { value: FullReviewAnnotation["admission"]; onChange(value: FullReviewAnnotation["admission"]): void }) {
  const requiresReason = value.decision !== "auto_archive";
  return <fieldset><legend>准入决定</legend>
    <label>处理结果<select value={value.decision} onChange={(event) => onChange({ ...value, decision: event.target.value as typeof value.decision, reason_codes: event.target.value === "auto_archive" ? [] : value.reason_codes })}><option value="auto_archive">允许自动归档</option><option value="quarantine">隔离复核</option><option value="reject">拒绝入库</option></select></label>
    {requiresReason && <div className="full-review-checks" role="group" aria-label="准入原因">{reasons.map(([code, label]) => <label key={code}><input type="checkbox" checked={value.reason_codes.includes(code)} onChange={(event) => onChange({ ...value, reason_codes: event.target.checked ? [...value.reason_codes, code] : value.reason_codes.filter((item) => item !== code) })} />{label}</label>)}</div>}
    {requiresReason && value.reason_codes.length === 0 && <p className="full-review-required">隔离或拒绝必须选择原因</p>}
    <label>备注<textarea value={value.notes ?? ""} onChange={(event) => onChange({ ...value, notes: event.target.value || null })} /></label>
  </fieldset>;
}
