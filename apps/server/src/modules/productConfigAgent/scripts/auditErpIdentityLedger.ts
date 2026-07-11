import path from "node:path";
import { prisma } from "../../../lib/prisma.js";
import { runErpIdentityLedgerAudit } from "../erpIdentityLedger.service.js";

async function main() {
  if (process.argv.slice(2).some((arg) => arg === "--apply" || arg.startsWith("--apply="))) {
    throw new Error("This audit is read-only and refuses --apply.");
  }
  const inputDir = arg("input-dir") ?? "tmp/product-config-new-product-type-review-400-v2";
  const outputDir = arg("out-dir") ?? "tmp/product-config-erp-identity-ledger-400-v1";
  const summary = await runErpIdentityLedgerAudit({
    inputDir: path.resolve(inputDir),
    outputDir: path.resolve(outputDir),
    onProgress: (message) => process.stderr.write(`${message}\n`),
  });
  console.log(JSON.stringify(summary, null, 2));
}

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.split("=", 2)[1];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
