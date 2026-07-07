import { prisma } from "../../../lib/prisma.js";
import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";
import {
  buildArchiveSearchAcceptanceCaseReport,
  buildArchiveSearchAcceptanceReport,
  FIXED_RANDOM_BASELINE_CASES,
} from "../archive/archiveSearchAcceptance.js";

async function main() {
  const caseReports = [];
  for (const acceptanceCase of FIXED_RANDOM_BASELINE_CASES) {
    const response = await archiveItemSearchService.searchArchiveItems({ ...acceptanceCase, limit: 5 });
    caseReports.push(buildArchiveSearchAcceptanceCaseReport(acceptanceCase, response));
  }

  const report = buildArchiveSearchAcceptanceReport(caseReports);
  console.log(JSON.stringify(report, null, 2));
  if (report.failedCases > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
