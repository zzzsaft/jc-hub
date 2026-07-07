import { auditArchiveFeatureCoverage } from "../archive/archiveFeatureCoverage.js";
import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";

const SMOKE_QUERY = {
  queryText: "1380mm PVC+UPVC 波浪板模头",
  productType: "flat_die",
  materials: ["PVC", "UPVC"],
  application: "波浪板",
  widthMm: 1380,
  limit: 10,
};

async function main() {
  const audit = await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 });
  const search = await archiveItemSearchService.searchArchiveItems(SMOKE_QUERY);
  const top1 = search.results[0] ?? null;

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    coverage: {
      totalArchives: audit.totalArchives,
      totalArchiveItems: audit.totalArchiveItems,
      archivesWithSimilarityFeatures: audit.archivesWithSimilarityFeatures,
      archivesMissingSimilarityFeatures: audit.archivesMissingSimilarityFeatures,
      archivesMissingConfirmedSimilarityFeatures: audit.archivesMissingConfirmedSimilarityFeatures,
      missing: {
        effective_width_mm: audit.missing.effective_width_mm,
        effective_width_mm_or_die_width_mm: audit.missing.effective_width_mm_or_die_width_mm,
        product_type: audit.missing.product_type,
        plastic_material: audit.missing.plastic_material,
        application: audit.missing.application,
        lip_adjustment_method: audit.missing.lip_adjustment_method,
        deckle_type: audit.missing.deckle_type,
        plastic_material_or_application: audit.missing.plastic_material_or_application,
      },
      recoverable: {
        effective_width_mm: audit.recoverable.effective_width_mm,
        product_type: audit.recoverable.product_type,
        plastic_material: audit.recoverable.plastic_material,
        application: audit.recoverable.application,
        lip_adjustment_method: audit.recoverable.lip_adjustment_method,
        deckle_type: audit.recoverable.deckle_type,
      },
    },
    smokeQuery: {
      query: search.query,
      warnings: search.warnings,
      resultCount: search.results.length,
      top1: top1
        ? {
            archiveItemId: top1.archiveItemId,
            archiveId: top1.archiveId,
            itemName: top1.itemName,
            productType: top1.productType,
            similarityScore: top1.similarityScore,
            matchReasons: top1.matchReasons,
            evidence: top1.evidence,
            explainability: {
              hasProductTypeReason: top1.matchReasons.some((reason) => reason.includes("产品类型匹配")),
              hasMaterialReason: top1.matchReasons.some((reason) => reason.includes("材料匹配")),
              hasWidthReason: top1.matchReasons.some((reason) => reason.includes("宽度接近")),
              hasApplicationReason: top1.matchReasons.some((reason) => reason.includes("应用匹配")),
              hasWaveBoardKeyword: top1.matchReasons.some((reason) => reason.includes("波浪板")),
            },
          }
        : null,
      topResults: search.results.slice(0, 5).map((result) => ({
        archiveItemId: result.archiveItemId,
        archiveId: result.archiveId,
        itemName: result.itemName,
        productType: result.productType,
        similarityScore: result.similarityScore,
        matchReasons: result.matchReasons,
        evidence: result.evidence,
      })),
    },
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
