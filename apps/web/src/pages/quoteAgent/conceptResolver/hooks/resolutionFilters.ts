import {
  primaryTarget,
  proposalId,
  unifiedScoreOf,
} from "../proposalReview";
import type {
  ConceptResolution,
  ConceptResolverFilters,
} from "../types";
import {
  candidateTypeLabel,
  recommendedActionLabel,
  relationTypeLabel,
  riskLabel,
  routeLabel,
} from "../utils";

export function filterResolutions(resolutions: ConceptResolution[], filters: ConceptResolverFilters) {
  const query = filters.search.trim().toLowerCase();
  return resolutions.filter((resolution) => {
    if (filters.status === "applied" && !resolution.appliedAt) return false;
    if (filters.status === "pending" && resolution.appliedAt) return false;
    if (filters.route && resolution.route !== filters.route) return false;
    if (filters.relationType && resolution.relationType !== filters.relationType) return false;
    if (filters.recommendedAction && resolution.recommendedAction !== filters.recommendedAction) return false;
    if (filters.candidateType !== "all" && resolution.candidateType !== filters.candidateType) return false;
    if (filters.riskLevel !== "all" && resolution.riskLevel !== filters.riskLevel) return false;
    if (!query) return true;
    const target = primaryTarget(resolution);
    const haystack = [
      resolution.id,
      resolution.candidateId,
      resolution.candidateType,
      resolution.rawFieldName,
      resolution.rawValue,
      resolution.normalizedFieldName,
      resolution.normalizedRawValue,
      resolution.sourceProductType,
      resolution.route,
      resolution.relationType,
      resolution.recommendedAction,
      resolution.riskLevel,
      resolution.reason,
      target?.targetType,
      target?.id,
      target?.termType,
      target?.canonicalValue,
      target?.displayName,
      candidateTypeLabel(resolution.candidateType),
      relationTypeLabel(resolution.relationType),
      recommendedActionLabel(resolution.recommendedAction),
      routeLabel(resolution.route),
      riskLabel(resolution.riskLevel),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export function sortResolutions(resolutions: ConceptResolution[], filters: ConceptResolverFilters) {
  return [...resolutions].sort((left, right) => {
    const diff = sortValue(left, filters.sortKey) - sortValue(right, filters.sortKey);
    if (diff !== 0) return filters.sortDir === "asc" ? diff : -diff;
    return proposalId(left).localeCompare(proposalId(right));
  });
}

function sortValue(resolution: ConceptResolution, key: ConceptResolverFilters["sortKey"]) {
  if (key === "riskLevel") {
    const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return order[String(resolution.riskLevel ?? "")] ?? 0;
  }
  if (key === "avgScore") return Number(unifiedScoreOf(resolution, primaryTarget(resolution)) ?? 0);
  if (key === "lastResolvedAt") return resolution.updatedAt ? new Date(resolution.updatedAt).getTime() : 0;
  return Number(resolution.occurrenceCount ?? resolution.documentCount ?? 0);
}
