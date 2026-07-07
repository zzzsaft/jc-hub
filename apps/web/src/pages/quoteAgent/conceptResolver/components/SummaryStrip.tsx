import { crText } from "../locales";
import type { ConceptPatternReview, ConceptResolverRun } from "../types";

interface Props {
  patterns: ConceptPatternReview[];
  run: ConceptResolverRun | null;
}

const countBy = (patterns: ConceptPatternReview[], key: string, value: string) =>
  patterns.filter((pattern) => String((pattern as any)[key] ?? "") === value).length;

export function SummaryStrip({ patterns, run }: Props) {
  const items = [
    [crText.summary.total, patterns.length],
    [crText.summary.highRisk, countBy(patterns, "riskLevel", "high")],
    [crText.summary.humanReview, countBy(patterns, "route", "human_review")],
    [crText.summary.pendingReject, countBy(patterns, "route", "auto_reject_pending")],
    [crText.summary.defer, countBy(patterns, "route", "defer_until_more_occurrences")],
    [crText.summary.autoPass, countBy(patterns, "route", "auto_pass")],
  ];

  return (
    <section className="cr-summary">
      {items.map(([label, value]) => (
        <div key={String(label)} className="cr-summary-item">
          <div className="cr-summary-value">{value}</div>
          <div className="cr-summary-label">{label}</div>
        </div>
      ))}
      <div className="cr-summary-run">
        <span>{crText.summary.run(run?.id ?? "-")}</span>
        <span>{crText.summary.dict(run?.dictionaryVersionAtStart ?? "-")}</span>
        <span>{run?.resolverVersion ?? "v1"}</span>
        <span>{run?.status ?? "-"}</span>
      </div>
    </section>
  );
}
