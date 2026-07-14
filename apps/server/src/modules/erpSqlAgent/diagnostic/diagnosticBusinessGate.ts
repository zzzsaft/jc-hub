import type { ErpSqlAccessScope } from "../access/index.js";
import type { AnalysisPlan } from "../planner/index.js";

export const DIAGNOSTIC_ALL_BUSINESS_GATES_WARNING = "diagnostic_all_business_gates_bypassed";
export const DIAGNOSTIC_PLAN_NORMALIZED_WARNING = "diagnostic_plan_normalized";
export const DIAGNOSTIC_LLM_SQL_FALLBACK_WARNING = "diagnostic_llm_sql_fallback";

export function isAllBusinessGatesDiagnosticEnabled(): boolean {
  return process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES === "true";
}

export function qualifiesForAllBusinessGatesDiagnostic(
  plan: AnalysisPlan | undefined,
  scope: ErpSqlAccessScope,
): boolean {
  const metrics = new Set([...(plan?.metrics ?? []), ...(plan?.requiredMetrics ?? [])]);
  return isAllBusinessGatesDiagnosticEnabled()
    && Boolean(plan?.route === "complex_composed" || metrics.size >= 2)
    && scope.modules.includes("finance")
    && scope.sensitive.finance === "full";
}
