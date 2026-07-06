import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import {
  sqlTemplateRetrievalEvalService,
  writeSqlTemplateRetrievalEvalOutputs,
} from "../service/SqlTemplateRetrievalEvalService.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await sqlTemplateRetrievalEvalService.evaluate();
  await writeSqlTemplateRetrievalEvalOutputs(report, {
    out: requireArg(args, "out"),
    mdOut: requireArg(args, "md-out"),
    compactOut: requireArg(args, "compact-out"),
  });
  console.log(JSON.stringify(report.summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
