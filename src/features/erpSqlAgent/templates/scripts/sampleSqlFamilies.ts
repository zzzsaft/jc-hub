import "../../../../config/env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../../../lib/prisma.js";
import { sqlTemplateFamilySampler } from "../service/SqlTemplateFamilySampler.js";
import { parseArgs, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = requireArg(args, "out");
  const report = await sqlTemplateFamilySampler.sample({
    sourceType: requireArg(args, "source-type"),
    limit: typeof args.limit === "string" ? Number(args.limit) : undefined,
    businessOnly: args["business-only"] === true,
  });

  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    out,
    totalDatasets: report.summary.totalDatasets,
    familyCount: report.summary.familyCount,
    outputFamilyCount: report.summary.outputFamilyCount,
    businessFamilyCount: "businessFamilyCount" in report.summary ? report.summary.businessFamilyCount : undefined,
    demoFilteredFamilyCount: "demoFilteredFamilyCount" in report.summary ? report.summary.demoFilteredFamilyCount : undefined,
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
