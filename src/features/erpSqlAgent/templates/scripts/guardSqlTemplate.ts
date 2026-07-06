import "../../../../config/env.js";

import { prisma } from "../../../../lib/prisma.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateGuardService } from "../service/SqlTemplateGuardService.js";
import { parseArgs, readBigIntArg } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const templateId = readBigIntArg(args, "template-id");
  const template = await sqlTemplateRepository.findTemplate(templateId);
  if (!template) throw new Error(`Template not found: ${templateId.toString()}`);

  const result = await sqlTemplateGuardService.validate(template.sqlTemplate, readParamMap(template.requiredParams));
  await sqlTemplateRepository.updateGuard(templateId, result.guardPassed, result);
  console.log(JSON.stringify(result, null, 2));
}

function readParamMap(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, { type?: "string" | "number" | "boolean" }> : {};
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
