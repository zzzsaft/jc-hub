import type { SqlReferenceHint } from "../../generator/index.js";
import type { AnalysisPlan, QueryPlan } from "../../planner/index.js";
import type { FinanceSqlMode, SqlGuardOptions, SqlGuardResult } from "../../sqlGuard/index.js";

export type SqlSemanticStatus = "exact" | "estimate" | "semantic_mismatch";

export type SqlSemanticGuardResult = {
  valid: boolean;
  status: SqlSemanticStatus;
  errors: string[];
  expectedFamilyGroups: string[][];
  expectedFamilyIds: string[];
  actualFamilyIds: string[];
  expectedMetricCodes: string[];
  actualMetricCodes: string[];
};

export type SqlRuntimeGuardInput = {
  question: string;
  sql: string;
  source?: string;
  scenario?: string;
  references?: SqlReferenceHint[];
  queryPlan?: QueryPlan;
  analysisPlan?: AnalysisPlan;
  financeMode?: FinanceSqlMode;
  guardOptions?: SqlGuardOptions;
  lowConfidence?: boolean;
};

export type SqlRuntimeGuardResult = {
  valid: boolean;
  sql: string;
  candidateSql: string;
  guardResult: SqlGuardResult;
  semanticResult: SqlSemanticGuardResult;
};
