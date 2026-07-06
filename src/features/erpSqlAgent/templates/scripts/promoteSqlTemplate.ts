import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import { sqlGuardService } from "../../sqlGuard/index.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { parameterizeFineReportSql, sqlTemplatePromotionService } from "../service/SqlTemplatePromotionService.js";
import { parseArgs, readBigIntArg, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const datasetId = readBigIntArg(args, "dataset-id");
  const intent = requireArg(args, "intent");
  const module = requireArg(args, "module");
  const dryRun = args["dry-run"] === true;

  if (dryRun) {
    const dataset = await sqlTemplateRepository.findDataset(datasetId);
    if (!dataset) throw new Error(`Dataset not found: ${datasetId.toString()}`);
    const sqlTemplate = parameterizeFineReportSql(dataset.rawSql);
    const guard = await sqlGuardService.validate(sqlTemplate);
    console.log(JSON.stringify({
      dryRun,
      datasetId: datasetId.toString(),
      intent,
      module,
      sqlTemplate,
      approvalStatus: "draft",
      approved: false,
      guardPassed: false,
      tables: guard.referencedTables,
      fields: guard.referencedFields,
    }, null, 2));
    return;
  }

  const template = await sqlTemplatePromotionService.promote({ datasetId, intent, module });
  console.log(JSON.stringify({ templateId: template.id.toString(), approvalStatus: template.approvalStatus }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
