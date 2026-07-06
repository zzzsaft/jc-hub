import fs from "node:fs/promises";
import path from "node:path";
import { ErpSqlQueryError, getErpSqlQueryClient, type ErpSqlQueryResult } from "../../query/index.js";

type QueryClient = {
  query(options: { sql: string; maxRows?: number }): Promise<ErpSqlQueryResult>;
};

type ReviewJson = {
  templateDrafts?: TemplateDraft[];
};

type TemplateDraft = {
  familyId: string;
  name: string;
  intent: string;
  sqlTemplate: string;
  requiredParams?: string[];
  optionalParams?: string[];
};

type ParsedColumn = {
  table: string;
  column: string;
  alias: string;
  exists?: boolean;
  dataType?: string | null;
  suggestions?: string[];
};

type TemplateValidation = {
  familyId: string;
  name: string;
  intent: string;
  parsed: {
    tables: Array<{ schema: string; table: string; alias: string }>;
    columns: ParsedColumn[];
    parameterNames: string[];
  };
  schemaValidation: {
    status: "pass" | "fail" | "warning";
    missingColumns: ParsedColumn[];
    existingColumns: ParsedColumn[];
    suggestions: Array<{ table: string; column: string; suggestions: string[] }>;
    errors?: string[];
  };
  compileValidation: {
    status: "pass" | "fail" | "skipped";
    error: string | null;
    familyId?: string;
    templateName?: string;
    compileStatus?: "pass" | "fail" | "skipped";
    rawExecutorStatusCode?: number | null;
    rawExecutorErrorMessage?: string | null;
    rawExecutorResponseBody?: unknown;
    sqlServerErrorNumber?: number | null;
    sqlServerErrorState?: number | null;
    sqlServerErrorLine?: number | null;
    sqlServerErrorProcedure?: string | null;
    sqlServerErrorServerName?: string | null;
    expandedCompileSql?: string;
    parameterSubstitutions?: Record<string, string>;
    validationMode?: string;
  };
  sampleValidation: {
    status: "pass" | "fail" | "skipped";
    rowCount: number;
    columns: string[];
    error?: string;
  };
  recommendation: "ready_for_draft_apply" | "needs_template_fix" | "needs_schema_mapping" | "keep_as_reference_only";
  notes: string[];
};

export type SqlTemplateDraftValidationOptions = {
  reviewJsonPath: string;
  company: string;
  sample?: boolean;
  sampleLimit?: number;
};

export type SqlTemplateDraftValidationReport = {
  summary: {
    templateCount: number;
    schemaPassCount: number;
    compilePassCount: number;
    samplePassCount: number;
    failedCount: number;
  };
  templates: TemplateValidation[];
};

const BANNED_SQL_PATTERN = /\b(DECLARE|EXEC|EXECUTE|DROP|CREATE|INSERT|UPDATE|DELETE|MERGE|ALTER|TRUNCATE)\b|SELECT\s+INTO\s+#/iu;
const TABLE_PATTERN = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\s+(?:AS\s+)?([A-Za-z_][\w]*)/giu;
const COLUMN_REF_PATTERN = /\b([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\b/gu;
const PARAM_PATTERN = /@([A-Za-z_][\w]*)/gu;
const FOCUS_COLUMNS = [
  ["Erp.Warehse", "Name"],
  ["Erp.Warehse", "Description"],
  ["Erp.PartBin", "OnhandQty"],
  ["Erp.PartBin", "OnHandQty"],
  ["Erp.PORel", "XRelQty"],
  ["Erp.PORel", "PromiseDt"],
  ["Erp.PODetail", "XOrderQty"],
  ["Erp.RcvDtl", "OurQty"],
  ["Erp.JobMtl", "MtlPartNum"],
  ["Erp.JobMtl", "PartNum"],
  ["Erp.OrderRel", "OurReqQty"],
  ["Erp.OrderRel", "OpenRelease"],
  ["Erp.OrderRel", "ReqDate"],
  ["Erp.OrderDtl", "DocExtPriceDtl"],
  ["Erp.OrderDtl", "OpenLine"],
] as const;

export class SqlTemplateDraftValidationService {
  constructor(private readonly queryClient?: QueryClient) {}

  async validate(options: SqlTemplateDraftValidationOptions): Promise<SqlTemplateDraftValidationReport> {
    const review = await readJson<ReviewJson>(options.reviewJsonPath, "review json");
    const drafts = review.templateDrafts ?? [];
    const templates: TemplateValidation[] = [];
    for (const draft of drafts) templates.push(await this.validateTemplate(draft, options));
    return {
      summary: {
        templateCount: templates.length,
        schemaPassCount: templates.filter((item) => item.schemaValidation.status === "pass").length,
        compilePassCount: templates.filter((item) => item.compileValidation.status === "pass").length,
        samplePassCount: templates.filter((item) => item.sampleValidation.status === "pass").length,
        failedCount: templates.filter((item) =>
          item.schemaValidation.status === "fail" || item.compileValidation.status === "fail" || item.sampleValidation.status === "fail",
        ).length,
      },
      templates,
    };
  }

  private async validateTemplate(draft: TemplateDraft, options: SqlTemplateDraftValidationOptions): Promise<TemplateValidation> {
    const parsed = withFocusColumns(parseTemplateSql(draft.sqlTemplate), draft.sqlTemplate);
    const notes: string[] = [];
    if (BANNED_SQL_PATTERN.test(draft.sqlTemplate) || !/^\s*SELECT\b/iu.test(draft.sqlTemplate)) {
      notes.push("Template failed local SELECT-only safety check; compile/sample skipped.");
    }

    const schemaValidation = await this.validateSchema(parsed.columns);
    const { sql: safeSql, substitutions } = substituteTemplateParams(draft.sqlTemplate, options.company);
    const compileValidation = notes.length
      ? { status: "skipped" as const, error: "Local safety check failed." }
      : await this.compile(draft, safeSql, substitutions);
    const sampleValidation = options.sample && !notes.length
      ? await this.sample(safeSql, options.sampleLimit ?? 10)
      : { status: "skipped" as const, rowCount: 0, columns: [] };

    return {
      familyId: draft.familyId,
      name: draft.name,
      intent: draft.intent,
      parsed,
      schemaValidation,
      compileValidation,
      sampleValidation,
      recommendation: recommend(schemaValidation.status, compileValidation.status, sampleValidation.status),
      notes,
    };
  }

  private async validateSchema(columns: ParsedColumn[]): Promise<TemplateValidation["schemaValidation"]> {
    const columnsByTable = new Map<string, Map<string, string>>();
    for (const table of new Set(columns.map((column) => column.table))) {
      const [schemaName, tableName] = table.split(".");
      try {
        const result = await this.client().query({
          sql: `
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = '${sqlString(schemaName ?? "")}'
  AND TABLE_NAME = '${sqlString(tableName ?? "")}'
ORDER BY ORDINAL_POSITION`,
          maxRows: 2000,
        });
        columnsByTable.set(table, new Map(result.rows.map((row) => [String(row[0]).toLowerCase(), String(row[1])])));
      } catch (error) {
        return {
          status: "fail",
          missingColumns: [],
          existingColumns: [],
          suggestions: [],
          errors: [`Metadata query failed for ${table}: ${error instanceof Error ? error.message : String(error)}`],
        };
      }
    }

    const existingColumns: ParsedColumn[] = [];
    const missingColumns: ParsedColumn[] = [];
    const suggestions: Array<{ table: string; column: string; suggestions: string[] }> = [];
    for (const column of columns) {
      const tableColumns = columnsByTable.get(column.table) ?? new Map();
      const dataType = tableColumns.get(column.column.toLowerCase()) ?? null;
      if (dataType) {
        existingColumns.push({ ...column, exists: true, dataType, suggestions: [] });
      } else {
        const close = suggestColumns(column.column, [...tableColumns.keys()]);
        missingColumns.push({ ...column, exists: false, dataType: null, suggestions: close });
        suggestions.push({ table: column.table, column: column.column, suggestions: close });
      }
    }

    return {
      status: missingColumns.length === 0 ? "pass" : existingColumns.length > 0 ? "warning" : "fail",
      missingColumns,
      existingColumns,
      suggestions,
    };
  }

  private async compile(
    draft: TemplateDraft,
    sql: string,
    parameterSubstitutions: Record<string, string>,
  ): Promise<TemplateValidation["compileValidation"]> {
    const expandedCompileSql = `SELECT TOP 0 * FROM (\n${sql}\n) AS draft_validate`;
    try {
      await this.client().query({ sql: expandedCompileSql, maxRows: 1 });
      return {
        status: "pass",
        error: null,
        familyId: draft.familyId,
        templateName: draft.name,
        compileStatus: "pass",
        rawExecutorStatusCode: null,
        rawExecutorErrorMessage: null,
        expandedCompileSql,
        parameterSubstitutions,
        validationMode: "compile_top_0_wrapped_select",
      };
    } catch (error) {
      const debug = executorErrorDebug(error);
      return {
        status: "fail",
        error: debug.rawExecutorErrorMessage,
        familyId: draft.familyId,
        templateName: draft.name,
        compileStatus: "fail",
        ...debug,
        expandedCompileSql,
        parameterSubstitutions,
        validationMode: "compile_top_0_wrapped_select",
      };
    }
  }

  private async sample(sql: string, limit: number): Promise<TemplateValidation["sampleValidation"]> {
    try {
      const result = await this.client().query({ sql: `SELECT TOP ${Math.max(1, Math.min(limit, 100))} * FROM (\n${sql}\n) draft_sample`, maxRows: limit });
      return { status: "pass", rowCount: result.rowCount, columns: result.fields.slice(0, 20) };
    } catch (error) {
      return { status: "fail", rowCount: 0, columns: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private client(): QueryClient {
    return this.queryClient ?? getErpSqlQueryClient();
  }
}

export const sqlTemplateDraftValidationService = new SqlTemplateDraftValidationService();

export async function writeSqlTemplateDraftValidationOutputs(
  report: SqlTemplateDraftValidationReport,
  options: { out: string; mdOut?: string },
): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await fs.writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (options.mdOut) {
    await fs.mkdir(path.dirname(path.resolve(options.mdOut)), { recursive: true });
    await fs.writeFile(options.mdOut, renderValidationMarkdown(report), "utf8");
  }
}

export function parseTemplateSql(sql: string): TemplateValidation["parsed"] {
  const aliasToTable = new Map<string, { schema: string; table: string; alias: string }>();
  for (const match of sql.matchAll(TABLE_PATTERN)) {
    const [, schemaName, tableName, alias] = match;
    if (schemaName && tableName && alias) aliasToTable.set(alias, { schema: schemaName, table: tableName, alias });
  }

  const seen = new Set<string>();
  const columns: ParsedColumn[] = [];
  for (const match of sql.matchAll(COLUMN_REF_PATTERN)) {
    const [, alias, column] = match;
    const table = alias ? aliasToTable.get(alias) : undefined;
    if (!table || !column) continue;
    const key = `${table.schema}.${table.table}.${column}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push({ table: `${table.schema}.${table.table}`, column, alias });
  }

  return {
    tables: [...aliasToTable.values()],
    columns,
    parameterNames: [...new Set([...sql.matchAll(PARAM_PATTERN)].map((match) => match[1]).filter((item): item is string => Boolean(item)))],
  };
}

function withFocusColumns(parsed: TemplateValidation["parsed"], sql: string): TemplateValidation["parsed"] {
  const columns = [...parsed.columns];
  const seen = new Set(columns.map((column) => `${column.table}.${column.column}`.toLowerCase()));
  const lowerSql = sql.toLowerCase();
  for (const [table, column] of FOCUS_COLUMNS) {
    if (!lowerSql.includes(table.toLowerCase()) || !new RegExp(`\\b${escapeRegExp(column)}\\b`, "iu").test(sql) || seen.has(`${table}.${column}`.toLowerCase())) continue;
    columns.push({ table, column, alias: "focus" });
    seen.add(`${table}.${column}`.toLowerCase());
  }
  return { ...parsed, columns };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function replaceTemplateParams(sql: string, company: string): string {
  return substituteTemplateParams(sql, company).sql;
}

export function substituteTemplateParams(sql: string, company: string): { sql: string; substitutions: Record<string, string> } {
  const substitutions: Record<string, string> = {};
  const substitutedSql = sql.replace(PARAM_PATTERN, (_match, name: string) => {
    const key = `@${name}`;
    const value = /^company(scope)?$/iu.test(name) ? `'${sqlString(company)}'` : /^only[A-Z_]/u.test(name) ? "0" : "NULL";
    substitutions[key] = value;
    return value;
  });
  return { sql: substitutedSql, substitutions };
}

function renderValidationMarkdown(report: SqlTemplateDraftValidationReport): string {
  const missing = report.templates.flatMap((template) =>
    template.schemaValidation.missingColumns.map((column) => `- ${template.familyId} ${column.table}.${column.column}: ${(column.suggestions ?? []).join(", ") || "no suggestion"}`),
  );
  return `${[
    "# SQL Template Draft Validation",
    "",
    "## Summary",
    "",
    `- templateCount: ${report.summary.templateCount}`,
    `- schemaPassCount: ${report.summary.schemaPassCount}`,
    `- compilePassCount: ${report.summary.compilePassCount}`,
    `- samplePassCount: ${report.summary.samplePassCount}`,
    `- failedCount: ${report.summary.failedCount}`,
    "",
    "## Templates",
    "",
    ...report.templates.flatMap((template) => [
      `### ${template.familyId} - ${template.name}`,
      "",
      `- schema: ${template.schemaValidation.status}`,
      `- compile: ${template.compileValidation.status}${template.compileValidation.error ? ` - ${template.compileValidation.error}` : ""}`,
      `- sample: ${template.sampleValidation.status}`,
      `- recommendation: ${template.recommendation}`,
      "",
      "Missing columns:",
      "",
      ...(template.schemaValidation.missingColumns.length
        ? template.schemaValidation.missingColumns.map((column) => `- ${column.table}.${column.column}: ${(column.suggestions ?? []).join(", ") || "no suggestion"}`)
        : ["- none"]),
      ...(template.schemaValidation.errors?.length ? ["", "Schema errors:", "", ...template.schemaValidation.errors.map((error) => `- ${error}`)] : []),
      ...(template.compileValidation.status === "fail" ? renderCompileDebug(template) : []),
      "",
    ]),
    "## Missing Columns",
    "",
    ...(missing.length ? missing : ["- none"]),
    "",
    "## Suggested Fixes",
    "",
    "- Fix templates only after checking missing columns and compile errors against ERP schema.",
    "- Keep failed templates as draft/reference until schema mapping is resolved.",
    "",
  ].join("\n")}\n`;
}

function renderCompileDebug(template: TemplateValidation): string[] {
  return [
    "",
    "Compile debug:",
    "",
    `- familyId: ${template.compileValidation.familyId ?? template.familyId}`,
    `- templateName: ${template.compileValidation.templateName ?? template.name}`,
    `- compileStatus: ${template.compileValidation.compileStatus ?? template.compileValidation.status}`,
    `- rawExecutorStatusCode: ${template.compileValidation.rawExecutorStatusCode ?? ""}`,
    `- rawExecutorErrorMessage: ${template.compileValidation.rawExecutorErrorMessage ?? ""}`,
    `- sqlServerErrorNumber: ${template.compileValidation.sqlServerErrorNumber ?? ""}`,
    `- sqlServerErrorState: ${template.compileValidation.sqlServerErrorState ?? ""}`,
    `- sqlServerErrorLine: ${template.compileValidation.sqlServerErrorLine ?? ""}`,
    `- sqlServerErrorProcedure: ${template.compileValidation.sqlServerErrorProcedure ?? ""}`,
    `- sqlServerErrorServerName: ${template.compileValidation.sqlServerErrorServerName ?? ""}`,
    `- validationMode: ${template.compileValidation.validationMode ?? ""}`,
    `- rawExecutorResponseBody: ${JSON.stringify(template.compileValidation.rawExecutorResponseBody ?? null)}`,
    "",
    "parameterSubstitutions:",
    "",
    "```json",
    JSON.stringify(template.compileValidation.parameterSubstitutions ?? {}, null, 2),
    "```",
    "",
    "expandedCompileSql:",
    "",
    "```sql",
    template.compileValidation.expandedCompileSql ?? "",
    "```",
    "",
  ];
}

function recommend(
  schemaStatus: TemplateValidation["schemaValidation"]["status"],
  compileStatus: TemplateValidation["compileValidation"]["status"],
  sampleStatus: TemplateValidation["sampleValidation"]["status"],
): TemplateValidation["recommendation"] {
  if (schemaStatus === "fail") return "needs_schema_mapping";
  if (schemaStatus === "warning") return "needs_schema_mapping";
  if (compileStatus === "fail") return "needs_template_fix";
  if (sampleStatus === "fail") return "needs_template_fix";
  return "ready_for_draft_apply";
}

function suggestColumns(column: string, candidates: string[]): string[] {
  return candidates
    .map((candidate) => ({ candidate, score: editDistance(column.toLowerCase(), candidate.toLowerCase()) }))
    .filter((item) => item.score <= Math.max(3, Math.ceil(column.length / 2)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, 5)
    .map((item) => item.candidate);
}

function executorErrorDebug(error: unknown): {
  rawExecutorStatusCode: number | null;
  rawExecutorErrorMessage: string;
  rawExecutorResponseBody?: unknown;
  sqlServerErrorNumber: number | null;
  sqlServerErrorState: number | null;
  sqlServerErrorLine: number | null;
  sqlServerErrorProcedure: string | null;
  sqlServerErrorServerName: string | null;
} {
  const responseBody = error instanceof ErpSqlQueryError ? error.responseBody : undefined;
  const sqlServer = findSqlServerError(responseBody);
  return {
    rawExecutorStatusCode: error instanceof ErpSqlQueryError ? error.statusCode : null,
    rawExecutorErrorMessage: error instanceof Error ? error.message : String(error),
    rawExecutorResponseBody: responseBody,
    sqlServerErrorNumber: readNumber(sqlServer, ["number", "code"]),
    sqlServerErrorState: readNumber(sqlServer, ["state"]),
    sqlServerErrorLine: readNumber(sqlServer, ["lineNumber", "line", "line_number"]),
    sqlServerErrorProcedure: readString(sqlServer, ["procedure", "procName"]),
    sqlServerErrorServerName: readString(sqlServer, ["serverName", "server"]),
  };
}

function findSqlServerError(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (["number", "lineNumber", "state", "procedure", "serverName"].some((key) => key in object)) return object;
  for (const key of ["sqlServerError", "sqlError", "originalError", "cause", "error", "details"]) {
    const found = findSqlServerError(object[key]);
    if (found) return found;
  }
  return undefined;
}

function readNumber(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of keys) {
    const item = object[key];
    if (typeof item === "number") return item;
    if (typeof item === "string" && /^-?\d+$/u.test(item)) return Number(item);
  }
  return null;
}

function readString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of keys) {
    const item = object[key];
    if (typeof item === "string" && item.trim()) return item;
  }
  return null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let j = 1; j <= b.length; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function sqlString(value: string): string {
  return value.replace(/'/gu, "''");
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing ${label} file: ${filePath}`);
    throw new Error(`Invalid ${label} file: ${filePath}`);
  }
}
