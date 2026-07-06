import path from "node:path";
import process from "node:process";
import { prisma } from "../../../../lib/prisma.js";
import { schemaRepository } from "../repository/SchemaRepository.js";
import { mapZDataFieldRow } from "../utils/csvRow.js";
import type { SchemaFieldImportInput, SchemaImportStats } from "../types/schemaTypes.js";
import { importCsvBatches } from "./importCsvBatches.js";

const DEFAULT_BATCH_SIZE = 1000;

/** Imports ZDataField.csv through a CSV stream and 1000-row batch upserts by default. */
export async function importZDataField(filePath = path.resolve("ZDataField.csv"), batchSize = DEFAULT_BATCH_SIZE): Promise<SchemaImportStats> {
  return importCsvBatches<SchemaFieldImportInput>(filePath, batchSize, mapZDataFieldRow, flushFields);
}

/** Writes one field batch to the schema repository. */
async function flushFields(batch: SchemaFieldImportInput[]): Promise<number> {
  return schemaRepository.upsertFields(batch);
}

/** Runs the importer when invoked from the command line. */
async function main(): Promise<void> {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("ZDataField.csv");
  const stats = await importZDataField(filePath);
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
