import type { ErpSqlAccessAuditReason, ErpSqlAccessScope, ErpSqlSensitiveClass } from "./types.js";

const RESERVED_ALIAS = new Set(["where", "with", "join", "left", "right", "inner", "outer", "full", "cross", "on", "group", "order", "having", "union", "option", "offset", "fetch"]);
const FIELD_CLASSES: Array<{ kind: ErpSqlSensitiveClass; pattern: RegExp }> = [
  { kind: "finance", pattern: /amount|amt|price|cost|margin|balance|debit|credit|tax|金额|成本|毛利|余额|单价/iu },
  { kind: "customer", pattern: /customer|cust(?:id|num|name)\b|client|contact|mobile|phone|email|客户|联系人|手机|电话|邮箱/iu },
  { kind: "employee", pattern: /employee|emp(?:id|num|name)\b|labor|worker|operator|工号|员工|姓名|报工|工时|人工/iu },
];

export function assertModuleAllowed(scope: ErpSqlAccessScope, modules: string[]): void {
  const requested = [...new Set(modules.filter(Boolean))];
  const effective = requested.length ? requested : ["custom"];
  if (effective.some((module) => !scope.modules.includes(module))) {
    throw new Error(`ERP_SQL_ACCESS_DENIED: module scope denied (${effective.join(", ")})`);
  }
}

export function applyErpSqlAccessScope(sql: string, scope: ErpSqlAccessScope): string {
  if (!scope.companies.length) throw new Error("ERP_SQL_ACCESS_DENIED: company scope is empty");
  let sourceCount = 0;
  const applied = { departments: false, businessUnits: false, customerNumbers: false };
  const scoped = sql.replace(
    /\b(FROM|JOIN)\s+(\[?Erp\]?\.\[?([A-Za-z_][\w$]*)\]?)(?:\s+(?:AS\s+)?(\[?[A-Za-z_][\w$]*\]?))?/giu,
    (match, keyword: string, source: string, table: string, capturedAlias?: string) => {
      const aliasValue = capturedAlias?.replace(/[\[\]]/gu, "");
      const hasAlias = Boolean(aliasValue && !RESERVED_ALIAS.has(aliasValue.toLowerCase()));
      const alias = hasAlias ? capturedAlias! : `[${table}]`;
      const lookupAlias = hasAlias ? aliasValue! : table;
      const suffix = capturedAlias && !hasAlias ? ` ${capturedAlias}` : "";
      const filters = [`Company IN (${scope.companies.map(sqlString).join(", ")})`];
      addStringRangeFilter(sql, lookupAlias, ["Department", "DepartmentID", "DeptCode", "JCDept"], scope.departments, filters, () => { applied.departments = true; });
      addStringRangeFilter(sql, lookupAlias, ["Division", "DivisionID", "BusinessUnit", "BusinessUnitID"], scope.businessUnits, filters, () => { applied.businessUnits = true; });
      addNumberRangeFilter(sql, lookupAlias, "CustNum", scope.customerNumbers, filters, () => { applied.customerNumbers = true; });
      sourceCount += 1;
      return `${keyword} (SELECT * FROM ${source} WHERE ${filters.join(" AND ")}) AS ${alias}${suffix}`;
    },
  );
  if (!sourceCount) throw new Error("ERP_SQL_ACCESS_DENIED: SQL has no scoped Erp table source");
  if (scope.departments !== "*" && !applied.departments) throw new Error("ERP_SQL_ACCESS_DENIED: department scope cannot be enforced for this SQL");
  if (scope.businessUnits !== "*" && !applied.businessUnits) throw new Error("ERP_SQL_ACCESS_DENIED: business unit scope cannot be enforced for this SQL");
  if (scope.customerNumbers !== "*" && !applied.customerNumbers) throw new Error("ERP_SQL_ACCESS_DENIED: customer scope cannot be enforced for this SQL");
  return scoped;
}

export function maskSensitiveResult(input: {
  fields: string[];
  rows: unknown[][];
  scope: ErpSqlAccessScope;
}): { rows: unknown[][]; warnings: string[]; auditReasons: ErpSqlAccessAuditReason[] } {
  const masked = input.fields
    .map((field, index) => ({ field, index, kind: classifyField(field) }))
    .filter((item): item is { field: string; index: number; kind: ErpSqlSensitiveClass } => Boolean(item.kind))
    .filter((item) => input.scope.sensitive[item.kind] !== "full");
  if (!masked.length) return { rows: input.rows, warnings: [], auditReasons: [] };
  const rows = input.rows.map((row) => row.map((value, index) => {
    const field = masked.find((item) => item.index === index);
    return field ? maskValue(value, field.kind) : value;
  }));
  const fields = masked.map((item) => item.field);
  return {
    rows,
    warnings: [`erp_sql_sensitive_fields_masked:${fields.join(",")}`],
    auditReasons: [{
      code: "erp_sql_sensitive_fields_masked",
      category: "masking",
      message: "返回字段超出用户敏感数据级别，已在服务端脱敏。",
      fields,
    }],
  };
}

function classifyField(field: string): ErpSqlSensitiveClass | undefined {
  return FIELD_CLASSES.find((item) => item.pattern.test(field))?.kind;
}

function maskValue(value: unknown, kind: ErpSqlSensitiveClass): unknown {
  if (value === null || value === undefined) return value;
  if (kind === "finance") return null;
  const text = String(value);
  if (text.length <= 2) return "**";
  return `${text[0]}${"*".repeat(Math.min(6, text.length - 2))}${text.at(-1)}`;
}

function sqlString(value: string): string {
  return `N'${value.replace(/'/gu, "''")}'`;
}

function addStringRangeFilter(
  sql: string,
  alias: string,
  fields: string[],
  values: string[] | "*",
  filters: string[],
  applied: () => void,
): void {
  if (values === "*") return;
  const field = fields.find((candidate) => new RegExp(`(?:\\[?${escapeRegExp(alias)}\\]?\\.)\\[?${candidate}\\]?\\b`, "iu").test(sql));
  if (!field) return;
  filters.push(`[${field}] IN (${values.map(sqlString).join(", ")})`);
  applied();
}

function addNumberRangeFilter(
  sql: string,
  alias: string,
  field: string,
  values: number[] | "*",
  filters: string[],
  applied: () => void,
): void {
  if (values === "*" || !new RegExp(`(?:\\[?${escapeRegExp(alias)}\\]?\\.)\\[?${field}\\]?\\b`, "iu").test(sql)) return;
  filters.push(`[${field}] IN (${values.join(", ")})`);
  applied();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
