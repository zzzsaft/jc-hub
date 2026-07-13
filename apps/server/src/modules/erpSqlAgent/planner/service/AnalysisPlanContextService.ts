import type {
  AnalysisPlan,
  AnalysisPlanComparison,
  AnalysisPlanDimensionRule,
  AnalysisPlannerResult,
  AnalysisPlanTimeRange,
} from "../types/SqlPlannerTypes.js";

export function parseUserDimensionRule(question: string): AnalysisPlanDimensionRule | undefined {
  const match = question.match(/(?:今年的|本月的|上月的|上个月的)?\s*([^，。,+＋]{1,30}?)总(?:销售额|类别|类)?\s*(?:应该是|是|=|等于)\s*([^，。,+＋]{1,30}?)\s*[+＋]\s*([^，。,]{1,30})/u);
  if (!match) return undefined;
  const target = cleanCategoryName(match[1]);
  const members = [cleanCategoryName(match[2]), cleanCategoryName(match[3])].filter(Boolean);
  if (!target || members.length !== 2 || new Set(members).size !== 2) return undefined;
  return {
    dimension: "product_category",
    target: `${target}总类`,
    members,
    source: "user_statement",
    trust: "user_asserted",
    validation: "master_data_required",
  };
}

export function extendAnalysisPlanFromContext(input: {
  question: string;
  previous: AnalysisPlan;
  detectedMetrics: string[];
  timeRange?: AnalysisPlanTimeRange;
  comparison?: AnalysisPlanComparison;
  dimensionRule?: AnalysisPlanDimensionRule;
  sourceTraceId?: string;
}): AnalysisPlannerResult | undefined {
  const hasStructuredExtension = Boolean(
    input.dimensionRule
    || input.timeRange
    || input.comparison
    || input.detectedMetrics.length > 0
  );
  if (!hasStructuredExtension) return undefined;
  const metrics = input.detectedMetrics.length > 0 ? [...new Set(input.detectedMetrics)] : input.previous.metrics;
  const timeRange = input.timeRange ?? input.previous.timeRange;
  const comparison = input.comparison ?? input.previous.comparison;
  const dimensions = input.dimensionRule
    ? [...new Set([...input.previous.dimensions.filter((dimension) => dimension !== "product"), input.dimensionRule.dimension])]
    : input.previous.dimensions;
  return {
    analysisPlan: {
      ...input.previous,
      route: "complex_composed",
      grain: dimensions,
      metrics,
      requiredMetrics: metrics,
      dimensions,
      ...(timeRange ? { timeRange } : {}),
      ...(comparison ? { comparison } : {}),
      ...(inferredTimeGrain(timeRange, comparison) ? { timeGrain: inferredTimeGrain(timeRange, comparison) } : {}),
      businessScope: metrics.map((metric) => ({ metric, source: "approved_metric" as const })),
      assumptions: dedupeStrings([
        ...(input.previous.assumptions ?? []).filter((assumption) => !/同比口径按今年与去年自然年分桶对比/u.test(assumption)),
        ...(comparison?.kind === "year_over_year" && timeRange?.kind === "month"
          ? ["同比口径按明确月份与去年同月对比。"]
          : comparison?.kind === "year_over_year" && (timeRange?.kind === "current_year" || timeRange?.kind === "year_over_year")
            ? ["年度同比按今年截至当前日与去年同期对比。"]
            : []),
        "本轮沿用上一轮的指标、维度、比较和业务口径。",
        ...(input.dimensionRule ? [
          `用户声明分类合并规则：${input.dimensionRule.target} = ${input.dimensionRule.members.join(" + ")}。`,
          "计算前必须在 ERP 产品类别主数据中验证全部成员类别存在；该规则的业务真实性来源为用户本轮陈述。",
        ] : []),
      ]),
      ...(input.dimensionRule ? {
        dimensionRules: dedupeDimensionRules([...(input.previous.dimensionRules ?? []), input.dimensionRule]),
        dimensionFilters: { ...(input.previous.dimensionFilters ?? {}), product_category: input.dimensionRule.target },
      } : {}),
      contextInheritance: {
        ...(input.sourceTraceId ? { sourceTraceId: input.sourceTraceId } : {}),
        inheritedFields: ["metrics", "dimensions", "comparison", "orderBy", "businessScope"],
      },
    },
    clarificationQuestions: [],
    warnings: input.dimensionRule ? ["user_asserted_dimension_rule_requires_master_data_validation"] : [],
  };
}

export function mergeLlmPlanFromContext(
  previous: AnalysisPlan,
  current: AnalysisPlan,
  sourceTraceId?: string,
): AnalysisPlannerResult {
  const metrics = current.metrics.length > 0 ? current.metrics : previous.metrics;
  const dimensions = current.dimensions.length > 0 ? current.dimensions : previous.dimensions;
  const analysisPlan: AnalysisPlan = {
    ...previous,
    ...current,
    route: "complex_composed",
    grain: dimensions,
    metrics,
    dimensions,
    requiredMetrics: current.requiredMetrics?.length ? current.requiredMetrics : metrics,
    timeRange: current.timeRange ?? previous.timeRange,
    comparison: current.comparison ?? previous.comparison,
    dimensionFilters: current.dimensionFilters ?? previous.dimensionFilters,
    businessScope: metrics.map((metric) => ({ metric, source: "approved_metric" as const })),
    contextInheritance: {
      ...(sourceTraceId ? { sourceTraceId } : {}),
      inheritedFields: inheritedFieldNames(previous, current),
    },
  };
  return { analysisPlan, clarificationQuestions: [], warnings: [] };
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeDimensionRules(values: AnalysisPlanDimensionRule[]): AnalysisPlanDimensionRule[] {
  const seen = new Set<string>();
  return values.filter((rule) => {
    const key = JSON.stringify([rule.dimension, rule.target, [...rule.members].sort(), rule.source, rule.trust, rule.validation]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanCategoryName(value: string | undefined): string {
  return (value ?? "").replace(/^(?:今年的|本月的|上月的|上个月的)/u, "").replace(/(?:总销售额|总类别|总类)$/u, "").trim();
}

function inferredTimeGrain(timeRange: AnalysisPlan["timeRange"], comparison: AnalysisPlan["comparison"]) {
  if (timeRange?.kind === "current_month" || timeRange?.kind === "previous_month" || timeRange?.kind === "month" || comparison?.kind === "month_over_month") return "month" as const;
  if (timeRange?.kind === "current_year" || timeRange?.kind === "year_over_year") return "year" as const;
  return undefined;
}

function inheritedFieldNames(previous: AnalysisPlan, current: AnalysisPlan): string[] {
  const fields = ["metrics", "dimensions", "timeRange", "comparison", "dimensionFilters", "orderBy", "limit", "businessScope"] as const;
  return fields.filter((field) => current[field] === undefined
    || JSON.stringify(previous[field] ?? null) === JSON.stringify(current[field] ?? null));
}
