import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { importFineReportSqlAssets } from "../service/FineReportSqlExtractor.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await importFineReportSqlAssets({
    rootDir: requireArg(args, "root-dir"),
    dryRun: args["dry-run"] === true,
    onProgress: (progress) => renderProgress("parse", progress.done, progress.total),
  });
  finishProgress();

  if (!result.dryRun) {
    await sqlTemplateRepository.saveImportResult(result, (progress) => renderProgress("save", progress.done, progress.total));
    finishProgress();
  }
  console.log(JSON.stringify({
    rootDir: result.rootDir,
    dryRun: result.dryRun,
    fileCount: result.fileCount,
    datasetCount: result.datasetCount,
    errorCount: result.errorCount,
    errors: result.errors,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function renderProgress(label: string, done: number, total: number): void {
  if (!process.stderr.isTTY || total === 0) return;
  const width = 24;
  const filled = Math.round((done / total) * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const percent = Math.round((done / total) * 100).toString().padStart(3, " ");
  process.stderr.write(`\r${label} [${bar}] ${percent}% ${done}/${total}`);
}

function finishProgress(): void {
  if (process.stderr.isTTY) process.stderr.write("\n");
}
