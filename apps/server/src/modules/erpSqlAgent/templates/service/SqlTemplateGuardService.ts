import { sqlGuardService, type SqlGuardResult } from "../../sqlGuard/index.js";
import { maskSqlLiteralsAndComments } from "../../sqlGuard/utils/sqlText.js";
import type { SqlTemplateParamMap, TemplateGuardResult } from "../types/SqlTemplateTypes.js";
import type { AnalysisPlan } from "../../planner/index.js";

const FINE_REPORT_PARAM_PATTERN = /\$\{\s*[^}]+?\s*\}/u;
const CONCAT_PARAM_PATTERN = /(\+\s*[@:]?\w+\s*\+)|(["']\s*\+\s*\w+)|(\w+\s*\+\s*["'])/u;

export class SqlTemplateGuardService {
  constructor(private readonly guard: { validate(sql: string): Promise<SqlGuardResult> } = sqlGuardService) {}

  async validate(sql: string, requiredParams: SqlTemplateParamMap = {}): Promise<TemplateGuardResult> {
    const errors: string[] = [];
    const masked = maskSqlLiteralsAndComments(sql);
    if (FINE_REPORT_PARAM_PATTERN.test(sql)) errors.push("FineReport ${...} parameters are not allowed in reusable templates.");
    if (CONCAT_PARAM_PATTERN.test(masked)) errors.push("String concatenation parameters are not allowed in reusable templates.");

    for (const paramName of Object.keys(requiredParams)) {
      if (!new RegExp(`@${escapeRegExp(paramName)}\\b`, "u").test(sql)) {
        errors.push(`Required param is not bound in sql_template: ${paramName}.`);
      }
    }

    const guardResult = await this.guard.validate(sql);
    const mergedErrors = [...errors, ...guardResult.errors];
    return {
      ...guardResult,
      valid: mergedErrors.length === 0,
      guardPassed: mergedErrors.length === 0,
      errors: [...new Set(mergedErrors)],
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const DIMENSION_FILTER_SLOTS: Record<string, string> = {
  customer: "customerName",
  order: "orderNum",
  supplier: "vendorName",
  product: "partNum",
  warehouse: "warehouseCode",
  job: "jobNum",
};

export function templateCoversPlan(
  coveredFilterSlots: string[],
  plan: AnalysisPlan | undefined,
): boolean {
  const covered = new Set(coveredFilterSlots);
  return Object.keys(plan?.dimensionFilters ?? {}).every((dimension) => covered.has(DIMENSION_FILTER_SLOTS[dimension] ?? dimension));
}

export const sqlTemplateGuardService = new SqlTemplateGuardService();
