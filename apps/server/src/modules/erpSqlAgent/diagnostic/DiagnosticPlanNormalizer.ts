import type { AnalysisPlan, AnalysisPlanFilter } from "../planner/index.js";
import { DIAGNOSTIC_PLAN_NORMALIZED_WARNING } from "./diagnosticBusinessGate.js";
import { parseExplicitAnalysisTimeRange } from "./ExplicitAnalysisTimeRange.js";

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

    const explicitTime = parseExplicitAnalysisTimeRange(question);
    const timeRange = explicitTime?.timeRange;
    const timeSource = explicitTime?.sourceText;
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

function replaceMetricFilters(filters: AnalysisPlanFilter[], desired: AnalysisPlanFilter): AnalysisPlanFilter[] {
  const first = filters.findIndex((filter) => filter.metric === desired.metric);
  const remaining = filters.filter((filter) => filter.metric !== desired.metric);
  remaining.splice(first < 0 ? remaining.length : first, 0, desired);
  return remaining;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
