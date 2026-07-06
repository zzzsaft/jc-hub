import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import type {
  FineReportImportResult,
  SqlTemplateAnalysisDataset,
  SqlTemplateParamMap,
  TemplateDraftInput,
} from "../types/SqlTemplateTypes.js";

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
    insert into "agent"."sql_template_report_file" (
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
      insert into "agent"."sql_template_dataset" (
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
  let raw = 0;
  if (input.intent && row.intent === input.intent) {
    raw += 10;
    signals.push(`intent:${input.intent}`);
  }
  if (input.module && row.module === input.module) {
    raw += 6;
    signals.push(`module:${input.module}`);
  }
  const params = new Set([...Object.keys(readParamMap(row.requiredParams)), ...Object.keys(readParamMap(row.optionalParams))]);
  for (const slot of slotNames) {
    if (params.has(slot)) {
      raw += 3;
      signals.push(`slot:${slot}`);
    }
  }
  const haystack = normalize([row.name, row.intent, row.module, row.questionPattern, row.normalizedQuestion, ...params].filter(Boolean).join(" "));
  for (const token of questionTokens(input.question)) {
    if (haystack.includes(normalize(token))) {
      raw += token.length > 1 ? 2 : 1;
      signals.push(token);
    }
  }
  return { score: Math.round(Math.min(raw / 20, 1) * 10000) / 10000, matchedSignals: [...new Set(signals)] };
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
