import type { AnalysisPlan } from "../planner/index.js";
import type { ComplexQueryPlan, ComplexQueryPlanResult, ComplexQueryStep } from "./types.js";

const SCENARIO = "product_sales_inventory_backlog_trend";
const REQUIRED_METRICS = ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"];

export class ComplexQueryPlanService {
  build(analysisPlan: AnalysisPlan): ComplexQueryPlanResult {
    if (analysisPlan.scenario !== SCENARIO) return { ok: false, reason: "unsupported_complex_scenario" };
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
        capabilityCode: "complex.sales_growth",
        metrics: ["order_amount"],
        dimensions: ["product"],
        dependsOn: [],
        timeRange: analysisPlan.timeRange,
        timeGrain: "month",
        limit,
      },
      {
        id: "inventory",
        capabilityCode: "complex.inventory_by_product",
        metrics: ["inventory_on_hand_qty"],
        dimensions: ["product"],
        dependsOn: ["sales_growth"],
        inputFrom: { stepId: "sales_growth", keys: ["Company", "product"] },
        limit: 500,
      },
      {
        id: "backlog",
        capabilityCode: "complex.backlog_by_product",
        metrics: ["open_shipping_qty", "open_shipping_amount"],
        dimensions: ["product"],
        dependsOn: ["sales_growth"],
        inputFrom: { stepId: "sales_growth", keys: ["Company", "product"] },
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
      budget: { maxQueries: 5, maxRowsPerQuery: 500, timeoutMs: 30_000 },
    };
    return validPlan(plan) ? { ok: true, plan } : { ok: false, reason: "invalid_complex_plan" };
  }
}

function isScenarioAnalysisFilter(metric: string, op: string): boolean {
  return (metric === "order_amount" && op === "rank_high")
    || (metric === "inventory_on_hand_qty" && op === "low")
    || (metric === "open_shipping_amount" && op === "high");
}

function validPlan(plan: ComplexQueryPlan): boolean {
  if (plan.steps.length > plan.budget.maxQueries) return false;
  if (plan.joinPolicy.allowNameBasedJoin || plan.joinPolicy.keys.join("|") !== "Company|product") return false;
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
