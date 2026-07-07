import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import {
  compactSummaryLine,
  sqlFamilyAutoPromotionService,
  writeSqlFamilyAutoPromotionOutputs,
} from "../service/SqlFamilyAutoPromotionService.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  if (!apply && args["dry-run"] !== true) throw new Error("Pass --dry-run or --apply");

  const families = requireArg(args, "families").split(",").map((item) => item.trim()).filter(Boolean);
  const report = await sqlFamilyAutoPromotionService.promote({
    classificationPath: requireArg(args, "classification"),
    businessSamplesPath: requireArg(args, "business-samples"),
    families,
    company: requireArg(args, "company"),
    apply,
    batchId: typeof args["batch-id"] === "string" ? args["batch-id"] : "batch2",
  });

  await writeSqlFamilyAutoPromotionOutputs(report, {
    compactOut: requireArg(args, "compact-out"),
    out: requireArg(args, "out"),
  });

  console.log(compactSummaryLine(report));
  if (report.summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
