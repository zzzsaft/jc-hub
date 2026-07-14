import type { AnalysisPlan } from "../planner/index.js";
import type { ComplexQueryPlan, ComplexQueryPlanResult, ComplexQueryStep } from "./types.js";

const SCENARIO = "product_sales_inventory_backlog_trend";
const REQUIRED_METRICS = ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"];
const FINANCE_METRICS = new Set([
  "order_amount", "invoice_revenue", "gross_margin_rate",
  "material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount", "cost_component_amount",
  "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount",
  "collection_delay_days", "collection_overdue_amount",
]);
const COST_METRICS = new Set([
  "material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount", "cost_component_amount",
]);
const SALES_DIMENSIONS = new Set(["customer", "product", "order", "product_category"]);

export class ComplexQueryPlanService {
  build(analysisPlan: AnalysisPlan): ComplexQueryPlanResult {
    if (analysisPlan.scenario === SCENARIO) return buildProductRiskPlan(analysisPlan);
    return buildFinancePlan(analysisPlan);
  }
}

function buildProductRiskPlan(analysisPlan: AnalysisPlan): ComplexQueryPlanResult {
    const metrics = new Set([...(analysisPlan.metrics ?? []), ...(analysisPlan.requiredMetrics ?? [])]);
    if (!analysisPlan.dimensions.includes("product") || REQUIRED_METRICS.some((metric) => !metrics.has(metric))) {
      return { ok: false, reason: "missing_complex_coverage" };
    }
    const unsupportedFilters = Object.keys(analysisPlan.dimensionFilters ?? {}).filter((key) => key !== "product");
    const unsupportedMetricFilter = analysisPlan.filters.some((filter) => !isScenarioAnalysisFilter(filter.metric, filter.op));
    if (unsupportedFilters.length > 0 || unsupportedMetricFilter || analysisPlan.dimensionFilterSets || analysisPlan.joinKeyFilterTuples
      || analysisPlan.customerName || analysisPlan.dimensionRules?.length) {
      return { ok: false, reason: "unsupported_complex_filter" };
    }

    const limit = Math.min(Math.max(analysisPlan.limit ?? 20, 1), 500);
    const steps: ComplexQueryStep[] = [
      {
        id: "sales_growth",
        question: "按产品查询最近3个月销售额月度趋势",
        capabilityCode: "complex.sales_growth",
        module: "sales",
        metrics: ["order_amount"],
        dimensions: ["product"],
        joinKeys: ["Company", "product"],
        dependsOn: [],
        timeRange: analysisPlan.timeRange,
        filters: [],
        orderBy: [],
        limit,
      },
      {
        id: "inventory",
        question: "查询选定产品的当前库存现存量",
        capabilityCode: "complex.inventory_by_product",
        module: "inventory",
        metrics: ["inventory_on_hand_qty"],
        dimensions: ["product"],
        joinKeys: ["Company", "product"],
        dependsOn: ["sales_growth"],
        filters: [],
        orderBy: [],
        limit: 500,
      },
      {
        id: "backlog",
        question: "查询选定产品的当前未交付数量和金额",
        capabilityCode: "complex.backlog_by_product",
        module: "sales",
        metrics: ["open_shipping_qty", "open_shipping_amount"],
        dimensions: ["product"],
        joinKeys: ["Company", "product"],
        dependsOn: ["sales_growth"],
        filters: [],
        orderBy: [],
        limit: 500,
      },
    ];
    const plan: ComplexQueryPlan = {
      scenario: SCENARIO,
      objective: "识别销售增长快但库存或未交付存在风险的产品",
      resultLimit: limit,
      entityGrain: ["Company", "product"],
      steps,
      joinPolicy: { keys: ["Company", "product"], allowNameBasedJoin: false },
      budget: budget(),
      diagnostic: false,
    };
    return validPlan(plan) ? { ok: true, plan } : { ok: false, reason: "invalid_complex_plan" };
}

function buildFinancePlan(source: AnalysisPlan): ComplexQueryPlanResult {
  const requested = [...new Set([...(source.metrics ?? []), ...(source.requiredMetrics ?? [])])];
  const anchorMetric = requested.includes("order_amount") ? "order_amount" : requested.includes("invoice_revenue") ? "invoice_revenue" : undefined;
  const unsupported = requested.filter((metric) => !FINANCE_METRICS.has(metric));
  const dimensions = source.dimensions.filter((dimension) => SALES_DIMENSIONS.has(dimension));
  if (source.route !== "complex_composed" || !anchorMetric || requested.length < 2 || unsupported.length > 0 || dimensions.length === 0) {
    return { ok: false, reason: "unsupported_complex_scenario" };
  }
  if (source.dimensionFilterSets || source.joinKeyFilterTuples || source.customerName || source.dimensionRules?.length) {
    return { ok: false, reason: "unsupported_complex_filter" };
  }

  const limit = Math.min(Math.max(source.limit ?? 20, 1), 500);
  const anchorId = "sales_anchor";
  const steps: ComplexQueryStep[] = [step({
    id: anchorId,
    question: anchorMetric === "invoice_revenue" ? "按请求维度查询收入" : "按请求维度查询销售额",
    capabilityCode: anchorMetric === "invoice_revenue" ? "finance.invoice_revenue" : "sales.order_amount",
    module: anchorMetric === "invoice_revenue" ? "finance" : "sales",
    metrics: [anchorMetric], dimensions, dependsOn: [], source, limit: 500,
  })];
  const dependent = { dimensions, dependsOn: [anchorId], source, limit: 500 };
  if (requested.includes("gross_margin_rate")) steps.push(step({
    id: "margin", question: "按锚点实体查询毛利率", capabilityCode: "finance.gross_margin_rate",
    module: "finance", metrics: ["gross_margin_rate"], ...dependent,
  }));
  const costs = requested.filter((metric) => COST_METRICS.has(metric));
  if (costs.length > 0) steps.push(step({
    id: "costs", question: "按锚点实体查询主要成本构成", capabilityCode: "finance.cost_components",
    module: "finance", metrics: costs, ...dependent,
  }));
  if (requested.includes("inventory_on_hand_qty") && dimensions.includes("product")) steps.push(step({
    id: "inventory", question: "查询选定产品的当前库存现存量", capabilityCode: "complex.inventory_by_product",
    module: "inventory", metrics: ["inventory_on_hand_qty"], dimensions: ["product"], dependsOn: [anchorId], source, limit: 500,
  }));
  const backlog = ["open_shipping_qty", "open_shipping_amount"].filter((metric) => requested.includes(metric));
  if (backlog.length > 0 && dimensions.includes("product")) steps.push(step({
    id: "backlog", question: "查询选定产品的当前未交付数量和金额", capabilityCode: "complex.backlog_by_product",
    module: "sales", metrics: backlog, dimensions: ["product"], dependsOn: [anchorId], source, limit: 500,
  }));
  const collection = ["collection_delay_days", "collection_overdue_amount"].filter((metric) => requested.includes(metric));
  const collectionDimensions = dimensions.filter((dimension) => dimension === "customer" || dimension === "order");
  if (collection.length > 0 && collectionDimensions.length > 0) steps.push(step({
    id: "collection", question: "按锚点客户和订单查询逾期回款", capabilityCode: "finance.collection",
    module: "finance", metrics: collection, dimensions: collectionDimensions, dependsOn: [anchorId], source, limit: 500,
  }));

  const covered = new Set(steps.flatMap((item) => item.metrics));
  if (requested.some((metric) => !covered.has(metric))) return { ok: false, reason: "missing_complex_coverage" };
  const plan: ComplexQueryPlan = {
    scenario: source.scenario ?? "diagnostic_finance_composite",
    objective: "按有限财务查询步骤提供诊断决策依据",
    resultLimit: limit,
    entityGrain: ["Company", ...dimensions],
    steps: mergeSteps(steps).slice(0, 8),
    joinPolicy: { keys: ["Company", ...dimensions], allowNameBasedJoin: false },
    budget: budget(),
    diagnostic: true,
  };
  return validPlan(plan) ? { ok: true, plan } : { ok: false, reason: "invalid_complex_plan" };
}

function step(input: Omit<ComplexQueryStep, "joinKeys" | "timeRange" | "filters" | "selectionMode" | "orderBy"> & { source: AnalysisPlan }): ComplexQueryStep {
  const { source, ...value } = input;
  const metricSet = new Set(value.metrics);
  const filters = source.filters.filter((filter) => metricSet.has(filter.metric));
  return {
    ...value,
    joinKeys: ["Company", ...value.dimensions],
    timeRange: source.timeRange,
    filters,
    selectionMode: value.dependsOn.length > 0 && filters.length > 0 ? "filter" : "enrich",
    orderBy: source.orderBy.filter((order) => metricSet.has(order.metric)),
  };
}

function mergeSteps(steps: ComplexQueryStep[]): ComplexQueryStep[] {
  const merged = new Map<string, ComplexQueryStep>();
  for (const item of steps) {
    const key = JSON.stringify([item.module, item.dimensions, item.filters, item.selectionMode, item.timeRange, item.dependsOn, item.orderBy]);
    const existing = merged.get(key);
    if (!existing) merged.set(key, item);
    else {
      existing.metrics = [...new Set([...existing.metrics, ...item.metrics])];
      existing.question = `${existing.question}；${item.question}`;
      if (existing.capabilityCode !== item.capabilityCode) existing.capabilityCode = "finance.composite_decision";
    }
  }
  return [...merged.values()];
}

function budget(): ComplexQueryPlan["budget"] {
  return { maxQueries: 8, maxRowsPerQuery: 500, timeoutMs: 30_000 };
}

function isScenarioAnalysisFilter(metric: string, op: string): boolean {
  return (metric === "order_amount" && op === "rank_high")
    || (metric === "inventory_on_hand_qty" && op === "low")
    || (metric === "open_shipping_amount" && op === "high");
}

function validPlan(plan: ComplexQueryPlan): boolean {
  if (plan.steps.length > plan.budget.maxQueries) return false;
  if (plan.joinPolicy.allowNameBasedJoin || plan.joinPolicy.keys[0] !== "Company") return false;
  const ids = new Set(plan.steps.map((step) => step.id));
  if (ids.size !== plan.steps.length) return false;
  if (plan.steps.some((step) => step.limit > plan.budget.maxRowsPerQuery || step.dependsOn.some((id) => !ids.has(id)))) return false;
  return !hasCycle(plan.steps);
}

function hasCycle(steps: ComplexQueryStep[]): boolean {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visiting = new Set<ComplexQueryStep["id"]>();
  const visited = new Set<ComplexQueryStep["id"]>();
  const visit = (id: ComplexQueryStep["id"]): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (byId.get(id)?.dependsOn.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return steps.some((step) => visit(step.id));
}

export const complexQueryPlanService = new ComplexQueryPlanService();
