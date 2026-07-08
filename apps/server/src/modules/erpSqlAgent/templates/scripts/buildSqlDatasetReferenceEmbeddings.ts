import "../../../../config/env.js";

import { Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { prisma } from "../../../../lib/prisma.js";
import {
  createSqlReferenceEmbeddingClientFromEnv,
  DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL,
  type SqlReferenceEmbeddingClient,
} from "../service/SqlReferenceEmbeddingClient.js";
import { parseArgs } from "./cli.js";

type EmbeddingRow = {
  datasetId: bigint;
  embeddingText: string | null;
  embeddingModel: string | null;
  hasVector: boolean;
};

export type BuildReferenceEmbeddingOptions = {
  apply: boolean;
  limit?: number;
  force?: boolean;
  batchSize?: number;
  model?: string;
};

export async function buildSqlDatasetReferenceEmbeddings(
  options: BuildReferenceEmbeddingOptions,
  client?: SqlReferenceEmbeddingClient,
) {
  const model = options.model?.trim() || process.env.ERP_SQL_EMBEDDING_MODEL || DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL;
  const rows = await loadEmbeddingRows({ ...options, model });
  const report = {
    mode: options.apply ? "apply" : "dry-run",
    model,
    batchSize: normalizeBatchSize(options.batchSize),
    candidateCount: rows.length,
    updatedCount: 0,
    sampleDatasetIds: rows.slice(0, 5).map((row) => row.datasetId.toString()),
  };
  if (!options.apply || rows.length === 0) return report;
  const embedder = client ?? createSqlReferenceEmbeddingClientFromEnv({ model, required: true });
  if (!embedder) throw new Error("Embedding client is not configured");
  for (const batch of chunks(rows, report.batchSize)) {
    const vectors = await embedWithRetry(embedder, batch.map((row) => row.embeddingText ?? ""));
    if (vectors.length !== batch.length) throw new Error(`Embedding count mismatch: expected ${batch.length}, got ${vectors.length}`);
    await updateEmbeddingRows(batch, vectors, model);
    report.updatedCount += batch.length;
    if (process.env.ERP_SQL_EMBEDDING_PROGRESS !== "0") {
      console.error(`embedding progress ${report.updatedCount}/${rows.length}`);
    }
  }
  return report;
}

async function loadEmbeddingRows(options: BuildReferenceEmbeddingOptions & { model: string }): Promise<EmbeddingRow[]> {
  return prisma.$queryRaw<EmbeddingRow[]>(Prisma.sql`
    SELECT
      dataset_id AS "datasetId",
      embedding_text AS "embeddingText",
      embedding_model AS "embeddingModel",
      embedding_vector_json IS NOT NULL AS "hasVector"
    FROM "erp_agent"."sql_dataset_reference_index"
    WHERE embedding_text IS NOT NULL
      AND embedding_text <> ''
      AND (${options.force === true} OR embedding_vector_json IS NULL OR embedding_model IS DISTINCT FROM ${options.model})
    ORDER BY dataset_id
    ${options.limit && Number.isFinite(options.limit) ? Prisma.sql`LIMIT ${options.limit}` : Prisma.empty}
  `);
}

async function updateEmbeddingRows(rows: EmbeddingRow[], vectors: number[][], model: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "erp_agent"."sql_dataset_reference_index" AS target
    SET
      embedding_vector_json = source.embedding_vector_json,
      embedding_model = source.embedding_model,
      embedding_updated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(rows.map((row, index) => Prisma.sql`(
      ${row.datasetId},
      ${JSON.stringify(vectors[index])}::jsonb,
      ${model}
    )`))}) AS source(dataset_id, embedding_vector_json, embedding_model)
    WHERE target.dataset_id = source.dataset_id
  `);
}

function normalizeBatchSize(value?: number): number {
  return Math.min(Math.max(value && Number.isFinite(value) ? Math.floor(value) : 64, 1), 2048);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function embedWithRetry(embedder: SqlReferenceEmbeddingClient, texts: string[]): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await embedder.embed(texts);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildSqlDatasetReferenceEmbeddings({
    apply: args.apply === true,
    force: args.force === true,
    limit: typeof args.limit === "string" ? Number(args.limit) : undefined,
    batchSize: typeof args["batch-size"] === "string" ? Number(args["batch-size"]) : undefined,
    model: typeof args.model === "string" ? args.model : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
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
