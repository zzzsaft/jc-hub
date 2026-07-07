import { prisma } from "../../../lib/prisma.js";
import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";

const CASES = [
  "1380mm PVC 模头",
  "PVC+UPVC 波浪板模头",
  "平挤出 模头",
  "flat die 1380",
  "客户提供原料 模头",
];

type SmokeDetail = {
  queryText: string;
  resultCount: number;
  top1: null | {
    archiveItemId: string;
    archiveId: string;
    documentId: string | null;
    itemName: string | null;
    productType: string | null;
    similarityScore: number;
    matchReasons: string[];
    confirmedKeys: string[];
    unresolvedCount: number;
    evidence: unknown;
  };
  checks: {
    resultCountGt0: boolean;
    top1HasProductTypeOrMaterialMatch: boolean;
    confirmedFieldsExists: boolean;
    unresolvedFieldsNotEmptyIfAmbiguityExists: boolean;
  };
  warnings: string[];
};

async function main() {
  const details: SmokeDetail[] = [];
  for (const queryText of CASES) {
    const result = await archiveItemSearchService.searchArchiveItems({ queryText, limit: 5 });
    const top1Result = result.results[0] ?? null;
    const top1 = top1Result
      ? {
          archiveItemId: top1Result.archiveItemId,
          archiveId: top1Result.archiveId,
          documentId: top1Result.documentId,
          itemName: top1Result.itemName,
          productType: top1Result.productType,
          similarityScore: top1Result.similarityScore,
          matchReasons: top1Result.matchReasons,
          confirmedKeys: Object.keys(top1Result.confirmedFields ?? {}),
          unresolvedCount: top1Result.unresolvedFieldsSummary?.length ?? 0,
          evidence: top1Result.evidence,
        }
      : null;
    details.push({
      queryText,
      resultCount: result.results.length,
      top1,
      checks: buildChecks(queryText, top1),
      warnings: result.warnings,
    });
  }

  const failureCases = details.flatMap((detail) =>
    Object.entries(detail.checks)
      .filter(([, ok]) => !ok)
      .map(([check]) => ({
        queryText: detail.queryText,
        check,
        resultCount: detail.resultCount,
        top1: detail.top1,
      })),
  );

  console.log(JSON.stringify({
    totalCases: details.length,
    recall_score: score(details, (detail) => detail.checks.resultCountGt0),
    ranking_score: score(details, (detail) => detail.checks.top1HasProductTypeOrMaterialMatch),
    explainability_score: score(details, (detail) =>
      Boolean(detail.top1)
        && detail.top1!.matchReasons.length > 0
        && detail.checks.confirmedFieldsExists
        && detail.checks.unresolvedFieldsNotEmptyIfAmbiguityExists,
    ),
    failure_cases: failureCases,
    details,
  }, null, 2));
}

function buildChecks(queryText: string, top1: SmokeDetail["top1"]): SmokeDetail["checks"] {
  const top1Text = `${top1?.productType ?? ""} ${top1?.confirmedKeys.join(" ") ?? ""} ${top1?.matchReasons.join(" ") ?? ""}`.toLowerCase();
  const expectsMaterial = /PVC|UPVC|CPVC|RPVC/i.test(queryText);
  const expectsProductType = /模头|flat die|平挤出/i.test(queryText);
  const hasMaterialMatch = !expectsMaterial || /pvc|upvc|cpvc|rpvc|材料匹配/.test(top1Text);
  const hasProductTypeMatch = !expectsProductType || /flat_die|die|模头|产品类型匹配/.test(top1Text);
  const ambiguityExists = /\+|\/|、|客户提供|原料/i.test(queryText);
  return {
    resultCountGt0: Boolean(top1),
    top1HasProductTypeOrMaterialMatch: Boolean(top1 && (hasMaterialMatch || hasProductTypeMatch)),
    confirmedFieldsExists: Boolean(top1 && top1.confirmedKeys.length > 0),
    unresolvedFieldsNotEmptyIfAmbiguityExists: !ambiguityExists || Boolean(top1 && top1.unresolvedCount > 0),
  };
}

function score(details: SmokeDetail[], predicate: (detail: SmokeDetail) => boolean) {
  return details.length === 0 ? 0 : details.filter(predicate).length / details.length;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
