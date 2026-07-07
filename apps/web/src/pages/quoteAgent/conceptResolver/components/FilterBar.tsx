import { ACTION_OPTIONS, RELATION_TYPE_OPTIONS, ROUTE_OPTIONS, STATUS_OPTIONS, candidateTypeLabels, riskLabels } from "../constants";
import { crText } from "../locales";
import type { ConceptResolverFilters } from "../types";

interface Props {
  filters: ConceptResolverFilters;
  loading: boolean;
  running: boolean;
  submitting: boolean;
  onChange: (patch: Partial<ConceptResolverFilters>, resetPage?: boolean) => void;
  onRefresh: () => void;
  onRunDryResolver: () => void;
  onClear: () => void;
}

const boundedLimit = (value: string) => Math.min(5000, Math.max(1, Number(value) || 1));

export function FilterBar({ filters, loading, running, submitting, onChange, onRefresh, onRunDryResolver, onClear }: Props) {
  const runOptions = Array.from(new Set([filters.runId, "8"].filter(Boolean)));

  return (
    <div className="cr-filter-bar">
      <label className="cr-filter-field cr-filter-run">
        <span>{crText.filters.runId}</span>
        <select className="cr-input" value={filters.runId} onChange={(event) => onChange({ runId: event.target.value }, false)}>
          {runOptions.map((runId) => <option key={runId} value={runId}>{crText.filters.runOption(runId)}</option>)}
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.status}</span>
        <select className="cr-input" value={filters.status} onChange={(event) => onChange({ status: event.target.value as any })}>
          {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.route}</span>
        <select className="cr-input" value={filters.route} onChange={(event) => onChange({ route: event.target.value })}>
          {ROUTE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.relation}</span>
        <select className="cr-input" value={filters.relationType} onChange={(event) => onChange({ relationType: event.target.value })}>
          {RELATION_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.action}</span>
        <select className="cr-input" value={filters.recommendedAction} onChange={(event) => onChange({ recommendedAction: event.target.value })}>
          {ACTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.candidate}</span>
        <select className="cr-input" value={filters.candidateType} onChange={(event) => onChange({ candidateType: event.target.value as any })}>
          <option value="all">{candidateTypeLabels.all}</option>
          <option value="term_type">{candidateTypeLabels.term_type}</option>
          <option value="value">{candidateTypeLabels.value}</option>
        </select>
      </label>
      <label className="cr-filter-field">
        <span>{crText.filters.risk}</span>
        <select className="cr-input" value={filters.riskLevel} onChange={(event) => onChange({ riskLevel: event.target.value as any })}>
          <option value="all">{crText.labels.risks.all}</option>
          <option value="high">{riskLabels.high}</option>
          <option value="medium">{riskLabels.medium}</option>
          <option value="low">{riskLabels.low}</option>
        </select>
      </label>
      <label className="cr-filter-field cr-filter-search">
        <span>{crText.filters.search}</span>
        <input
          className="cr-input"
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={crText.filters.searchPlaceholder}
        />
      </label>
      <label className="cr-filter-field cr-filter-limit">
        <span>{crText.filters.limit}</span>
        <input
          className="cr-input"
          type="number"
          min={1}
          max={5000}
          step={50}
          value={filters.limit}
          onChange={(event) => onChange({ limit: boundedLimit(event.target.value) })}
        />
      </label>
      <div className="cr-filter-actions">
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={loading || submitting} onClick={onRefresh}>
          {loading ? crText.filters.refreshing : crText.filters.refresh}
        </button>
        <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={running || loading || submitting} onClick={onRunDryResolver}>
          {running ? crText.filters.running : crText.filters.runDryResolver}
        </button>
        <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" disabled={submitting} onClick={onClear}>
          {crText.filters.clear}
        </button>
      </div>
    </div>
  );
}
