import type { QueryPlan } from "../../planner/index.js";
import type { SqlGuardResult } from "../../sqlGuard/index.js";

export type SqlGeneratorGuard = {
  validate(sql: string): Promise<SqlGuardResult>;
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

export type SqlGeneratorPlan = QueryPlan & {
  statusFilters?: SqlPlanFilter[];
  keywordFilters?: SqlPlanFilter[];
  groupBy?: string[];
  orderBy?: SqlPlanOrderBy[];
  metrics?: SqlPlanMetric[];
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
}
