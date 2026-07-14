import {
  ComplexQueryGraphExecutor,
  ComplexQueryResultComposer,
  complexQueryPlanService,
  type ComplexQueryGraphResult,
  type ComplexQueryPlan,
  type ComplexQueryStep,
  type ComplexQueryStepResult,
} from "../../../modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../../modules/erpSqlAgent/planner/index.js";
import type {
  AnalysisPlanDimensionFilter,
  AnalysisPlanJoinKeyFilterTuple,
} from "../../../modules/erpSqlAgent/planner/types/SqlPlannerTypes.js";

export type ErpComplexQueryStepInput = {
  question: string;
  step: ComplexQueryStep;
  analysisPlan: AnalysisPlan;
};

export type ErpComplexQueryStepExecutor = (
  input: ErpComplexQueryStepInput,
  signal: AbortSignal,
) => Promise<ComplexQueryStepResult>;

export type ErpComplexQueryResult =
  | {
      ok: true;
      plan: ComplexQueryPlan;
      graph: ComplexQueryGraphResult;
      composed: ReturnType<ComplexQueryResultComposer["compose"]>;
    }
  | { ok: false; reason: string; graph?: ComplexQueryGraphResult };

export async function runErpComplexQuery(input: {
  question: string;
  analysisPlan: AnalysisPlan;
  executeStep: ErpComplexQueryStepExecutor;
  signal?: AbortSignal;
}): Promise<ErpComplexQueryResult> {
  const built = complexQueryPlanService.build(input.analysisPlan);
  if (!built.ok) return { ok: false, reason: built.reason };
  const graph = await new ComplexQueryGraphExecutor().execute(
    built.plan,
    async (step, upstream, signal) => {
      const upstreamFilters = filtersFromUpstream(step, built.plan, upstream);
      if (step.dependsOn.length > 0 && !upstreamFilters) {
        return emptyStep(step, "skipped", "no_anchor_entities");
      }
      return input.executeStep({
        question: step.question,
        step,
        analysisPlan: {
          ...narrowPlan(step, input.analysisPlan),
          ...upstreamFilters,
          ...q3Overrides(step, input.analysisPlan),
        },
      }, signal);
    },
    input.signal,
  );
  if (graph.status === "failed") return { ok: false, reason: "complex_query_failed", graph };
  try {
    return {
      ok: true,
      plan: built.plan,
      graph,
      composed: new ComplexQueryResultComposer().compose(built.plan, graph.steps),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error), graph };
  }
}

function narrowPlan(step: ComplexQueryStep, source: AnalysisPlan): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    scenario: source.scenario,
    grain: step.dimensions,
    dimensions: step.dimensions,
    metrics: step.metrics,
    requiredMetrics: step.metrics,
    filters: step.filters,
    orderBy: step.orderBy,
    limit: step.limit,
    timeRange: step.timeRange,
    assumptions: source.assumptions,
  };
}

function filtersFromUpstream(
  step: ComplexQueryStep,
  plan: ComplexQueryPlan,
  upstream: ReadonlyMap<string, ComplexQueryStepResult>,
): Pick<AnalysisPlan, "joinKeyFilterTuples"> | undefined {
  if (step.dependsOn.length === 0) return {};
  const byId = new Map(plan.steps.map((item) => [item.id, item]));
  const tuples = new Map<string, AnalysisPlanJoinKeyFilterTuple>();
  let matchedRows = 0;
  for (const dependencyId of step.dependsOn) {
    const dependency = byId.get(dependencyId);
    const result = upstream.get(dependencyId);
    if (!dependency || !result || !["completed", "partial"].includes(result.status)) continue;
    const commonKeys = step.joinKeys.filter((key) => dependency.joinKeys.includes(key));
    const dimensionKeys = commonKeys.filter(isDimensionFilter);
    if (!commonKeys.includes("Company") || dimensionKeys.length === 0 || commonKeys.some((key) => !result.fields.includes(key))) continue;
    const indexes = new Map(commonKeys.map((key) => [key, result.fields.indexOf(key)]));
    for (const row of result.rows) {
      const values = new Map(commonKeys.map((key) => [key, exactKey(row[indexes.get(key)!])]));
      if (commonKeys.some((key) => !values.get(key))) continue;
      matchedRows += 1;
      const tuple = Object.fromEntries(commonKeys.map((key) => [key, values.get(key)!])) as AnalysisPlanJoinKeyFilterTuple;
      tuples.set(commonKeys.map((key) => tuple[key as keyof AnalysisPlanJoinKeyFilterTuple]).join("\u0000"), tuple);
    }
  }
  if (matchedRows === 0) return undefined;
  return tuples.size > 0 ? { joinKeyFilterTuples: [...tuples.values()] } : undefined;
}

function q3Overrides(step: ComplexQueryStep, source: AnalysisPlan): Partial<AnalysisPlan> {
  if (step.id !== "sales_growth" || source.scenario !== "product_sales_inventory_backlog_trend") return {};
  return {
    timeGrain: "month",
    calculation: "sales_growth",
    completeMonthCount: 3,
    assumptions: ["最近3个月按最近三个完整自然月计算；边界月无销售行按销售额 0。"],
    ...(source.dimensionFilters?.product ? { dimensionFilters: { product: source.dimensionFilters.product } } : {}),
  };
}

function isDimensionFilter(value: string): value is AnalysisPlanDimensionFilter {
  return ["customer", "order", "supplier", "product", "warehouse", "job", "product_category"].includes(value);
}

function exactKey(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function complexStepStatus(
  execution: { valid: boolean; executed: boolean; truncated: boolean },
  semanticStatus: ComplexQueryStepResult["semanticStatus"],
): ComplexQueryStepResult["status"] {
  if (!execution.valid || !execution.executed || semanticStatus === "semantic_mismatch") return "failed";
  return execution.truncated || semanticStatus === "estimate" ? "partial" : "completed";
}

function emptyStep(step: ComplexQueryStep, status: "skipped", error: string): ComplexQueryStepResult {
  return { id: step.id, status, fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error };
}
