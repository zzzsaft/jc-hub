import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import {
  compactSqlFamilyPromotionReport,
  sqlFamilyAssetPromotionService,
  writeSqlFamilyPromotionReviewOutputs,
} from "../service/SqlFamilyAssetPromotionService.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  if (!apply && args["dry-run"] !== true) throw new Error("Pass --dry-run or --apply");
  const classificationPath = requireArg(args, "classification");
  const businessSamplesPath = requireArg(args, "business-samples");

  const report = await sqlFamilyAssetPromotionService.promote({
    classificationPath,
    businessSamplesPath,
    apply,
  });

  await writeSqlFamilyPromotionReviewOutputs(report, {
    reviewOut: typeof args["review-out"] === "string" ? args["review-out"] : undefined,
    jsonOut: typeof args["json-out"] === "string" ? args["json-out"] : undefined,
    applyCommand: `npm run sql-family:promote-assets -- --classification=${classificationPath} --business-samples=${businessSamplesPath} --apply`,
  });

  console.log(JSON.stringify(compactSqlFamilyPromotionReport(report), null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
