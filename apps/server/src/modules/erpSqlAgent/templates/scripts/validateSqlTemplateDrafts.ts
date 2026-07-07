import "../../../../config/env.js";

import { parseArgs, requireArg } from "./cli.js";
import {
  sqlTemplateDraftValidationService,
  writeSqlTemplateDraftValidationOutputs,
} from "../service/SqlTemplateDraftValidationService.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = requireArg(args, "out");
  const report = await sqlTemplateDraftValidationService.validate({
    reviewJsonPath: requireArg(args, "review-json"),
    company: requireArg(args, "company"),
    sample: args.sample === true,
    sampleLimit: typeof args["sample-limit"] === "string" ? Number(args["sample-limit"]) : undefined,
  });

  await writeSqlTemplateDraftValidationOutputs(report, {
    out,
    mdOut: typeof args["md-out"] === "string" ? args["md-out"] : undefined,
  });
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
