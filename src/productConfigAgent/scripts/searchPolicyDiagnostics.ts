import { prisma } from "../../lib/prisma.js";
import { getLegacyArchiveSearchFieldConfig } from "../archive/insertGate.js";
import { buildSearchPolicyDiagnostics, loadTermTypeSearchPolicy } from "../archive/searchPolicy.js";

async function main() {
  const policy = await loadTermTypeSearchPolicy();
  const diagnostics = buildSearchPolicyDiagnostics(policy, getLegacyArchiveSearchFieldConfig());
  console.log(JSON.stringify(diagnostics, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
