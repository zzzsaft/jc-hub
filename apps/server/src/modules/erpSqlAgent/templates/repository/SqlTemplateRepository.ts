import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import type {
  FineReportImportResult,
  SqlTemplateAnalysisDataset,
  SqlTemplateParamMap,
  TemplateDraftInput,
} from "../types/SqlTemplateTypes.js";
import {
  rerankDatasetReferenceWithVector,
  scoreDatasetReference,
  type DatasetReferenceSearchRow,
} from "../service/SqlDatasetReferenceSearch.js";
import { createSqlReferenceEmbeddingClientFromEnv } from "../service/SqlReferenceEmbeddingClient.js";

export type ExecutableTemplateCandidateInput = {
  question: string;
  intent?: string;
  module?: string;
  slots?: Record<string, unknown>;
  limit?: number;
};

export type ExecutableTemplateCandidate = NonNullable<Awaited<ReturnType<SqlTemplateRepository["findTemplate"]>>> & {
  score: number;
  matchedSignals: string[];
};

export type ReferenceFamilyCandidateInput = {
  question: string;
  intent?: string;
  module?: string;
  limit?: number;
  diagnostics?: SqlReferenceLookupTiming[];
};

export type SqlReferenceLookupTiming = {
  stage: string;
  durationMs: number;
  detail?: string;
};

export type AtomicMetricCandidateInput = ReferenceFamilyCandidateInput & {
  metricCodes: string[];
};

export type ReferenceFamilyCandidate = {
  familyId: string;
  businessDescription: string;
  coreTables: string[];
  joins: string[];
  exampleSql?: string;
  score: number;
  matchedSignals: string[];
};

export type DatasetReferenceCandidate = {
  datasetId: string;
  familyId: string;
  businessDescription: string;
  coreTables: string[];
  joins: string[];
  exampleSql?: string;
  reportName?: string;
  datasetName?: string;
  fields: string[];
  metrics: string[];
  questionText: string;
  timeScope: string;
  businessScenario: string;
  isFinance: boolean;
  verified: boolean;
  sourceType: "dataset";
  score: number;
  matchedSignals: string[];
};

export type ApprovedMetricCandidate = {
  familyId: string;
  metricCode: string;
  metricName: string;
  businessDescription: string;
  calculationSummary: string;
  coreTables: string[];
  joins: string[];
  params: string[];
  definitionJson: unknown;
  exampleSql?: string;
  score: number;
  matchedSignals: string[];
};

const TEMPLATE_FAMILY_BOOSTS: Record<string, Array<{ pattern: RegExp; weight: number; signal: string }>> = {
  family_016: [
    { pattern: /销售订单|客户.*订单|下了?哪些订单|订单\s*\d+.*(明细|物料|产品|客户)|订单.*明细|按客户查销售订单/u, weight: 0.45, signal: "销售订单明细" },
  ],
  family_037: [
    { pattern: /发货通知|待发货|未发货|没发货|还没发货|欠发|欠交|未发完|通知发货/u, weight: 0.5, signal: "发货通知/待发货" },
  ],
  family_062: [
    { pattern: /采购|采购单|供应商|到货|收货/u, weight: 0.25, signal: "采购到货" },
    { pattern: /未到货|没到货|未收齐|延期|交期|应到货|到货情况|收货进度/u, weight: 0.25, signal: "采购收货进度" },
    { pattern: /未来|近\s*\d+\s*天|本周|今天|今日|要到货|应到货/u, weight: 0.25, signal: "采购到货日期" },
  ],
};

export class SqlTemplateRepository {
  async saveImportResult(
    result: FineReportImportResult,
    onProgress?: (progress: { done: number; total: number; filePath: string }) => void,
  ) {
    const run = await prisma.sqlTemplateParseRun.create({
      data: {
        rootDir: result.rootDir,
        extensions: result.extensions,
        dryRun: result.dryRun,
        fileCount: result.fileCount,
        datasetCount: result.datasetCount,
        errorCount: result.errorCount,
        errorsJson: result.errors,
        status: result.errorCount > 0 ? "completed_with_errors" : "completed",
        completedAt: new Date(),
      },
    });

    let done = 0;
    for (const files of chunks(result.files, 500)) {
      const reportFiles = await upsertReportFiles(run.id, files);
      const reportFileIdByKey = new Map(reportFiles.map((file) => [`${file.fileHash}\0${file.relativePath}`, file.id]));
      await upsertDatasets(run.id, files.flatMap((file) => {
        const reportFileId = reportFileIdByKey.get(`${file.fileHash}\0${file.relativePath}`);
        if (!reportFileId) throw new Error(`Report file upsert did not return id: ${file.relativePath}`);
        return file.datasets.map((dataset) => ({ ...dataset, reportFileId }));
      }));
      done += files.length;
      onProgress?.({ done, total: result.files.length, filePath: files.at(-1)?.filePath ?? "" });
    }

    return run;
  }

  async findDataset(datasetId: bigint) {
    return prisma.sqlTemplateDataset.findUnique({
      where: { id: datasetId },
      include: { reportFile: true },
    });
  }

  async findDatasetsForAnalysis(limit?: number): Promise<SqlTemplateAnalysisDataset[]> {
    return prisma.sqlTemplateDataset.findMany({
      include: { reportFile: { select: { reportName: true, relativePath: true } } },
      orderBy: { id: "asc" },
      take: limit,
    });
  }

  async createTemplateDraft(input: TemplateDraftInput & {
    sqlTemplate: string;
    requiredParams: SqlTemplateParamMap;
    optionalParams: SqlTemplateParamMap;
    tables: string[];
    fields: string[];
  }) {
    const dataset = await this.findDataset(input.datasetId);
    if (!dataset) throw new Error(`Dataset not found: ${input.datasetId.toString()}`);

    return prisma.erpQueryTemplate.create({
      data: {
        name: input.name ?? `${input.module}.${input.intent}`,
        intent: input.intent,
        module: input.module,
        questionPattern: input.questionPattern,
        normalizedQuestion: input.normalizedQuestion,
        queryPlanJson: {
          intent: input.intent,
          module: input.module,
          description: input.normalizedQuestion ?? input.questionPattern ?? "",
          steps: ["Review raw FineReport SQL", "Parameterize SQL", "Run guard", "Manual approve"],
        },
        sqlTemplate: input.sqlTemplate,
        requiredParams: input.requiredParams,
        optionalParams: input.optionalParams,
        tables: input.tables,
        fields: input.fields,
        joins: [],
        sourceType: "finereport_cpt",
        sourceDatasetId: dataset.id,
        sourceReportName: dataset.reportFile.reportName,
        sourceSqlHash: dataset.sqlHash,
        guardPassed: false,
        approved: false,
        approvalStatus: "draft",
      },
    });
  }

  async findTemplate(templateId: bigint) {
    return prisma.erpQueryTemplate.findUnique({ where: { id: templateId } });
  }

  async findExecutableCandidates(input: ExecutableTemplateCandidateInput): Promise<ExecutableTemplateCandidate[]> {
    if (!process.env.DATABASE_URL) return [];
    const rows = await prisma.erpQueryTemplate.findMany({
      where: {
        approved: true,
        approvalStatus: "approved",
        guardPassed: true,
      },
      orderBy: [{ successCount: "desc" }, { usageCount: "desc" }, { id: "asc" }],
      take: 200,
    });
    const slotNames = Object.keys(input.slots ?? {}).filter((key) => input.slots?.[key] !== undefined && input.slots?.[key] !== null && input.slots?.[key] !== "");
    return rows
      // ponytail: scans approved templates in memory; move to DB text search if approved templates get large.
      .map((row) => ({ ...row, ...scoreTemplate(row, input, slotNames) }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score || left.id.toString().localeCompare(right.id.toString()))
      .slice(0, input.limit ?? 3);
  }

  async findReferenceCandidates(input: ReferenceFamilyCandidateInput): Promise<ReferenceFamilyCandidate[]> {
    if (!process.env.DATABASE_URL) return [];
    const cached = referenceCache.get(cacheKey("family", input));
    if (cached) return timedReferenceLookup("family", input, cached.value as Promise<ReferenceFamilyCandidate[]>, "cache_hit");
    const promise = this.findReferenceCandidatesUncached(input);
    setReferenceCache(cacheKey("family", input), promise);
    return timedReferenceLookup("family", input, promise, "cache_miss");
  }

  private async findReferenceCandidatesUncached(input: ReferenceFamilyCandidateInput): Promise<ReferenceFamilyCandidate[]> {
    const dbStartedAt = Date.now();
    const rows = await prisma.$queryRaw<Array<{
      familyId: string;
      module: string;
      intent: string;
      businessDescription: string;
      coreTables: unknown;
      coreJoins: unknown;
      representativeSql: string | null;
    }>>(Prisma.sql`
      SELECT
        family_id AS "familyId",
        module,
        intent,
        business_description AS "businessDescription",
        core_tables AS "coreTables",
        core_joins AS "coreJoins",
        representative_sql AS "representativeSql"
      FROM "erp_agent"."erp_sql_reference_family"
      WHERE is_enabled = TRUE
        AND recommended_use = 'reference_retrieval'
      ORDER BY family_id
      LIMIT 200
    `);
    pushReferenceTiming(input, "family_db_query", dbStartedAt, `rows=${rows.length}`);
    const scoringStartedAt = Date.now();
    const result = rows
      // ponytail: scans reference families in memory; add DB full text only if this grows past a few hundred.
      .map((row) => {
        const scored = scoreReference(row, input);
        return {
          familyId: row.familyId,
          businessDescription: row.businessDescription,
          coreTables: readStringArray(row.coreTables),
          joins: readStringArray(row.coreJoins),
          ...(row.representativeSql ? { exampleSql: row.representativeSql } : {}),
          ...scored,
        };
      })
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score || left.familyId.localeCompare(right.familyId))
      .slice(0, input.limit ?? 3);
    pushReferenceTiming(input, "family_scoring_sort", scoringStartedAt, `rows=${rows.length}`);
    return result;
  }

  async findDatasetReferenceCandidates(input: ReferenceFamilyCandidateInput): Promise<DatasetReferenceCandidate[]> {
    if (!process.env.DATABASE_URL) return [];
    const cached = referenceCache.get(cacheKey("dataset", input));
    if (cached) return timedReferenceLookup("dataset", input, cached.value as Promise<DatasetReferenceCandidate[]>, "cache_hit");
    const promise = this.findDatasetReferenceCandidatesUncached(input);
    setReferenceCache(cacheKey("dataset", input), promise);
    return timedReferenceLookup("dataset", input, promise, "cache_miss");
  }

  private async findDatasetReferenceCandidatesUncached(input: ReferenceFamilyCandidateInput): Promise<DatasetReferenceCandidate[]> {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 10);
    const useQueryEmbedding = process.env.ERP_SQL_REFERENCE_QUERY_EMBEDDING === "1";
    const moduleFilter = input.module
      ? Prisma.sql`WHERE (module = ${input.module} OR module IS NULL OR module = '' OR module = 'unknown')`
      : Prisma.empty;
    const dbStartedAt = Date.now();
    const rows = await prisma.$queryRaw<DatasetReferenceSearchRow[]>(Prisma.sql`
      SELECT
        dataset_id AS "datasetId",
        family_id AS "familyId",
        module,
        intent,
        report_name AS "reportName",
        dataset_name AS "datasetName",
        question_text AS "questionText",
        '' AS "sqlText",
        tables,
        fields,
        metrics,
        params,
        risk_flags AS "riskFlags",
        keywords,
        summary,
        business_description AS "businessDescription",
        time_scope AS "timeScope",
        business_scenario AS "businessScenario",
        is_finance AS "isFinance",
        verified,
        normalized_sql_preview AS "normalizedSqlPreview",
        ${useQueryEmbedding ? Prisma.sql`embedding_vector_json` : Prisma.sql`NULL::jsonb`} AS "embeddingVectorJson",
        embedding_model AS "embeddingModel"
      FROM "erp_agent"."sql_dataset_reference_index"
      ${moduleFilter}
      ORDER BY updated_at DESC, dataset_id DESC
      LIMIT 600
    `);
    pushReferenceTiming(input, "dataset_db_query", dbStartedAt, `rows=${rows.length}; module=${input.module ?? ""}`);
    const embeddingStartedAt = Date.now();
    const queryVector = useQueryEmbedding && rows.some((row) => Array.isArray(row.embeddingVectorJson))
      ? await withTimeout(embedReferenceQuery(input.question), referenceEmbeddingTimeoutMs(), null)
      : null;
    pushReferenceTiming(input, "embedding_query", embeddingStartedAt, queryVector ? "used=1" : "used=0");
    const scoringStartedAt = Date.now();
    const result = rows
      // ponytail: 4000 rows is tiny; add DB FTS/vector only when this is too slow.
      .map((row) => {
        const mixed = scoreDatasetReference(row, input);
        return { row, ...rerankDatasetReferenceWithVector(mixed.score, mixed.matchedSignals, row.embeddingVectorJson, queryVector) };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.row.datasetId.toString().localeCompare(right.row.datasetId.toString()))
      .slice(0, limit)
      .map((item) => mapDatasetReference(item.row, item.score, item.matchedSignals));
    pushReferenceTiming(input, "dataset_scoring_sort", scoringStartedAt, `rows=${rows.length}`);
    return result;
  }

  async findApprovedMetricCandidates(input: ReferenceFamilyCandidateInput): Promise<ApprovedMetricCandidate[]> {
    if (!process.env.DATABASE_URL) return [];
    const cached = referenceCache.get(cacheKey("metric", input));
    if (cached) return timedReferenceLookup("metric", input, cached.value as Promise<ApprovedMetricCandidate[]>, "cache_hit");
    const promise = this.findApprovedMetricCandidatesUncached(input);
    setReferenceCache(cacheKey("metric", input), promise);
    return timedReferenceLookup("metric", input, promise, "cache_miss");
  }

  private async findApprovedMetricCandidatesUncached(input: ReferenceFamilyCandidateInput): Promise<ApprovedMetricCandidate[]> {
    const dbStartedAt = Date.now();
    const rows = await prisma.$queryRaw<Array<{
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
    }>>(Prisma.sql`
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
        AND module = 'finance'
      ORDER BY metric_code
      LIMIT 200
    `);
    pushReferenceTiming(input, "metric_db_query", dbStartedAt, `rows=${rows.length}`);
    const scoringStartedAt = Date.now();
    const result = rows
      // ponytail: approved finance metrics should stay small; DB search can wait.
      .map((row) => {
        const scored = scoreMetric(row, input);
        return {
          familyId: row.familyId,
          metricCode: row.metricCode,
          metricName: row.metricName,
          businessDescription: row.businessDescription,
          calculationSummary: row.calculationSummary,
          coreTables: readStringArray(row.coreTables),
          joins: readStringArray(row.coreJoins),
          params: readStringArray(row.params),
          definitionJson: row.definitionJson,
          ...(row.representativeSql ? { exampleSql: row.representativeSql } : {}),
          ...scored,
        };
      })
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score || left.metricCode.localeCompare(right.metricCode))
      .slice(0, input.limit ?? 3);
    pushReferenceTiming(input, "metric_scoring_sort", scoringStartedAt, `rows=${rows.length}`);
    return result;
  }

  async findApprovedAtomicMetricCandidates(input: AtomicMetricCandidateInput): Promise<ApprovedMetricCandidate[]> {
    if (!process.env.DATABASE_URL || input.metricCodes.length === 0) return [];
    const rows = await prisma.$queryRaw<Array<{
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
    }>>(Prisma.sql`
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
        AND definition_json->>'kind' = 'atomic_metric'
        AND metric_code IN (${Prisma.join(input.metricCodes)})
      ORDER BY metric_code
      LIMIT ${Math.min(Math.max(input.limit ?? input.metricCodes.length, 1), 50)}
    `);
    return rows.map((row) => ({
      familyId: row.familyId,
      metricCode: row.metricCode,
      metricName: row.metricName,
      businessDescription: row.businessDescription,
      calculationSummary: row.calculationSummary,
      coreTables: readStringArray(row.coreTables),
      joins: readStringArray(row.coreJoins),
      params: readStringArray(row.params),
      definitionJson: row.definitionJson,
      ...(row.representativeSql ? { exampleSql: row.representativeSql } : {}),
      score: input.metricCodes.includes(row.metricCode) ? 1 : 0,
      matchedSignals: [`metric:${row.metricCode}`],
    }));
  }

  async updateGuard(templateId: bigint, guardPassed: boolean, guard: unknown) {
    const template = await this.findTemplate(templateId);
    if (!template) throw new Error(`Template not found: ${templateId.toString()}`);
    const plan = template.queryPlanJson && typeof template.queryPlanJson === "object" && !Array.isArray(template.queryPlanJson)
      ? template.queryPlanJson
      : {};
    return prisma.erpQueryTemplate.update({
      where: { id: templateId },
      data: {
        guardPassed,
        queryPlanJson: { ...plan, guard: toJson(guard) },
      },
    });
  }

  async approve(templateId: bigint, approvedBy: string) {
    return prisma.erpQueryTemplate.update({
      where: { id: templateId },
      data: {
        approved: true,
        approvalStatus: "approved",
        approvedBy,
        approvedAt: new Date(),
      },
    });
  }

  async recordUse(templateId: bigint, success: boolean) {
    await prisma.erpQueryTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: { increment: 1 },
        successCount: success ? { increment: 1 } : undefined,
        lastUsedAt: new Date(),
      },
    });
  }
}

export const sqlTemplateRepository = new SqlTemplateRepository();

async function embedReferenceQuery(question: string): Promise<number[] | null> {
  const client = createSqlReferenceEmbeddingClientFromEnv();
  if (!client) return null;
  try {
    return (await client.embed([question]))[0] ?? null;
  } catch {
    return null;
  }
}

type ReportFileRow = {
  id: bigint;
  fileHash: string;
  relativePath: string;
};

type DatasetRow = FineReportImportResult["files"][number]["datasets"][number] & {
  reportFileId: bigint;
};

async function upsertReportFiles(parseRunId: bigint, files: FineReportImportResult["files"]): Promise<ReportFileRow[]> {
  if (files.length === 0) return [];
  return prisma.$queryRaw<ReportFileRow[]>(Prisma.sql`
    insert into "erp_agent"."sql_template_report_file" (
      "parse_run_id", "file_path", "relative_path", "extension", "file_hash", "file_size", "report_name"
    )
    values ${Prisma.join(files.map((file) => Prisma.sql`(
      ${parseRunId},
      ${file.filePath},
      ${file.relativePath},
      ${file.extension},
      ${file.fileHash},
      ${file.fileSize},
      ${file.reportName}
    )`))}
    on conflict ("file_hash", "relative_path") do update set
      "parse_run_id" = excluded."parse_run_id",
      "file_path" = excluded."file_path",
      "extension" = excluded."extension",
      "file_size" = excluded."file_size",
      "report_name" = excluded."report_name"
    returning "id", "file_hash" as "fileHash", "relative_path" as "relativePath"
  `);
}

async function upsertDatasets(parseRunId: bigint, rows: DatasetRow[]): Promise<void> {
  for (const chunk of chunks(dedupeDatasets(rows), 1000)) {
    if (chunk.length === 0) continue;
    await prisma.$executeRaw(Prisma.sql`
      insert into "erp_agent"."sql_template_dataset" (
        "parse_run_id", "report_file_id", "dataset_name", "dataset_type", "connection_name",
        "raw_sql", "sql_hash", "dynamic_params", "risk_flags"
      )
      values ${Prisma.join(chunk.map((dataset) => Prisma.sql`(
        ${parseRunId},
        ${dataset.reportFileId},
        ${dataset.datasetName ?? ""},
        ${dataset.datasetType},
        ${dataset.connectionName},
        ${dataset.rawSql},
        ${dataset.sqlHash},
        ${JSON.stringify(dataset.dynamicParams)}::jsonb,
        ${JSON.stringify(dataset.riskFlags)}::jsonb
      )`))}
      on conflict ("report_file_id", "sql_hash", "dataset_name", "dataset_type") do update set
        "parse_run_id" = excluded."parse_run_id",
        "connection_name" = excluded."connection_name",
        "raw_sql" = excluded."raw_sql",
        "dynamic_params" = excluded."dynamic_params",
        "risk_flags" = excluded."risk_flags"
    `);
  }
}

function dedupeDatasets(rows: DatasetRow[]): DatasetRow[] {
  const map = new Map<string, DatasetRow>();
  for (const row of rows) {
    map.set(`${row.reportFileId}\0${row.sqlHash}\0${row.datasetName ?? ""}\0${row.datasetType}`, row);
  }
  return [...map.values()];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function scoreTemplate(
  row: NonNullable<Awaited<ReturnType<SqlTemplateRepository["findTemplate"]>>>,
  input: ExecutableTemplateCandidateInput,
  slotNames: string[],
): { score: number; matchedSignals: string[] } {
  if (!row) return { score: 0, matchedSignals: [] };
  const signals: string[] = [];
  let score = 0;
  if (input.intent && row.intent === input.intent) {
    score += 0.4;
    signals.push(`intent:${input.intent}`);
  }
  if (input.module && row.module === input.module) {
    score += 0.2;
    signals.push(`module:${input.module}`);
  }
  const params = new Set([...Object.keys(readParamMap(row.requiredParams)), ...Object.keys(readParamMap(row.optionalParams))]);
  const haystack = normalize([row.name, row.intent, row.module, row.questionPattern, row.normalizedQuestion, ...params].filter(Boolean).join(" "));
  if (templateConflictsQuestion(input.question, haystack)) return { score: 0, matchedSignals: [] };
  let slotHits = 0;
  for (const slot of slotNames) {
    if (params.has(slot)) {
      slotHits += 1;
      signals.push(`slot:${slot}`);
    }
  }
  if (slotNames.length > 0) score += 0.2 * (slotHits / slotNames.length);
  let tokenHits = 0;
  for (const token of questionTokens(input.question)) {
    if (haystack.includes(normalize(token))) {
      tokenHits += 1;
      signals.push(token);
    }
  }
  const tokens = questionTokens(input.question);
  if (tokens.length > 0) score += 0.1 * Math.min(tokenHits / tokens.length, 1);
  for (const boost of TEMPLATE_FAMILY_BOOSTS[String(row.sourceFamilyId ?? "")] ?? []) {
    if (boost.pattern.test(input.question)) {
      score += boost.weight;
      signals.push(boost.signal);
    }
  }
  if (row.usageCount > 0) score += 0.1 * (row.successCount / row.usageCount);
  return { score: round(Math.min(score, 1)), matchedSignals: [...new Set(signals)] };
}

function templateConflictsQuestion(question: string, normalizedHaystack: string): boolean {
  if (/发货通知|待发货|未发货|没发货|还没发货|欠发|欠交|未发完|通知发货/u.test(question)) {
    return !/(orderrel|openrelease|ourreqqty|发货通知|待发货|未发货|欠发|欠交|未发完|通知发货)/iu.test(normalizedHaystack);
  }
  if (/物料需求|缺料|发料|领料/u.test(question)) {
    return !/(jobmtl|material|物料需求|缺料|发料|领料)/iu.test(normalizedHaystack);
  }
  if (/报工|工时|人工|labor/iu.test(question)) {
    return !/(labordtl|labor|报工|工时|人工)/iu.test(normalizedHaystack);
  }
  return false;
}

function scoreReference(row: { familyId: string; module: string; intent: string; businessDescription: string; coreTables: unknown; coreJoins: unknown }, input: ReferenceFamilyCandidateInput): { score: number; matchedSignals: string[] } {
  const signals: string[] = [];
  let score = 0;
  if (input.intent && row.intent === input.intent) {
    score += 0.4;
    signals.push(`intent:${input.intent}`);
  }
  if (input.module && row.module === input.module) {
    score += 0.2;
    signals.push(`module:${input.module}`);
  }
  const tokens = questionTokens(input.question);
  const haystack = normalize([row.familyId, row.intent, row.module, row.businessDescription, ...readStringArray(row.coreTables), ...readStringArray(row.coreJoins)].join(" "));
  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(normalize(token))) {
      tokenHits += 1;
      signals.push(token);
    }
  }
  if (tokens.length > 0) score += 0.4 * Math.min(tokenHits / tokens.length, 1);
  return { score: round(score), matchedSignals: [...new Set(signals)] };
}

function scoreMetric(
  row: {
    familyId: string;
    metricCode: string;
    metricName: string;
    businessDescription: string;
    calculationSummary: string;
    coreTables: unknown;
    coreJoins: unknown;
    params: unknown;
    definitionJson: unknown;
  },
  input: ReferenceFamilyCandidateInput,
): { score: number; matchedSignals: string[] } {
  const signals: string[] = [];
  let score = 0;
  if (input.module === "finance") {
    score += 0.2;
    signals.push("module:finance");
  }
  const tokens = questionTokens(input.question);
  const haystack = normalize([
    row.familyId,
    row.metricCode,
    row.metricName,
    row.businessDescription,
    row.calculationSummary,
    JSON.stringify(row.definitionJson ?? {}),
    ...readStringArray(row.coreTables),
    ...readStringArray(row.coreJoins),
    ...readStringArray(row.params),
  ].join(" "));
  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(normalize(token))) {
      tokenHits += 1;
      signals.push(token);
    }
  }
  if (tokens.length > 0) score += 0.8 * Math.min(tokenHits / tokens.length, 1);
  return { score: round(score), matchedSignals: [...new Set(signals)] };
}

function mapDatasetReference(
  row: DatasetReferenceSearchRow,
  score: number,
  matchedSignals: string[],
): DatasetReferenceCandidate {
  return {
    datasetId: row.datasetId.toString(),
    familyId: row.familyId,
    businessDescription: row.businessDescription || row.summary,
    coreTables: readStringArray(row.tables),
    joins: [],
    ...(row.normalizedSqlPreview ? { exampleSql: row.normalizedSqlPreview } : {}),
    ...(row.reportName ? { reportName: row.reportName } : {}),
    ...(row.datasetName ? { datasetName: row.datasetName } : {}),
    fields: readStringArray(row.fields),
    metrics: readStringArray(row.metrics),
    questionText: row.questionText,
    timeScope: row.timeScope,
    businessScenario: row.businessScenario,
    isFinance: row.isFinance,
    verified: row.verified,
    sourceType: "dataset",
    score,
    matchedSignals,
  };
}

function readParamMap(value: unknown): SqlTemplateParamMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SqlTemplateParamMap : {};
}

function questionTokens(question: string): string[] {
  return [...new Set(question.match(/[A-Za-z]+\d*|\d+|[\u4e00-\u9fa5]{2,}/gu) ?? [])];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const REFERENCE_CACHE_TTL_MS = 10 * 60 * 1000;
const REFERENCE_CACHE_MAX = 200;
const referenceCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

function cacheKey(kind: string, input: ReferenceFamilyCandidateInput): string {
  cleanupReferenceCache();
  return JSON.stringify({
    kind,
    question: input.question,
    intent: input.intent ?? "",
    module: input.module ?? "",
    limit: input.limit ?? "",
  });
}

function cleanupReferenceCache(): void {
  const now = Date.now();
  for (const [key, cached] of referenceCache) {
    if (cached.expiresAt <= now || referenceCache.size > REFERENCE_CACHE_MAX) referenceCache.delete(key);
  }
}

function setReferenceCache(key: string, value: Promise<unknown>): void {
  referenceCache.set(key, { expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS, value });
  value.catch(() => referenceCache.delete(key));
}

async function timedReferenceLookup<T>(
  kind: string,
  input: ReferenceFamilyCandidateInput,
  promise: Promise<T[]>,
  cacheState: "cache_hit" | "cache_miss",
): Promise<T[]> {
  const startedAt = Date.now();
  pushReferenceTiming(input, `${kind}_${cacheState}`, startedAt);
  const timeoutMs = referenceSoftTimeoutMs();
  try {
    const result = await withTimeout(promise, timeoutMs, [] as T[]);
    pushReferenceTiming(input, `${kind}_total`, startedAt, `count=${result.length}`);
    if (result.length === 0 && Date.now() - startedAt >= timeoutMs) {
      pushReferenceTiming(input, `${kind}_soft_timeout`, startedAt, `timeoutMs=${timeoutMs}`);
    }
    return result;
  } catch {
    return [];
  }
}

function pushReferenceTiming(
  input: ReferenceFamilyCandidateInput,
  stage: string,
  startedAt: number,
  detail?: string,
): void {
  input.diagnostics?.push({ stage, durationMs: Date.now() - startedAt, ...(detail ? { detail } : {}) });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function referenceSoftTimeoutMs(): number {
  return positiveInt(process.env.ERP_SQL_REFERENCE_SOFT_TIMEOUT_MS, 5000);
}

function referenceEmbeddingTimeoutMs(): number {
  return positiveInt(process.env.ERP_SQL_REFERENCE_EMBEDDING_TIMEOUT_MS, 1200);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
