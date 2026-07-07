import { crText } from "../locales";
import type { ConceptPatternReview } from "../types";
import { recommendedActionLabel, riskSummary, selectedCandidateCount, textValue } from "../utils";
import { cr } from "../classNames";

interface Props {
  patterns: ConceptPatternReview[];
  ok: boolean;
  reason: string;
  submitting: boolean;
  onReview: () => void;
  onApply: () => void;
  onClear: () => void;
}

export function BulkActionBar({ patterns, ok, reason, submitting, onReview, onApply, onClear }: Props) {
  if (!patterns.length) return null;
  const commonAction = recommendedActionLabel(patterns[0]?.recommendedAction);

  return (
    <div className={cr("cr-bulk-bar")}>
      <div className={cr("cr-bulk-meta")}>
        <strong>{crText.bulk.selected(patterns.length)}</strong>
        <span>{crText.bulk.affected(selectedCandidateCount(patterns))}</span>
        <span title={textValue(patterns[0]?.recommendedAction)}>{crText.bulk.commonAction}：{commonAction}</span>
        <span>{crText.bulk.risk}：{riskSummary(patterns)}</span>
        {!ok && <span className={cr("cr-bulk-warning")}>{reason}</span>}
      </div>
      <div className={cr("cr-bulk-actions")}>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={submitting || !ok} onClick={onReview}>
          {crText.bulk.markReviewed}
        </button>
        <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={submitting || !ok} onClick={onApply}>
          {crText.bulk.queueCandidates}
        </button>
        <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" disabled={submitting} onClick={onClear}>
          {crText.bulk.clear}
        </button>
      </div>
    </div>
  );
}
