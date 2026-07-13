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
  resultLimit: number;
  entityGrain: ["Company", "product"];
  steps: ComplexQueryStep[];
  joinPolicy: { keys: ["Company", "product"]; allowNameBasedJoin: false };
  budget: { maxQueries: 5; maxRowsPerQuery: 500; timeoutMs: 30_000 };
};

export type ComplexQueryPlanResult =
  | { ok: true; plan: ComplexQueryPlan }
  | { ok: false; reason: "unsupported_complex_scenario" | "missing_complex_coverage" | "unsupported_complex_filter" | "invalid_complex_plan" };

export type ComplexQueryStepResult = {
  id: ComplexQueryStepId;
  status: ComplexQueryStepStatus;
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  semanticStatus?: "exact" | "estimate" | "semantic_mismatch";
  error?: string;
};

export type ComplexQueryGraphResult = {
  status: "completed" | "partial" | "failed";
  steps: ComplexQueryStepResult[];
};

export type ComplexQueryJoinCoverage = {
  anchorRows: number;
  matchedRows: number;
  unmatchedRows: number;
  coverageRate: number;
};

export type ComplexQueryComposedResult = {
  status: "completed" | "partial";
  fields: ["Company", "product", "sales_growth_rate", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  joinCoverage: ComplexQueryJoinCoverage;
};

export type ComplexQueryStepRunner = (
  step: ComplexQueryStep,
  upstream: ReadonlyMap<ComplexQueryStepId, ComplexQueryStepResult>,
  signal: AbortSignal,
) => Promise<ComplexQueryStepResult>;
