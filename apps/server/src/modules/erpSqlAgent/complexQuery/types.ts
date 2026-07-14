import type { AnalysisPlan, AnalysisPlanTimeRange } from "../planner/index.js";

export type ComplexQueryStepId = string;
export type ComplexQueryStepStatus = "completed" | "partial" | "clarification_required" | "unsupported" | "failed" | "skipped";

export type ComplexQueryStep = {
  id: ComplexQueryStepId;
  question: string;
  capabilityCode: string;
  module: "sales" | "inventory" | "finance";
  metrics: string[];
  dimensions: string[];
  joinKeys: string[];
  dependsOn: ComplexQueryStepId[];
  timeRange?: AnalysisPlanTimeRange;
  filters: AnalysisPlan["filters"];
  orderBy: AnalysisPlan["orderBy"];
  limit: number;
};

export type ComplexQueryPlan = {
  scenario: string;
  objective: string;
  resultLimit: number;
  entityGrain: string[];
  steps: ComplexQueryStep[];
  joinPolicy: { keys: string[]; allowNameBasedJoin: false };
  budget: { maxQueries: 8; maxRowsPerQuery: 500; timeoutMs: 30_000 };
  diagnostic: boolean;
};

export type ComplexQueryPlanResult =
  | { ok: true; plan: ComplexQueryPlan }
  | { ok: false; reason: "unsupported_complex_scenario" | "missing_complex_coverage" | "unsupported_complex_filter" | "invalid_complex_plan" };

export type ComplexQueryStepResult = {
  id: ComplexQueryStepId;
  status: ComplexQueryStepStatus;
  source?: "template" | "composer" | "llm";
  sqlCount?: 0 | 1;
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
