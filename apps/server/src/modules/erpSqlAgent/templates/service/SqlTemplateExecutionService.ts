import { getErpSqlQueryClient, type ErpSqlQueryValue } from "../../query/index.js";
import type { SqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import type { SqlTemplateParamMap, TemplateExecutionInput, TemplateExecutionResult } from "../types/SqlTemplateTypes.js";

type QueryClient = {
  query(options: { sql: string; params?: ErpSqlQueryValue[]; maxRows?: number }): Promise<{
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
  ) {}

  async execute(input: TemplateExecutionInput): Promise<TemplateExecutionResult> {
    const template = await this.repository.findTemplate(input.templateId);
    if (!template) return empty("", `Template not found: ${input.templateId.toString()}`);
    if (!template.approved || template.approvalStatus !== "approved") return this.fail(input.templateId, template.sqlTemplate, "Template is not approved.");
    if (!template.guardPassed) return this.fail(input.templateId, template.sqlTemplate, "Template guard has not passed.");

    const requiredParams = readParamMap(template.requiredParams);
    const optionalParams = readParamMap(template.optionalParams);
    const paramError = validateParams(input.params, requiredParams, optionalParams);
    if (paramError) return this.fail(input.templateId, template.sqlTemplate, paramError);

    try {
      const result = await (this.queryClient ?? getErpSqlQueryClient()).query({
        sql: template.sqlTemplate,
        params: bindParams(input.params, requiredParams, optionalParams),
        maxRows: input.maxRows,
      });
      await this.repository.recordUse(input.templateId, true);
      return { ...result, executed: true, valid: true, sql: template.sqlTemplate, warnings: [] };
    } catch (error) {
      await this.repository.recordUse(input.templateId, false);
      return empty(template.sqlTemplate, error instanceof Error ? error.message : String(error), true);
    }
  }

  private async fail(templateId: bigint, sql: string, error: string): Promise<TemplateExecutionResult> {
    await this.repository.recordUse(templateId, false);
    return empty(sql, error);
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

function bindParams(values: Record<string, ErpSqlQueryValue>, required: SqlTemplateParamMap, optional: SqlTemplateParamMap): ErpSqlQueryValue[] {
  return [
    ...Object.keys(required).map((name) => values[name] ?? null),
    ...Object.entries(optional).map(([name, spec]) => values[name] ?? defaultOptionalValue(spec.type)),
  ];
}

function readParamMap(value: unknown): SqlTemplateParamMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SqlTemplateParamMap : {};
}

function defaultOptionalValue(type?: string): ErpSqlQueryValue {
  return type === "boolean" ? false : null;
}

function empty(sql: string, error: string, executed = false): TemplateExecutionResult {
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
  };
}

export const sqlTemplateExecutionService = new SqlTemplateExecutionService();
