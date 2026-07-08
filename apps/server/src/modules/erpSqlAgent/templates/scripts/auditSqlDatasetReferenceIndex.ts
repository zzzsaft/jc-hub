import "../../../../config/env.js";

import { Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { prisma } from "../../../../lib/prisma.js";
import {
  rerankDatasetReferenceWithVector,
  scoreDatasetReference,
  readNumberArray,
  readStringArray,
  type DatasetReferenceSearchRow,
} from "../service/SqlDatasetReferenceSearch.js";
import { createSqlReferenceEmbeddingClientFromEnv } from "../service/SqlReferenceEmbeddingClient.js";
import { parseArgs } from "./cli.js";

type CountRow = { count: bigint };

export type SqlDatasetReferenceAuditReport = {
  kind: "sql_dataset_reference_index_audit";
  summary: {
    datasetCount: number;
    indexCount: number;
    coverageRatio: number;
    missingIndexCount: number;
    financeCount: number;
    verifiedCount: number;
    metricTaggedCount: number;
    smokeGapCount: number;
    embeddingVectorCount: number;
    embeddingCoverageRatio: number;
  };
  embeddingModelCounts: Record<string, number>;
  embeddingDimCounts: Record<string, number>;
  fieldGaps: Record<string, number>;
  metricCounts: Record<string, number>;
  smokeQueries: Array<{
    question: string;
    topResults: Array<{
      datasetId: string;
      familyId: string;
      score: number;
      metrics: string[];
      tables: string[];
      matchedSignals: string[];
    }>;
  }>;
};

const SMOKE_QUESTIONS = [
  "查本月收入和税额",
  "查成本和毛利",
  "查应收实收退款",
  "查采购到货",
  "查库存物料",
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const limit = typeof args.limit === "string" ? Number(args.limit) : 10;
  const [datasetCount, rows] = await Promise.all([loadDatasetCount(), loadIndexRows()]);
  const requireEmbeddings = args["require-embeddings"] === true;
  const queryVectors = requireEmbeddings ? await embedSmokeQuestions() : undefined;
  const report = buildSqlDatasetReferenceAuditReport(rows, datasetCount, { topK: limit, queryVectors });
  console.log(JSON.stringify(report, null, 2));
  if (args.strict === true && (
    report.summary.missingIndexCount > 0
    || report.summary.smokeGapCount > 0
    || Object.values(report.fieldGaps).some((count) => count > 0)
    || (requireEmbeddings && hasEmbeddingAuditFailure(report))
  )) {
    process.exitCode = 1;
  }
}

async function loadDatasetCount(): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*) AS count FROM "erp_agent"."sql_template_dataset"
  `);
  return Number(rows[0]?.count ?? 0n);
}

async function loadIndexRows(): Promise<DatasetReferenceSearchRow[]> {
  return prisma.$queryRaw<DatasetReferenceSearchRow[]>(Prisma.sql`
    SELECT
      dataset_id AS "datasetId",
      family_id AS "familyId",
      module,
      intent,
      report_name AS "reportName",
      dataset_name AS "datasetName",
      question_text AS "questionText",
      sql_text AS "sqlText",
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
      embedding_vector_json AS "embeddingVectorJson",
      embedding_model AS "embeddingModel"
    FROM "erp_agent"."sql_dataset_reference_index"
  `);
}

export function buildSqlDatasetReferenceAuditReport(
  rows: DatasetReferenceSearchRow[],
  datasetCount: number,
  options: { topK?: number; queryVectors?: Map<string, number[]> } = {},
): SqlDatasetReferenceAuditReport {
  const topK = options.topK ?? 10;
  const smokeQueries = buildSmokeQueries(rows, topK, options.queryVectors);
  const embeddingVectorCount = rows.filter((row) => readNumberArray(row.embeddingVectorJson).length > 0).length;
  return {
    kind: "sql_dataset_reference_index_audit",
    summary: {
      datasetCount,
      indexCount: rows.length,
      coverageRatio: datasetCount === 0 ? 0 : round(rows.length / datasetCount),
      missingIndexCount: Math.max(0, datasetCount - rows.length),
      financeCount: rows.filter((row) => row.isFinance).length,
      verifiedCount: rows.filter((row) => row.verified).length,
      metricTaggedCount: rows.filter((row) => readStringArray(row.metrics).length > 0).length,
      smokeGapCount: smokeQueries.filter((item) => item.topResults.length === 0).length,
      embeddingVectorCount,
      embeddingCoverageRatio: rows.length === 0 ? 0 : round(embeddingVectorCount / rows.length),
    },
    embeddingModelCounts: countEmbeddingModels(rows),
    embeddingDimCounts: countEmbeddingDims(rows),
    fieldGaps: countFieldGaps(rows),
    metricCounts: countMetrics(rows),
    smokeQueries,
  };
}

function buildSmokeQueries(rows: DatasetReferenceSearchRow[], topK: number, queryVectors?: Map<string, number[]>): SqlDatasetReferenceAuditReport["smokeQueries"] {
  return SMOKE_QUESTIONS.map((question) => ({
    question,
    topResults: rows
      .map((row) => {
        const mixed = scoreDatasetReference(row, { question });
        return { row, ...rerankDatasetReferenceWithVector(mixed.score, mixed.matchedSignals, row.embeddingVectorJson, queryVectors?.get(question) ?? null) };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.row.datasetId.toString().localeCompare(right.row.datasetId.toString()))
      .slice(0, topK)
      .map((item) => ({
        datasetId: item.row.datasetId.toString(),
        familyId: item.row.familyId,
        score: item.score,
        metrics: readStringArray(item.row.metrics),
        tables: readStringArray(item.row.tables),
        matchedSignals: item.matchedSignals,
      })),
  }));
}

function countEmbeddingModels(rows: DatasetReferenceSearchRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.embeddingModel || "(empty)"] = (counts[row.embeddingModel || "(empty)"] ?? 0) + 1;
  return counts;
}

function countEmbeddingDims(rows: DatasetReferenceSearchRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const vector = readNumberArray(row.embeddingVectorJson);
    counts[vector.length ? String(vector.length) : "(empty)"] = (counts[vector.length ? String(vector.length) : "(empty)"] ?? 0) + 1;
  }
  return counts;
}

function hasEmbeddingAuditFailure(report: SqlDatasetReferenceAuditReport): boolean {
  const nonEmptyDims = Object.keys(report.embeddingDimCounts).filter((key) => key !== "(empty)");
  return report.summary.embeddingCoverageRatio !== 1
    || (report.embeddingModelCounts["(empty)"] ?? 0) > 0
    || nonEmptyDims.length !== 1
    || !report.smokeQueries.some((query) => query.topResults.some((result) => result.matchedSignals.some((signal) => signal.startsWith("vector:"))));
}

async function embedSmokeQuestions(): Promise<Map<string, number[]>> {
  const client = createSqlReferenceEmbeddingClientFromEnv({ required: true });
  if (!client) throw new Error("Embedding client is not configured");
  const vectors = await client.embed(SMOKE_QUESTIONS);
  return new Map(SMOKE_QUESTIONS.map((question, index) => [question, vectors[index] ?? []]));
}

function countFieldGaps(rows: DatasetReferenceSearchRow[]): Record<string, number> {
  return {
    questionText: rows.filter((row) => !row.questionText.trim()).length,
    sqlText: rows.filter((row) => !row.sqlText.trim()).length,
    familyId: rows.filter((row) => !row.familyId.trim()).length,
    tables: rows.filter((row) => readStringArray(row.tables).length === 0).length,
    fields: rows.filter((row) => readStringArray(row.fields).length === 0).length,
    timeScope: rows.filter((row) => !row.timeScope.trim()).length,
    businessScenario: rows.filter((row) => !row.businessScenario.trim()).length,
  };
}

function countMetrics(rows: DatasetReferenceSearchRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) for (const metric of readStringArray(row.metrics)) counts[metric] = (counts[metric] ?? 0) + 1;
  return counts;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

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
