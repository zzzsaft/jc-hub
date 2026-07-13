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
      const products = step.dependsOn.length > 0 ? productsFrom(upstream.get("sales_growth")) : [];
      if (step.dependsOn.length > 0 && products.length === 0) {
        return emptyStep(step, "skipped", "no_anchor_entities");
      }
      return input.executeStep({
        question: stepQuestion(step),
        step,
        analysisPlan: narrowPlan(step, products),
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

function narrowPlan(step: ComplexQueryStep, products: string[]): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    grain: ["product"],
    metrics: step.metrics,
    requiredMetrics: step.metrics,
    filters: [],
    dimensions: ["product"],
    orderBy: step.id === "sales_growth" ? [{ metric: "order_amount", direction: "DESC" }] : [],
    limit: step.limit,
    ...(step.timeRange ? { timeRange: step.timeRange } : {}),
    ...(step.timeGrain ? { timeGrain: step.timeGrain } : {}),
    ...(products.length > 0 ? { dimensionFilterSets: { product: products } } : {}),
  };
}

function productsFrom(result: ComplexQueryStepResult | undefined): string[] {
  if (!result || !["completed", "partial"].includes(result.status)) return [];
  const index = result.fields.indexOf("product");
  if (index < 0) return [];
  return [...new Set(result.rows.map((row) => row[index]).filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))];
}

function stepQuestion(step: ComplexQueryStep): string {
  if (step.id === "sales_growth") return "按产品查询最近3个月销售额月度趋势";
  if (step.id === "inventory") return "查询选定产品的当前库存现存量";
  return "查询选定产品的当前未交付数量和金额";
}

function emptyStep(step: ComplexQueryStep, status: "skipped", error: string): ComplexQueryStepResult {
  return { id: step.id, status, fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error };
}
