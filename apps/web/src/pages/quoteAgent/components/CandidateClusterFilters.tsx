import { candidateStatuses } from "../constants";
import type { CandidateStatus, CandidateType } from "../types";

interface Props {
  status: CandidateStatus;
  documentId: string;
  limit: number;
  candidateType: CandidateType | "";
  loading: boolean;
  suggesting: boolean;
  submitting: boolean;
  selectedCount: number;
  onStatusChange: (value: CandidateStatus) => void;
  onDocumentIdChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onCandidateTypeChange: (value: CandidateType | "") => void;
  onRefresh: () => void;
  onSuggest: () => void;
  onOpenManualPrompt: () => void;
  onSubmitSelected: () => void;
}

export function CandidateClusterFilters(props: Props) {
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[150px_minmax(220px,1fr)_120px_180px]">
          <select
            className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
            value={props.status}
            onChange={(event) => props.onStatusChange(event.target.value as CandidateStatus)}
          >
            {candidateStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <input
            className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
            value={props.documentId}
            placeholder="按 documentId 过滤，可留空"
            onChange={(event) => props.onDocumentIdChange(event.target.value)}
          />
          <input
            className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
            min={1}
            max={500}
            type="number"
            value={props.limit}
            onChange={(event) => props.onLimitChange(Number(event.target.value) || 200)}
          />
          <select
            className="h-9 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
            value={props.candidateType}
            onChange={(event) => props.onCandidateTypeChange(event.target.value as CandidateType | "")}
          >
            <option value="">全部候选类型</option>
            <option value="term_type">字段 Key</option>
            <option value="value">字段值</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="qa-btn qa-btn-secondary" type="button" disabled={props.loading} onClick={props.onRefresh}>
            刷新候选簇
          </button>
          <button
            className="qa-btn qa-btn-secondary"
            type="button"
            disabled={props.suggesting || props.loading}
            onClick={props.onSuggest}
          >
            {props.suggesting ? "生成中" : "生成 AI 建议"}
          </button>
          <button
            className="qa-btn qa-btn-secondary"
            type="button"
            disabled={props.loading}
            onClick={props.onOpenManualPrompt}
          >
            DeepSeek Prompt
          </button>
          <button
            className="qa-btn qa-btn-primary"
            type="button"
            disabled={!props.selectedCount || props.submitting}
            onClick={props.onSubmitSelected}
          >
            {props.submitting ? "提交中" : `应用已勾选建议 ${props.selectedCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
