import type { AnalysisPlan, AnalysisPlanFilter, AnalysisPlanTimeRange } from "../planner/index.js";
import { DIAGNOSTIC_PLAN_NORMALIZED_WARNING } from "./diagnosticBusinessGate.js";

const firstHalf = /今年上半年/u;
const recentMonths = /最近\s*(\d{1,2})\s*个?月/u;
const calendarMonth = /(?:^|\D)(1[0-2]|0?[1-9])\s*月份?/u;
const marginBelow = /毛利率?\s*(?:低于|小于|<)\s*(\d+(?:\.\d+)?)\s*%/u;
const topN = /(?:最高|最多|前)\s*(\d{1,9})(?!\d)\s*(?:类|个|名|条)?/u;

export type DiagnosticPlanCorrection = {
  field: string;
  before: unknown;
  after: unknown;
  sourceText: string;
};

export type DiagnosticPlanNormalizationResult = {
  plan: AnalysisPlan;
  corrections: DiagnosticPlanCorrection[];
  warnings: string[];
};

export class DiagnosticPlanNormalizer {
  normalize(question: string, plan: AnalysisPlan): DiagnosticPlanNormalizationResult {
    const corrections: DiagnosticPlanCorrection[] = [];
    let normalized = { ...plan, filters: [...plan.filters] };

    const firstHalfMatch = firstHalf.exec(question);
    const recentMonthsMatch = recentMonths.exec(question);
    const calendarMonthMatch = !recentMonthsMatch ? calendarMonth.exec(question) : null;
    const timeRange: AnalysisPlanTimeRange | undefined = firstHalfMatch
      ? { kind: "current_year_first_half" }
      : recentMonthsMatch
        ? { kind: "relative", days: Number(recentMonthsMatch[1]) * 30 }
        : calendarMonthMatch
          ? { kind: "month", month: Number(calendarMonthMatch[1]) }
          : undefined;
    const timeSource = firstHalfMatch?.[0]
      ?? recentMonthsMatch?.[0]
      ?? (calendarMonthMatch ? calendarMonthSource(calendarMonthMatch[0]) : undefined);
    if (timeRange && timeSource && !sameValue(normalized.timeRange, timeRange)) {
      corrections.push({ field: "timeRange", before: normalized.timeRange, after: timeRange, sourceText: timeSource });
      normalized = { ...normalized, timeRange };
    }

    const marginMatch = marginBelow.exec(question);
    if (marginMatch) {
      const desired: AnalysisPlanFilter = { metric: "gross_margin_rate", op: "lt", value: Number(marginMatch[1]) / 100 };
      const existing = normalized.filters.filter((filter) => filter.metric === desired.metric);
      if (!sameValue(existing, [desired])) {
        corrections.push({ field: "filters.gross_margin_rate", before: existing, after: desired, sourceText: marginMatch[0] });
        normalized = { ...normalized, filters: replaceMetricFilters(normalized.filters, desired) };
      }
    }

    const topMatch = topN.exec(question);
    if (topMatch) {
      const limit = Math.min(Math.max(Number(topMatch[1]), 1), 500);
      if (normalized.limit !== limit) {
        corrections.push({ field: "limit", before: normalized.limit, after: limit, sourceText: topMatch[0] });
        normalized = { ...normalized, limit };
      }
    }

    return {
      plan: normalized,
      corrections,
      warnings: corrections.length > 0 ? [DIAGNOSTIC_PLAN_NORMALIZED_WARNING] : [],
    };
  }
}

function replaceMetricFilters(filters: AnalysisPlanFilter[], desired: AnalysisPlanFilter): AnalysisPlanFilter[] {
  const first = filters.findIndex((filter) => filter.metric === desired.metric);
  const remaining = filters.filter((filter) => filter.metric !== desired.metric);
  remaining.splice(first < 0 ? remaining.length : first, 0, desired);
  return remaining;
}

function calendarMonthSource(value: string): string {
  return value.replace(/^\D(?=\d)/u, "").trim();
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
