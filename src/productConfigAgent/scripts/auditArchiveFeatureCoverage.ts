import {
  applyArchiveFeatureBackfill,
  auditArchiveFeatureCoverage,
  planArchiveFeatureBackfillFromDatabase,
} from "../archive/archiveFeatureCoverage.js";
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
  const args = new Set(process.argv.slice(2));
  const limit = numberArg("--limit");
  const maxUpdates = numberArg("--max-updates");
  const minConfidence = numberArg("--min-confidence") ?? 0;
  const apply = args.has("--apply");
  const audit = await auditArchiveFeatureCoverage({ limit });
  const plannedProposals = await planArchiveFeatureBackfillFromDatabase({ limit });
  const proposals = plannedProposals
    .filter((proposal) => proposal.confidence >= minConfidence)
    .slice(0, maxUpdates ?? plannedProposals.length);
  const applied = apply ? await applyArchiveFeatureBackfill(proposals) : { updatedCount: 0 };
  const postApplyVerification = apply ? await buildPostApplyVerification() : null;
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    applyRequiredFlag: "--apply",
    ...(apply ? { preApplyAudit: audit } : { audit }),
    backfill: {
      plannedUpdateCount: plannedProposals.length,
      proposedUpdateCount: proposals.length,
      appliedUpdateCount: applied.updatedCount,
      minConfidence,
      maxUpdates: maxUpdates ?? null,
      proposals: proposals.slice(0, 100),
    },
    ...(apply ? { postApplyVerification } : {}),
  }, bigintReplacer, 2));
}

async function buildPostApplyVerification() {
  const [coverage, search] = await Promise.all([
    auditArchiveFeatureCoverage({ proposalSampleLimit: 0 }),
    archiveItemSearchService.searchArchiveItems(SMOKE_QUERY),
  ]);
  const top1 = search.results[0] ?? null;
  return {
    coverage: {
      totalArchives: coverage.totalArchives,
      totalArchiveItems: coverage.totalArchiveItems,
      archivesWithSimilarityFeatures: coverage.archivesWithSimilarityFeatures,
      archivesMissingSimilarityFeatures: coverage.archivesMissingSimilarityFeatures,
      archivesMissingConfirmedSimilarityFeatures: coverage.archivesMissingConfirmedSimilarityFeatures,
      missing: {
        effective_width_mm: coverage.missing.effective_width_mm,
        effective_width_mm_or_die_width_mm: coverage.missing.effective_width_mm_or_die_width_mm,
        product_type: coverage.missing.product_type,
        plastic_material: coverage.missing.plastic_material,
        application: coverage.missing.application,
        lip_adjustment_method: coverage.missing.lip_adjustment_method,
        deckle_type: coverage.missing.deckle_type,
        plastic_material_or_application: coverage.missing.plastic_material_or_application,
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
    },
  };
}

function numberArg(name: string): number | undefined {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? String(value) : value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
