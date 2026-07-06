import { createReadStream } from "node:fs";
import csv from "csv-parser";
import type { CsvRow } from "../utils/csvRow.js";
import type { SchemaImportStats } from "../types/schemaTypes.js";

export async function importCsvBatches<T>(
  filePath: string,
  batchSize: number,
  mapRow: (row: CsvRow) => T | null,
  flush: (batch: T[]) => Promise<number>,
): Promise<SchemaImportStats> {
  const stats: SchemaImportStats = { processed: 0, upserted: 0 };
  let batch: T[] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath).pipe(csv());

    stream.on("data", (row: CsvRow) => {
      stream.pause();
      void (async () => {
        const mapped = mapRow(row);
        if (mapped) {
          batch.push(mapped);
          stats.processed += 1;
        }
        if (batch.length >= batchSize) {
          stats.upserted += await flush(batch);
          batch = [];
        }
        stream.resume();
      })().catch(reject);
    });

    stream.on("error", reject);
    stream.on("end", () => {
      void (async () => {
        stats.upserted += await flush(batch);
        resolve();
      })().catch(reject);
    });
  });

  return stats;
}
