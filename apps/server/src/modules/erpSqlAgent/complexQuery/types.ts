import type { AnalysisPlanTimeRange } from "../planner/index.js";

export type ComplexQueryStepId = "sales_growth" | "inventory" | "backlog";
export type ComplexQueryStepStatus = "completed" | "partial" | "clarification_required" | "unsupported" | "failed" | "skipped";

export type ComplexQueryStep = {
  id: ComplexQueryStepId;
  capabilityCode: string;
  metrics: string[];
  dimensions: ["product"];
  dependsOn: ComplexQueryStepId[];
  inputFrom?: { stepId: "sales_growth"; keys: ["Company", "product"] };
  timeRange?: AnalysisPlanTimeRange;
  timeGrain?: "month";
  limit: number;
};

export type ComplexQueryPlan = {
  scenario: "product_sales_inventory_backlog_trend";
  objective: string;
  entityGrain: ["Company", "product"];
  steps: ComplexQueryStep[];
  joinPolicy: { keys: ["Company", "product"]; allowNameBasedJoin: false };
  budget: { maxQueries: 5; maxRowsPerQuery: 500; timeoutMs: 30_000 };
};

export type ComplexQueryPlanResult =
  | { ok: true; plan: ComplexQueryPlan }
  | { ok: false; reason: "unsupported_complex_scenario" | "missing_complex_coverage" | "invalid_complex_plan" };
