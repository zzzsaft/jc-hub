import { productConfigErpIdentityLookupService, type ErpIdentityLookupInput } from "../erpIdentityLookup.service.js";
import { prisma } from "../../../lib/prisma.js";

const DEFAULT_TARGETS = [
  { documentId: 3950, itemIndex: 5 },
  { documentId: 3966, itemIndex: 3 },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.documentId ? [args] : DEFAULT_TARGETS;
  const results = [];
  let processed = 0;
  let failed = 0;

  for (const target of targets) {
    process.stderr.write(`stage=erp_identity_lookup processed=${processed}/${targets.length} failed=${failed} documentId=${target.documentId} itemIndex=${target.itemIndex}\n`);
    try {
      results.push({
        target,
        ...(await productConfigErpIdentityLookupService.lookup(target)),
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      results.push({ target, error: error instanceof Error ? error.message : String(error) });
    }
  }

  process.stderr.write(`stage=done processed=${processed}/${targets.length} failed=${failed}\n`);
  console.log(JSON.stringify({ processed, failed, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

function parseArgs(argv: string[]): ErpIdentityLookupInput {
  const input: ErpIdentityLookupInput = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/u, "").split("=", 2);
    if (key === "document-id" || key === "documentId") input.documentId = value;
    if (key === "item-index" || key === "itemIndex") input.itemIndex = value;
    if (key === "product-number" || key === "productNumber") input.productNumber = value;
    if (key === "order-number" || key === "orderNumber") input.orderNumber = value;
    if (key === "contract-number" || key === "contractNumber") input.contractNumber = value;
    if (key === "customer" || key === "customerText") input.customerText = value;
    if (key === "item-text" || key === "itemText") input.itemText = value;
    if (key === "limit") input.limit = Number(value);
  }
  return input;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
