import type { ConceptPatternReview, ConceptResolverFilters } from "../types";
import { cr } from "../classNames";
import { crText } from "../locales";
import {
  actionLabel,
  candidateTypeLabel,
  formatDateTime,
  formatScore,
  patternIdentity,
  recommendedActionLabel,
  relationTypeLabel,
  reviewStatusLabel,
  riskLabel,
  routeLabel,
  textValue,
} from "../utils";

interface Props {
  patterns: ConceptPatternReview[];
  filters: ConceptResolverFilters;
  selectedPatternKey: string;
  selectedPatternKeys: string[];
  loading: boolean;
  submitting: boolean;
  onSelectPattern: (patternKey: string) => void;
  onToggleSelected: (patternKey: string) => void;
  onTogglePageSelected: () => void;
  onSort: (key: ConceptResolverFilters["sortKey"]) => void;
  onOpenAction: (pattern: ConceptPatternReview, kind: "review" | "apply") => void;
}

const sortMark = (filters: ConceptResolverFilters, key: ConceptResolverFilters["sortKey"]) =>
  filters.sortKey === key ? (filters.sortDir === "asc" ? " ↑" : " ↓") : "";

export function PatternTable(props: Props) {
  const allPageSelected = props.patterns.length > 0 && props.patterns.every((pattern) => props.selectedPatternKeys.includes(patternIdentity(pattern)));

  if (props.loading) {
    return (
      <div className={cr("cr-table-shell")}>
        {Array.from({ length: 8 }).map((_, index) => <div key={index} className={cr("cr-skeleton-row")} />)}
      </div>
    );
  }

  if (!props.patterns.length) {
    return (
      <div className={cr("cr-empty")}>
        <div>{crText.table.emptyTitle}</div>
        <div className={cr("cr-empty-sub")}>{crText.table.emptyHint}</div>
      </div>
    );
  }

  return (
    <div className={cr("cr-table-shell")}>
      <table className={cr("cr-table")}>
        <thead>
          <tr>
            <th className={cr("cr-select-cell")}>
              <input type="checkbox" checked={allPageSelected} disabled={props.submitting} onChange={props.onTogglePageSelected} aria-label={crText.table.selectPage} />
            </th>
            <th><button type="button" onClick={() => props.onSort("riskLevel")}>{crText.table.risk}{sortMark(props.filters, "riskLevel")}</button></th>
            <th>{crText.table.candidate}</th>
            <th>{crText.table.relationAction}</th>
            <th>{crText.table.route}</th>
            <th><button type="button" onClick={() => props.onSort("candidateCount")}>{crText.table.count}{sortMark(props.filters, "candidateCount")}</button></th>
            <th><button type="button" onClick={() => props.onSort("avgScore")}>{crText.table.avg}{sortMark(props.filters, "avgScore")}</button></th>
            <th>{crText.table.sample}</th>
            <th>{crText.table.source}</th>
            <th>{crText.table.status}</th>
            <th><button type="button" onClick={() => props.onSort("lastResolvedAt")}>{crText.table.resolvedAt}{sortMark(props.filters, "lastResolvedAt")}</button></th>
            <th>{crText.table.operation}</th>
          </tr>
        </thead>
        <tbody>
          {props.patterns.map((pattern) => {
            const key = patternIdentity(pattern);
            const active = key === props.selectedPatternKey;
            const checked = props.selectedPatternKeys.includes(key);
            return (
              <tr key={key} className={cr(active && "cr-row-active", pattern.riskLevel === "high" && "cr-row-high")} onClick={() => props.onSelectPattern(key)}>
                <td className={cr("cr-select-cell")} onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={checked} disabled={props.submitting} onChange={() => props.onToggleSelected(key)} aria-label={crText.table.selectRow(key)} />
                </td>
                <td><span className={cr("cr-badge", `cr-risk-${textValue(pattern.riskLevel, "unknown")}`)} title={textValue(pattern.riskLevel)}>{riskLabel(pattern.riskLevel)}</span></td>
                <td><span className={cr("cr-badge")} title={textValue(pattern.candidateType)}>{candidateTypeLabel(pattern.candidateType)}</span></td>
                <td>
                  <div className={cr("cr-strong")} title={textValue(pattern.relationType)}>{relationTypeLabel(pattern.relationType)}</div>
                  <div className={cr("cr-muted cr-clamp")} title={textValue(pattern.recommendedAction)}>{recommendedActionLabel(pattern.recommendedAction)}</div>
                </td>
                <td><span className={cr("cr-badge cr-route")} title={textValue(pattern.route)}>{routeLabel(pattern.route)}</span></td>
                <td className={cr("cr-number")}>{textValue(pattern.candidateCount ?? pattern.uniqueCandidateCount)}</td>
                <td className={cr("cr-number")}>{formatScore(pattern.avgScore)}</td>
                <td>
                  <div className={cr("cr-clamp")} title={textValue(pattern.sampleField)}>{textValue(pattern.sampleField)}</div>
                  <div className={cr("cr-muted cr-clamp")} title={textValue(pattern.sampleValue)}>{textValue(pattern.sampleValue)}</div>
                </td>
                <td><div className={cr("cr-clamp")} title={textValue(pattern.sourceProductType)}>{textValue(pattern.sourceProductType)}</div></td>
                <td><span className={cr("cr-badge")} title={textValue(pattern.reviewStatus ?? "pending")}>{reviewStatusLabel(pattern.reviewStatus ?? "pending")}</span></td>
                <td className={cr("cr-date")}>{formatDateTime(pattern.lastResolvedAt)}</td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className={cr("cr-row-actions")}>
                    <button
                      className="qa-btn qa-btn-secondary qa-btn-sm"
                      type="button"
                      disabled={props.submitting}
                      title={actionLabel(pattern)}
                      onClick={() => props.onOpenAction(pattern, "review")}
                    >
                      {crText.table.review}
                    </button>
                    <button
                      className="qa-btn qa-btn-quiet qa-btn-sm"
                      type="button"
                      disabled={props.submitting}
                      title={crText.table.queueTitle}
                      onClick={() => props.onOpenAction(pattern, "apply")}
                    >
                      {crText.table.queue}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
