import { useMemo, useState } from "react";
import { ConfirmActionDialog } from "./components/ConfirmActionDialog";
import { FilterBar } from "./components/FilterBar";
import { ProposalList } from "./components/ProposalList";
import { useConceptResolverReviewState } from "./hooks/useConceptResolverReviewState";
import { crText } from "./locales";
import type { ConceptActionIntent } from "./types";
import "../styles.css";
import "./styles.css";
import "./table.css";
import "./detail.css";
import "./feedback.css";

export default function ConceptResolverReviewPage() {
  const state = useConceptResolverReviewState();
  const [intent, setIntent] = useState<ConceptActionIntent | null>(null);

  const pageRange = useMemo(() => {
    const start = state.filteredResolutions.length ? (state.currentPage - 1) * state.filters.pageSize + 1 : 0;
    const end = Math.min(state.currentPage * state.filters.pageSize, state.filteredResolutions.length);
    return `${start}-${end} / ${state.filteredResolutions.length}`;
  }, [state.currentPage, state.filteredResolutions.length, state.filters.pageSize]);

  const toast = state.loading
    ? { type: "loading", text: "正在加载 resolution proposals" }
    : state.running
      ? { type: "loading", text: crText.page.startingRun }
      : state.submitting
        ? { type: "loading", text: crText.page.submitting }
        : state.error
          ? { type: "error", text: state.error }
          : state.message
            ? { type: "success", text: state.message }
            : null;

  return (
    <div className="cr-page">
      {toast && <div className={`cr-toast cr-toast-${toast.type}`}>{toast.text}</div>}
      <header className="cr-header">
        <div>
          <h1>Resolution Proposal Review</h1>
          <p>审核 concept resolver / resolution proposals，结合 target health、policy score 和影响样例做确认。</p>
        </div>
      </header>

      <FilterBar
        filters={state.filters}
        loading={state.loading}
        running={state.running}
        submitting={state.submitting}
        onChange={state.setFilters}
        onRefresh={state.loadData}
        onRunDryResolver={state.runDryResolver}
        onClear={state.clearFilters}
      />

      {state.error && (
        <div className="cr-error">
          <span>{state.error}</span>
          <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={state.loadData}>{crText.page.retry}</button>
        </div>
      )}

      <main className="cr-proposal-workbench">
        <section className="cr-list-panel">
          <div className="cr-list-toolbar">
            <div className="cr-muted">显示 {pageRange}</div>
            <div className="cr-pagination">
              <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={state.submitting || state.currentPage <= 1} onClick={() => state.setFilters({ page: state.currentPage - 1 }, false)}>{crText.page.prev}</button>
              <span>{state.currentPage} / {state.pageCount}</span>
              <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={state.submitting || state.currentPage >= state.pageCount} onClick={() => state.setFilters({ page: state.currentPage + 1 }, false)}>{crText.page.next}</button>
            </div>
          </div>
          <ProposalList
            resolutions={state.pagedResolutions}
            selectedIds={state.selectedResolutionIds}
            healthReports={state.healthReports}
            loading={state.loading}
            healthLoading={state.healthLoading}
            submitting={state.submitting}
            onToggleSelected={state.toggleSelected}
            onTogglePageSelected={state.togglePageSelected}
            onOpenAction={setIntent}
          />
        </section>
      </main>

      <ConfirmActionDialog
        open={Boolean(intent)}
        intent={intent}
        submitting={state.submitting}
        onCancel={() => setIntent(null)}
        onConfirm={async () => {
          if (!intent) return;
          await state.submitIntent(intent);
          setIntent(null);
        }}
      />
    </div>
  );
}
