import sqlParser from "node-sql-parser";
import type { AST } from "node-sql-parser";
import type { AnalysisPlan } from "../../planner/index.js";
import type { AnalysisPlanCoverageResult } from "../types/SqlRuntimeGuardTypes.js";

type RecordValue = Record<string, unknown>;
type ParsedSql = AST | AST[];

const { Parser } = sqlParser;

const DIMENSION_IDENTIFIERS: Record<string, string[]> = {
  customer: ["customer", "custid", "custnum", "customername", "客户", "客户名称", "客户编号"],
  order: ["order", "ordernum", "订单", "订单号"],
  supplier: ["supplier", "vendor", "vendornum", "供应商", "供应商编号"],
  product: ["product", "part", "partnum", "产品", "物料", "产品编号", "物料编号"],
  warehouse: ["warehouse", "warehousecode", "仓库", "仓库编号"],
  job: ["job", "jobnum", "工单", "工单号"],
  product_category: ["productcategory", "prodcode", "classid", "prodgrupdescription", "产品类别", "产品分类", "产品群组", "物料分类"],
  salesperson: ["salesperson", "salesrep", "销售员"],
  division: ["division", "businessunit", "事业部"],
};

const METRIC_ALTERNATIVES: Record<string, string[]> = {
  cost_component_amount: ["material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount"],
};

export class AnalysisPlanCoverageService {
  private readonly parser = new Parser();

  validate(sql: string, plan?: AnalysisPlan): AnalysisPlanCoverageResult {
    const missing = emptyMissing();
    if (!plan || plan.route === "clarification_required") return { valid: true, missing, errors: [] };

    let statement: RecordValue;
    try {
      const parsed = this.parser.astify(sql, { database: "transactsql" }) as ParsedSql;
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!isRecord(first)) throw new Error("unsupported AST");
      statement = first;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, missing, errors: [`semantic_mismatch: analysis plan coverage could not parse SQL: ${message}`] };
    }

    const predicateNodes = collectPredicateNodes(statement);
    const outputIdentifiers = collectOutputIdentifiers(statement);
    const groupedIdentifiers = collectGroupIdentifiers(statement);
    const projectedOrGrouped = new Set([...outputIdentifiers, ...groupedIdentifiers]);

    const requiredMetrics = unique([...plan.metrics, ...(plan.requiredMetrics ?? [])]);
    missing.metrics = requiredMetrics.filter((metric) => !metricCovered(outputIdentifiers, metric));
    missing.dimensions = unique([...plan.dimensions, ...plan.grain]).filter((dimension) =>
      !identifiersCover(projectedOrGrouped, dimension, DIMENSION_IDENTIFIERS[dimension])
    );

    for (const [dimension, value] of Object.entries(plan.dimensionFilters ?? {})) {
      if (!hasBoundDimensionPredicate(predicateNodes, dimension, value, plan)) missing.filters.push(`${dimension}=${value}`);
    }
    for (const filter of plan.filters) {
      if (!coversSemanticFilter(statement, predicateNodes, filter.metric, filter.op)) missing.filters.push(`${filter.metric}:${filter.op}`);
    }

    if (plan.timeRange && !coversTimeRange(this.parser, predicateNodes, plan)) missing.time.push(plan.timeRange.kind);
    if (plan.comparison && !coversComparison(statement, plan, requiredMetrics)) missing.comparison.push(plan.comparison.kind);

    for (const order of plan.orderBy) {
      if (!hasOrderBy(statement, order.metric, order.direction)) missing.sorting.push(`${order.metric}:${order.direction}`);
    }
    if (plan.limit !== undefined && !hasLimit(statement, plan.limit)) missing.limit.push(String(plan.limit));

    const errors = coverageErrors(missing);
    return { valid: errors.length === 0, missing, errors };
  }
}

function emptyMissing(): AnalysisPlanCoverageResult["missing"] {
  return { metrics: [], dimensions: [], filters: [], time: [], comparison: [], sorting: [], limit: [] };
}

function coverageErrors(missing: AnalysisPlanCoverageResult["missing"]): string[] {
  return [
    ...missing.metrics.map((value) => `semantic_mismatch: required metric ${value} is not covered by SQL`),
    ...missing.dimensions.map((value) => `semantic_mismatch: required dimension ${value} is not projected or grouped by SQL`),
    ...missing.filters.map((value) => `semantic_mismatch: required filter ${value} is not covered by SQL`),
    ...missing.time.map((value) => `semantic_mismatch: required time ${value} is not covered by SQL`),
    ...missing.comparison.map((value) => `semantic_mismatch: required comparison ${value} is not covered by SQL`),
    ...missing.sorting.map((value) => `semantic_mismatch: required sorting ${value} is not covered by SQL`),
    ...missing.limit.map((value) => `semantic_mismatch: required limit ${value} is not covered by SQL`),
  ];
}

function collectNodes(value: unknown, nodes: RecordValue[] = []): RecordValue[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, nodes);
  } else if (isRecord(value)) {
    nodes.push(value);
    for (const child of Object.values(value)) collectNodes(child, nodes);
  }
  return nodes;
}

function collectPredicateNodes(statement: RecordValue): RecordValue[] {
  const predicates: RecordValue[] = [];
  for (const select of collectSelectStatements(statement)) {
    collectPredicateExpression(select.where, predicates);
    for (const from of arrayValue(select.from)) if (isRecord(from)) collectPredicateExpression(from.on, predicates);
  }
  return predicates;
}

function collectSelectStatements(value: unknown, statements: RecordValue[] = []): RecordValue[] {
  if (Array.isArray(value)) {
    for (const item of value) collectSelectStatements(item, statements);
  } else if (isRecord(value)) {
    if (value.type === "select") statements.push(value);
    for (const child of Object.values(value)) collectSelectStatements(child, statements);
  }
  return statements;
}

function collectPredicateExpression(value: unknown, predicates: RecordValue[]): void {
  if (!isRecord(value)) return;
  if (value.type === "binary_expr" && ["AND", "OR"].includes(String(value.operator).toUpperCase())) {
    collectPredicateExpression(value.left, predicates);
    collectPredicateExpression(value.right, predicates);
    return;
  }
  if (value.type === "binary_expr") predicates.push(value);
}

function collectOutputIdentifiers(statement: RecordValue): Set<string> {
  const identifiers = new Set<string>();
  for (const column of arrayValue(statement.columns)) {
    if (!isRecord(column)) continue;
    addIdentifier(identifiers, column.as);
    for (const node of collectNodes(column.expr)) if (node.type === "column_ref") addIdentifier(identifiers, node.column);
  }
  return identifiers;
}

function collectGroupIdentifiers(statement: RecordValue): Set<string> {
  const identifiers = new Set<string>();
  const groupby = isRecord(statement.groupby) ? statement.groupby : undefined;
  for (const node of collectNodes(groupby?.columns)) if (node.type === "column_ref") addIdentifier(identifiers, node.column);
  return identifiers;
}

function hasBoundDimensionPredicate(nodes: RecordValue[], dimension: string, expected: string, plan: AnalysisPlan): boolean {
  const expectedValue = normalizeValue(expected);
  const ruleMembers = plan.dimensionRules?.find((rule) => rule.dimension === dimension && normalizeValue(rule.target) === expectedValue)?.members.map(normalizeValue);
  return nodes.some((node) => {
    const operator = String(node.operator).toUpperCase();
    if (node.type !== "binary_expr" || !["=", "IN", "LIKE"].includes(operator)) return false;
    const values = literalValues(node.right);
    const exactSingleValue = values.length === 1 && values[0] === expectedValue;
    const safeNameLike = dimension !== "order" && operator === "LIKE" && values.length === 1
      && safeBoundedLikeValue(values[0]!, expectedValue);
    const coversRule = operator === "IN" && Boolean(ruleMembers?.length) && ruleMembers?.length === values.length
      && ruleMembers.every((member) => values.includes(member));
    const coversValue = operator === "LIKE" ? safeNameLike : exactSingleValue || coversRule;
    return (expressionMatchesDimension(node.left, dimension) && coversValue)
      || (operator === "=" && expressionMatchesDimension(node.right, dimension) && literalValues(node.left).length === 1 && literalValues(node.left)[0] === expectedValue);
  });
}

function safeBoundedLikeValue(pattern: string, expected: string): boolean {
  const inner = pattern.startsWith("%") && pattern.endsWith("%") ? pattern.slice(1, -1) : pattern;
  return inner === expected && !inner.includes("%") && !inner.includes("_");
}

function metricCovered(outputs: Set<string>, metric: string): boolean {
  if (identifiersCover(outputs, metric)) return true;
  const alternatives = METRIC_ALTERNATIVES[metric];
  return Boolean(alternatives?.every((alternative) => identifiersCover(outputs, alternative)));
}

function coversSemanticFilter(statement: RecordValue, nodes: RecordValue[], metric: string, op: AnalysisPlan["filters"][number]["op"]): boolean {
  if (op === "rank_high") return hasOrderBy(statement, metric, "DESC");
  if (op === "rank_low") return hasOrderBy(statement, metric, "ASC");
  if (op === "high" || op === "low") {
    const direction = op === "high" ? "DESC" : "ASC";
    return hasMetricThreshold(nodes, metric) || (hasOrderBy(statement, metric, direction) && hasAnyLimit(statement));
  }
  return nodes.some((node) => node.type === "binary_expr"
    && ["<", "<=", ">", ">=", "=", "!=", "<>"].includes(String(node.operator))
    && collectNodes(node).some((child) => child.type === "column_ref" && /due|date|open|closed|complete|status/iu.test(String(child.column))));
}

function hasMetricThreshold(nodes: RecordValue[], metric: string): boolean {
  return nodes.some((node) => ["<", "<=", ">", ">="].includes(String(node.operator))
    && (expressionHasIdentifier(node.left, metric) || expressionHasIdentifier(node.right, metric))
    && literalValues(node).some((value) => Number.isFinite(Number(value))));
}

function coversTimeRange(parser: InstanceType<typeof Parser>, predicates: RecordValue[], plan: AnalysisPlan): boolean {
  const expected = expectedTimeClauses(plan);
  if (expected.length === 0) return false;
  const actualSignatures = new Set(predicates.map(timeExpressionSignature));
  return expected.every((clause) => actualSignatures.has(parseWhereSignature(parser, clause)));
}

function expectedTimeClauses(plan: AnalysisPlan): string[] {
  const range = plan.timeRange;
  if (!range) return [];
  if (plan.comparison) {
    const window = timeWindow(range);
    if (!window) return [];
    const shift = plan.comparison.kind === "year_over_year" ? "year" : "month";
    return [
      `TimeField >= ${window.start}`, `TimeField < ${window.end}`,
      `TimeField >= DATEADD(${shift}, -1, ${window.start})`, `TimeField < DATEADD(${shift}, -1, ${window.end})`,
    ];
  }
  if (range.kind === "current_year") return [
    "TimeField >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)",
    "TimeField < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))",
  ];
  if (range.kind === "year_over_year") return [
    "TimeField >= DATEFROMPARTS(YEAR(GETDATE()) - 1, 1, 1)",
    "TimeField < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))",
  ];
  if (range.kind === "current_month") return [
    "TimeField >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)",
    "TimeField < DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0)",
  ];
  if (range.kind === "previous_month") return [
    "TimeField >= DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0)",
    "TimeField < DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)",
  ];
  if (range.kind === "month" && range.month) return [
    "YEAR(TimeField) = YEAR(GETDATE())", `MONTH(TimeField) = ${range.month}`,
  ];
  if (range.kind === "relative" && range.days) return [
    `TimeField >= DATEADD(day, -${range.days}, CAST(GETDATE() AS date))`,
  ];
  return [];
}

function timeWindow(range: NonNullable<AnalysisPlan["timeRange"]>): { start: string; end: string } | undefined {
  if (range.kind === "current_month") return { start: "DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)", end: "DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0)" };
  if (range.kind === "previous_month") return { start: "DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0)", end: "DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)" };
  if (range.kind === "month" && range.month) return { start: `DATEFROMPARTS(YEAR(GETDATE()), ${range.month}, 1)`, end: `DATEADD(month, 1, DATEFROMPARTS(YEAR(GETDATE()), ${range.month}, 1))` };
  if (range.kind === "current_year" || range.kind === "year_over_year") return { start: "DATEFROMPARTS(YEAR(GETDATE()), 1, 1)", end: "DATEADD(day, 1, CAST(GETDATE() AS date))" };
  return undefined;
}

function parseWhereSignature(parser: InstanceType<typeof Parser>, expression: string): string {
  const ast = parser.astify(`SELECT TOP 1 Company FROM Erp.OrderHed WHERE ${expression}`, { database: "transactsql" }) as AST;
  return timeExpressionSignature((ast as unknown as RecordValue).where as RecordValue);
}

function timeExpressionSignature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(timeExpressionSignature).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  if (value.type === "column_ref") return "column";
  return `{${Object.keys(value).sort().filter((key) => !["loc", "collate", "table", "db", "schema"].includes(key))
    .map((key) => `${key}:${timeExpressionSignature(value[key])}`).join(",")}}`;
}

function coversComparison(statement: RecordValue, plan: AnalysisPlan, metrics: string[]): boolean {
  if (!plan.timeRange) return false;
  const outputs = outputExpressions(statement);
  return metrics.every((metric) => {
    const current = outputs.get(normalizeIdentifier(metric));
    const previous = outputs.get(normalizeIdentifier(`${metric}_comparison`));
    if (!current || !previous || !expressionHasColumn(current) || !expressionHasColumn(previous)) return false;
    const change = outputs.get(normalizeIdentifier(`${metric}_change`)) ?? outputs.get(normalizeIdentifier(`${metric}_change_rate`));
    return !change || collectNodes(change).filter((node) => node.type === "column_ref").length >= 2;
  });
}

function outputExpressions(statement: RecordValue): Map<string, unknown> {
  const outputs = new Map<string, unknown>();
  for (const column of arrayValue(statement.columns)) if (isRecord(column) && typeof column.as === "string") outputs.set(normalizeIdentifier(column.as), column.expr);
  return outputs;
}

function expressionHasColumn(value: unknown): boolean {
  return collectNodes(value).some((node) => node.type === "column_ref");
}

function expressionHasIdentifier(value: unknown, identifier: string): boolean {
  return collectNodes(value).some((node) => node.type === "column_ref" && identifierMatches(String(node.column), identifier));
}

function hasOrderBy(statement: RecordValue, metric: string, direction: "ASC" | "DESC"): boolean {
  return arrayValue(statement.orderby).some((item) => isRecord(item)
    && String(item.type).toUpperCase() === direction
    && collectNodes(item.expr).some((node) => node.type === "column_ref" && identifierMatches(String(node.column), metric)));
}

function hasLimit(statement: RecordValue, requested: number): boolean {
  const top = isRecord(statement.top) ? Number(statement.top.value) : Number.NaN;
  if (Number.isFinite(top)) return top <= requested;
  const limit = isRecord(statement.limit) ? statement.limit : undefined;
  const values = arrayValue(limit?.value).map((item) => isRecord(item) ? Number(item.value) : Number.NaN).filter(Number.isFinite);
  return values.some((value) => value <= requested);
}

function hasAnyLimit(statement: RecordValue): boolean {
  return isRecord(statement.top) || isRecord(statement.limit);
}

function columnMatches(value: unknown, dimension: string): boolean {
  return isRecord(value) && value.type === "column_ref" && (
    identifierMatches(String(value.column), dimension, DIMENSION_IDENTIFIERS[dimension])
    || identifierMatches(`${String(value.table ?? "")}${String(value.column)}`, dimension, DIMENSION_IDENTIFIERS[dimension])
  );
}

function expressionMatchesDimension(value: unknown, dimension: string): boolean {
  return collectNodes(value).some((node) => columnMatches(node, dimension));
}

function literalValues(value: unknown): string[] {
  return collectNodes(value)
    .filter((node) => ["number", "string", "single_quote_string", "national_string", "var_string", "bool"].includes(String(node.type)))
    .map((node) => normalizeValue(node.value));
}

function identifiersCover(identifiers: Set<string>, required: string, alternatives?: string[]): boolean {
  return [...identifiers].some((identifier) => identifierMatches(identifier, required, alternatives));
}

function identifierMatches(identifier: string, required: string, alternatives: string[] = []): boolean {
  const normalized = normalizeIdentifier(identifier);
  return [required, ...alternatives].map(normalizeIdentifier).some((candidate) => normalized === candidate);
}

function addIdentifier(target: Set<string>, value: unknown): void {
  if (typeof value === "string" && value) target.add(normalizeIdentifier(value));
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replaceAll("_", "").replaceAll(" ", "").replaceAll("[", "").replaceAll("]", "");
}

function normalizeValue(value: unknown): string {
  return String(value).trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
