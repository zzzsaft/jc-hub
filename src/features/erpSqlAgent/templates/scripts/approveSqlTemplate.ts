import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { parseArgs, readBigIntArg, requireArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const template = await sqlTemplateRepository.approve(readBigIntArg(args, "template-id"), requireArg(args, "approved-by"));
  console.log(JSON.stringify({
    templateId: template.id.toString(),
    approvalStatus: template.approvalStatus,
    approved: template.approved,
    approvedBy: template.approvedBy,
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
