import type { QueryPlan } from "../../planner/index.js";
import type { FinanceSqlMode, SqlGuardOptions, SqlGuardResult } from "../../sqlGuard/index.js";

export type SqlGeneratorGuard = {
  validate(sql: string, options?: SqlGuardOptions): Promise<SqlGuardResult>;
};

export type SqlGeneratorSource = "rule" | "llm" | "template";

export type SqlPlanFilter = {
  table?: string;
  field?: string;
  expression: string;
};

export type SqlPlanMetric = {
  expression: string;
  alias: string;
};

export type SqlPlanOrderBy = {
  expression: string;
  direction?: "ASC" | "DESC";
};

export type SqlReferenceHint = {
  familyId: string;
  businessDescription: string;
  coreTables: string[];
  joins: string[];
  exampleSql?: string;
  metricCode?: string;
  metricName?: string;
  calculationSummary?: string;
  definitionJson?: unknown;
  datasetId?: string;
  reportName?: string;
  datasetName?: string;
  fields?: string[];
  metrics?: string[];
  questionText?: string;
  timeScope?: string;
  businessScenario?: string;
  isFinance?: boolean;
  verified?: boolean;
  sqlPreview?: string;
  sourceType?: "dataset" | "family" | "metric" | "template";
  score?: number;
  matchedSignals?: string[];
};

export type SqlGeneratorPlan = QueryPlan & {
  statusFilters?: SqlPlanFilter[];
  keywordFilters?: SqlPlanFilter[];
  groupBy?: string[];
  orderBy?: SqlPlanOrderBy[];
  metrics?: SqlPlanMetric[];
  references?: SqlReferenceHint[];
  financeMode?: FinanceSqlMode;
};

export interface SqlGenerationResult {
  valid: boolean;
  source?: SqlGeneratorSource;
  scenario?: string;
  sql: string;
  intent: string;
  tables: string[];
  joins: string[];
  filters: string[];
  assumptions: string[];
  warnings: string[];
  guardResult: SqlGuardResult;
  references?: SqlReferenceHint[];
}
