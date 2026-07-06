import "../../../../config/env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../../../lib/prisma.js";
import { sqlTemplateAnalysisService } from "../service/SqlTemplateAnalysisService.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportOut = requireArg(args, "report-out");
  const report = await sqlTemplateAnalysisService.analyze({
    sourceType: requireArg(args, "source-type"),
    module: typeof args.module === "string" ? args.module as never : undefined,
    limit: typeof args.limit === "string" ? Number(args.limit) : undefined,
    onProgress: (progress) => renderProgress(progress.done, progress.total),
  });
  finishProgress();

  await fs.mkdir(path.dirname(path.resolve(reportOut)), { recursive: true });
  await fs.writeFile(reportOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    reportOut,
    totalDatasets: report.summary.totalDatasets,
    distinctSqlHashCount: report.summary.distinctSqlHashCount,
    templateCandidateCount: report.templateCandidates.length,
  }, null, 2));
}

function renderProgress(done: number, total: number): void {
  if (!process.stderr.isTTY || total === 0) return;
  const width = 24;
  const filled = Math.round((done / total) * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const percent = Math.round((done / total) * 100).toString().padStart(3, " ");
  process.stderr.write(`\ranalyze [${bar}] ${percent}% ${done}/${total}`);
}

function finishProgress(): void {
  if (process.stderr.isTTY) process.stderr.write("\n");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
