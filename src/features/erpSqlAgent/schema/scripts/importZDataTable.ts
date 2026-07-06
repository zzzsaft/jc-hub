import path from "node:path";
import process from "node:process";
import { prisma } from "../../../../lib/prisma.js";
import { schemaRepository } from "../repository/SchemaRepository.js";
import { mapZDataTableRow } from "../utils/csvRow.js";
import type { SchemaImportStats, SchemaTableImportInput } from "../types/schemaTypes.js";
import { importCsvBatches } from "./importCsvBatches.js";

const DEFAULT_BATCH_SIZE = 1000;

/** Imports ZDataTable.csv through a stream and repeatable batch upserts. */
export async function importZDataTable(filePath = path.resolve("ZDataTable.csv"), batchSize = DEFAULT_BATCH_SIZE): Promise<SchemaImportStats> {
  return importCsvBatches<SchemaTableImportInput>(filePath, batchSize, mapZDataTableRow, flushTables);
}

/** Writes one table batch to the schema repository. */
async function flushTables(batch: SchemaTableImportInput[]): Promise<number> {
  return schemaRepository.upsertTables(batch);
}

/** Runs the importer when invoked from the command line. */
async function main(): Promise<void> {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("ZDataTable.csv");
  const stats = await importZDataTable(filePath);
  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  });
}
