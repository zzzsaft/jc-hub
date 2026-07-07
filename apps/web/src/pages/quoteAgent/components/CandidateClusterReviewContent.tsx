import { CandidateClusterFilters } from "./CandidateClusterFilters";
import { CandidateClusterList } from "./CandidateClusterList";
import { CandidateClusterRenormalizePanel } from "./CandidateClusterRenormalizePanel";
import { UnitCandidateReviewPanel } from "./UnitCandidateReviewPanel";
import type { CandidateCluster } from "../types";

type ActiveTab = "clusters" | "units";

type CandidateClusterReviewContentProps = {
  activeTab: ActiveTab;
  state: any;
  numericSummaryValue: (value: unknown, fallback?: number) => number;
  onActiveTabChange: (tab: ActiveTab) => void;
  onOpenManualPrompt: () => void;
  onOpenManualReview: (cluster: CandidateCluster) => void;
};

export function CandidateClusterReviewContent({
  activeTab,
  state,
  numericSummaryValue,
  onActiveTabChange,
  onOpenManualPrompt,
  onOpenManualReview,
}: CandidateClusterReviewContentProps) {
  return (
    <>
      <div className="qa-review-tabs" role="tablist" aria-label="候选审核类型">
        <div className="qa-review-tabs-track">
          {[
            ["clusters", "候选簇审核"],
            ["units", "单位 Alias 审核"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className="qa-review-tab"
              onClick={() => onActiveTabChange(tab as ActiveTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "clusters" ? (
        <>
          <CandidateClusterFilters
            status={state.status}
            documentId={state.documentId}
            limit={state.limit}
            candidateType={state.candidateType}
            loading={state.loading}
            suggesting={state.suggesting}
            submitting={state.submitting}
            selectedCount={state.selectedClusters.length}
            onStatusChange={state.setStatus}
            onDocumentIdChange={state.setDocumentId}
            onLimitChange={state.setLimit}
            onCandidateTypeChange={state.setCandidateType}
            onRefresh={state.loadClusters}
            onSuggest={state.generateSuggestions}
            onOpenManualPrompt={onOpenManualPrompt}
            onSubmitSelected={state.submitSelectedClusters}
          />

          <CandidateClusterRenormalizePanel
            disabled={state.loading || state.suggesting || state.submitting}
            renormalizing={state.renormalizing}
            onRenormalize={state.renormalizeBatch}
          />

          <div className="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-5">
            {[
              ["总候选簇", numericSummaryValue(state.clusterSummary.clusterCount, state.visibleClusters.length)],
              ["当前返回", numericSummaryValue(state.clusterSummary.returnedClusterCount, state.visibleClusters.length)],
              ["已勾选", state.selectedClusters.length],
              ["待提交操作", state.selectedClusters.reduce((sum: number, cluster: CandidateCluster) => sum + (cluster.batchOperationsPreview?.length ?? 0), 0)],
              ["状态", state.status],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white px-4 py-3">
                <div className="text-xl font-semibold text-slate-950">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="p-3">
            <CandidateClusterList
              clusters={state.visibleClusters}
              expandedClusterIds={state.expandedClusterIds}
              selectedClusterIds={state.selectedClusterIds}
              loading={state.loading}
              submitting={state.submitting}
              onToggleExpanded={state.toggleExpanded}
              onToggleSelected={state.toggleSelected}
              onRetry={(cluster) => state.submitClusters([cluster])}
              onOpenManualReview={onOpenManualReview}
            />
          </div>

          {state.selectedClusters.length > 0 && (
            <div className="sticky bottom-0 z-40 flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-900 px-4 py-3 text-white">
              <div className="text-sm">已勾选 {state.selectedClusters.length} 个候选簇，提交前将再次确认影响 candidate 数量。</div>
              <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={state.submitting} onClick={state.submitSelectedClusters}>
                {state.submitting ? "提交中" : "应用已勾选建议"}
              </button>
            </div>
          )}
        </>
      ) : (
        <UnitCandidateReviewPanel />
      )}
    </>
  );
}

