import crypto from "node:crypto";
import type { SqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import type { SqlTemplateAnalysisDataset } from "../types/SqlTemplateTypes.js";

type ModuleName = "production" | "purchase" | "sales" | "inventory" | "finance" | "unknown";
type QualityGrade = "A" | "B" | "C" | "D";
type RiskLevel = "high" | "medium" | "low";

export type SqlTemplateAnalysisOptions = {
  sourceType: string;
  module?: ModuleName;
  limit?: number;
  onProgress?: (progress: { done: number; total: number }) => void;
};

const NON_SELECT_PATTERN = /\b(insert|update|delete|merge|drop|truncate|alter|create|exec|execute)\b/iu;
const FR_PARAM_PATTERN = /\$\{\s*([^}]+?)\s*\}/gu;
const SQL_PARAM_PATTERN = /[@:]([A-Za-z_][\w]*)/gu;
const COMPANY_PATTERN = /\bCompany\b\s*(?:=|in\s*\()\s*'?([A-Za-z0-9_]+)'?/giu;
const DATE_FIELD_PATTERN = /\b\w*(?:date|duedate|needbydate|shipby|requestdate|changedate|createdate|closedate)\b/iu;
const CORE_TABLES = new Set([
  "jobhead", "joboper", "jobmtl", "labordtl",
  "poheader", "podetail", "porel", "rcvdtl",
  "orderhed", "orderdtl", "orderrel", "shipdtl", "invcdtl",
  "parttran", "partwhse", "partbin", "partqty",
  "tranglc", "gljrndtl", "apinv", "apinvhed", "apinvdtl", "invchead",
]);
const MODULE_TABLES: Array<{ module: ModuleName; tables: string[] }> = [
  { module: "production", tables: ["jobhead", "joboper", "jobmtl", "labordtl"] },
  { module: "purchase", tables: ["poheader", "podetail", "porel", "rcvdtl"] },
  { module: "sales", tables: ["orderhed", "orderdtl", "orderrel", "shipdtl", "invcdtl"] },
  { module: "inventory", tables: ["parttran", "partwhse", "partbin", "partqty"] },
  { module: "finance", tables: ["tranglc", "gljrndtl", "apinv", "apinvhed", "apinvdtl", "invchead"] },
];
const DEFAULT_COMPANIES = new Set(["jctimes", "jingyimt"]);

export class SqlTemplateAnalysisService {
  constructor(private readonly repository: Pick<SqlTemplateRepository, "findDatasetsForAnalysis"> = sqlTemplateRepository) {}

  async analyze(options: SqlTemplateAnalysisOptions) {
    const rows = await this.repository.findDatasetsForAnalysis(options.limit);
    const analyzed = rows.map((row, index) => {
      const item = analyzeDataset(row);
      options.onProgress?.({ done: index + 1, total: rows.length });
      return item;
    }).filter((item) => !options.module || item.module === options.module);

    return buildReport(options, analyzed);
  }
}

export function analyzeDataset(row: SqlTemplateAnalysisDataset) {
  const sql = row.rawSql;
  const normalizedSql = normalizeSql(sql);
  const tables = extractTables(sql);
  const joins = extractJoins(sql);
  const whereFields = extractWhereFields(sql);
  const params = uniqueStrings([...readStringArray(row.dynamicParams), ...extractParams(sql)]);
  const hardcodedCompanies = uniqueStrings([...sql.matchAll(COMPANY_PATTERN)].map((match) => match[1]).filter(Boolean));
  const hasNonSelectRisk = NON_SELECT_PATTERN.test(sql);
  const sqlType = /^\s*(select|with)\b/iu.test(sql) ? "select" : "unknown";
  const hasFanruanMacro = /\$\{/u.test(sql);
  const hasDynamicParameter = params.length > 0 || hasFanruanMacro;
  const module = identifyModule(tables);
  const selectedFields = extractSelectedFields(sql);
  const groupByFields = extractClauseFields(sql, "group by", "order by");
  const orderByFields = extractClauseFields(sql, "order by");
  const hasTopOrAggregate = /\b(top\s+\d+|limit\s+\d+|count\s*\(|sum\s*\(|avg\s*\(|min\s*\(|max\s*\()/iu.test(sql);
  const hasCompanyFilter = hardcodedCompanies.length > 0 || /\bCompany\b\s*(=|in\b|like\b)/iu.test(sql);
  const hasCompanyOutput = /\bselect[\s\S]{0,600}\bCompany\b/iu.test(sql);
  const hasDateFilter = DATE_FIELD_PATTERN.test(sql) && /\b(where|and)\b[\s\S]*\b(date|duedate|needbydate|shipby|requestdate|changedate|createdate|closedate)\b[\s\S]*(=|>|<|between|dateadd|getdate)/iu.test(sql);
  const missingCompanyJoins = joins.filter((join) => join.missingCompany);
  const missingCompanyJoinSeverity = classifyMissingCompanyJoin(missingCompanyJoins.length, hardcodedCompanies, hasCompanyFilter);
  const issues = buildIssues({
    hasNonSelectRisk,
    hasFanruanMacro,
    hasDynamicParameter,
    missingCompanyJoinSeverity,
    hardcodedCompanies,
    selectedFields,
    whereFields,
    joins,
    sql,
  });
  const qualityScore = scoreSql({
    sqlType,
    module,
    tables,
    joins,
    params,
    selectedFields,
    whereFields,
    hasTopOrAggregate,
    hasCompanyFilter,
    hasCompanyOutput,
    hasDateFilter,
    hasNonSelectRisk,
    hasFanruanMacro,
    hardcodedCompanies,
    missingCompanyJoinSeverity,
    sql,
  });
  const qualityGrade = grade(qualityScore);

  return {
    datasetId: row.id.toString(),
    datasetIdBigInt: row.id,
    reportName: row.reportFile.reportName ?? row.reportFile.relativePath,
    datasetName: row.datasetName ?? "",
    sqlHash: row.sqlHash || sha256(normalizedSql),
    normalizedSql,
    sqlType,
    parseStatus: tables.length || sqlType === "select" ? "partial" : "failed",
    module,
    tables,
    joins,
    selectedFields,
    whereFields,
    groupByFields,
    orderByFields,
    params,
    hardcodedCompanies,
    hasFanruanMacro,
    hasDynamicParameter,
    hasNonSelectRisk,
    hasHardcodedCompany: hardcodedCompanies.length > 0,
    missingCompanyJoinCount: missingCompanyJoins.length,
    missingCompanyJoinSeverity,
    qualityScore,
    qualityGrade,
    riskLevel: riskLevel(qualityGrade, issues),
    issues,
    sqlPreview: preview(sql),
  };
}

function buildReport(options: SqlTemplateAnalysisOptions, items: ReturnType<typeof analyzeDataset>[]) {
  const distinctHashes = new Set(items.map((item) => item.sqlHash));
  const moduleStats = [...groupBy(items, (item) => item.module).entries()].map(([module, rows]) => ({
    module,
    count: rows.length,
    selectCount: rows.filter((item) => item.sqlType === "select").length,
    riskCount: rows.filter((item) => item.issues.length > 0).length,
  })).sort((a, b) => b.count - a.count);
  const topTables = topTableStats(items);
  const topJoins = topJoinStats(items);
  const topWhereFields = topCounts(items.flatMap((item) => item.whereFields), 100).map(([field, count]) => ({ field, count }));
  const topParameters = topCounts(items.flatMap((item) => item.params), 100).map(([name, count]) => ({ name, count, likelyType: likelyParamType(name) }));
  const companyStats = buildCompanyStats(items);
  const qualityStats = ["A", "B", "C", "D"].map((qualityGrade) => ({
    qualityGrade,
    count: items.filter((item) => item.qualityGrade === qualityGrade).length,
  }));
  const riskSamples = items
    .filter((item) => item.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length || a.qualityScore - b.qualityScore)
    .slice(0, 100)
    .map((item) => pickRiskSample(item));
  const parseFailedSamples = items
    .filter((item) => item.parseStatus === "failed")
    .slice(0, 50)
    .map((item) => pickRiskSample(item));
  const templateCandidates = items
    .filter((item) => item.qualityGrade === "A" && item.sqlType === "select" && !item.hasNonSelectRisk && item.module !== "unknown")
    .slice(0, 100)
    .map((item) => ({
      datasetId: Number(item.datasetId),
      reportName: item.reportName,
      datasetName: item.datasetName,
      module: item.module,
      suggestedIntent: suggestIntent(item.module, item.tables),
      qualityScore: item.qualityScore,
      qualityGrade: item.qualityGrade,
      tables: item.tables,
      params: item.params,
      reason: `SELECT SQL with ${item.module} tables, identifiable structure, and quality grade A.`,
    }));

  return {
    generatedAt: new Date().toISOString(),
    sourceType: options.sourceType,
    filters: { module: options.module, limit: options.limit },
    summary: {
      totalDatasets: items.length,
      validSqlCount: items.filter((item) => item.parseStatus !== "failed").length,
      selectSqlCount: items.filter((item) => item.sqlType === "select").length,
      nonSelectRiskCount: items.filter((item) => item.hasNonSelectRisk).length,
      parseFailedCount: items.filter((item) => item.parseStatus === "failed").length,
      distinctSqlHashCount: distinctHashes.size,
      duplicateSqlCount: items.length - distinctHashes.size,
      fanruanMacroCount: items.filter((item) => item.hasFanruanMacro).length,
      dynamicParameterCount: items.filter((item) => item.hasDynamicParameter).length,
      hardcodedCompanyCount: items.filter((item) => item.hasHardcodedCompany).length,
      missingCompanyJoinCount: items.filter((item) => item.missingCompanyJoinCount > 0).length,
    },
    moduleStats,
    topTables,
    topJoins,
    topWhereFields,
    topParameters,
    companyStats,
    qualityStats,
    riskSamples,
    templateCandidates,
    knowledgeBaseSuggestions: buildKnowledgeSuggestions(items, topJoins, topWhereFields),
    parseFailedSamples,
  };
}

function extractTables(sql: string): string[] {
  const tables: string[] = [];
  const pattern = /\b(?:from|join)\s+((?:\[?\w+\]?\.)?\[?\w+\]?)(?:\s+(?:as\s+)?(\w+))?/giu;
  for (const match of sql.matchAll(pattern)) {
    const table = normalizeTable(match[1]);
    if (table && !table.startsWith("#")) tables.push(table);
  }
  return uniqueStrings(tables);
}

function extractJoins(sql: string) {
  const aliases = collectAliases(sql);
  const joins: Array<{ leftTable: string; rightTable: string; normalizedCondition: string; missingCompany: boolean }> = [];
  let leftTable = "";
  const fromMatch = /\bfrom\s+((?:\[?\w+\]?\.)?\[?\w+\]?)(?:\s+(?:as\s+)?(\w+))?/iu.exec(sql);
  if (fromMatch) leftTable = normalizeTable(fromMatch[1]);

  const joinPattern = /\b(?:inner|left(?:\s+outer)?|right(?:\s+outer)?|full(?:\s+outer)?|cross)?\s*join\s+((?:\[?\w+\]?\.)?\[?\w+\]?)(?:\s+(?:as\s+)?(\w+))?\s+on\s+([\s\S]*?)(?=\b(?:inner|left|right|full|cross)?\s*join\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|$)/giu;
  for (const match of sql.matchAll(joinPattern)) {
    const rightTable = normalizeTable(match[1]);
    const condition = match[3] ?? "";
    const keys = extractJoinKeys(condition, aliases);
    if (leftTable && rightTable) {
      joins.push({
        leftTable,
        rightTable,
        normalizedCondition: keys.length ? keys.join(" + ") : normalizeCondition(condition),
        missingCompany: isCoreTable(leftTable) && isCoreTable(rightTable) && !keys.some((key) => key.toLowerCase() === "company"),
      });
    }
    leftTable = rightTable || leftTable;
  }
  return joins;
}

function collectAliases(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const pattern = /\b(?:from|join)\s+((?:\[?\w+\]?\.)?\[?\w+\]?)(?:\s+(?:as\s+)?(\w+))?/giu;
  for (const match of sql.matchAll(pattern)) {
    const table = normalizeTable(match[1]);
    const alias = match[2];
    if (table) aliases.set(tableName(table).toLowerCase(), table);
    if (table && alias && !RESERVED_ALIAS_WORDS.has(alias.toLowerCase())) aliases.set(alias.toLowerCase(), table);
  }
  return aliases;
}

const RESERVED_ALIAS_WORDS = new Set(["on", "where", "inner", "left", "right", "full", "join", "group", "order"]);

function extractJoinKeys(condition: string, aliases: Map<string, string>): string[] {
  const keys: string[] = [];
  const pattern = /\b(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\b/giu;
  for (const match of condition.matchAll(pattern)) {
    const leftAlias = match[1]?.toLowerCase() ?? "";
    const rightAlias = match[3]?.toLowerCase() ?? "";
    if (aliases.has(leftAlias) && aliases.has(rightAlias) && match[2]?.toLowerCase() === match[4]?.toLowerCase()) {
      keys.push(match[2]);
    }
  }
  return uniqueStrings(keys).sort((a, b) => a === "Company" ? -1 : b === "Company" ? 1 : a.localeCompare(b));
}

function extractWhereFields(sql: string): string[] {
  const where = clause(sql, "where", ["group by", "order by"]);
  if (!where) return [];
  const fields: string[] = [];
  for (const match of where.matchAll(/\b(?:(\w+)\.)?(\w+)\s*(=|<>|!=|>=|<=|>|<|like\b|in\b|between\b)/giu)) {
    fields.push(match[1] ? `${match[1]}.${match[2]}` : match[2]);
  }
  return uniqueStrings(fields);
}

function extractSelectedFields(sql: string): string[] {
  const match = /\bselect\b\s+(?:top\s+\d+\s+)?([\s\S]*?)\bfrom\b/iu.exec(sql);
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim().replace(/\s+as\s+.+$/iu, "")).filter(Boolean).slice(0, 200);
}

function extractClauseFields(sql: string, start: string, end?: string): string[] {
  const text = clause(sql, start, end ? [end] : []);
  return text ? text.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function clause(sql: string, start: string, ends: string[]): string {
  const lower = sql.toLowerCase();
  const startIndex = lower.indexOf(start);
  if (startIndex < 0) return "";
  const contentStart = startIndex + start.length;
  const endIndexes = ends.map((end) => lower.indexOf(end, contentStart)).filter((index) => index >= 0);
  const endIndex = endIndexes.length ? Math.min(...endIndexes) : sql.length;
  return sql.slice(contentStart, endIndex);
}

function extractParams(sql: string): string[] {
  return uniqueStrings([
    ...[...sql.matchAll(FR_PARAM_PATTERN)].map((match) => match[1]?.trim()).filter((item): item is string => Boolean(item)),
    ...[...sql.matchAll(SQL_PARAM_PATTERN)].map((match) => match[1]).filter((item): item is string => Boolean(item)),
  ]);
}

function identifyModule(tables: string[]): ModuleName {
  const names = tables.map((item) => tableName(item).toLowerCase());
  return MODULE_TABLES.find((entry) => entry.tables.some((table) => names.includes(table)))?.module ?? "unknown";
}

function classifyMissingCompanyJoin(count: number, companies: string[], hasCompanyFilter: boolean) {
  if (count === 0) return "none";
  if (!hasCompanyFilter) return "high";
  if (companies.some((company) => DEFAULT_COMPANIES.has(company.toLowerCase()))) return "medium";
  return "low";
}

function buildIssues(input: {
  hasNonSelectRisk: boolean;
  hasFanruanMacro: boolean;
  hasDynamicParameter: boolean;
  missingCompanyJoinSeverity: string;
  hardcodedCompanies: string[];
  selectedFields: string[];
  whereFields: string[];
  joins: unknown[];
  sql: string;
}) {
  const issues: string[] = [];
  if (input.hasNonSelectRisk) issues.push("non_select_keyword");
  if (input.hasFanruanMacro || input.hasDynamicParameter) issues.push("dynamic_parameter");
  if (input.hardcodedCompanies.some((company) => company.toLowerCase() === "jytimes")) issues.push("excluded_company_jytimes");
  if (input.missingCompanyJoinSeverity !== "none") issues.push("missing_company_join");
  if (input.selectedFields.length === 0) issues.push("selected_fields_unparsed");
  if (/\bwhere\b/iu.test(input.sql) && input.whereFields.length === 0) issues.push("where_unparsed");
  if (/\bjoin\b/iu.test(input.sql) && input.joins.length === 0) issues.push("join_unparsed");
  return uniqueStrings(issues);
}

function scoreSql(input: {
  sqlType: string;
  module: ModuleName;
  tables: string[];
  joins: Array<{ missingCompany: boolean }>;
  params: string[];
  selectedFields: string[];
  whereFields: string[];
  hasTopOrAggregate: boolean;
  hasCompanyFilter: boolean;
  hasCompanyOutput: boolean;
  hasDateFilter: boolean;
  hasNonSelectRisk: boolean;
  hasFanruanMacro: boolean;
  hardcodedCompanies: string[];
  missingCompanyJoinSeverity: string;
  sql: string;
}) {
  let score = 60;
  if (input.sqlType === "select") score += 15;
  if (input.module !== "unknown") score += 10;
  if (input.tables.some(isCoreTable)) score += 10;
  if (!/\bjoin\b/iu.test(input.sql) || input.joins.length > 0) score += 10;
  if (input.params.length > 0) score += 10;
  if (input.selectedFields.length > 0) score += 10;
  if (input.hasTopOrAggregate) score += 5;
  if (input.hasCompanyFilter || input.hasCompanyOutput) score += 5;
  if (input.hasDateFilter) score += 5;
  if (input.hasNonSelectRisk) score -= 50;
  if (input.tables.length === 0 && input.sqlType !== "select") score -= 25;
  if (input.hasFanruanMacro) score -= 20;
  if (input.sql.split(";").filter((part) => part.trim()).length > 1) score -= 20;
  if (input.hardcodedCompanies.some((company) => company.toLowerCase() === "jytimes")) score -= 15;
  if (input.hardcodedCompanies.some((company) => DEFAULT_COMPANIES.has(company.toLowerCase()))) score -= 10;
  if (input.missingCompanyJoinSeverity === "high") score -= 25;
  if (input.missingCompanyJoinSeverity === "medium") score -= 15;
  if (input.missingCompanyJoinSeverity === "low") score -= 5;
  if (DATE_FIELD_PATTERN.test(input.sql) && !input.hasDateFilter) score -= 15;
  if (input.selectedFields.length === 0) score -= 10;
  if (/\bwhere\b/iu.test(input.sql) && input.whereFields.length === 0) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function grade(score: number): QualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function riskLevel(qualityGrade: QualityGrade, issues: string[]): RiskLevel {
  if (qualityGrade === "D" || issues.includes("non_select_keyword")) return "high";
  if (qualityGrade === "C" || issues.length >= 2) return "medium";
  return "low";
}

function topTableStats(items: ReturnType<typeof analyzeDataset>[]) {
  return [...groupBy(items.flatMap((item) => item.tables.map((table) => ({ table, module: item.module }))), (item) => item.table).entries()]
    .map(([table, rows]) => ({ table, count: rows.length, modules: uniqueStrings(rows.map((row) => row.module)).sort() }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);
}

function topJoinStats(items: ReturnType<typeof analyzeDataset>[]) {
  const rows = items.flatMap((item) => item.joins.map((join) => ({ ...join, datasetId: Number(item.datasetId) })));
  return [...groupBy(rows, (row) => `${row.leftTable}\0${row.rightTable}\0${row.normalizedCondition}`).entries()]
    .map(([_key, group]) => ({
      leftTable: group[0]?.leftTable ?? "",
      rightTable: group[0]?.rightTable ?? "",
      normalizedCondition: group[0]?.normalizedCondition ?? "",
      count: group.length,
      missingCompanyCount: group.filter((row) => row.missingCompany).length,
      sampleDatasetIds: group.slice(0, 5).map((row) => row.datasetId),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);
}

function buildCompanyStats(items: ReturnType<typeof analyzeDataset>[]) {
  const companies = topCounts(items.flatMap((item) => item.hardcodedCompanies), 100).map(([company, count]) => ({ company, count }));
  return {
    hardcodedCompanies: companies,
    defaultScopeSqlCount: items.filter((item) => item.hardcodedCompanies.some((company) => DEFAULT_COMPANIES.has(company.toLowerCase()))).length,
    excludedCompanySqlCount: items.filter((item) => item.hardcodedCompanies.some((company) => company.toLowerCase() === "jytimes")).length,
    noCompanyFilterCount: items.filter((item) => item.hardcodedCompanies.length === 0 && !item.whereFields.some((field) => /company/iu.test(field))).length,
  };
}

function buildKnowledgeSuggestions(
  items: ReturnType<typeof analyzeDataset>[],
  topJoins: ReturnType<typeof topJoinStats>,
  topWhereFields: Array<{ field: string; count: number }>,
) {
  const dateFields = topWhereFields.filter((item) => DATE_FIELD_PATTERN.test(item.field)).slice(0, 30);
  const statusFields = topWhereFields.filter((item) => /(closed|complete|status|openorder)/iu.test(item.field)).slice(0, 30);
  return {
    joinRules: topJoins.slice(0, 50).map((join) => ({
      leftTable: join.leftTable,
      rightTable: join.rightTable,
      condition: join.normalizedCondition,
      sampleCount: join.count,
      confidence: join.count >= 20 ? "high" : join.count >= 3 ? "medium" : "low",
      source: "finereport_cpt_analysis",
    })),
    fieldUsage: topWhereFields.slice(0, 50).map((field) => ({
      field: field.field,
      usage: inferFieldUsage(field.field),
      sampleCount: field.count,
      confidence: field.count >= 20 ? "high" : "medium",
      source: "finereport_cpt_analysis",
    })),
    dateFields: dateFields.map((field) => ({
      field: field.field,
      usage: "date filter field",
      sampleCount: field.count,
      confidence: field.count >= 20 ? "high" : "medium",
      source: "finereport_cpt_analysis",
      note: "Need abnormal future date guard when used for recent/latest queries.",
    })),
    statusFilters: statusFields.map((field) => ({
      field: field.field,
      commonCondition: `${field.field.split(".").at(-1)} = 0`,
      meaning: "common status filter candidate",
      sampleCount: field.count,
      confidence: field.count >= 20 ? "high" : "medium",
      source: "finereport_cpt_analysis",
    })),
    customTableSemantics: topCounts(items.flatMap((item) => item.tables.filter((table) => !isCoreTable(table))), 30).map(([table, count]) => ({
      table,
      possibleMeaning: "custom or less-common table found in historical reports",
      sampleCount: count,
      confidence: count >= 20 ? "medium" : "low",
      source: "finereport_cpt_analysis",
      note: "Needs schema verification before becoming hard rule.",
    })),
  };
}

function pickRiskSample(item: ReturnType<typeof analyzeDataset>) {
  return {
    datasetId: Number(item.datasetId),
    reportName: item.reportName,
    datasetName: item.datasetName,
    riskLevel: item.riskLevel,
    qualityScore: item.qualityScore,
    qualityGrade: item.qualityGrade,
    issues: item.issues,
    sqlPreview: item.sqlPreview,
  };
}

function suggestIntent(module: ModuleName, tables: string[]): string {
  const names = tables.map((item) => tableName(item).toLowerCase());
  if (module === "production" && names.includes("jobhead")) return "production_job_report";
  if (module === "purchase" && names.includes("poheader")) return "purchase_order_report";
  if (module === "sales" && names.includes("orderhed")) return "sales_order_report";
  if (module === "inventory" && names.some((name) => name.startsWith("part"))) return "inventory_part_report";
  if (module === "finance") return "finance_transaction_report";
  return `${module}_report`;
}

function inferFieldUsage(field: string): string {
  const name = field.toLowerCase();
  if (name.includes("jobnum")) return "job identifier";
  if (name.includes("partnum")) return "part identifier";
  if (name.includes("ponum")) return "purchase order identifier";
  if (name.includes("ordernum")) return "sales order identifier";
  if (name.includes("company")) return "company scope";
  return "frequent filter field";
}

function likelyParamType(name: string): string {
  if (/(date|time|day|month|year)/iu.test(name)) return "date";
  if (/(qty|num|count|amount|price|total|id)$/iu.test(name) && !/(partnum|jobnum|ponum|ordernum)/iu.test(name)) return "number";
  return "string";
}

function normalizeTable(value: string | undefined): string {
  const clean = value?.replace(/[\[\]]/gu, "").trim() ?? "";
  if (!clean || clean.startsWith("(")) return "";
  return clean.includes(".") ? clean.split(".").map(capitalizeIdentifier).join(".") : `Erp.${capitalizeIdentifier(clean)}`;
}

function tableName(table: string): string {
  return table.split(".").at(-1) ?? table;
}

function isCoreTable(table: string): boolean {
  return CORE_TABLES.has(tableName(table).toLowerCase());
}

function normalizeCondition(condition: string): string {
  return normalizeSql(condition).slice(0, 160);
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

function preview(sql: string): string {
  return normalizeSql(sql).slice(0, 220);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function capitalizeIdentifier(value: string): string {
  return value ? value[0]?.toUpperCase() + value.slice(1) : value;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
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

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

export const sqlTemplateAnalysisService = new SqlTemplateAnalysisService();
