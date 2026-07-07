import "../../../../config/env.js";

import { Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { prisma } from "../../../../lib/prisma.js";
import { buildSqlDatasetReferenceAuditReport } from "./auditSqlDatasetReferenceIndex.js";
import { parseArgs } from "./cli.js";

export type DatasetRow = {
  datasetId: bigint;
  sqlHash: string;
  rawSql: string;
  datasetName: string | null;
  dynamicParams: unknown;
  riskFlags: unknown;
  reportName: string | null;
};

export type FamilyRow = {
  familyId: string;
  module: string;
  intent: string;
  businessDescription: string;
  representativeDatasetId: bigint | null;
  sampleDatasetIds: unknown;
};

type VerifiedDatasetRow = {
  sourceDatasetId: bigint | null;
  sourceDatasetIds: unknown;
};

type TemplateQuestionRow = {
  sourceDatasetId: bigint | null;
  sourceDatasetIds: unknown;
  questionPattern: string | null;
  normalizedQuestion: string | null;
};

export type IndexRow = {
  datasetId: bigint;
  sqlHash: string;
  familyId: string;
  module: string | null;
  intent: string | null;
  reportName: string | null;
  datasetName: string | null;
  questionText: string;
  sqlText: string;
  tables: string[];
  fields: string[];
  metrics: string[];
  params: string[];
  riskFlags: string[];
  keywords: string[];
  summary: string;
  businessDescription: string;
  timeScope: string;
  businessScenario: string;
  isFinance: boolean;
  verified: boolean;
  normalizedSqlPreview: string;
  embeddingText: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const limit = typeof args.limit === "string" ? Number(args.limit) : undefined;
  const [datasets, families, verifiedDatasetIds, templateQuestions] = await Promise.all([loadDatasets(limit), loadFamilies(), loadVerifiedDatasetIds(), loadTemplateQuestions()]);
  const familyByDatasetId = mapFamilies(families);
  const rows = datasets.map((dataset) => buildIndexRow(
    dataset,
    familyByDatasetId.get(dataset.datasetId.toString()) ?? null,
    verifiedDatasetIds,
    templateQuestions.get(dataset.datasetId.toString()) ?? [],
  ));
  if (apply) await upsertIndexRows(rows);
  console.log(JSON.stringify(buildSqlDatasetReferenceIndexReport(rows, datasets.length, apply), null, 2));
}

async function loadDatasets(limit?: number): Promise<DatasetRow[]> {
  return prisma.$queryRaw<DatasetRow[]>(Prisma.sql`
    SELECT
      dataset.id AS "datasetId",
      dataset.sql_hash AS "sqlHash",
      dataset.raw_sql AS "rawSql",
      dataset.dataset_name AS "datasetName",
      dataset.dynamic_params AS "dynamicParams",
      dataset.risk_flags AS "riskFlags",
      file.report_name AS "reportName"
    FROM "erp_agent"."sql_template_dataset" dataset
    JOIN "erp_agent"."sql_template_report_file" file ON file.id = dataset.report_file_id
    ORDER BY dataset.id
    ${limit && Number.isFinite(limit) ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `);
}

async function loadFamilies(): Promise<FamilyRow[]> {
  return prisma.$queryRaw<FamilyRow[]>(Prisma.sql`
    SELECT
      family_id AS "familyId",
      module,
      intent,
      business_description AS "businessDescription",
      representative_dataset_id AS "representativeDatasetId",
      sample_dataset_ids AS "sampleDatasetIds"
    FROM "erp_agent"."erp_sql_reference_family"
    WHERE is_enabled = TRUE
  `);
}

async function loadVerifiedDatasetIds(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<VerifiedDatasetRow[]>(Prisma.sql`
    SELECT
      source_dataset_id AS "sourceDatasetId",
      source_dataset_ids AS "sourceDatasetIds"
    FROM "erp_agent"."erp_query_templates"
    WHERE approved = TRUE
      AND approval_status = 'approved'
      AND guard_passed = TRUE
  `);
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.sourceDatasetId) ids.add(row.sourceDatasetId.toString());
    for (const id of readStringArray(row.sourceDatasetIds)) ids.add(id);
  }
  return ids;
}

async function loadTemplateQuestions(): Promise<Map<string, string[]>> {
  const rows = await prisma.$queryRaw<TemplateQuestionRow[]>(Prisma.sql`
    SELECT
      source_dataset_id AS "sourceDatasetId",
      source_dataset_ids AS "sourceDatasetIds",
      question_pattern AS "questionPattern",
      normalized_question AS "normalizedQuestion"
    FROM "erp_agent"."erp_query_templates"
    WHERE source_dataset_id IS NOT NULL OR source_dataset_ids <> '[]'::jsonb
  `);
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const questions = [row.normalizedQuestion, row.questionPattern].filter((item): item is string => Boolean(item?.trim()));
    if (questions.length === 0) continue;
    const ids = [
      ...(row.sourceDatasetId ? [row.sourceDatasetId.toString()] : []),
      ...readStringArray(row.sourceDatasetIds),
    ];
    for (const id of ids) map.set(id, unique([...(map.get(id) ?? []), ...questions]));
  }
  return map;
}

function mapFamilies(rows: FamilyRow[]): Map<string, FamilyRow> {
  const map = new Map<string, FamilyRow>();
  for (const row of rows) {
    if (row.representativeDatasetId) map.set(row.representativeDatasetId.toString(), row);
    for (const id of readStringArray(row.sampleDatasetIds)) map.set(id, row);
  }
  return map;
}

export function buildIndexRow(dataset: DatasetRow, family: FamilyRow | null, verifiedDatasetIds = new Set<string>(), templateQuestions: string[] = []): IndexRow {
  const extractedTables = extractTables(dataset.rawSql);
  const tables = extractedTables.length ? extractedTables : inferSourceFallback(dataset.rawSql);
  const extractedFields = extractFields(dataset.rawSql);
  const fields = extractedFields.length ? extractedFields : inferFieldFallback(dataset.rawSql);
  const metrics = extractMetrics(dataset.rawSql, [dataset.reportName, dataset.datasetName, family?.businessDescription].filter(Boolean).join(" "));
  const timeScope = extractTimeScope(dataset.rawSql, fields);
  const businessScenario = family?.businessDescription || dataset.reportName || dataset.datasetName || buildScenarioFallback(tables);
  const isFinance = isFinanceSql(dataset.rawSql, [businessScenario, ...metrics].join(" "));
  const params = extractParams(dataset.rawSql, dataset.dynamicParams);
  const riskFlags = readStringArray(dataset.riskFlags);
  const questionText = buildQuestionText(dataset, family, metrics, templateQuestions, tables);
  const keywords = unique([
    ...tokenize(questionText),
    ...tokenize(dataset.reportName ?? ""),
    ...tokenize(dataset.datasetName ?? ""),
    ...tokenize(family?.businessDescription ?? ""),
    ...tables,
    ...fields.slice(0, 30),
    ...metrics,
    ...params,
  ]).slice(0, 80);
  const summary = unique([dataset.reportName, dataset.datasetName, family?.businessDescription, ...tables.slice(0, 8)].filter(Boolean) as string[]).join(" ");
  const normalizedSqlPreview = normalizeSql(dataset.rawSql).slice(0, 3000);
  const module = family?.module ?? inferModule(tables);
  const intent = family?.intent ?? inferIntent(dataset.rawSql);
  return {
    datasetId: dataset.datasetId,
    sqlHash: dataset.sqlHash,
    familyId: family?.familyId ?? "unclassified",
    module,
    intent,
    reportName: dataset.reportName,
    datasetName: dataset.datasetName,
    questionText,
    sqlText: dataset.rawSql,
    tables,
    fields,
    metrics,
    params,
    riskFlags,
    keywords,
    summary,
    businessDescription: family?.businessDescription ?? summary,
    timeScope,
    businessScenario,
    isFinance,
    verified: verifiedDatasetIds.has(dataset.datasetId.toString()),
    normalizedSqlPreview,
    embeddingText: [questionText, summary, businessScenario, metrics.join(" "), keywords.join(" "), normalizedSqlPreview.slice(0, 1000)].filter(Boolean).join("\n"),
  };
}

export function buildSqlDatasetReferenceIndexReport(rows: IndexRow[], datasetCount: number, apply: boolean) {
  const audit = buildSqlDatasetReferenceAuditReport(rows, datasetCount, { topK: 5 });
  return {
    mode: apply ? "apply" : "dry-run",
    datasetCount,
    indexedCount: rows.length,
    familyLinkedCount: rows.filter((row) => row.familyId !== "unclassified").length,
    audit: {
      summary: audit.summary,
      fieldGaps: audit.fieldGaps,
      metricCounts: audit.metricCounts,
    },
    sample: rows.slice(0, 3).map((row) => ({
      datasetId: row.datasetId.toString(),
      familyId: row.familyId,
      reportName: row.reportName,
      tables: row.tables.slice(0, 5),
      keywords: row.keywords.slice(0, 8),
      metrics: row.metrics,
      timeScope: row.timeScope,
      isFinance: row.isFinance,
      verified: row.verified,
    })),
  };
}

async function upsertIndexRows(rows: IndexRow[]): Promise<void> {
  for (const chunk of chunks(rows, 500)) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "erp_agent"."sql_dataset_reference_index" AS current_index (
        dataset_id, sql_hash, family_id, module, intent, report_name, dataset_name, question_text, sql_text,
        tables, fields, metrics, params, risk_flags, keywords, summary, business_description,
        time_scope, business_scenario, is_finance, verified, normalized_sql_preview, embedding_text, updated_at
      )
      VALUES ${Prisma.join(chunk.map((row) => Prisma.sql`(
        ${row.datasetId},
        ${row.sqlHash},
        ${row.familyId},
        ${row.module},
        ${row.intent},
        ${row.reportName},
        ${row.datasetName},
        ${row.questionText},
        ${row.sqlText},
        ${JSON.stringify(row.tables)}::jsonb,
        ${JSON.stringify(row.fields)}::jsonb,
        ${JSON.stringify(row.metrics)}::jsonb,
        ${JSON.stringify(row.params)}::jsonb,
        ${JSON.stringify(row.riskFlags)}::jsonb,
        ${JSON.stringify(row.keywords)}::jsonb,
        ${row.summary},
        ${row.businessDescription},
        ${row.timeScope},
        ${row.businessScenario},
        ${row.isFinance},
        ${row.verified},
        ${row.normalizedSqlPreview},
        ${row.embeddingText},
        CURRENT_TIMESTAMP
      )`))}
      ON CONFLICT (dataset_id) DO UPDATE SET
        sql_hash = excluded.sql_hash,
        family_id = excluded.family_id,
        module = excluded.module,
        intent = excluded.intent,
        report_name = excluded.report_name,
        dataset_name = excluded.dataset_name,
        question_text = excluded.question_text,
        sql_text = excluded.sql_text,
        tables = excluded.tables,
        fields = excluded.fields,
        metrics = excluded.metrics,
        params = excluded.params,
        risk_flags = excluded.risk_flags,
        keywords = excluded.keywords,
        summary = excluded.summary,
        business_description = excluded.business_description,
        time_scope = excluded.time_scope,
        business_scenario = excluded.business_scenario,
        is_finance = excluded.is_finance,
        verified = excluded.verified,
        normalized_sql_preview = excluded.normalized_sql_preview,
        embedding_text = excluded.embedding_text,
        embedding_vector_json = CASE WHEN current_index.embedding_text IS DISTINCT FROM excluded.embedding_text THEN NULL ELSE current_index.embedding_vector_json END,
        embedding_model = CASE WHEN current_index.embedding_text IS DISTINCT FROM excluded.embedding_text THEN NULL ELSE current_index.embedding_model END,
        embedding_updated_at = CASE WHEN current_index.embedding_text IS DISTINCT FROM excluded.embedding_text THEN NULL ELSE current_index.embedding_updated_at END,
        updated_at = CURRENT_TIMESTAMP
    `);
  }
}

function extractTables(sql: string): string[] {
  const tables: string[] = [];
  for (const segment of sql.matchAll(/\bfrom\s+([\s\S]*?)(?=\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\bunion\b|$)/giu)) {
    for (const part of splitTopLevelComma(segment[1] ?? "")) {
      const table = readLeadingIdentifier(part);
      if (table) tables.push(table);
    }
  }
  for (const match of sql.matchAll(/\bjoin\s+([\s\S]*?)(?=\bon\b|\bwhere\b|\bjoin\b|\bgroup\s+by\b|\border\s+by\b|$)/giu)) {
    const table = readLeadingIdentifier(match[1] ?? "");
    if (table) tables.push(table);
  }
  return unique(tables).filter((table) => !SQL_WORDS.has(table.toLowerCase()));
}

function extractFields(sql: string): string[] {
  const searchable = stripParamAndLiteralText(sql);
  return unique([...searchable.matchAll(IDENTIFIER_TOKEN_PATTERN)]
    .map((match) => cleanIdentifier(match[0]))
    .filter((item) => item.length > 1 && !/^\d/u.test(item) && !SQL_WORDS.has(item.toLowerCase())))
    .slice(0, 120);
}

function stripParamAndLiteralText(sql: string): string {
  return sql
    .replace(/@[\p{L}_][\p{L}\p{N}_]*/gu, " ")
    .replace(/\$\{[\s\S]*?\}|\$P\{[\s\S]*?\}/gu, " ")
    .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/gu, " ");
}

function extractMetrics(sql: string, context: string): string[] {
  const haystack = `${context} ${sql}`;
  return METRIC_PATTERNS.filter((item) => item.pattern.test(haystack)).map((item) => item.metric);
}

function extractTimeScope(sql: string, fields: string[]): string {
  const dateFields = fields.filter((field) => /date|duedate|needbydate|shipby|requestdate|closedate|期间|日期|时间/iu.test(field)).slice(0, 5);
  const relative = /\b(getdate|dateadd|datediff|year|month)\s*\(/iu.test(sql) ? "relative_date" : "";
  return [relative, ...dateFields].filter(Boolean).join(" ") || "未识别时间口径";
}

function extractParams(sql: string, dynamicParams: unknown): string[] {
  const params = readStringArray(dynamicParams).flatMap(extractMacroParamNames);
  for (const match of sql.matchAll(/@([\p{L}_][\p{L}\p{N}_]*)/gu)) {
    if (match[1]) params.push(match[1]);
  }
  for (const macro of sql.matchAll(/\$\{[\s\S]*?\}|\$P\{[\s\S]*?\}/gu)) {
    params.push(...extractMacroParamNames(macro[0] ?? ""));
  }
  return unique(params).sort();
}

function extractMacroParamNames(value: string): string[] {
  const macroBody = value.replace(/^\$P?\{/u, "").replace(/\}$/u, "");
  const params: string[] = [];
  for (const token of macroBody.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/gu, " ").matchAll(/[\p{L}_][\p{L}\p{N}_]*/gu)) {
    const name = token[0];
    if (!MACRO_STOP_WORDS.has(name.toLowerCase()) && !/^\d/u.test(name)) params.push(name);
  }
  return params;
}

function buildQuestionText(dataset: DatasetRow, family: FamilyRow | null, metrics: string[], templateQuestions: string[], tables: string[]): string {
  return unique([
    ...templateQuestions,
    dataset.reportName,
    dataset.datasetName,
    family?.businessDescription,
    metrics.length ? `查询${metrics.join("、")}` : null,
    tables.length ? `查询${tables.slice(0, 3).join("、")}` : "查询历史SQL",
  ].filter(Boolean) as string[]).join(" ");
}

function buildScenarioFallback(tables: string[]): string {
  return tables.length ? `历史SQL参考: ${tables.slice(0, 3).join("、")}` : "历史SQL参考";
}

function inferModule(tables: string[]): string | null {
  const text = tables.map((table) => table.toLowerCase()).join(" ");
  if (/\b(invchead|invcdtl|tranglc|gljrndtl|apinv|arinv|cashdtl)\b/u.test(text)) return "finance";
  if (/\b(poheader|podetail|porel|rcvdtl|vendor)\b/u.test(text)) return "purchase";
  if (/\b(orderhed|orderdtl|orderrel|shipdtl|customer)\b/u.test(text)) return "sales";
  if (/\b(partbin|partwhse|parttran|partqty|warehse|whsebin|part)\b/u.test(text)) return "inventory";
  if (/\b(jobhead|joboper|jobmtl|jobasmbl|labordtl|resourcegroup)\b/u.test(text)) return "production";
  return null;
}

function inferIntent(sql: string): string {
  return /\b(group\s+by|sum|count|avg|min|max)\s*\(/iu.test(sql) || /\bgroup\s+by\b/iu.test(sql) ? "aggregate" : "detail";
}

function isFinanceSql(sql: string, context: string): boolean {
  return /finance|财务|收入|应收|应付|发票|成本|利润|毛利|回款|付款|收款|税|余额|退款|实收/u.test(`${context} ${sql}`);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function tokenize(value: string): string[] {
  return value.match(/[A-Za-z]+\d*|\d+|[\u4e00-\u9fa5]{2,}/gu) ?? [];
}

function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gmu, "").replace(/\s+/gu, " ").trim();
}

function cleanIdentifier(value: string): string {
  return value.replace(/[\[\]`"]/gu, "").replace(/\s*\.\s*/gu, ".");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function splitTopLevelComma(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function readLeadingIdentifier(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("(")) return null;
  const match = trimmed.match(TABLE_IDENTIFIER_PATTERN);
  return match ? cleanIdentifier(match[0]) : null;
}

function inferSourceFallback(sql: string): string[] {
  return /\bselect\b/iu.test(sql) ? ["inline_values"] : ["unknown_source"];
}

function inferFieldFallback(sql: string): string[] {
  return /\bselect\s+\*/iu.test(sql) ? ["*"] : ["inline_value"];
}

const IDENTIFIER_PART = String.raw`(?:\[[^\]]+\]|` + "`[^`]+`" + String.raw`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$#]*)`;
const TABLE_IDENTIFIER_PATTERN = new RegExp(String.raw`^${IDENTIFIER_PART}(?:\s*\.\s*${IDENTIFIER_PART}){0,3}`, "u");
const IDENTIFIER_TOKEN_PATTERN = new RegExp(IDENTIFIER_PART, "gu");

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

const SQL_WORDS = new Set([
  "select", "from", "where", "join", "inner", "left", "right", "full", "outer", "on", "and", "or", "as",
  "case", "when", "then", "else", "end", "null", "is", "not", "in", "like", "group", "by", "order",
  "sum", "count", "max", "min", "avg", "top", "distinct", "with", "union", "all", "cast", "convert",
]);

const MACRO_STOP_WORDS = new Set([
  "if", "len", "and", "or", "not", "null", "true", "false", "select", "from", "where",
  "then", "else", "date", "year", "month", "day", "like", "in",
]);

const METRIC_PATTERNS = [
  { metric: "收入", pattern: /收入|revenue|salesamt|sales_amt|invoiceamt/iu },
  { metric: "成本", pattern: /成本|cost|成本额|mfgcost|unitcost|extcost/iu },
  { metric: "毛利", pattern: /毛利|gross\s*profit|profit/iu },
  { metric: "应收", pattern: /应收|\bar\b|accounts?\s*receivable|invoice|invc/iu },
  { metric: "实收", pattern: /实收|收款|回款|cash|receipt|paid/iu },
  { metric: "退款", pattern: /退款|退货|credit|refund|rma/iu },
  { metric: "税额", pattern: /税额|税|tax|vat/iu },
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
