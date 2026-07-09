import sqlParser from "node-sql-parser";
import type { AST } from "node-sql-parser";
import { schemaRepository } from "../../schema/index.js";
import type {
  ReferencedField,
  ReferencedTable,
  SqlGuardOptions,
  SqlGuardResult,
  SqlGuardSchemaRepository,
} from "../types/SqlGuardTypes.js";
import {
  hasMultipleSqlStatements,
  maskSqlLiteralsAndComments,
  normalizeIdentifier,
  schemaFieldKey,
  schemaObjectKey,
} from "../utils/sqlText.js";
import { runSqlGuardLimited } from "./sqlGuardConcurrency.js";

type SqlAst = AST | AST[];
type UnknownRecord = Record<string, unknown>;
type TableContext = {
  realTables: ReferencedTable[];
  cteNames: Set<string>;
  aliasToTable: Map<string, ReferencedTable>;
};

const DEFAULT_SCHEMA = "Erp";
const ALLOWED_SCHEMAS = new Set(["erp", "dbo", "ice"]);
const BANNED_KEYWORD_PATTERN =
  /\b(insert|update|delete|merge|drop|truncate|alter|create|exec|execute|call)\b/iu;
const BANNED_RUNTIME_PATTERN = /\b(openrowset|xp_cmdshell|sp_executesql)\b/iu;
const DATE_FIELD_PATTERN = /(date|duedate|needbydate|shipby|requestdate|changedate|createdate|closedate)$/iu;
const DATE_RANGE_LOWER_BOUND_PATTERN = />=\s*'20000101'/iu;
const DATE_RANGE_UPPER_BOUND_PATTERN =
  /<\s*dateadd\s*\(\s*year\s*,\s*1\s*,\s*cast\s*\(\s*getdate\s*\(\s*\)\s+as\s+date\s*\)\s*\)/iu;
const FINANCE_AMOUNT_FIELD_PATTERN = /(amount|amt|cost|price|total|subtotal|debit|credit|balance|tax|doc(?:ext)?cost|docinvoiceamt|invoiceamt|销售金额|采购额|金额|成本|含税|未税)/iu;
const FINANCE_STATUS_FIELD_PATTERN = /(status|posted|open|closed|void|cancel|paid|hold|approved|approval|状态|审核|过账|关闭|付款|作废)/iu;
const FINANCE_DATE_FIELD_PATTERN = /(date|duedate|jedate|invoicedate|applydate|postdate|taxdate|日期|时间)/iu;
const FINANCE_DETAIL_AMOUNT_TABLE_PATTERN = /\bjoin\s+(?:erp\.)?(apinvdtl|invcdtl|gljrndtl|podetail|orderdtl|parttran)\b/iu;
const FINANCE_PREAGG_PATTERN = /(?:with\b[\s\S]*\bgroup\s+by\b[\s\S]*\b(?:invoice|order|po|pack|head|num)\w*|\bjoin\s*\(\s*select[\s\S]*\bgroup\s+by\b[\s\S]*\b(?:invoice|order|po|pack|head|num)\w*)/iu;
const FINANCE_SCOPE_ALIASES = ["时间字段", "金额字段", "状态过滤", "税退款口径"];
const { Parser } = sqlParser;

export class SqlGuardService {
  private readonly parser = new Parser();

  constructor(private readonly repository: SqlGuardSchemaRepository = schemaRepository) {}

  /** Validates generated SQL without executing it or relying on LLM self-discipline. */
  async validate(sql: string, options: SqlGuardOptions = {}): Promise<SqlGuardResult> {
    return runSqlGuardLimited(() => this.validateUnlocked(sql, options));
  }

  private async validateUnlocked(sql: string, options: SqlGuardOptions = {}): Promise<SqlGuardResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedSql = sql.trim();
    const maskedSql = maskSqlLiteralsAndComments(normalizedSql);

    if (!normalizedSql) {
      return buildResult(errors.concat("SQL is empty."), warnings, normalizedSql, [], []);
    }

    this.validateTextGuards(maskedSql, errors);

    let ast: SqlAst;
    try {
      ast = this.parser.astify(normalizedSql, { database: "transactsql" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`SQL parse failed: ${message}`);
      return buildResult(errors, warnings, normalizedSql, [], []);
    }

    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) {
      errors.push("Only one SQL statement is allowed.");
    }

    const statement = statements[0];
    if (!isRecord(statement)) {
      errors.push("SQL parser returned an unsupported AST.");
      return buildResult(errors, warnings, normalizedSql, [], []);
    }

    const statementType = stringValue(statement.type)?.toLowerCase();
    if (statementType !== "select") {
      errors.push("Only SELECT or WITH SELECT statements are allowed.");
      return buildResult(errors, warnings, normalizedSql, [], []);
    }

    if (isSelectInto(statement)) {
      errors.push("SELECT INTO is not allowed.");
    }

    const tableContext = collectTableContext(statement);
    const referencedFields = collectReferencedFields(statement);
    this.validateAllowedSchemas(tableContext.realTables, errors);
    await this.validateTables(tableContext.realTables, errors);
    await this.validateFields(referencedFields, tableContext, errors, warnings);
    this.validateCompanyRequirement(statement, errors);
    this.validateTopRequirement(statement, errors);
    this.validateDateRangeHint(maskedSql, referencedFields, warnings);
    this.validateFinanceRules(statement, maskedSql, referencedFields, options, errors);

    return buildResult(
      errors,
      warnings,
      normalizedSql,
      tableContext.realTables.map(formatTableName),
      referencedFields.map((field) => field.qualifier ? `${field.qualifier}.${field.fieldName}` : field.fieldName),
    );
  }

  /** Applies keyword, runtime feature, and multi-statement text guards before AST validation. */
  private validateTextGuards(maskedSql: string, errors: string[]): void {
    if (hasMultipleSqlStatements(maskedSql)) {
      errors.push("Multiple SQL statements are not allowed.");
    }
    if (BANNED_KEYWORD_PATTERN.test(maskedSql)) {
      errors.push("SQL contains a banned non-read operation or executable statement keyword.");
    }
    if (BANNED_RUNTIME_PATTERN.test(maskedSql)) {
      errors.push("SQL contains a banned runtime or external access function.");
    }
  }

  /** Rejects tables outside the allowed ERP schemas. */
  private validateAllowedSchemas(tables: ReferencedTable[], errors: string[]): void {
    for (const table of tables) {
      if (!ALLOWED_SCHEMAS.has(table.schemaName.toLowerCase())) {
        errors.push(`Schema is not allowed: ${table.schemaName}.`);
      }
    }
  }

  /** Validates referenced physical tables through the schema repository. */
  private async validateTables(tables: ReferencedTable[], errors: string[]): Promise<void> {
    const tableErrors = await Promise.all(dedupeTables(tables).map(async (table) =>
      await this.repository.tableExists(table.schemaName, table.tableName)
        ? null
        : `Referenced table does not exist in schema metadata: ${formatTableName(table)}.`
    ));
    errors.push(...tableErrors.filter((error): error is string => Boolean(error)));
  }

  /** Validates referenced physical fields through the schema repository where table ownership is knowable. */
  private async validateFields(
    fields: ReferencedField[],
    context: TableContext,
    errors: string[],
    warnings: string[],
  ): Promise<void> {
    const checked = new Set<string>();
    const checks: Array<Promise<string | null>> = [];
    for (const field of fields) {
      const fieldName = normalizeIdentifier(field.fieldName);
      if (!fieldName || fieldName === "*") {
        continue;
      }
      if (field.derived) {
        continue;
      }

      const candidateTables = resolveFieldTables(field, context);
      if (candidateTables.length === 0) {
        warnings.push(`Field cannot be tied to a physical ERP table and was not schema-validated: ${fieldName}.`);
        continue;
      }

      const key = `${field.qualifier ?? ""}.${fieldName}`;
      if (checked.has(key.toLowerCase())) {
        continue;
      }
      checked.add(key.toLowerCase());

      checks.push(Promise.all(candidateTables.map((table) =>
        this.repository.fieldExists(table.schemaName, table.tableName, fieldName)
      )).then((exists) =>
        exists.some(Boolean)
          ? null
          : `Referenced field does not exist in schema metadata: ${fieldName} on ${candidateTables.map(formatTableName).join(", ")}.`
      ));
    }
    errors.push(...(await Promise.all(checks)).filter((error): error is string => Boolean(error)));
  }

  /** Requires Company to be projected or grouped by in the outer SELECT. */
  private validateCompanyRequirement(statement: UnknownRecord, errors: string[]): void {
    if (!selectOutputsCompany(statement) && !selectGroupsByCompany(statement)) {
      errors.push("SQL must output Company or GROUP BY Company.");
    }
  }

  /** Requires TOP for non-aggregate outer SELECT statements. */
  private validateTopRequirement(statement: UnknownRecord, errors: string[]): void {
    if (!selectHasAggregate(statement) && !selectHasTop(statement)) {
      errors.push("Non-aggregate SELECT queries must include TOP, normally TOP 100.");
    }
  }

  /** Warns when date-like filters appear without the expected broad safety range. */
  private validateDateRangeHint(maskedSql: string, fields: ReferencedField[], warnings: string[]): void {
    const hasDateField = fields.some((field) => DATE_FIELD_PATTERN.test(field.fieldName));
    const hasRelativeDateIntent = /\b(getdate|dateadd|datediff|year|month)\s*\(/iu.test(maskedSql);
    if (!hasDateField || !hasRelativeDateIntent) {
      return;
    }

    if (!DATE_RANGE_LOWER_BOUND_PATTERN.test(maskedSql) || !DATE_RANGE_UPPER_BOUND_PATTERN.test(maskedSql)) {
      warnings.push(
        "Date-relative queries should include a reasonable date range: date field >= '20000101' AND date field < DATEADD(year, 1, CAST(GETDATE() AS date)).",
      );
    }
  }

  /** Applies stricter finance-only rules where wrong amounts are worse than no answer. */
  private validateFinanceRules(
    statement: UnknownRecord,
    maskedSql: string,
    fields: ReferencedField[],
    options: SqlGuardOptions,
    errors: string[],
  ): void {
    if (options.module !== "finance") {
      return;
    }

    const financeMode = options.financeMode ?? "strict";
    const references = options.references ?? [];
    const hasReference = financeMode === "estimate"
      ? references.some((reference) => Boolean(reference.sourceType))
      : references.some((reference) => reference.sourceType === "metric" || reference.sourceType === "template");
    if (!hasReference) {
      errors.push(financeMode === "estimate"
        ? "Estimated finance SQL must use at least one historical SQL reference."
        : "Finance SQL must use an approved business metric or approved SQL template.");
    }

    const fieldNames = fields.map((field) => field.fieldName);
    const referenceScopes = approvedReferenceScopes(references);
    if (!fieldNames.some((field) => FINANCE_AMOUNT_FIELD_PATTERN.test(field)) && !referenceScopes.amount) {
      errors.push("Finance SQL must reference an amount field.");
    }
    if (!fieldNames.some((field) => FINANCE_STATUS_FIELD_PATTERN.test(field)) && !referenceScopes.status) {
      errors.push("Finance SQL must reference a status field.");
    }
    if (!fieldNames.some((field) => FINANCE_DATE_FIELD_PATTERN.test(field)) && !referenceScopes.date) {
      errors.push("Finance SQL must reference a date field.");
    }

    if (FINANCE_DETAIL_AMOUNT_TABLE_PATTERN.test(maskedSql) && !FINANCE_PREAGG_PATTERN.test(maskedSql)) {
      errors.push("Finance SQL must pre-aggregate detail amount tables by key document number before joining them.");
    }

    const aliases = collectSelectAliases(statement);
    for (const alias of FINANCE_SCOPE_ALIASES) {
      if (!aliases.has(alias.toLowerCase())) {
        errors.push(`Finance SQL must return scope explanation column: ${alias}.`);
      }
    }
  }
}

function approvedReferenceScopes(references: SqlGuardOptions["references"] = []): { amount: boolean; status: boolean; date: boolean } {
  const definitions = references
    .filter((reference) => reference.sourceType === "metric")
    .map((reference) => readRecord(reference.definitionJson));
  return {
    amount: definitions.some((definition) => hasText(definition.amountExpression) || hasText(definition.valueExpression) || hasText(definition.rateExpression) || hasText(definition.metricCode)),
    status: definitions.some((definition) => readStringArray(definition.statusFilters).length > 0),
    date: definitions.some((definition) => hasText(definition.timeField)),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Builds a stable guard result from validation state. */
function buildResult(
  errors: string[],
  warnings: string[],
  normalizedSql: string,
  referencedTables: string[],
  referencedFields: string[],
): SqlGuardResult {
  return {
    valid: errors.length === 0,
    errors: uniqueStrings(errors),
    warnings: uniqueStrings(warnings),
    normalizedSql,
    referencedTables: uniqueStrings(referencedTables),
    referencedFields: uniqueStrings(referencedFields),
  };
}

/** Returns true when a parsed SELECT contains an INTO target. */
function isSelectInto(statement: UnknownRecord): boolean {
  const into = statement.into;
  return isRecord(into) && stringValue(into.type)?.toLowerCase() === "into";
}

/** Collects physical tables, CTE names, and aliases from the full SELECT tree. */
function collectTableContext(statement: UnknownRecord): TableContext {
  const cteNames = collectCteNames(statement);
  const realTables: ReferencedTable[] = [];
  const aliasToTable = new Map<string, ReferencedTable>();

  collectTablesFromSelect(statement, cteNames, realTables, aliasToTable);
  return {
    realTables: dedupeTables(realTables),
    cteNames,
    aliasToTable,
  };
}

/** Collects CTE names from the outer SELECT. */
function collectCteNames(statement: UnknownRecord): Set<string> {
  const cteNames = new Set<string>();
  for (const item of arrayValue(statement.with)) {
    if (!isRecord(item)) {
      continue;
    }
    const nameRecord = recordValue(item.name);
    const cteName = normalizeIdentifier(stringValue(nameRecord?.value));
    if (cteName) {
      cteNames.add(cteName.toLowerCase());
    }
  }
  return cteNames;
}

/** Recursively collects physical FROM tables from one SELECT and its CTEs/subqueries. */
function collectTablesFromSelect(
  statement: UnknownRecord,
  cteNames: Set<string>,
  realTables: ReferencedTable[],
  aliasToTable: Map<string, ReferencedTable>,
): void {
  for (const item of arrayValue(statement.with)) {
    const cteAst = recordValue(recordValue(item)?.stmt)?.ast;
    if (isRecord(cteAst)) {
      collectTablesFromSelect(cteAst, cteNames, realTables, aliasToTable);
    }
  }

  for (const fromItem of arrayValue(statement.from)) {
    collectTablesFromFromItem(fromItem, cteNames, realTables, aliasToTable);
  }
}

/** Collects a table reference or nested subquery from one FROM item. */
function collectTablesFromFromItem(
  fromItem: unknown,
  cteNames: Set<string>,
  realTables: ReferencedTable[],
  aliasToTable: Map<string, ReferencedTable>,
): void {
  if (!isRecord(fromItem)) {
    return;
  }

  const nestedAst = recordValue(recordValue(fromItem.expr)?.ast);
  if (nestedAst) {
    collectTablesFromSelect(nestedAst, cteNames, realTables, aliasToTable);
    return;
  }

  const tableName = normalizeIdentifier(stringValue(fromItem.table));
  if (!tableName || cteNames.has(tableName.toLowerCase())) {
    return;
  }

  const schemaName = normalizeIdentifier(stringValue(fromItem.db) ?? stringValue(fromItem.schema)) ?? DEFAULT_SCHEMA;
  const table: ReferencedTable = {
    schemaName,
    tableName,
    alias: normalizeIdentifier(stringValue(fromItem.as)) ?? undefined,
    cte: false,
  };
  realTables.push(table);
  aliasToTable.set(table.tableName.toLowerCase(), table);
  if (table.alias) {
    aliasToTable.set(table.alias.toLowerCase(), table);
  }
}

/** Collects all column references from the parsed SELECT tree. */
function collectReferencedFields(statement: UnknownRecord): ReferencedField[] {
  const fields: ReferencedField[] = [];
  const outputAliases = collectSelectAliases(statement);
  const cteOutputAliases = collectCteOutputAliases(statement);
  walkAst(statement, (node) => {
    if (stringValue(node.type) !== "column_ref") {
      return;
    }
    const column = node.column;
    const fieldName = typeof column === "string" ? normalizeIdentifier(column) : null;
    if (
      !fieldName
      || fieldName === "*"
      || fieldName.startsWith("@")
      || outputAliases.has(fieldName.toLowerCase())
      || isDatePart(fieldName)
    ) {
      return;
    }
    if (cteOutputAliases.has(fieldName.toLowerCase())) {
      fields.push({
        fieldName,
        qualifier: normalizeIdentifier(stringValue(node.table)) ?? undefined,
        derived: true,
      });
      return;
    }
    fields.push({
      fieldName,
      qualifier: normalizeIdentifier(stringValue(node.table)) ?? undefined,
    });
  });
  return dedupeFields(fields);
}

function collectCteOutputAliases(statement: UnknownRecord): Set<string> {
  const aliases = new Set<string>();
  for (const item of arrayValue(statement.with)) {
    const cteAst = recordValue(recordValue(item)?.stmt)?.ast;
    if (!isRecord(cteAst)) continue;
    for (const column of arrayValue(cteAst.columns)) {
      if (!isRecord(column)) continue;
      const alias = normalizeIdentifier(stringValue(column.as));
      if (alias) {
        aliases.add(alias.toLowerCase());
        continue;
      }
      const expr = recordValue(column.expr);
      if (stringValue(expr?.type) === "column_ref") {
        const fieldName = normalizeIdentifier(stringValue(expr?.column));
        if (fieldName) aliases.add(fieldName.toLowerCase());
      }
    }
  }
  return aliases;
}

function collectSelectAliases(statement: UnknownRecord): Set<string> {
  const aliases = new Set<string>();
  for (const column of arrayValue(statement.columns)) {
    const alias = isRecord(column) ? normalizeIdentifier(stringValue(column.as)) : null;
    if (alias) aliases.add(alias.toLowerCase());
  }
  return aliases;
}

function isDatePart(value: string): boolean {
  return /^(year|yy|yyyy|quarter|qq|q|month|mm|m|dayofyear|dy|y|day|dd|d|week|wk|ww|hour|hh|minute|mi|n|second|ss|s)$/iu.test(value);
}

/** Resolves a field qualifier to candidate physical tables. */
function resolveFieldTables(field: ReferencedField, context: TableContext): ReferencedTable[] {
  if (field.qualifier) {
    const qualifiedTable = context.aliasToTable.get(field.qualifier.toLowerCase());
    return qualifiedTable ? [qualifiedTable] : [];
  }
  return context.realTables.length > 0 ? context.realTables : [];
}

/** Returns true when the outer SELECT projects Company directly or as alias. */
function selectOutputsCompany(statement: UnknownRecord): boolean {
  return arrayValue(statement.columns).some((column) => {
    if (!isRecord(column)) {
      return false;
    }
    const alias = stringValue(column.as);
    if (alias?.toLowerCase() === "company") {
      return true;
    }
    const expr = recordValue(column.expr);
    return expr !== null && stringValue(expr.type) === "column_ref" && stringValue(expr.column)?.toLowerCase() === "company";
  });
}

/** Returns true when the outer SELECT groups by Company. */
function selectGroupsByCompany(statement: UnknownRecord): boolean {
  const groupBy = recordValue(statement.groupby);
  return arrayValue(groupBy?.columns).some((column) => {
    if (!isRecord(column)) {
      return false;
    }
    return stringValue(column.type) === "column_ref" && stringValue(column.column)?.toLowerCase() === "company";
  });
}

/** Returns true when the outer SELECT contains at least one aggregate function. */
function selectHasAggregate(statement: UnknownRecord): boolean {
  let foundAggregate = false;
  for (const column of arrayValue(statement.columns)) {
    walkAst(column, (node) => {
      if (stringValue(node.type) === "aggr_func") {
        foundAggregate = true;
      }
    });
  }
  return foundAggregate;
}

/** Returns true when the outer SELECT includes TOP. */
function selectHasTop(statement: UnknownRecord): boolean {
  const top = recordValue(statement.top);
  return top !== null && top.value !== null && top.value !== undefined;
}

/** Walks record nodes in a parser AST. */
function walkAst(value: unknown, visit: (node: UnknownRecord) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkAst(item, visit);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  visit(value);
  for (const child of Object.values(value)) {
    walkAst(child, visit);
  }
}

/** Returns a record when an unknown value is object-like. */
function recordValue(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

/** Narrows unknown values to plain object records. */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalizes unknown values to strings where possible. */
function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Normalizes unknown arrays to safe arrays. */
function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

/** Deduplicates physical table references. */
function dedupeTables(tables: ReferencedTable[]): ReferencedTable[] {
  const byKey = new Map<string, ReferencedTable>();
  for (const table of tables) {
    byKey.set(schemaObjectKey(table.schemaName, table.tableName), table);
  }
  return [...byKey.values()];
}

/** Deduplicates referenced field names and qualifiers. */
function dedupeFields(fields: ReferencedField[]): ReferencedField[] {
  const byKey = new Map<string, ReferencedField>();
  for (const field of fields) {
    byKey.set(`${field.qualifier?.toLowerCase() ?? ""}.${field.fieldName.toLowerCase()}`, field);
  }
  return [...byKey.values()];
}

/** Formats a table reference for guard output. */
function formatTableName(table: ReferencedTable): string {
  return `${table.schemaName}.${table.tableName}`;
}

/** Deduplicates strings while preserving first-seen order. */
function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export const sqlGuardService = new SqlGuardService();
