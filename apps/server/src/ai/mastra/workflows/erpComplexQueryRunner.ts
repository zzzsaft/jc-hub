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
import type { AnalysisPlanJoinKeyFilterTuple } from "../../../modules/erpSqlAgent/planner/types/SqlPlannerTypes.js";

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
      const anchors = step.dependsOn.length > 0 ? anchorsFrom(upstream.get("sales_growth")) : [];
      if (step.dependsOn.length > 0 && anchors.length === 0) {
        return emptyStep(step, "skipped", "no_anchor_entities");
      }
      return input.executeStep({
        question: stepQuestion(step),
        step,
        analysisPlan: narrowPlan(step, anchors, input.analysisPlan),
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

function narrowPlan(step: ComplexQueryStep, anchors: AnalysisPlanJoinKeyFilterTuple[], sourcePlan: AnalysisPlan): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    grain: ["product"],
    metrics: step.metrics,
    requiredMetrics: step.metrics,
    filters: [],
    dimensions: ["product"],
    orderBy: [],
    limit: step.limit,
    ...(step.timeRange && step.id !== "sales_growth" ? { timeRange: step.timeRange } : {}),
    ...(step.timeGrain ? { timeGrain: step.timeGrain } : {}),
    ...(step.id === "sales_growth" ? { calculation: "sales_growth" as const } : {}),
    ...(step.id === "sales_growth" ? { completeMonthCount: 3 as const } : {}),
    ...(step.id === "sales_growth" ? { assumptions: ["最近3个月按最近三个完整自然月计算；边界月无销售行按销售额 0。"] } : {}),
    ...(step.id === "sales_growth" && sourcePlan.dimensionFilters?.product
      ? { dimensionFilters: { product: sourcePlan.dimensionFilters.product } }
      : {}),
    ...(anchors.length > 0 ? { joinKeyFilterTuples: anchors } : {}),
  };
}

function anchorsFrom(result: ComplexQueryStepResult | undefined): AnalysisPlanJoinKeyFilterTuple[] {
  if (!result || !["completed", "partial"].includes(result.status)) return [];
  const companyIndex = result.fields.indexOf("Company");
  const productIndex = result.fields.indexOf("product");
  if (companyIndex < 0 || productIndex < 0) return [];
  const unique = new Map<string, AnalysisPlanJoinKeyFilterTuple>();
  for (const row of result.rows) {
    const Company = row[companyIndex];
    const product = row[productIndex];
    if (typeof Company !== "string" || Company.trim() === "" || typeof product !== "string" || product.trim() === "") continue;
    const tuple = { Company: Company.trim(), product: product.trim() };
    unique.set(`${tuple.Company}\u0000${tuple.product}`, tuple);
  }
  return [...unique.values()];
}

export function complexStepStatus(
  execution: { valid: boolean; executed: boolean; truncated: boolean },
  semanticStatus: ComplexQueryStepResult["semanticStatus"],
): ComplexQueryStepResult["status"] {
  if (!execution.valid || !execution.executed || semanticStatus === "semantic_mismatch") return "failed";
  return execution.truncated || semanticStatus === "estimate" ? "partial" : "completed";
}

function stepQuestion(step: ComplexQueryStep): string {
  if (step.id === "sales_growth") return "按产品查询最近3个月销售额月度趋势";
  if (step.id === "inventory") return "查询选定产品的当前库存现存量";
  return "查询选定产品的当前未交付数量和金额";
}

function emptyStep(step: ComplexQueryStep, status: "skipped", error: string): ComplexQueryStepResult {
  return { id: step.id, status, fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error };
}
