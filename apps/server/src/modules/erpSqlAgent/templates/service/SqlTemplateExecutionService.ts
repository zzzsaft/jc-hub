import { getErpSqlQueryClient, type ErpSqlQueryValue } from "../../query/index.js";
import type { SqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import type { SqlTemplateParamMap, TemplateExecutionInput, TemplateExecutionResult } from "../types/SqlTemplateTypes.js";
import { auditHash, protectBindingParams } from "../../../../ai/audit/dataProtection.js";
import { applyErpSqlAccessScope, assertCompanyPredicatesWithinScope, assertModuleAllowed, maskSensitiveResult } from "../../access/index.js";
import { sqlRuntimeGuardService, type SqlRuntimeGuardService } from "../../runtimeGuard/index.js";
import { isAbortError, throwIfAborted } from "../../../../lib/abort.js";
import { approvedTemplateKillSwitchReason } from "./templateKillSwitch.js";

type QueryClient = {
  query(options: { sql: string; params?: ErpSqlQueryValue[]; maxRows?: number; signal?: AbortSignal }): Promise<{
    fields: string[];
    rows: unknown[][];
    rowCount: number;
    truncated: boolean;
  }>;
};

export class SqlTemplateExecutionService {
  constructor(
    private readonly repository: Pick<SqlTemplateRepository, "findTemplate" | "recordUse"> = sqlTemplateRepository,
    private readonly queryClient?: QueryClient,
    private readonly requireAccessScope = false,
    private readonly runtimeGuard: Pick<SqlRuntimeGuardService, "validate"> = sqlRuntimeGuardService,
  ) {}

  async execute(input: TemplateExecutionInput): Promise<TemplateExecutionResult> {
    throwIfAborted(input.signal);
    const template = await this.repository.findTemplate(input.templateId);
    throwIfAborted(input.signal);
    if (!template) return empty("", `Template not found: ${input.templateId.toString()}`);
    const killSwitchReason = approvedTemplateKillSwitchReason(template);
    if (killSwitchReason) return this.fail(input.templateId, template.sqlTemplate, killSwitchReason);
    if (!template.approved || template.approvalStatus !== "approved") return this.fail(input.templateId, template.sqlTemplate, "Template is not approved.");
    if (!template.guardPassed) return this.fail(input.templateId, template.sqlTemplate, "Template guard has not passed.");

    const requiredParams = readParamMap(template.requiredParams);
    const optionalParams = readParamMap(template.optionalParams);
    const paramError = validateParams(input.params, requiredParams, optionalParams);
    if (paramError) return this.fail(input.templateId, template.sqlTemplate, paramError);

    try {
      if (this.requireAccessScope && !input.accessScope) throw new Error("ERP_SQL_ACCESS_DENIED: template execution scope is required");
      if (input.accessScope) assertModuleAllowed(input.accessScope, [input.module ?? template.module]);
      const bindingParams = {
        ...input.params,
        authorizedCompanies: input.accessScope?.companies.join(",") ?? null,
      };
      const renderedSql = renderSqlWithParams(template.sqlTemplate, bindingParams, requiredParams, optionalParams);
      if (input.accessScope && input.runtimeContext?.diagnosticBusinessGateBypass) {
        assertCompanyPredicatesWithinScope(renderedSql, input.accessScope);
      }
      const scopedSql = input.accessScope ? applyErpSqlAccessScope(renderedSql, input.accessScope) : renderedSql;
      const familyId = String(template.sourceFamilyId ?? template.sourceDatasetId ?? template.id);
      const reference = {
        familyId,
        businessDescription: template.name,
        coreTables: readStringArray(template.tables),
        joins: readStringArray(template.joins),
        exampleSql: scopedSql,
        sourceType: "template" as const,
      };
      const runtimeResult = await this.runtimeGuard.validate({
        question: input.runtimeContext?.question ?? template.normalizedQuestion ?? template.questionPattern ?? template.name,
        sql: scopedSql,
        source: "template",
        scenario: "template",
        references: [reference],
        queryPlan: input.runtimeContext?.queryPlan,
        analysisPlan: input.runtimeContext?.analysisPlan,
        financeMode: input.runtimeContext?.financeMode,
        lowConfidence: input.runtimeContext?.lowConfidence,
        diagnosticBusinessGateBypass: input.runtimeContext?.diagnosticBusinessGateBypass,
        diagnosticRequiredCoverage: input.runtimeContext?.diagnosticRequiredCoverage,
        guardOptions: {
          module: input.module ?? template.module,
          signal: input.signal,
        },
      });
      if (!runtimeResult.valid) {
        await this.repository.recordUse(input.templateId, false);
        return empty("", runtimeResult.guardResult.errors.join("; ") || "SQL runtime guard rejected template.", false, {
          candidateSql: scopedSql,
          guardResult: runtimeResult.guardResult,
          semanticResult: runtimeResult.semanticResult,
        });
      }
      if (input.dryRun) {
        return {
          executed: false,
          valid: true,
          sql: scopedSql,
          fields: [],
          rows: [],
          rowCount: 0,
          truncated: false,
          warnings: ["SQL template was selected but not executed in dry-run mode."],
          guardResult: runtimeResult.guardResult,
          semanticResult: runtimeResult.semanticResult,
          audit: {
            renderedSqlHash: auditHash(scopedSql),
            templateId: input.templateId.toString(),
            bindingParams: protectBindingParams(input.params),
          },
        };
      }
      const result = await (this.queryClient ?? getErpSqlQueryClient()).query({
        sql: scopedSql,
        maxRows: input.maxRows,
        signal: input.signal,
      });
      throwIfAborted(input.signal);
      const masked = input.accessScope
        ? maskSensitiveResult({ fields: result.fields, rows: result.rows, scope: input.accessScope })
        : { rows: result.rows, warnings: [], auditReasons: [] };
      await this.repository.recordUse(input.templateId, true);
      return {
        ...result,
        executed: true,
        valid: true,
        rows: masked.rows,
        sql: scopedSql,
        warnings: masked.warnings,
        auditReasons: [...(input.accessScope?.auditReasons ?? []), ...masked.auditReasons],
        guardResult: runtimeResult.guardResult,
        semanticResult: runtimeResult.semanticResult,
        audit: {
          renderedSqlHash: auditHash(scopedSql),
          templateId: input.templateId.toString(),
          bindingParams: protectBindingParams(input.params),
        },
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      await this.repository.recordUse(input.templateId, false);
      return empty("", error instanceof Error ? error.message : String(error), true);
    }
  }

  private async fail(templateId: bigint, sql: string, error: string): Promise<TemplateExecutionResult> {
    await this.repository.recordUse(templateId, false);
    return empty("", error);
  }
}

function validateParams(
  values: Record<string, ErpSqlQueryValue>,
  required: SqlTemplateParamMap,
  optional: SqlTemplateParamMap,
): string | undefined {
  for (const [name, spec] of Object.entries(required)) {
    if (!(name in values) || values[name] === null || values[name] === "") return `Missing required param: ${name}.`;
    const error = validateOne(name, values[name], spec.type);
    if (error) return error;
  }
  for (const [name, spec] of Object.entries(optional)) {
    if (name in values && values[name] !== null) {
      const error = validateOne(name, values[name], spec.type);
      if (error) return error;
    }
  }
  return undefined;
}

function validateOne(name: string, value: ErpSqlQueryValue | undefined, type?: string): string | undefined {
  if (!type || value === undefined || value === null) return undefined;
  if (type === "string" && typeof value !== "string") return `Param ${name} must be a string.`;
  if (type === "number" && typeof value !== "number") return `Param ${name} must be a number.`;
  if (type === "boolean" && typeof value !== "boolean") return `Param ${name} must be a boolean.`;
  return undefined;
}

function renderSqlWithParams(
  sql: string,
  values: Record<string, ErpSqlQueryValue>,
  required: SqlTemplateParamMap,
  optional: SqlTemplateParamMap,
): string {
  let rendered = sql;
  for (const [name, spec] of [...Object.entries(required), ...Object.entries(optional)]) {
    const value = values[name] ?? defaultOptionalValue(spec.type);
    rendered = rendered.replace(new RegExp(`@${escapeRegExp(name)}\\b`, "gu"), sqlLiteral(value, spec.type));
  }
  return rendered;
}

function readParamMap(value: unknown): SqlTemplateParamMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SqlTemplateParamMap : {};
}

function defaultOptionalValue(type?: string): ErpSqlQueryValue {
  return type === "boolean" ? false : null;
}

function sqlLiteral(value: ErpSqlQueryValue, type?: string): string {
  if (value === null) return "NULL";
  if (type === "number") return String(value);
  if (type === "boolean") return value ? "1" : "0";
  return `N'${String(value).replace(/'/gu, "''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function empty(
  sql: string,
  error: string,
  executed = false,
  extra: Pick<TemplateExecutionResult, "candidateSql" | "guardResult" | "semanticResult"> = {},
): TemplateExecutionResult {
  return {
    executed,
    valid: false,
    sql,
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error,
    ...extra,
  };
}

export const sqlTemplateExecutionService = new SqlTemplateExecutionService(undefined, undefined, true);
