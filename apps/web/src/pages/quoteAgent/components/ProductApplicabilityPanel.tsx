import { useState } from "react";
import type { Candidate, QuoteAgentField, QuoteAgentItem, ReviewOperation } from "../types";
import { applicabilityTermType, applicabilityWarning } from "../utils";

export function ProductApplicabilityPanel({
  field,
  item,
  candidate,
  onClose,
  onSubmit,
}: {
  field: QuoteAgentField;
  item: QuoteAgentItem;
  candidate: Candidate;
  onClose: () => void;
  onSubmit: (operation: ReviewOperation) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const warning = applicabilityWarning(field);
  const termType = applicabilityTermType(field, candidate);
  const productType = String(item.itemProductTypeHint || candidate.sourceProductType || warning?.sourceProductType || "当前产品类型");
  const fieldName = String(field.field_name || candidate.rawFieldName || warning?.field_name || "-");

  const confirm = async () => {
    if (!termType) return;
    setSubmitting(true);
    try {
      await onSubmit({
        candidateType: "term_type",
        candidateId: String(candidate.id),
        action: "approve_term_type_as_alias",
        payload: {
          termType,
          aliasNames: [fieldName],
          appendApplicableProductType: true,
        },
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white shadow-2xl md:absolute md:inset-auto md:right-4 md:top-10 md:w-[min(420px,calc(100vw-2rem))] md:border">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">加入当前产品类型？</div>
            <div className="mt-1 text-xs text-slate-500">字段已命中字典，但目标 Key 暂不适用于当前产品类型。</div>
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div>字段：<b>{fieldName}</b></div>
          <div className="mt-1">字典 Key：<b>{termType || "-"}</b></div>
          <div className="mt-1">当前产品类型：<b>{productType}</b></div>
        </div>
        <div className="text-xs text-slate-600">
          确认后会把这个字段 Key 追加适用于当前产品类型。后端会通过
          <span className="mx-1 font-mono">appendApplicableProductType</span>
          更新字段 Key 的适用范围，然后刷新当前文档匹配结果。
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={onClose}>取消</button>
        <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={!termType || submitting} onClick={confirm}>
          {submitting ? "提交中" : "确认加入"}
        </button>
      </div>
    </div>
  );
}
