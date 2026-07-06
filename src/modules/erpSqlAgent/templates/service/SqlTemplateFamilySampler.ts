import crypto from "node:crypto";
import type { SqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import type { SqlTemplateAnalysisDataset } from "../types/SqlTemplateTypes.js";

type ModuleGuess = "production" | "purchase" | "sales" | "inventory" | "finance" | "cross_module" | "unknown";

export type SqlTemplateFamilySampleOptions = {
  sourceType: string;
  limit?: number;
  outputFamilyCount?: number;
  businessOnly?: boolean;
};

const DEFAULT_OUTPUT_FAMILY_COUNT = 100;
const NON_SELECT_PATTERN = /\b(insert|update|delete|merge|drop|truncate|alter|create|exec|execute)\b/iu;
const FR_MACRO_PATTERN = /\$\{[\s\S]*?\}/gu;
const SQL_PARAM_PATTERN = /[@:]([\p{L}_][\p{L}\p{N}_]*)/gu;
const DATE_LITERAL_PATTERN = /'?\d{4}[-/]\d{1,2}[-/]\d{1,2}'?/gu;
const STRING_LITERAL_PATTERN = /'(?:''|[^'])*'|"(?:""|[^"])*"/gu;
const NUMBER_LITERAL_PATTERN = /\b\d+(?:\.\d+)?\b/gu;
const BAD_TABLE_NAMES = new Set(["s", "erp", "pub", "dbo", "on", "where", "select"]);
const MODULE_TABLES = {
  production: ["jobhead", "joboper", "jobmtl", "labordtl"],
  purchase: ["poheader", "podetail", "porel", "rcvdtl"],
  sales: ["orderhed", "orderdtl", "orderrel", "shipdtl", "invcdtl"],
  inventory: ["parttran", "partwhse", "partbin", "partqty"],
  finance: ["tranglc", "gljrndtl", "apinv", "invchead"],
} as const;
const TABLE_CASES = new Map<string, string>([
  ["jobhead", "JobHead"], ["joboper", "JobOper"], ["jobmtl", "JobMtl"], ["jobasmbl", "JobAsmbl"], ["labordtl", "LaborDtl"],
  ["poheader", "POHeader"], ["podetail", "PODetail"], ["porel", "PORel"], ["rcvdtl", "RcvDtl"], ["vendor", "Vendor"],
  ["orderhed", "OrderHed"], ["orderdtl", "OrderDtl"], ["orderrel", "OrderRel"], ["shipdtl", "ShipDtl"], ["invcdtl", "InvcDtl"],
  ["part", "Part"], ["parttran", "PartTran"], ["partwhse", "PartWhse"], ["partbin", "PartBin"], ["partqty", "PartQty"],
  ["tranglc", "TranGLC"], ["gljrndtl", "GLJrnDtl"], ["apinv", "APInv"], ["invchead", "InvcHead"],
]);
const MACRO_STOP_WORDS = new Set([
  "if", "len", "and", "or", "not", "null", "true", "false", "select", "from", "where",
  "then", "else", "date", "year", "month", "day", "like", "in",
]);
const DEMO_REPORT_PATTERN = /(示例|图表|chart|dashboard|hyperlink|map|地图|填报|js|css|分页|主子报表|数据钻取|freeform|lineform|columns|basicpagination|blankpagination|watermark|水印|excel导入|excel导出|第一张报表|模板参数|票据套打)/iu;
const BUSINESS_KEYWORD_PATTERN = /(工单|工序|报工|任务|生产|完工|延期|采购|供应商|入库|收货|采购单|销售|订单|客户|发货|库存|物料|bom|eco|报价|合同|成本|费用|财务|毛利|应付|应收|项目|设计|技术)/iu;
const PRIORITY_BUSINESS_PATTERN = /(生产任务|今日任务|明日任务|bom|eco|产品报价|产品配置|采购及时率|采购延期|采购分析|销售订单|签约额|库存查询|发货通知|工时统计|财务费用|成本数据表)/iu;
const METRIC_PATTERN = /(成本|费用|毛利|及时率|延期率|工时统计|库存金额|采购金额|经营分析)/iu;
const SENSITIVE_PATTERN = /(采购单价|销售金额|成本|毛利|费用|财务|工资|提成|供应商价格|客户价格)/iu;
const TEMPLATE_PATTERN = /(库存查询|采购订单明细|销售订单明细|工单进度|报工明细)/iu;
const REFERENCE_PATTERN = /(生产任务|拉动式生产|销售驾驶舱|采购延期|供应商及时率|发货看板)/iu;
const DEMO_TABLES = new Set(["销量", "订单", "订单明细", "产品", "库存", "雇员", "销售总额", "地图", "运货商", "carsales", "sale_month", "get"]);
const REVIEW_TABLES = new Set(["sales", "carsales", "get", "sale_month"]);

export class SqlTemplateFamilySampler {
  constructor(private readonly repository: Pick<SqlTemplateRepository, "findDatasetsForAnalysis"> = sqlTemplateRepository) {}

  async sample(options: SqlTemplateFamilySampleOptions) {
    const rows = await this.repository.findDatasetsForAnalysis(options.limit);
    const items = rows.map(analyzeFamilyItem);
    const families = [...groupBy(items, (item) => item.familyKey).values()]
      .map(buildFamily)
      .sort(compareFamilies)
      .slice(0, options.outputFamilyCount ?? DEFAULT_OUTPUT_FAMILY_COUNT)
      .map((family, index) => ({ ...family, familyId: `family_${String(index + 1).padStart(3, "0")}` }));

    if (options.businessOnly) return buildBusinessOnlyReport(items, families);

    return {
      summary: {
        totalDatasets: items.length,
        distinctSqlHashCount: new Set(items.map((item) => item.sqlHash)).size,
        familyCount: new Set(items.map((item) => item.familyKey)).size,
        outputFamilyCount: families.length,
      },
      families,
    };
  }
}

export function analyzeFamilyItem(row: SqlTemplateAnalysisDataset) {
  const normalizedSql = normalizeSqlForFamily(row.rawSql);
  const coreTables = extractTables(row.rawSql);
  const joins = extractJoins(row.rawSql);
  const params = extractParams(row.rawSql, row.dynamicParams);
  const reportName = row.reportFile.reportName ?? row.reportFile.relativePath;
  const moduleGuess = guessModule(coreTables);
  return {
    datasetId: Number(row.id),
    reportName,
    reportPrefix: reportPrefix(reportName),
    datasetName: row.datasetName ?? "",
    rawSql: row.rawSql,
    sqlHash: row.sqlHash || sha256(normalizedSql),
    normalizedSql,
    normalizedHash: sha256(normalizedSql),
    coreTables,
    joins,
    params,
    moduleGuess,
    hasFanruanMacro: FR_MACRO_PATTERN.test(row.rawSql),
    hasDynamicParameter: params.length > 0,
    hasNonSelectRisk: NON_SELECT_PATTERN.test(row.rawSql),
    hasHardcodedCompany: /\bCompany\b\s*(?:=|in\s*\()\s*'?[\w]+'?/iu.test(row.rawSql),
    isDemo: /(^|[/\\])demo([/\\]|$)|示例|样例/iu.test(row.reportFile.relativePath),
    familyKey: coreTables.length > 0 ? `tables:${coreTables.join("+")}` : `exact:${sha256(normalizedSql)}`,
  };
}

export function normalizeSqlForFamily(sql: string): string {
  return stripComments(sql)
    .replace(FR_MACRO_PATTERN, "?macro")
    .replace(DATE_LITERAL_PATTERN, "?date")
    .replace(STRING_LITERAL_PATTERN, "?string")
    .replace(/\btop\s+\d+\b/giu, "top ?number")
    .replace(NUMBER_LITERAL_PATTERN, "?number")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function buildFamily(items: ReturnType<typeof analyzeFamilyItem>[]) {
  const representative = [...items].sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || b.coreTables.length - a.coreTables.length || a.rawSql.length - b.rawSql.length)[0] ?? items[0];
  const moduleGuess = mergeModules(items.map((item) => item.moduleGuess));
  const coreTables = unique(items.flatMap((item) => item.coreTables)).sort();
  const coreJoins = topCounts(items.flatMap((item) => item.joins), 20).map(([join]) => join);
  const params = unique(items.flatMap((item) => item.params)).sort();
  const reportNames = topCounts(items.map((item) => item.reportName), 20).map(([name]) => name);
  const datasetNames = topCounts(items.map((item) => item.datasetName).filter(Boolean), 20).map(([name]) => name);
  return {
    familyId: "",
    datasetCount: items.length,
    distinctSqlCount: new Set(items.map((item) => item.normalizedHash)).size,
    reportNames,
    datasetNames,
    moduleGuess,
    coreTables,
    coreJoins,
    params,
    hasFanruanMacroCount: items.filter((item) => item.hasFanruanMacro).length,
    hasDynamicParameterCount: items.filter((item) => item.hasDynamicParameter).length,
    hasNonSelectRiskCount: items.filter((item) => item.hasNonSelectRisk).length,
    hasHardcodedCompanyCount: items.filter((item) => item.hasHardcodedCompany).length,
    representativeDatasetId: representative.datasetId,
    representativeReportName: representative.reportName,
    representativeDatasetName: representative.datasetName,
    representativeSql: representative.rawSql,
    sampleDatasetIds: items.slice(0, 10).map((item) => item.datasetId),
    variationHints: variationHints(items),
    demoCount: items.filter((item) => item.isDemo).length,
  };
}

function buildBusinessOnlyReport(
  items: ReturnType<typeof analyzeFamilyItem>[],
  families: Array<ReturnType<typeof buildFamily> & { familyId: string }>,
) {
  const businessFamilies: Array<ReturnType<typeof enrichBusinessFamily>> = [];
  const demoFilteredFamilies: Array<ReturnType<typeof enrichBusinessFamily>> = [];
  const needsReviewFamilies: Array<ReturnType<typeof enrichBusinessFamily>> = [];
  for (const family of families) {
    const enriched = enrichBusinessFamily(family);
    if (isNeedsReviewFamily(family)) needsReviewFamilies.push(enriched);
    else if (isDemoFamily(family)) demoFilteredFamilies.push(enriched);
    else if (isBusinessFamily(family)) businessFamilies.push(enriched);
    else demoFilteredFamilies.push(enriched);
  }

  return {
    summary: {
      totalDatasets: items.length,
      familyCount: new Set(items.map((item) => item.familyKey)).size,
      businessFamilyCount: businessFamilies.length,
      demoFilteredFamilyCount: demoFilteredFamilies.length,
      needsReviewFamilyCount: needsReviewFamilies.length,
      outputFamilyCount: businessFamilies.length,
    },
    businessFamilies,
    demoFilteredFamilies,
    needsReviewFamilies,
  };
}

function enrichBusinessFamily<T extends ReturnType<typeof buildFamily> & { familyId: string }>(family: T) {
  const text = familyText(family);
  const recommendedUse = recommendedUseFor(family, text);
  return {
    ...family,
    recommendedUse,
    businessPriority: priorityFor(family, text, recommendedUse),
    reason: reasonFor(family, text, recommendedUse),
    permissionDomainGuess: permissionDomainFor(family, text),
    sensitivityGuess: sensitivityFor(text, recommendedUse),
  };
}

function isDemoFamily(family: ReturnType<typeof buildFamily>): boolean {
  const text = familyText(family);
  if (DEMO_REPORT_PATTERN.test(text)) return true;
  const tables = family.coreTables.map(lastPart);
  return tables.length > 0 && tables.every((table) => DEMO_TABLES.has(table.toLowerCase()) || DEMO_TABLES.has(table));
}

function isNeedsReviewFamily(family: ReturnType<typeof buildFamily>): boolean {
  return family.coreTables.some((table) => table.startsWith("Erp.") && REVIEW_TABLES.has(lastPart(table).toLowerCase()));
}

function isBusinessFamily(family: ReturnType<typeof buildFamily>): boolean {
  const text = familyText(family);
  return family.moduleGuess !== "unknown"
    || family.coreTables.some(isBusinessSchemaTable)
    || BUSINESS_KEYWORD_PATTERN.test(text);
}

function recommendedUseFor(family: ReturnType<typeof buildFamily>, text: string) {
  if (SENSITIVE_PATTERN.test(text)) return "permission_sensitive";
  if (METRIC_PATTERN.test(text)) return "business_metric_catalog";
  if (TEMPLATE_PATTERN.test(text) && family.hasNonSelectRiskCount === 0 && family.coreJoins.length > 0) return "template_candidate";
  if (REFERENCE_PATTERN.test(text) || family.distinctSqlCount > 1) return "reference_then_template";
  return "reference_retrieval";
}

function priorityFor(family: ReturnType<typeof buildFamily>, text: string, recommendedUse: string) {
  if (PRIORITY_BUSINESS_PATTERN.test(text) || recommendedUse === "template_candidate") return "high";
  if (family.moduleGuess !== "unknown" || BUSINESS_KEYWORD_PATTERN.test(text)) return "medium";
  return "low";
}

function reasonFor(family: ReturnType<typeof buildFamily>, text: string, recommendedUse: string): string {
  if (recommendedUse === "permission_sensitive") return "Contains sensitive financial, pricing, wage, cost, or margin keywords.";
  if (recommendedUse === "business_metric_catalog") return "Looks like a metric/reporting family suitable for business metric catalog review.";
  if (recommendedUse === "template_candidate") return "Stable SELECT-oriented ERP family with clear joins and common query intent keywords.";
  if (recommendedUse === "reference_then_template") return "Business report family with variants; use as reference before extracting reusable templates.";
  if (BUSINESS_KEYWORD_PATTERN.test(text)) return "Kept by business report keywords.";
  return "Kept by ERP schema or module evidence.";
}

function permissionDomainFor(family: ReturnType<typeof buildFamily>, text: string): string {
  if (/(财务|费用|应付|应收|成本|毛利)/iu.test(text) || family.moduleGuess === "finance") return "finance";
  if (/(采购|供应商|入库|收货)/iu.test(text) || family.moduleGuess === "purchase") return "purchase";
  if (/(销售|客户|发货|签约)/iu.test(text) || family.moduleGuess === "sales") return "sales";
  if (/(工单|生产|工序|报工|bom|eco)/iu.test(text) || family.moduleGuess === "production") return "production";
  if (/(库存|物料)/iu.test(text) || family.moduleGuess === "inventory") return "inventory";
  return "general";
}

function sensitivityFor(text: string, recommendedUse: string): string {
  if (recommendedUse === "permission_sensitive") return "high";
  if (/(金额|单价|价格|成本|毛利|费用|财务)/iu.test(text)) return "medium";
  return "low";
}

function familyText(family: ReturnType<typeof buildFamily>): string {
  return [
    ...family.reportNames,
    ...family.datasetNames,
    ...family.coreTables,
    family.representativeSql.slice(0, 500),
  ].join(" ");
}

function isBusinessSchemaTable(table: string): boolean {
  return /^(Erp|PUB|dbo|JCJDY\.dbo|ERPLog\.dbo)\./u.test(table);
}

function compareFamilies(a: ReturnType<typeof buildFamily>, b: ReturnType<typeof buildFamily>): number {
  return b.datasetCount - a.datasetCount
    || b.distinctSqlCount - a.distinctSqlCount
    || b.coreTables.length - a.coreTables.length
    || a.demoCount - b.demoCount;
}

function extractTables(sql: string): string[] {
  const tables: string[] = [];
  for (const match of sql.matchAll(/\b(?:from|join)\s+((?:\[?[\w]+\]?\.){0,2}\[?[\w]+\]?)/giu)) {
    const table = normalizeTable(match[1]);
    if (table) tables.push(table);
  }
  return unique(tables).sort();
}

function extractJoins(sql: string): string[] {
  const joins: string[] = [];
  const aliases = collectAliases(sql);
  let leftTable = normalizeTable(/\bfrom\s+((?:\[?[\w]+\]?\.){0,2}\[?[\w]+\]?)/iu.exec(sql)?.[1]);
  const joinPattern = /\bjoin\s+((?:\[?[\w]+\]?\.){0,2}\[?[\w]+\]?)(?:\s+(?:as\s+)?(\w+))?\s+on\s+([\s\S]*?)(?=\bjoin\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|$)/giu;
  for (const match of sql.matchAll(joinPattern)) {
    const rightTable = normalizeTable(match[1]);
    const condition = match[3] ?? "";
    const keys = extractJoinKeys(condition, aliases);
    if (leftTable && rightTable) joins.push(`${leftTable} -> ${rightTable} ON ${keys.length ? keys.join(" + ") : "unknown"}`);
    leftTable = rightTable || leftTable;
  }
  return unique(joins);
}

function collectAliases(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const pattern = /\b(?:from|join)\s+((?:\[?[\w]+\]?\.){0,2}\[?[\w]+\]?)(?:\s+(?:as\s+)?(\w+))?/giu;
  for (const match of sql.matchAll(pattern)) {
    const table = normalizeTable(match[1]);
    const alias = match[2];
    if (!table) continue;
    aliases.set(lastPart(table).toLowerCase(), table);
    if (alias && !BAD_TABLE_NAMES.has(alias.toLowerCase())) aliases.set(alias.toLowerCase(), table);
  }
  return aliases;
}

function extractJoinKeys(condition: string, aliases: Map<string, string>): string[] {
  const keys: string[] = [];
  for (const match of condition.matchAll(/\b(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\b/giu)) {
    const leftAlias = match[1]?.toLowerCase() ?? "";
    const rightAlias = match[3]?.toLowerCase() ?? "";
    if (aliases.has(leftAlias) && aliases.has(rightAlias) && match[2]?.toLowerCase() === match[4]?.toLowerCase()) {
      keys.push(canonicalFieldName(match[2] ?? ""));
    }
  }
  return unique(keys).sort((a, b) => a === "Company" ? -1 : b === "Company" ? 1 : a.localeCompare(b));
}

function extractParams(sql: string, importedParams: unknown): string[] {
  const params = Array.isArray(importedParams)
    ? importedParams.filter((item): item is string => typeof item === "string").flatMap(extractMacroParamNames)
    : [];
  for (const match of sql.matchAll(SQL_PARAM_PATTERN)) {
    if (match[1]) params.push(match[1]);
  }
  for (const macro of sql.matchAll(FR_MACRO_PATTERN)) {
    params.push(...extractMacroParamNames(macro[0] ?? ""));
  }
  return unique(params).sort();
}

function extractMacroParamNames(value: string): string[] {
  const text = stripQuotedText(value);
  const params: string[] = [];
  for (const token of text.matchAll(/[\p{L}_][\p{L}\p{N}_]*/gu)) {
    const name = token[0];
    if (!MACRO_STOP_WORDS.has(name.toLowerCase()) && !/^\d/u.test(name)) params.push(name);
  }
  return params;
}

function normalizeTable(value: string | undefined): string {
  if (!value) return "";
  const parts = value.replace(/[\[\]]/gu, "").split(".").filter(Boolean);
  const table = parts.at(-1) ?? "";
  if (!table || BAD_TABLE_NAMES.has(table.toLowerCase()) || table.length < 3) return "";
  const schema = parts.length >= 3 ? `${canonicalDbPart(parts[0] ?? "")}.${canonicalDbPart(parts[1] ?? "")}` : canonicalSchema(parts.at(-2));
  return `${schema}.${canonicalTableName(table)}`;
}

function canonicalSchema(value: string | undefined): string {
  if (!value) return "Erp";
  if (value.toLowerCase() === "pub") return "PUB";
  if (value.toLowerCase() === "erp") return "Erp";
  if (value.toLowerCase() === "dbo") return "dbo";
  return canonicalDbPart(value);
}

function canonicalDbPart(value: string): string {
  if (value.toLowerCase() === "dbo") return "dbo";
  if (value.toLowerCase() === "pub") return "PUB";
  return value;
}

function canonicalTableName(value: string): string {
  return TABLE_CASES.get(value.toLowerCase()) ?? (value[0]?.toUpperCase() ?? "") + value.slice(1);
}

function canonicalFieldName(value: string): string {
  if (value.toLowerCase() === "company") return "Company";
  return (value[0]?.toUpperCase() ?? "") + value.slice(1);
}

function guessModule(tables: string[]): ModuleGuess {
  const names = new Set(tables.map((table) => lastPart(table).toLowerCase()));
  const matches = Object.entries(MODULE_TABLES).filter(([, moduleTables]) => moduleTables.some((table) => names.has(table))).map(([module]) => module as ModuleGuess);
  if (matches.length > 1) return "cross_module";
  return matches[0] ?? "unknown";
}

function mergeModules(modules: ModuleGuess[]): ModuleGuess {
  const known = unique(modules.filter((module) => module !== "unknown"));
  if (known.length > 1) return "cross_module";
  return known[0] ?? "unknown";
}

function variationHints(items: ReturnType<typeof analyzeFamilyItem>[]): string[] {
  const hints: string[] = [];
  if (new Set(items.map((item) => item.normalizedHash)).size > 1) hints.push("multiple_normalized_sql_variants");
  if (unique(items.flatMap((item) => item.params)).length > 0) hints.push("parameterized_reports");
  if (items.some((item) => item.hasNonSelectRisk)) hints.push("contains_non_select_risk");
  if (items.some((item) => item.hasHardcodedCompany)) hints.push("contains_hardcoded_company");
  if (items.some((item) => item.reportPrefix !== items[0]?.reportPrefix)) hints.push("multiple_report_prefixes");
  return hints;
}

function reportPrefix(reportName: string): string {
  return reportName.replace(/\.(cpt|frm)$/iu, "").replace(/[-_（(].*$/u, "").trim().slice(0, 12);
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gmu, " ").replace(/\/\*[\s\S]*?\*\//gu, " ");
}

function stripQuotedText(value: string): string {
  return value.replace(STRING_LITERAL_PATTERN, " ");
}

function lastPart(table: string): string {
  return table.split(".").at(-1) ?? table;
}

function topCounts(values: string[], limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const sqlTemplateFamilySampler = new SqlTemplateFamilySampler();
