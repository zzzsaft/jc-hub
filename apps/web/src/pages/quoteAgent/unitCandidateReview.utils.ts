import type {
  UnitAlias,
  UnitAliasPayload,
  UnitCandidate,
  UnitCandidateReviewAction,
  UnitCandidateReviewSuggestion,
} from "./types";
import { asArray } from "./utils";

export const unitText = (value: unknown) => String(value ?? "").trim();

export const unitCandidateId = (candidate: UnitCandidate) =>
  String(candidate.id ?? candidate.candidateId ?? candidate.unitCandidateId ?? "");

export const defaultUnitAliasPayload = (candidate: UnitCandidate): UnitAliasPayload => {
  const canonicalUnit =
    unitText(candidate.proposedCanonicalUnit) ||
    unitText(candidate.normalizedRawUnit) ||
    unitText(candidate.rawUnit);

  return {
    canonicalUnit,
    aliasValue: unitText(candidate.rawUnit),
    displayUnit: canonicalUnit,
    reviewedBy: "Codex",
  };
};

export const parsedUnitValue = (candidate: UnitCandidate) =>
  candidate.parsedValue ??
  candidate.parsedResult ??
  candidate.parsed ??
  candidate.valueParseResult ??
  candidate.normalizedValue ??
  candidate.evidence ??
  null;

export const unitAliasesForPrompt = (aliases: UnitAlias[]) =>
  aliases.map((alias) => ({
    id: alias.id,
    canonicalUnit: alias.canonicalUnit,
    displayUnit: alias.displayUnit,
    aliasValue: alias.aliasValue,
    normalizedAlias: alias.normalizedAlias,
  }));

export const unitCandidatesForPrompt = (candidates: UnitCandidate[]) =>
  candidates.map((candidate) => ({
    candidateId: unitCandidateId(candidate),
    documentId: candidate.documentId,
    extractionResultId: candidate.extractionResultId,
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    rawUnit: candidate.rawUnit,
    normalizedRawUnit: candidate.normalizedRawUnit,
    proposedCanonicalUnit: candidate.proposedCanonicalUnit,
    reason: candidate.reason,
    evidence: candidate.evidence,
  }));

const normalizeAction = (value: unknown): UnitCandidateReviewAction | null => {
  const action = String(value ?? "").trim();
  if (action === "approve" || action === "reject" || action === "needs_human_review") return action;
  if (["approved", "accept", "accepted", "approve_alias", "add_alias"].includes(action)) return "approve";
  if (["rejected", "deny", "denied"].includes(action)) return "reject";
  return null;
};

const suggestionId = (suggestion: any) =>
  String(suggestion?.candidateId ?? suggestion?.candidate_id ?? suggestion?.unitCandidateId ?? suggestion?.unit_candidate_id ?? suggestion?.id ?? "");

export const normalizeUnitSuggestion = (value: unknown): UnitCandidateReviewSuggestion | null => {
  const suggestion = value as any;
  const candidateId = suggestionId(suggestion);
  const recommendedAction = normalizeAction(
    suggestion?.recommendedAction ??
      suggestion?.recommended_action ??
      suggestion?.action ??
      suggestion?.decision ??
      suggestion?.recommendation,
  );
  if (!candidateId || !recommendedAction) return null;
  return {
    ...suggestion,
    candidateId,
    recommendedAction,
    canonicalUnit: suggestion.canonicalUnit ?? suggestion.canonical_unit ?? null,
    displayUnit: suggestion.displayUnit ?? suggestion.display_unit ?? null,
    aliasValue: suggestion.aliasValue ?? suggestion.alias_value ?? null,
    confidence: suggestion.confidence ?? null,
    riskLevel: suggestion.riskLevel ?? suggestion.risk_level,
    needsHumanReview: Boolean(suggestion.needsHumanReview ?? suggestion.needs_human_review),
    reason: suggestion.reason,
  };
};

export const unitSuggestionsFromResponse = (response: unknown) => {
  const value = response as any;
  return asArray(
    Array.isArray(value)
      ? value
      : value?.suggestions ??
          value?.unitSuggestions ??
          value?.unit_suggestions ??
          value?.unitCandidateSuggestions ??
          value?.unit_candidate_suggestions ??
          value?.reviewSuggestions ??
          value?.review_suggestions ??
          value?.items ??
          value?.data,
  )
    .map(normalizeUnitSuggestion)
    .filter(Boolean) as UnitCandidateReviewSuggestion[];
};

export const filterUnitCandidates = (candidates: UnitCandidate[], keyword: string) => {
  const query = keyword.trim().toLowerCase();
  if (!query) return candidates;
  return candidates.filter((candidate) =>
    [candidate.rawUnit, candidate.normalizedRawUnit, candidate.proposedCanonicalUnit, candidate.termType, candidate.rawValue, candidate.documentId]
      .map((value) => unitText(value).toLowerCase())
      .some((value) => value.includes(query)),
  );
};

export const payloadFromUnitSuggestion = (
  candidate: UnitCandidate,
  suggestion?: UnitCandidateReviewSuggestion,
): UnitAliasPayload => {
  const fallback = defaultUnitAliasPayload(candidate);
  return {
    canonicalUnit: unitText(suggestion?.canonicalUnit) || fallback.canonicalUnit,
    aliasValue: unitText(suggestion?.aliasValue) || fallback.aliasValue,
    displayUnit: unitText(suggestion?.displayUnit) || unitText(suggestion?.canonicalUnit) || fallback.displayUnit,
    reviewedBy: "Codex",
  };
};
