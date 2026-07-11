import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import type { AnalysisConversationContext, AnalysisPlan, AnalysisPlannerResult, AnalysisPlanFilter, AnalysisScenarioRecipe } from "../types/SqlPlannerTypes.js";
import { extendAnalysisPlanFromContext, parseUserDimensionRule } from "./AnalysisPlanContextService.js";

export type AnalysisPlanRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  signal?: AbortSignal;
}) => Promise<string>;
type MetricRule = {
  code: string;
  pattern: RegExp;
  filter?: AnalysisPlanFilter["op"];
  order?: "ASC" | "DESC";
};
const COST_COMPONENT_METRICS = ["material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount"];
const OPEN_SHIPPING_METRICS = ["open_shipping_amount", "open_shipping_qty"];
const OPEN_SHIPPING_PATTERN = /(待发货|未发货|没发货|欠发|欠交|未交付|延期交付|逾期交付|已经超了)/u;
const COLLECTION_PATTERN = /(回款慢|收款慢|回款周期|收款周期|账龄|逾期回款|逾期应收|应收逾期|回款\s*overdue|overdue)/iu;
const CUSTOMER_TREND_PATTERN = /(客户|三环科技|帝龙永孚|中博塑料|精卫科技|扬帆新).*(今年|去年|过去三年|近三年|相比|同比)/u;

const METRIC_RULES: MetricRule[] = [
  { code: "order_amount", pattern: /(订单金额|销售额|销售金额|价值高|金额大)/u, filter: "rank_high", order: "DESC" },
  { code: "invoice_revenue", pattern: /(发票|收入|开票|销售收入)/u, filter: "rank_high", order: "DESC" },
  { code: "collection_overdue_amount", pattern: /(逾期回款|逾期应收|应收逾期|回款\s*overdue|overdue|逾期.*最多)/iu, filter: "rank_high", order: "DESC" },
  { code: "collection_delay_days", pattern: COLLECTION_PATTERN, filter: "high", order: "DESC" },
  { code: "gross_margin_rate", pattern: /(毛利率|毛利.*低|低毛利)/u, filter: "low", order: "ASC" },
  { code: "gross_margin_amount", pattern: /(毛利金额|毛利是多少|毛利)/u },
  { code: "material_cost_amount", pattern: /(材料成本|物料成本|料费|物料费)/u, filter: "high", order: "DESC" },
  { code: "labor_cost_amount", pattern: /(人工成本|人工费|加工成本|加工费)/u, filter: "high", order: "DESC" },
  { code: "burden_cost_amount", pattern: /(制造成本|制造费用|制造费)/u, filter: "high", order: "DESC" },
  { code: "subcontract_cost_amount", pattern: /(外协成本|外协费|委外)/u, filter: "high", order: "DESC" },
  { code: "cost_component_amount", pattern: /(成本构成|成本占比|成本主要高在哪|成本项)/u, filter: "high", order: "DESC" },
  { code: "open_shipping_amount", pattern: OPEN_SHIPPING_PATTERN, filter: "high", order: "DESC" },
  { code: "inventory_on_hand_qty", pattern: /(库存不足|库存数量|现存量|库存)/u, filter: "low", order: "ASC" },
  { code: "purchase_amount", pattern: /(采购成本|采购金额|采购额)/u, filter: "high", order: "DESC" },
  { code: "shipped_amount", pattern: /(发货金额|已发货金额)/u, filter: "rank_high", order: "DESC" },
];
const ALLOWED_METRICS = [...new Set([
  ...METRIC_RULES.map((rule) => rule.code),
  "collection_overdue_amount",
  "open_job_margin_cost_risk",
  ...OPEN_SHIPPING_METRICS,
])];
const LlmAnalysisPlanSchema = z.object({
  route: z.enum(["complex_composed", "clarification_required"]).optional(),
  mode: z.enum(["strict", "decision_support"]).default("strict"),
  grain: z.array(z.string()).default([]),
  metrics: z.array(z.enum(ALLOWED_METRICS as [string, ...string[]])).default([]),
  filters: z.array(z.object({
    metric: z.string(),
    op: z.enum(["rank_high", "rank_low", "high", "low", "overdue"]),
  })).default([]),
  dimensions: z.array(z.string()).default([]),
  orderBy: z.array(z.object({
    metric: z.string(),
    direction: z.enum(["ASC", "DESC"]),
  })).default([]),
  limit: z.number().int().positive().optional(),
  timeGrain: z.enum(["month", "year"]).optional(),
  analysisShape: z.enum(["trend", "concentration"]).optional(),
  timeRange: z.object({
    kind: z.enum(["current_year", "year_over_year", "current_month", "previous_month", "month", "relative"]),
    month: z.number().optional(),
    days: z.number().optional(),
  }).optional(),
  comparison: z.object({
    kind: z.enum(["year_over_year", "month_over_month"]),
  }).optional(),
  assumptions: z.array(z.string()).default([]),
  clarificationCandidates: z.array(z.string()).default([]),
  retrievalHints: z.array(z.string()).default([]),
  dimensionFilters: z.object({
    customer: z.string().optional(),
    order: z.string().optional(),
    supplier: z.string().optional(),
    product: z.string().optional(),
    warehouse: z.string().optional(),
    job: z.string().optional(),
    product_category: z.string().optional(),
  }).optional(),
  customerName: z.string().optional(),
});
export const ANALYSIS_SCENARIO_RECIPES: AnalysisScenarioRecipe[] = [
  {
    code: "customer_product_yoy_trend",
    patterns: [CUSTOMER_TREND_PATTERN, /销售额|购买|产品类型|毛利|订单数|平均单价|单价/u],
    requiredMetrics: ["order_amount"],
    optionalMetrics: ["gross_margin_rate"],
    supportedDimensions: ["customer", "product"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    timeGrain: "year",
    analysisShape: "trend",
    strictExecutable: true,
  },
  {
    code: "product_sales_inventory_backlog_trend",
    patterns: [/销售.*增长|增长最快/u, /产品/u, /库存/u, /未交付|待发货|未发货|欠交/u],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    optionalMetrics: [],
    supportedDimensions: ["product"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    analysisShape: "trend",
    strictExecutable: true,
  },
  {
    code: "division_sales_margin_monthly_trend",
    patterns: [/事业部/u, /销售额|销售金额|收入/u, /增长/u, /毛利率|毛利/u, /下降/u],
    requiredMetrics: ["order_amount", "gross_margin_rate"],
    optionalMetrics: [],
    supportedDimensions: ["division"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    timeGrain: "month",
    analysisShape: "trend",
    strictExecutable: true,
  },
  {
    code: "customer_margin_monthly_trend",
    patterns: [/持续|逐月|趋势|下降/u, /客户/u, /毛利|销售/u],
    requiredMetrics: ["order_amount", "gross_margin_rate"],
    optionalMetrics: ["gross_margin_amount"],
    supportedDimensions: ["customer"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    timeGrain: "month",
    analysisShape: "trend",
    strictExecutable: true,
  },
  {
    code: "product_customer_concentration",
    patterns: [/top|前\d+|销售额|销售金额|订单金额/iu, /产品/u, /客户集中度|单一客户依赖/u],
    requiredMetrics: ["order_amount"],
    optionalMetrics: [],
    supportedDimensions: ["product", "customer"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    analysisShape: "concentration",
    strictExecutable: true,
  },
  {
    code: "division_sales_margin_backlog_summary",
    patterns: [/事业部/u, /销售额|销售金额|收入/u, /毛利|成本|未交付|欠交/u],
    requiredMetrics: ["order_amount", "gross_margin_amount", ...COST_COMPONENT_METRICS, "open_shipping_amount"],
    optionalMetrics: ["gross_margin_rate", "open_shipping_qty"],
    supportedDimensions: ["division"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    strictExecutable: true,
  },
  {
    code: "sales_margin_cost_by_product_customer_order",
    patterns: [/销售额|销售金额|订单金额|价值高/u, /毛利/u, /成本/u],
    requiredMetrics: ["order_amount", "gross_margin_rate", ...COST_COMPONENT_METRICS],
    optionalMetrics: ["gross_margin_amount", "invoice_revenue"],
    supportedDimensions: ["customer", "product", "order", "salesperson", "division"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    strictExecutable: true,
  },
  {
    code: "customer_revenue_margin_risk",
    patterns: [/客户/u, /收入|销售额|订单金额/u, /毛利.*低|低毛利|毛利率/u],
    requiredMetrics: ["invoice_revenue", "gross_margin_rate"],
    optionalMetrics: ["order_amount", "gross_margin_amount"],
    supportedDimensions: ["customer", "product", "order"],
    defaultOrderBy: { metric: "invoice_revenue", direction: "DESC" },
    strictExecutable: true,
  },
  {
    code: "purchase_supplier_product_summary",
    patterns: [/采购金额|采购额/u, /供应商/u, /物料|产品/u],
    requiredMetrics: ["purchase_amount"],
    optionalMetrics: [],
    supportedDimensions: ["supplier", "product"],
    defaultOrderBy: { metric: "purchase_amount", direction: "DESC" },
    strictExecutable: true,
  },
  {
    code: "purchase_cost_margin_impact",
    patterns: [/采购/u, /成本|毛利/u],
    requiredMetrics: ["purchase_amount", "gross_margin_rate"],
    optionalMetrics: [...COST_COMPONENT_METRICS, "gross_margin_amount", "order_amount"],
    supportedDimensions: ["product", "order", "customer"],
    defaultOrderBy: { metric: "purchase_amount", direction: "DESC" },
    strictExecutable: false,
  },
  {
    code: "open_job_customer_margin_cost_risk",
    patterns: [/未完工工单|打开工单|当前.*工单/u, /高价值|价值高|客户订单/u, /毛利|成本|风险/u],
    requiredMetrics: ["open_job_margin_cost_risk", "order_amount", "gross_margin_rate", ...COST_COMPONENT_METRICS],
    optionalMetrics: [],
    supportedDimensions: ["customer", "order", "product"],
    defaultOrderBy: { metric: "order_amount", direction: "DESC" },
    strictExecutable: true,
  },
  {
    code: "shipped_customer_margin_collection_summary",
    patterns: [/发货金额|已发货金额/u, /客户/u, /毛利/u, /回款|收款/u],
    requiredMetrics: ["shipped_amount", "gross_margin_rate", "collection_delay_days", "collection_overdue_amount"],
    optionalMetrics: [],
    supportedDimensions: ["customer"],
    defaultOrderBy: { metric: "shipped_amount", direction: "DESC" },
    strictExecutable: true,
  },
];
export class AnalysisPlannerService {
  constructor(private readonly requestJson: AnalysisPlanRequester = requestDeepSeekJson) {}

  async plan(question: string, signal?: AbortSignal, previousPlan?: AnalysisPlan, sourceTraceId?: string, conversation?: AnalysisConversationContext): Promise<AnalysisPlannerResult> {
    const metrics = METRIC_RULES.filter((rule) => rule.pattern.test(question)
      && (rule.code !== "open_shipping_amount" || !/(采购|供应商)/u.test(question)));
    const matchedRecipe = matchScenarioRecipe(question);
    const dimensionRule = parseUserDimensionRule(question);
    if (previousPlan) {
      const contextual = conversation?.recentMessages.length ? await this.planWithLlm(question, signal, conversation) : undefined;
      const inherited = extendAnalysisPlanFromContext({
        question,
        previous: previousPlan,
        detectedMetrics: metrics.length > 0 ? metrics.map((metric) => metric.code) : contextual?.analysisPlan?.metrics ?? [],
        timeRange: timeRangeFor(question) ?? contextual?.analysisPlan?.timeRange,
        comparison: comparisonFor(question) ?? contextual?.analysisPlan?.comparison,
        dimensionRule,
        sourceTraceId,
      });
      if (inherited) return inherited;
    }

    const clarificationQuestions = clarificationFor(question, metrics, matchedRecipe);
    if (clarificationQuestions.length > 0) {
      return {
        analysisPlan: {
          route: "clarification_required",
          mode: "decision_support",
          grain: [],
          metrics: [],
          filters: [],
          dimensions: [],
          orderBy: [],
          clarificationCandidates: clarificationQuestions,
        },
        clarificationQuestions,
        warnings: [],
      };
    }

    if (metrics.length === 0) {
      if (!shouldAskLlm(question)) return { clarificationQuestions: [], warnings: [] };
      return this.planWithLlm(question, signal);
    }

    const recipe = metrics.some((rule) => rule.code === "collection_delay_days") && matchedRecipe?.code !== "shipped_customer_margin_collection_summary"
      ? undefined
      : matchedRecipe;
    const requiredMetricSet = new Set(recipe?.requiredMetrics ?? []);
    const metricCodes = [...new Set([
      ...(recipe?.requiredMetrics ?? []),
      ...metrics.flatMap((rule) => rule.code === "collection_delay_days" ? [rule.code, "collection_overdue_amount"] : [rule.code]),
      ...costBreakdownMetricsFor(question),
      ...openShippingMetricsFor(question),
    ])]
      .filter((code, _index, codes) => code !== "gross_margin_amount" || requiredMetricSet.has(code) || !codes.includes("gross_margin_rate"));
    const dimensions = dimensionsFor(question);
    const comparison = comparisonFor(question);
    if (metricCodes.length < 2 && !recipe && !isStructuredAnalysis(question, dimensions, comparison)) {
      return { clarificationQuestions: [], warnings: [] };
    }
    const orderBy = metrics
      .filter((rule) => rule.order && metricCodes.includes(rule.code))
      .map((rule) => ({ metric: rule.code, direction: rule.order! }))
      .slice(0, 1);
    const selectedDimensions = dimensionsForRecipe(dimensions, recipe);
    const timeRange = timeRangeFor(question);
    return {
      analysisPlan: {
        mode: recipe?.strictExecutable === false || recipe?.analysisShape === "trend" || /估算|大概|决策参考|经营决策|趋势|粗算/u.test(question) ? "decision_support" : "strict",
        route: "complex_composed",
        grain: selectedDimensions,
        metrics: metricCodes,
        filters: metrics
          .filter((rule) => rule.filter && metricCodes.includes(rule.code))
          .map((rule) => ({ metric: rule.code, op: isOverdueShipping(question, rule.code) ? "overdue" : rule.filter! })),
        dimensions: selectedDimensions,
        orderBy: orderBy.length > 0 ? orderBy : recipe?.defaultOrderBy ? [recipe.defaultOrderBy] : [],
        requiredMetrics: recipe?.requiredMetrics ?? metricCodes,
        ...(recipe ? { scenario: recipe.code } : {}),
        ...(recipe?.timeGrain || inferredTimeGrain(timeRange, comparison) ? { timeGrain: recipe?.timeGrain ?? inferredTimeGrain(timeRange, comparison) } : {}),
        ...(recipe?.analysisShape ? { analysisShape: recipe.analysisShape } : {}),
        ...(timeRange ? { timeRange } : {}),
        ...(comparison ? { comparison } : {}),
        ...(limitFor(question) ? { limit: limitFor(question) } : {}),
        assumptions: assumptionsFor(question, recipe?.code),
        retrievalHints: retrievalHintsFor(recipe?.code, metricCodes, selectedDimensions),
        businessScope: metricCodes.map((metric) => ({ metric, source: "approved_metric" as const })),
        ...(Object.keys(dimensionFiltersFor(question)).length > 0 ? {
          dimensionFilters: dimensionFiltersFor(question),
        } : {}),
        ...(customerNameFor(question) ? {
          customerName: customerNameFor(question),
        } : {}),
      },
      clarificationQuestions: [],
      warnings: [],
    };
  }

  private async planWithLlm(question: string, signal?: AbortSignal, conversation?: AnalysisConversationContext): Promise<AnalysisPlannerResult> {
    try {
      const content = await this.requestJson({
        purpose: "erp_sql_analysis_plan",
        input: { question, allowedMetrics: ALLOWED_METRICS, conversation },
        maxTokens: 900,
        signal,
        messages: [
          {
            role: "system",
            content: "Convert ERP business-analysis questions to one JSON analysisPlan only. Resolve references using the supplied same-session dialogue and semantic summary. The newest explicit user statement overrides older context. Never output SQL. Use only allowed metric codes.",
          },
          ...(conversation?.semanticSummary ? [{ role: "system" as const, content: `Earlier dialogue semantic summary: ${conversation.semanticSummary}` }] : []),
          ...(conversation?.recentMessages ?? []).map((message) => ({ role: message.role, content: message.content })),
          {
            role: "user",
            content: JSON.stringify({
              question,
              allowedMetrics: ALLOWED_METRICS,
              outputShape: {
                mode: "strict | decision_support",
                grain: "string[]",
                metrics: "allowed metric code[]",
                filters: "{ metric, op: rank_high|rank_low|high|low|overdue }[]",
                dimensions: "string[]",
                orderBy: "{ metric, direction: ASC|DESC }[]",
                timeRange: "{ kind: current_year|year_over_year|current_month|previous_month|month|relative, month?, days? }?",
                comparison: "{ kind: year_over_year|month_over_month }?",
                limit: "number?",
              },
            }),
          },
        ],
      });
      const analysisPlan = LlmAnalysisPlanSchema.parse(JSON.parse(content));
      const metrics = analysisPlan.metrics.filter((metric) => ALLOWED_METRICS.includes(metric));
      const recipe = matchScenarioRecipe(question);
      if (metrics.length === 0) return { clarificationQuestions: [], warnings: ["LLM analysis plan did not contain approved atomic metric codes."] };
      return {
        analysisPlan: {
          ...analysisPlan,
          route: "complex_composed",
          metrics: recipe ? [...new Set([...recipe.requiredMetrics, ...metrics])] : metrics,
          dimensions: dimensionsForRecipe(analysisPlan.dimensions, recipe),
          ...(recipe ? { scenario: recipe.code, requiredMetrics: recipe.requiredMetrics } : {}),
          ...(recipe?.timeGrain ? { timeGrain: recipe.timeGrain } : {}),
          ...(recipe?.analysisShape ? { analysisShape: recipe.analysisShape } : {}),
          ...(recipe?.timeGrain === "month" && !analysisPlan.timeRange ? { timeRange: { kind: "relative" as const, days: 180 } } : {}),
          businessScope: metrics.map((metric) => ({ metric, source: "approved_metric" as const })),
          assumptions: [...analysisPlan.assumptions, ...assumptionsFor(question, recipe?.code)],
          retrievalHints: [...analysisPlan.retrievalHints, ...retrievalHintsFor(recipe?.code, analysisPlan.metrics, dimensionsForRecipe(analysisPlan.dimensions, recipe))],
          ...(Object.keys(dimensionFiltersFor(question)).length > 0 ? {
            dimensionFilters: dimensionFiltersFor(question),
          } : {}),
          ...(customerNameFor(question) ? {
            customerName: customerNameFor(question),
          } : {}),
        },
        clarificationQuestions: [],
        warnings: [],
      };
    } catch (error) {
      return { clarificationQuestions: [], warnings: [`LLM analysis planner failed: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }
}
function clarificationFor(question: string, metrics: MetricRule[], recipe: AnalysisScenarioRecipe | undefined): string[] {
  const questions: string[] = [];
  const needsOpenAssessmentClarification = metrics.length === 0 && !recipe && /(认为|评估|帮忙|看看|分析)/u.test(question);
  if (/毛利低/u.test(question) && !/(毛利金额|毛利率|毛利低于|毛利偏低|低毛利|高价值)/u.test(question)) {
    questions.push("“毛利低”按毛利金额还是毛利率？");
  }
  if (isAmbiguousQuantityQuestion(question, needsOpenAssessmentClarification)) {
    questions.push("你说的“数量”是生产完工数量、入库数量、发货数量，还是销售订单数量？");
  }
  if (/(单价|价格)/u.test(question) && !/(销售单价|未税单价|含税单价|加工单价|采购单价)/u.test(question)) {
    questions.push("你说的“单价”是销售单价、未税单价、含税单价、加工单价，还是采购单价？");
  }
  if (questions.length === 0 && needsOpenAssessmentClarification && /哪些|哪个|分析|评估|同时/u.test(question) && dimensionsFor(question).length === 0) {
    questions.push("维度按客户、订单、产品还是事业部？");
  }
  return questions.slice(0, 1);
}
function isAmbiguousQuantityQuestion(question: string, needsOpenAssessmentClarification: boolean): boolean {
  if (hasExplicitQuantityBasis(question)) return false;
  if (needsOpenAssessmentClarification && /数量/u.test(question)) return true;
  return /(做了多少|产量|数量.*占比|占比.*数量|各型号.*数量|数量.*各型号|型号.*占比|按型号.*(?:多少|数量)|多少.*占比)/u.test(question);
}

function hasExplicitQuantityBasis(question: string): boolean {
  return /(生产完工数量|完工数量|生产入库数量|入库数量|报工数量|发货数量|已发货数量|待发数量|未发货数量|欠发数量|未交付数量|销售订单数量|订单数量|销售数量|库存数量|现存量|需求数量|已发数量|未发数量|采购数量|收货数量|到货数量)/u.test(question);
}

function dimensionsFor(question: string): string[] {
  const dimensions: string[] = [];
  if (/客户/u.test(question)) dimensions.push("customer");
  if (/订单/u.test(question)) dimensions.push("order");
  if (/产品类别|产品分类|产品群组|产品品类|(?:^|[^产])品类/u.test(question)) dimensions.push("product_category");
  else if (/产品|物料|类别/u.test(question)) dimensions.push("product");
  if (/仓库/u.test(question)) dimensions.push("warehouse");
  if (/事业部/u.test(question)) dimensions.push("division");
  if (/供应商/u.test(question)) dimensions.push("supplier");
  if (/销售员|业务员|录入人/u.test(question)) dimensions.push("salesperson");
  if (/车间/u.test(question)) dimensions.push("workshop");
  return dimensions;
}

function customerNameFor(question: string): string | undefined {
  const known = question.match(/(三环科技|帝龙永孚|中博塑料|精卫科技|扬帆新)/u)?.[1];
  const explicit = question.match(/客户\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,24}?)(?=今年|去年|过去三年|近三年|购买|销售|订单|下单|发货|毛利|产品|$)/u)?.[1];
  const value = known ?? explicit;
  return value && !isBadCustomerToken(value) ? value : undefined;
}

function dimensionFiltersFor(question: string): NonNullable<AnalysisPlan["dimensionFilters"]> {
  const customer = customerNameFor(question);
  const order = question.match(/(?:销售)?订单(?:号)?\s*[：:#-]?\s*(\d+)/u)?.[1];
  return {
    ...(customer ? { customer } : {}),
    ...(order ? { order } : {}),
  };
}

function isBadCustomerToken(value: string): boolean {
  return /^(的|哪些|哪个|订单|客户|今年|去年|过去三年|近三年|本月|最近|产品|销售额|毛利|趋势)$/u.test(value);
}

function timeRangeFor(question: string) {
  if (/上个?月|上月/u.test(question)) return { kind: "previous_month" as const };
  if (/本月|这个月|当月/u.test(question)) return { kind: "current_month" as const };
  const month = question.match(/(\d{1,2})\s*月份?/u)?.[1];
  if (month) return { kind: "month" as const, month: Number(month) };
  if (/今年.*去年|去年.*今年|同比/u.test(question)) return { kind: "year_over_year" as const };
  if (/今年/u.test(question)) return { kind: "current_year" as const };
  if (/最近3个月|近\s*3\s*个?月|最近一个季度|近一季度/u.test(question)) return { kind: "relative" as const, days: 90 };
  if (/最近一个月|近\s*1\s*个?月/u.test(question)) return { kind: "relative" as const, days: 30 };
  if (/最近半年|近\s*6\s*个?月|逐月|持续|趋势|下降/u.test(question)) return { kind: "relative" as const, days: 180 };
  const days = question.match(/近\s*(\d+)\s*天/u)?.[1];
  if (days) return { kind: "relative" as const, days: Number(days) };
  return undefined;
}

function comparisonFor(question: string) {
  if (/同比|去年同期|较去年/u.test(question)) return { kind: "year_over_year" as const };
  if (/环比|较上月|和上月比|与上月相比/u.test(question)) return { kind: "month_over_month" as const };
  return undefined;
}

function inferredTimeGrain(timeRange: AnalysisPlan["timeRange"], comparison: AnalysisPlan["comparison"]) {
  if (timeRange?.kind === "current_month" || timeRange?.kind === "previous_month" || timeRange?.kind === "month" || comparison?.kind === "month_over_month") return "month" as const;
  if (timeRange?.kind === "current_year" || timeRange?.kind === "year_over_year") return "year" as const;
  return undefined;
}

function isStructuredAnalysis(question: string, dimensions: string[], comparison: ReturnType<typeof comparisonFor>): boolean {
  return dimensions.length > 0 && Boolean(comparison || /按|最高|最低|排行|排名|top\s*\d*|前\s*\d+/iu.test(question));
}


function assumptionsFor(question: string, scenario: string | undefined): string[] {
  const assumptions: string[] = [];
  if (/趋势|下降|增长|逐月|持续/u.test(question) && !/(今年|去年|月份|最近|近\s*\d+\s*天|过去三年|近三年|最近三年)/u.test(question)) assumptions.push("趋势默认按近 180 天观察。");
  if (/最近|最近一个季度|近一季度/u.test(question) && !/趋势|半年/u.test(question)) assumptions.push("最近默认按近 90 天观察。");
  if (/下降/u.test(question)) assumptions.push("下降默认按环比趋势判断。");
  if (/产品类型|品类/u.test(question)) assumptions.push("产品类型 v1 映射为现有 product 维度。");
  if (scenario?.includes("yoy") || /今年.*去年|去年.*今年|同比/u.test(question)) assumptions.push("年度同比默认按今年截至当前日与去年同期对比；明确月份按对应自然月对比。");
  return assumptions;
}

function retrievalHintsFor(scenario: string | undefined, metrics: string[], dimensions: string[]): string[] {
  return [...new Set([
    scenario,
    ...metrics,
    ...dimensions,
    ...metrics.map((metric) => metric.replace(/_/gu, " ")),
    ...dimensions.map((dimension) => dimension === "customer" ? "客户" : dimension === "product" ? "产品" : dimension),
    metrics.includes("order_amount") ? "销售额 订单金额" : undefined,
    metrics.includes("gross_margin_rate") ? "毛利 毛利率" : undefined,
    scenario?.includes("trend") ? "趋势 同比 增长 下降" : undefined,
  ].filter((item): item is string => Boolean(item)))];
}

function limitFor(question: string): number | undefined {
  const match = question.match(/(?:top\s*|前|最高的)(\d{1,3})\s*(?:类|种|个|条|名)?/iu);
  if (!match?.[1]) return /最高|排行|排名/iu.test(question) ? 10 : undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function shouldAskLlm(question: string): boolean {
  return /(分析|评估|同时|哪些|哪个|最高|最低|偏高|偏低|主要|影响|原因|趋势)/u.test(question);
}

function costBreakdownMetricsFor(question: string): string[] {
  return /(成本构成|成本占比|成本主要高在哪|成本项|材料成本|物料成本|料费|物料费|人工|加工|制造|外协|委外)/u.test(question)
    ? COST_COMPONENT_METRICS
    : [];
}

function openShippingMetricsFor(question: string): string[] {
  return !/(采购|供应商)/u.test(question) && OPEN_SHIPPING_PATTERN.test(question) ? OPEN_SHIPPING_METRICS : [];
}

function isOverdueShipping(question: string, metricCode: string): boolean {
  return metricCode === "open_shipping_amount" && !/(采购|供应商)/u.test(question) && /(延期|逾期|已经超了)/u.test(question);
}

function matchScenarioRecipe(question: string): AnalysisScenarioRecipe | undefined {
  return ANALYSIS_SCENARIO_RECIPES.find((recipe) => recipe.patterns.every((pattern) => pattern.test(question)));
}

function dimensionsForRecipe(dimensions: string[], recipe: AnalysisScenarioRecipe | undefined): string[] {
  if (!recipe) return dimensions;
  const supported = recipe.supportedDimensions.filter((dimension) => dimensions.includes(dimension));
  return supported.length > 0 ? supported : recipe.supportedDimensions.slice(0, 1);
}

export const analysisPlannerService = new AnalysisPlannerService();
