import "../../../config/env.js";

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { schemaRepository } from "../schema/index.js";
import { sqlTemplateRepository } from "../templates/repository/SqlTemplateRepository.js";
import { parseArgs } from "../templates/scripts/cli.js";

type MetricRow = {
  familyId: string;
  metricCode: string;
  metricName: string;
  businessDescription: string;
  calculationSummary: string;
  coreTables: unknown;
  coreJoins: unknown;
  params: unknown;
  definitionJson: unknown;
  representativeSql: string | null;
};

type TableRef = { schemaName: string; tableName: string; alias?: string };
type Issue = {
  metricCode: string;
  severity: "error" | "warning";
  kind: "invalid_table" | "invalid_field" | "unqualified_field";
  location: string;
  reference: string;
  message: string;
  evidence: Evidence[];
};
type Evidence = {
  datasetId: string;
  familyId: string;
  sourceType: "dataset";
  score: number;
  reportName?: string;
  datasetName?: string;
  tables: string[];
  fields: string[];
  sqlPreview?: string;
  matchedSignals: string[];
  reason: string;
};
type AuditReport = {
  kind: "approved_metric_catalog_audit";
  dryRun: true;
  generatedAt: string;
  summary: {
    approvedMetricCount: number;
    issueMetricCount: number;
    invalidTableCount: number;
    invalidFieldCount: number;
    unqualifiedFieldCount: number;
  };
  issues: Issue[];
};

const FIELD_REF_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/gu;
const TABLE_REF_PATTERN = /\b(?:from|join)\s+(?:(Erp|Ice|dbo)\.)?([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/giu;
const BARE_FIELD_KEYS = new Set(["timeField", "amountExpression", "valueExpression", "rateExpression"]);
const SQL_WORDS = new Set(["on", "where", "left", "right", "inner", "outer", "full", "join", "group", "order"]);
const SCHEMA_QUALIFIERS = new Set(["erp", "ice", "dbo"]);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadApprovedMetrics();
  const issues: Issue[] = [];
  let done = 0;
  console.error(`approved metric audit loaded ${rows.length} approved metrics`);

  for (const row of rows) {
    const metricIssues = await auditMetric(row);
    for (const issue of metricIssues.filter((item) => item.severity === "error")) {
      issue.evidence = await findEvidence(row, issue);
    }
    issues.push(...metricIssues);
    done += 1;
    console.error(`approved metric audit ${done}/${rows.length}: ${row.metricCode} issues=${metricIssues.length}`);
  }

  const report = buildReport(rows.length, issues);
  if (typeof args.out === "string") await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (typeof args["md-out"] === "string") await writeFile(args["md-out"], renderMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

async function loadApprovedMetrics(): Promise<MetricRow[]> {
  return prisma.$queryRaw<MetricRow[]>(Prisma.sql`
    SELECT
      family_id AS "familyId",
      metric_code AS "metricCode",
      metric_name AS "metricName",
      business_description AS "businessDescription",
      calculation_summary AS "calculationSummary",
      core_tables AS "coreTables",
      core_joins AS "coreJoins",
      params,
      definition_json AS "definitionJson",
      representative_sql AS "representativeSql"
    FROM "erp_agent"."business_metric_catalog"
    WHERE status = 'approved'
    ORDER BY metric_code
  `);
}

async function auditMetric(row: MetricRow): Promise<Issue[]> {
  const issues: Issue[] = [];
  const aliasToTable = collectAliasMap(row);

  for (const { location, table } of collectTables(row)) {
    if (!await schemaRepository.tableExists(table.schemaName, table.tableName)) {
      issues.push({
        metricCode: row.metricCode,
        severity: "error",
        kind: "invalid_table",
        location,
        reference: `${table.schemaName}.${table.tableName}`,
        message: `schema metadata missing table ${table.schemaName}.${table.tableName}`,
        evidence: [],
      });
    }
  }

  for (const { location, qualifier, fieldName } of collectMetricFieldRefsForAudit(row)) {
    const table = aliasToTable.get(qualifier.toLowerCase());
    if (!table) {
      issues.push({
        metricCode: row.metricCode,
        severity: "warning",
        kind: "unqualified_field",
        location,
        reference: `${qualifier}.${fieldName}`,
        message: `cannot resolve qualifier ${qualifier} to a core/required/join table`,
        evidence: [],
      });
      continue;
    }
    if (!await schemaRepository.fieldExists(table.schemaName, table.tableName, fieldName)) {
      issues.push({
        metricCode: row.metricCode,
        severity: "error",
        kind: "invalid_field",
        location,
        reference: `${qualifier}.${fieldName}`,
        message: `schema metadata missing field ${fieldName} on ${table.schemaName}.${table.tableName}`,
        evidence: [],
      });
    }
  }

  for (const { location, value } of collectBareFieldLocations(row)) {
    if (!FIELD_REF_PATTERN.test(value)) {
      issues.push({
        metricCode: row.metricCode,
        severity: "warning",
        kind: "unqualified_field",
        location,
        reference: value,
        message: "expression has no Table.Field reference; needs manual review before trusting approved metric semantics",
        evidence: [],
      });
    }
    FIELD_REF_PATTERN.lastIndex = 0;
  }

  return issues;
}

function collectAliasMap(row: MetricRow): Map<string, TableRef> {
  const map = new Map<string, TableRef>();
  for (const { table } of collectTables(row)) addTableAliases(map, table);
  for (const join of [...readStringArray(row.coreJoins), ...readStringArray(readRecord(row.definitionJson).joinSql)]) {
    for (const table of parseTablesFromSql(join)) addTableAliases(map, table);
  }
  for (const joins of Object.values(readRecord(readRecord(row.definitionJson).dimensionJoinSql))) {
    for (const join of readStringArray(joins)) for (const table of parseTablesFromSql(join)) addTableAliases(map, table);
  }
  return map;
}

function addTableAliases(map: Map<string, TableRef>, table: TableRef): void {
  map.set(table.tableName.toLowerCase(), table);
  if (table.alias) map.set(table.alias.toLowerCase(), table);
}

function collectTables(row: MetricRow): Array<{ location: string; table: TableRef }> {
  const definition = readRecord(row.definitionJson);
  return [
    ...readStringArray(row.coreTables).map((value, index) => ({ location: `coreTables[${index}]`, table: parseTable(value) })),
    ...readStringArray(definition.requiredTables).map((value, index) => ({ location: `definitionJson.requiredTables[${index}]`, table: parseTable(value) })),
    ...readStringArray(row.coreJoins).flatMap((value, index) => parseTablesFromSql(value).map((table) => ({ location: `coreJoins[${index}]`, table }))),
    ...readStringArray(definition.joinSql).flatMap((value, index) => parseTablesFromSql(value).map((table) => ({ location: `definitionJson.joinSql[${index}]`, table }))),
    ...Object.entries(readRecord(definition.dimensionJoinSql)).flatMap(([dimension, joins]) =>
      readStringArray(joins).flatMap((value, index) => parseTablesFromSql(value).map((table) => ({ location: `definitionJson.dimensionJoinSql.${dimension}[${index}]`, table })))
    ),
  ].filter((item) => item.table.tableName);
}

export function collectMetricFieldRefsForAudit(row: MetricRow): Array<{ location: string; qualifier: string; fieldName: string }> {
  const seen = new Set<string>();
  return collectStrings(row).flatMap(({ location, value }) => {
    const refs: Array<{ location: string; qualifier: string; fieldName: string }> = [];
    for (const match of value.matchAll(FIELD_REF_PATTERN)) {
      if (SCHEMA_QUALIFIERS.has(match[1]!.toLowerCase())) continue;
      const key = `${location}:${match[1]}.${match[2]}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ location, qualifier: match[1]!, fieldName: match[2]! });
    }
    return refs;
  });
}

function collectStrings(row: MetricRow): Array<{ location: string; value: string }> {
  const items: Array<{ location: string; value: string }> = [];
  walk(row.definitionJson, "definitionJson", items);
  readStringArray(row.coreJoins).forEach((value, index) => items.push({ location: `coreJoins[${index}]`, value }));
  return items;
}

function collectBareFieldLocations(row: MetricRow): Array<{ location: string; value: string }> {
  const result: Array<{ location: string; value: string }> = [];
  walkSelectedStrings(row.definitionJson, "definitionJson", result);
  return result;
}

function walk(value: unknown, path: string, output: Array<{ location: string; value: string }>): void {
  if (typeof value === "string") {
    output.push({ location: path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, output));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, output);
  }
}

function walkSelectedStrings(value: unknown, path: string, output: Array<{ location: string; value: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSelectedStrings(item, `${path}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (typeof child === "string" && BARE_FIELD_KEYS.has(key) && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(child)) {
      output.push({ location: childPath, value: child });
      continue;
    }
    walkSelectedStrings(child, childPath, output);
  }
}

function parseTablesFromSql(sql: string): TableRef[] {
  const tables: TableRef[] = [];
  for (const match of sql.matchAll(TABLE_REF_PATTERN)) {
    const alias = match[3] && !SQL_WORDS.has(match[3].toLowerCase()) ? match[3] : undefined;
    tables.push({ schemaName: match[1] ?? "Erp", tableName: match[2]!, ...(alias ? { alias } : {}) });
  }
  return tables;
}

function parseTable(value: string): TableRef {
  const [name, alias] = value.replace(/[\[\]"]/gu, "").trim().split(/\s+/u);
  const parts = (name ?? "").split(".");
  if (parts.length >= 2) return { schemaName: parts.at(-2) ?? "Erp", tableName: parts.at(-1) ?? "", ...(alias ? { alias } : {}) };
  return { schemaName: "Erp", tableName: name ?? "", ...(alias ? { alias } : {}) };
}

async function findEvidence(row: MetricRow, issue: Issue): Promise<Evidence[]> {
  const bad = issue.reference.replace(/^[^.]+\./u, "");
  const question = [
    row.metricCode,
    row.metricName,
    row.businessDescription,
    row.calculationSummary,
    issue.reference,
    bad,
  ].join(" ");
  const refs = await sqlTemplateRepository.findDatasetReferenceCandidates({ question, limit: 5 });
  return refs.map((reference) => ({
    datasetId: reference.datasetId,
    familyId: reference.familyId,
    sourceType: "dataset",
    score: reference.score,
    ...(reference.reportName ? { reportName: reference.reportName } : {}),
    ...(reference.datasetName ? { datasetName: reference.datasetName } : {}),
    tables: reference.coreTables,
    fields: reference.fields.slice(0, 25),
    ...(reference.exampleSql ? { sqlPreview: reference.exampleSql } : {}),
    matchedSignals: reference.matchedSignals,
    reason: evidenceReason(reference.fields, reference.coreTables, issue),
  }));
}

function evidenceReason(fields: string[], tables: string[], issue: Issue): string {
  const bad = issue.reference.split(".").at(-1)?.toLowerCase() ?? issue.reference.toLowerCase();
  const fieldHit = fields.find((field) => field.toLowerCase() !== bad && similar(field, bad));
  const tableHit = tables.find((table) => issue.message.toLowerCase().includes(table.split(".").at(-1)?.toLowerCase() ?? ""));
  if (fieldHit) return `candidate field near bad reference: ${fieldHit}`;
  if (tableHit) return `candidate reference uses related table: ${tableHit}`;
  return "matched metric/business keywords; manual review required";
}

function similar(value: string, bad: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes(bad) || bad.includes(normalized) || /part|prod|cust|order|amount|qty|date|cost|price/iu.test(`${normalized} ${bad}`);
}

function buildReport(approvedMetricCount: number, issues: Issue[]): AuditReport {
  const issueMetricCount = new Set(issues.map((issue) => issue.metricCode)).size;
  return {
    kind: "approved_metric_catalog_audit",
    dryRun: true,
    generatedAt: new Date().toISOString(),
    summary: {
      approvedMetricCount,
      issueMetricCount,
      invalidTableCount: issues.filter((issue) => issue.kind === "invalid_table").length,
      invalidFieldCount: issues.filter((issue) => issue.kind === "invalid_field").length,
      unqualifiedFieldCount: issues.filter((issue) => issue.kind === "unqualified_field").length,
    },
    issues,
  };
}

function renderMarkdown(report: AuditReport): string {
  const lines = [
    "# Approved Metric Catalog Audit",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- dryRun: ${report.dryRun}`,
    `- approvedMetricCount: ${report.summary.approvedMetricCount}`,
    `- issueMetricCount: ${report.summary.issueMetricCount}`,
    `- invalidTableCount: ${report.summary.invalidTableCount}`,
    `- invalidFieldCount: ${report.summary.invalidFieldCount}`,
    `- unqualifiedFieldCount: ${report.summary.unqualifiedFieldCount}`,
    "",
  ];
  for (const issue of report.issues) {
    lines.push(`## ${issue.metricCode} - ${issue.kind}`, "", `- severity: ${issue.severity}`, `- location: ${issue.location}`, `- reference: ${issue.reference}`, `- message: ${issue.message}`, "");
    for (const evidence of issue.evidence.slice(0, 3)) {
      lines.push(`- evidence datasetId=${evidence.datasetId} familyId=${evidence.familyId} score=${evidence.score}: ${evidence.reason}`);
      if (evidence.tables.length > 0) lines.push(`  - tables: ${evidence.tables.join(", ")}`);
      if (evidence.fields.length > 0) lines.push(`  - fields: ${evidence.fields.join(", ")}`);
      if (evidence.sqlPreview) lines.push(`  - sqlPreview: ${evidence.sqlPreview.replace(/\s+/gu, " ").slice(0, 500)}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
