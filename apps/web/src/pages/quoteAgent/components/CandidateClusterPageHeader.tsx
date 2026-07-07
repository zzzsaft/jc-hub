import { Link } from "react-router-dom";

type CandidateClusterPageHeaderProps = {
  promptText: string;
  onOpenDictionary: () => void;
};

export function CandidateClusterPageHeader({ promptText, onOpenDictionary }: CandidateClusterPageHeaderProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-950">候选簇审核</h1>
          <p className="mt-1 text-sm text-slate-500">按 candidateCluster 批量治理重复候选，默认展示 pending 并按涉及文档数、出现次数排序。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="qa-btn qa-btn-secondary" type="button" onClick={onOpenDictionary}>
            字典管理
          </button>
          <Link className="qa-btn qa-btn-secondary" to="/agent/review">返回文档审核</Link>
        </div>
      </div>
      {promptText && (
        <details className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">查看 AI 审核提示词说明</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs">{promptText}</pre>
        </details>
      )}
    </div>
  );
}

