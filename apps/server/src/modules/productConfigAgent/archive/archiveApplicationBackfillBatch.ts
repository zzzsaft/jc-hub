import type { ArchiveFeatureBackfillProposal } from "./archiveFeatureCoverage.js";

export const APPLICATION_BACKFILL_EXCLUDED_VALUES = new Set(["other", "其他", "无", "none", "unknown", "未知"]);

export type ArchiveApplicationBackfillPolicy = {
  minConfidence: number;
  maxUpdates: number;
};

export function selectArchiveApplicationBackfillBatch(
  proposals: ArchiveFeatureBackfillProposal[],
  policy: ArchiveApplicationBackfillPolicy,
): ArchiveFeatureBackfillProposal[] {
  return proposals
    .filter((proposal) => isAllowedArchiveApplicationBackfillProposal(proposal, policy.minConfidence))
    .slice(0, policy.maxUpdates);
}

export function isAllowedArchiveApplicationBackfillProposal(
  proposal: ArchiveFeatureBackfillProposal,
  minConfidence = 0.78,
): boolean {
  return proposal.missingFeatureKey === "application"
    && proposal.sourceFieldPath === "itemName"
    && proposal.confidence >= minConfidence
    && !APPLICATION_BACKFILL_EXCLUDED_VALUES.has(normalizeExcludedValue(proposal.proposedValue));
}

export function summarizeArchiveApplicationBackfillValues(proposals: ArchiveFeatureBackfillProposal[]) {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    const value = String(proposal.proposedValue);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function normalizeExcludedValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
