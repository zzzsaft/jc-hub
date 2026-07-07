import { useState } from "react";
import type { RenormalizeBatchParams, RenormalizeBatchScope } from "../types";
import { Modal } from "./Modal";

interface Props {
  disabled?: boolean;
  renormalizing: boolean;
  onRenormalize: (params: RenormalizeBatchParams) => Promise<void> | void;
}

export function CandidateClusterRenormalizePanel({ disabled, renormalizing, onRenormalize }: Props) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<RenormalizeBatchScope>("missing_normalized");
  const [limit, setLimit] = useState("");
  const [batchSize, setBatchSize] = useState("100");

  const submit = async () => {
    await onRenormalize({
      scope,
      limit: numericValue(limit),
      batchSize: numericValue(batchSize),
    });
    setOpen(false);
  };

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="qa-btn qa-btn-secondary"
          type="button"
          disabled={disabled || renormalizing}
          onClick={() => setOpen(true)}
        >
          {renormalizing ? "重跑中" : "重跑归一化"}
        </button>
      </div>

      <Modal
        open={open}
        title="重跑 extraction normalization"
        subtitle="按当前字典重新生成 normalized 结果。"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button className="qa-btn qa-btn-secondary" type="button" onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              className="qa-btn qa-btn-primary"
              type="button"
              disabled={disabled || renormalizing}
              onClick={submit}
            >
              {renormalizing ? "重跑中" : "开始重跑"}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            范围
            <select
              className="h-9 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500"
              value={scope}
              onChange={(event) => setScope(event.target.value as RenormalizeBatchScope)}
            >
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              limit
              <input
                className="h-9 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500"
                min={1}
                placeholder="不填则处理全部"
                type="number"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              batchSize
              <input
                className="h-9 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500"
                max={500}
                min={1}
                type="number"
                value={batchSize}
                onChange={(event) => setBatchSize(event.target.value)}
              />
            </label>
          </div>

          <div className="text-xs text-slate-500">
            batchSize 默认 100，最大 500；limit 适合先做小批量验证。
          </div>
        </div>
      </Modal>
    </>
  );
}

const scopeOptions: Array<{ value: RenormalizeBatchScope; label: string }> = [
  { value: "missing_normalized", label: "只补缺失 normalized" },
  { value: "with_pending_candidates", label: "只处理 pending candidates" },
  { value: "all", label: "全部重跑 normalization" },
];

const numericValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};
