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

    const nodes = collectNodes(statement);
    const outputIdentifiers = collectOutputIdentifiers(statement);
    const groupedIdentifiers = collectGroupIdentifiers(statement);
    const projectedOrGrouped = new Set([...outputIdentifiers, ...groupedIdentifiers]);

    missing.metrics = unique(plan.metrics).filter((metric) => !metricCovered(outputIdentifiers, metric));
    missing.dimensions = unique([...plan.dimensions, ...plan.grain]).filter((dimension) =>
      !identifiersCover(projectedOrGrouped, dimension, DIMENSION_IDENTIFIERS[dimension])
    );

    for (const [dimension, value] of Object.entries(plan.dimensionFilters ?? {})) {
      if (!hasBoundDimensionPredicate(nodes, dimension, value, plan)) missing.filters.push(`${dimension}=${value}`);
    }
    for (const filter of plan.filters) {
      if (!coversSemanticFilter(statement, nodes, outputIdentifiers, filter.metric, filter.op)) missing.filters.push(`${filter.metric}:${filter.op}`);
    }

    if (plan.timeRange && !hasTimePredicate(nodes)) missing.time.push(plan.timeRange.kind);
    if (plan.comparison && !coversComparison(outputIdentifiers, plan)) missing.comparison.push(plan.comparison.kind);

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
    if (node.type !== "binary_expr" || !["=", "IN", "LIKE"].includes(String(node.operator).toUpperCase())) return false;
    const values = literalValues(node.right);
    const coversValue = values.some((value) => value.replaceAll("%", "") === expectedValue)
      || Boolean(ruleMembers?.every((member) => values.includes(member)));
    return (expressionMatchesDimension(node.left, dimension) && coversValue)
      || (expressionMatchesDimension(node.right, dimension) && literalValues(node.left).some((value) => value.replaceAll("%", "") === expectedValue));
  });
}

function metricCovered(outputs: Set<string>, metric: string): boolean {
  if (identifiersCover(outputs, metric)) return true;
  const alternatives = METRIC_ALTERNATIVES[metric];
  return Boolean(alternatives?.every((alternative) => identifiersCover(outputs, alternative)));
}

function coversSemanticFilter(statement: RecordValue, nodes: RecordValue[], outputs: Set<string>, metric: string, op: AnalysisPlan["filters"][number]["op"]): boolean {
  if (op === "rank_high") return hasOrderBy(statement, metric, "DESC");
  if (op === "rank_low") return hasOrderBy(statement, metric, "ASC");
  // "high"/"low" have no numeric threshold in AnalysisPlan; projecting the metric is the only provable contract.
  if (op === "high" || op === "low") return metricCovered(outputs, metric);
  return nodes.some((node) => node.type === "binary_expr"
    && ["<", "<=", ">", ">=", "=", "!=", "<>"].includes(String(node.operator))
    && collectNodes(node).some((child) => child.type === "column_ref" && /due|date|open|closed|complete|status/iu.test(String(child.column))));
}

function hasTimePredicate(nodes: RecordValue[]): boolean {
  return nodes.some((node) => node.type === "binary_expr"
    && collectNodes(node).some((child) => child.type === "column_ref" && /date|time|period|year|month/iu.test(String(child.column))));
}

function coversComparison(outputs: Set<string>, plan: AnalysisPlan): boolean {
  return plan.metrics.every((metric) => [...outputs].some((output) =>
    output === normalizeIdentifier(`${metric}_comparison`)
    || output === normalizeIdentifier(`${metric}_change`)
    || output === normalizeIdentifier(`${metric}_change_rate`)
  ));
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
  return [required, ...alternatives].map(normalizeIdentifier).some((candidate) => normalized === candidate || normalized.includes(candidate));
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
