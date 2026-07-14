import type { AnalysisPlan, AnalysisPlanFilter, AnalysisPlanTimeRange } from "../planner/index.js";
import { DIAGNOSTIC_PLAN_NORMALIZED_WARNING } from "./diagnosticBusinessGate.js";

const firstHalf = /今年上半年/u;
const recentMonths = /最近\s*(\d{1,2})\s*个?月/u;
const calendarMonth = /(?:^|\D)(1[0-2]|0?[1-9])\s*月份?/u;
const recentDays = /(?:最近|近)\s*(\d{1,4})\s*天/u;
const previousMonth = /上个?月|上月/u;
const currentMonth = /本月|这个月|当月/u;
const yearOverYear = /同比|今年.*去年|去年.*今年|(?:与|和|较)?去年(?:同期)?(?:比较|对比)|(?:比较|对比).*去年/u;
const currentYear = /今年/u;
const marginBelow = /毛利率?\s*(?:低于|小于|<)\s*(\d+(?:\.\d+)?)\s*%/u;
const topN = /(?:最高|最多|前)\s*(\d{1,9})(?!\d)\s*(?:类|个|名|条)?/u;
const explicitSorting = /最高|最低|最多|最少|排名|top\s*\d+|前\s*\d+/iu;

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

    const explicitTime = explicitTimeRange(question);
    const timeRange = explicitTime?.range;
    const timeSource = explicitTime?.source;
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

    const diagnosticExplicitCoverage = {
      time: Boolean(timeSource),
      filters: marginMatch ? ["gross_margin_rate:lt"] : [],
      sorting: normalized.orderBy.length > 0 && explicitSorting.test(question),
      limit: Boolean(topMatch),
    };
    return {
      plan: { ...normalized, diagnosticExplicitCoverage },
      corrections,
      warnings: corrections.length > 0 ? [DIAGNOSTIC_PLAN_NORMALIZED_WARNING] : [],
    };
  }
}

function explicitTimeRange(question: string): { range: AnalysisPlanTimeRange; source: string } | undefined {
  const firstHalfMatch = firstHalf.exec(question);
  if (firstHalfMatch) return { range: { kind: "current_year_first_half" }, source: firstHalfMatch[0] };
  const recentMonthsMatch = recentMonths.exec(question);
  if (recentMonthsMatch) return { range: { kind: "relative", days: Number(recentMonthsMatch[1]) * 30 }, source: recentMonthsMatch[0] };
  const recentDaysMatch = recentDays.exec(question);
  if (recentDaysMatch) return { range: { kind: "relative", days: Number(recentDaysMatch[1]) }, source: recentDaysMatch[0] };
  const previousMonthMatch = previousMonth.exec(question);
  if (previousMonthMatch) return { range: { kind: "previous_month" }, source: previousMonthMatch[0] };
  const currentMonthMatch = currentMonth.exec(question);
  if (currentMonthMatch) return { range: { kind: "current_month" }, source: currentMonthMatch[0] };
  const calendarMonthMatch = calendarMonth.exec(question);
  if (calendarMonthMatch) return { range: { kind: "month", month: Number(calendarMonthMatch[1]) }, source: calendarMonthSource(calendarMonthMatch[0]) };
  const yearOverYearMatch = yearOverYear.exec(question);
  if (yearOverYearMatch) return { range: { kind: "year_over_year" }, source: yearOverYearMatch[0] };
  const currentYearMatch = currentYear.exec(question);
  return currentYearMatch ? { range: { kind: "current_year" }, source: currentYearMatch[0] } : undefined;
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
