import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { normalizeAlias } from "../dictionary/matcher.service.js";
import {
  archiveItemSearchService,
  calculateArchiveItemCandidateLimit,
  type ArchiveItemSearchResult,
} from "./archiveItemSearch.service.js";
import { normalizeArchiveSearchQuery } from "./queryNormalizer.js";

export type AliasDictionaryValue = {
  termId: string;
  termType: string;
  canonicalValue: string;
  displayName?: string | null;
  aliases: string[];
};

export type AliasGapSuggestion = {
  termId: string;
  termType: string;
  queryTerm: string;
  canonicalValue: string;
  displayName?: string | null;
  existingAliases: string[];
  status: "missing_alias" | "already_covered";
  confidence: number;
  evidence: {
    similarity: number;
    sharedCharacters: string[];
    queryTermOccurrences: ArchiveTermOccurrence[];
    canonicalOccurrences: ArchiveTermOccurrence[];
  };
};

export type ArchiveTermOccurrence = {
  archiveItemId: string;
  archiveId: string;
  itemName: string | null;
  matchedValue: string;
  source: "itemName" | "searchableText";
};

export type AliasGapAudit = {
  termType: string;
  queryTerms: string[];
  dictionaryValueCount: number;
  suggestions: AliasGapSuggestion[];
};

export type CandidatePoolTruncationDiagnostics = {
  query: {
    queryText: string;
    productType?: string;
    materials?: string[];
    application?: string;
    widthMm?: number;
    defaultLimit: number;
    expandedLimit: number;
    defaultCandidateLimit: number;
    expandedCandidateLimit: number;
  };
  defaultTopResults: CandidatePoolResultSummary[];
  expandedTopResults: CandidatePoolResultSummary[];
  truncatedHighScoringResults: CandidatePoolResultSummary[];
  preciseItemsExcludedFromDefault: CandidatePoolResultSummary[];
  summary: {
    defaultResultCount: number;
    expandedResultCount: number;
    truncatedHighScoringCount: number;
    preciseExcludedCount: number;
  };
};

export type CandidatePoolResultSummary = {
  rank: number;
  archiveItemId: string;
  archiveId: string;
  itemName: string | null;
  productType: string | null;
  similarityScore: number;
  matchReasons: string[];
  evidence: ArchiveItemSearchResult["evidence"];
};

export type ArchiveSearchDiagnosticsReport = {
  mode: "read-only";
  aliasGapAudit: AliasGapAudit;
  aliasApplyPlan: AliasGapAliasApplyPlan;
  candidatePoolDiagnostics: CandidatePoolTruncationDiagnostics;
};

export type AliasGapAliasProposal = {
  termId: string;
  termType: string;
  canonicalValue: string;
  aliasValue: string;
  normalizedAlias: string;
  confidence: number;
  source: "archive_search_alias_gap_audit";
  evidence: AliasGapSuggestion["evidence"];
};

export type AliasGapAliasApplyPlan = {
  mode: "dry-run";
  minConfidence: number;
  proposalCount: number;
  proposals: AliasGapAliasProposal[];
};

const DEFAULT_QUERY = "1380mm PVC+UPVC 波浪板模头";
const DEFAULT_ALIAS_TERMS = ["波浪板", "波浪瓦", "波浪瓦板"];

export async function auditArchiveSearchDiagnostics(params: {
  queryText?: string;
  termType?: string;
  aliasTerms?: string[];
  defaultLimit?: number;
  expandedLimit?: number;
  productType?: string;
  materials?: string[];
  application?: string;
  widthMm?: number;
} = {}): Promise<ArchiveSearchDiagnosticsReport> {
  const queryText = params.queryText ?? DEFAULT_QUERY;
  const termType = params.termType ?? "application";
  const aliasTerms = params.aliasTerms?.length ? params.aliasTerms : DEFAULT_ALIAS_TERMS;
  const [dictionaryValues, occurrences] = await Promise.all([
    loadAliasDictionaryValues(termType),
    loadArchiveTermOccurrences(aliasTerms),
  ]);

  const aliasGapAudit = buildAliasGapAudit({
    termType,
    queryTerms: aliasTerms,
    dictionaryValues,
    occurrences,
  });
  const aliasApplyPlan = buildAliasGapAliasApplyPlan(aliasGapAudit, { minConfidence: 0.7 });
  const candidatePoolDiagnostics = await diagnoseCandidatePoolTruncation({
    queryText,
    productType: params.productType ?? "flat_die",
    materials: params.materials ?? ["PVC", "UPVC"],
    application: params.application ?? "波浪板",
    widthMm: params.widthMm ?? 1380,
    defaultLimit: params.defaultLimit ?? 10,
    expandedLimit: params.expandedLimit ?? 50,
  });

  return {
    mode: "read-only",
    aliasGapAudit,
    aliasApplyPlan,
    candidatePoolDiagnostics,
  };
}

export function buildAliasGapAudit(params: {
  termType: string;
  queryTerms: string[];
  dictionaryValues: AliasDictionaryValue[];
  occurrences?: ArchiveTermOccurrence[];
}): AliasGapAudit {
  const queryTerms = dedupe(params.queryTerms.map((term) => term.trim()).filter(Boolean));
  const occurrences = params.occurrences ?? [];
  const suggestions: AliasGapSuggestion[] = [];
  const valuesForTermType = params.dictionaryValues.filter((item) => item.termType === params.termType);
  const coveredQueryTerms = new Set(queryTerms.filter((queryTerm) => (
    valuesForTermType.some((value) => valueMatchValues(value).some((item) => normalizeAlias(item) === normalizeAlias(queryTerm)))
  )));

  for (const queryTerm of queryTerms) {
    const normalizedQuery = normalizeAlias(queryTerm);
    for (const value of valuesForTermType) {
      const matchValues = valueMatchValues(value);
      const alreadyCovered = matchValues.some((item) => normalizeAlias(item) === normalizedQuery);
      if (coveredQueryTerms.has(queryTerm) && !alreadyCovered) continue;
      const bestSimilarity = Math.max(...matchValues.map((item) => aliasTermSimilarity(queryTerm, item)));
      const canonicalOccurrence = occurrences.filter((item) => (
        includesAnyNormalized(item.matchedValue, [value.canonicalValue, value.displayName ?? "", ...value.aliases])
      ));
      const queryOccurrence = occurrences.filter((item) => includesAnyNormalized(item.matchedValue, [queryTerm]));
      const confidence = aliasGapConfidence({
        alreadyCovered,
        similarity: bestSimilarity,
        queryOccurrenceCount: queryOccurrence.length,
        canonicalOccurrenceCount: canonicalOccurrence.length,
      });

      if (!alreadyCovered && confidence < 0.55) continue;
      suggestions.push({
        termId: value.termId,
        termType: params.termType,
        queryTerm,
        canonicalValue: value.canonicalValue,
        displayName: value.displayName,
        existingAliases: value.aliases,
        status: alreadyCovered ? "already_covered" : "missing_alias",
        confidence,
        evidence: {
          similarity: round(bestSimilarity),
          sharedCharacters: sharedCjkCharacters(queryTerm, value.canonicalValue),
          queryTermOccurrences: queryOccurrence.slice(0, 5),
          canonicalOccurrences: canonicalOccurrence.slice(0, 5),
        },
      });
    }
  }

  return {
    termType: params.termType,
    queryTerms,
    dictionaryValueCount: valuesForTermType.length,
    suggestions: suggestions
      .sort((left, right) => (
        statusRank(left.status) - statusRank(right.status)
        || right.confidence - left.confidence
        || left.queryTerm.localeCompare(right.queryTerm)
        || left.canonicalValue.localeCompare(right.canonicalValue)
      ))
      .slice(0, 30),
  };
}

export function buildAliasGapAliasApplyPlan(
  audit: AliasGapAudit,
  params: { minConfidence?: number } = {},
): AliasGapAliasApplyPlan {
  const minConfidence = params.minConfidence ?? 0.7;
  const proposals = audit.suggestions
    .filter((suggestion) => suggestion.status === "missing_alias" && suggestion.confidence >= minConfidence)
    .map((suggestion) => ({
      termId: suggestion.termId,
      termType: suggestion.termType,
      canonicalValue: suggestion.canonicalValue,
      aliasValue: suggestion.queryTerm,
      normalizedAlias: normalizeAlias(suggestion.queryTerm),
      confidence: suggestion.confidence,
      source: "archive_search_alias_gap_audit" as const,
      evidence: suggestion.evidence,
    }))
    .sort((left, right) => right.confidence - left.confidence || left.aliasValue.localeCompare(right.aliasValue));
  return {
    mode: "dry-run",
    minConfidence,
    proposalCount: proposals.length,
    proposals,
  };
}

export async function applyAliasGapAliasProposals(proposals: AliasGapAliasProposal[]) {
  const applied: Array<AliasGapAliasProposal & { aliasId: string }> = [];
  for (const proposal of proposals) {
    const result = await prisma.dictionaryAlias.upsert({
      where: { termType_normalizedAlias: { termType: proposal.termType, normalizedAlias: proposal.normalizedAlias } },
      create: {
        termId: BigInt(proposal.termId),
        termType: proposal.termType,
        aliasValue: proposal.aliasValue,
        normalizedAlias: proposal.normalizedAlias,
        confidence: proposal.confidence,
        source: proposal.source,
        note: `Suggested by archive search alias gap audit for ${proposal.canonicalValue}`,
      },
      update: {
        termId: BigInt(proposal.termId),
        aliasValue: proposal.aliasValue,
        confidence: proposal.confidence,
        source: proposal.source,
        note: `Suggested by archive search alias gap audit for ${proposal.canonicalValue}`,
        isActive: true,
      },
      select: { id: true },
    });
    applied.push({ ...proposal, aliasId: stringifyId(result.id) });
  }
  return { appliedCount: applied.length, applied };
}

function valueMatchValues(value: AliasDictionaryValue): string[] {
  return [value.canonicalValue, value.displayName ?? "", ...value.aliases].filter(Boolean);
}

export async function diagnoseCandidatePoolTruncation(params: {
  queryText: string;
  productType?: string;
  materials?: string[];
  application?: string;
  widthMm?: number;
  defaultLimit?: number;
  expandedLimit?: number;
}): Promise<CandidatePoolTruncationDiagnostics> {
  const defaultLimit = normalizePositiveInt(params.defaultLimit, 10);
  const expandedLimit = Math.max(normalizePositiveInt(params.expandedLimit, 50), defaultLimit);
  const defaultSearch = await archiveItemSearchService.searchArchiveItems({ ...params, limit: defaultLimit });
  const expandedSearch = await archiveItemSearchService.searchArchiveItems({ ...params, limit: expandedLimit });
  return buildCandidatePoolTruncationDiagnostics({
    queryText: params.queryText,
    productType: params.productType,
    materials: params.materials,
    application: params.application,
    widthMm: params.widthMm,
    defaultLimit,
    expandedLimit,
    defaultResults: defaultSearch.results,
    expandedResults: expandedSearch.results,
  });
}

export function buildCandidatePoolTruncationDiagnostics(params: {
  queryText: string;
  productType?: string;
  materials?: string[];
  application?: string;
  widthMm?: number;
  defaultLimit: number;
  expandedLimit: number;
  defaultResults: ArchiveItemSearchResult[];
  expandedResults: ArchiveItemSearchResult[];
}): CandidatePoolTruncationDiagnostics {
  const defaultIds = new Set(params.defaultResults.map((item) => item.archiveItemId));
  const defaultTopScore = params.defaultResults[0]?.similarityScore ?? 0;
  const expandedSummaries = params.expandedResults.map(summarizeSearchResult);
  const truncatedHighScoringResults = expandedSummaries
    .filter((item) => !defaultIds.has(item.archiveItemId) && item.similarityScore >= defaultTopScore)
    .slice(0, 20);
  const preciseItemsExcludedFromDefault = expandedSummaries
    .filter((item) => !defaultIds.has(item.archiveItemId) && isPreciseResult(item))
    .slice(0, 20);

  return {
    query: {
      queryText: params.queryText,
      ...(params.productType ? { productType: params.productType } : {}),
      ...(params.materials?.length ? { materials: params.materials } : {}),
      ...(params.application ? { application: params.application } : {}),
      ...(params.widthMm !== undefined ? { widthMm: params.widthMm } : {}),
      defaultLimit: params.defaultLimit,
      expandedLimit: params.expandedLimit,
      defaultCandidateLimit: calculateArchiveItemCandidateLimit(params.defaultLimit),
      expandedCandidateLimit: calculateArchiveItemCandidateLimit(params.expandedLimit),
    },
    defaultTopResults: params.defaultResults.slice(0, 10).map(summarizeSearchResult),
    expandedTopResults: expandedSummaries.slice(0, 10),
    truncatedHighScoringResults,
    preciseItemsExcludedFromDefault,
    summary: {
      defaultResultCount: params.defaultResults.length,
      expandedResultCount: params.expandedResults.length,
      truncatedHighScoringCount: truncatedHighScoringResults.length,
      preciseExcludedCount: preciseItemsExcludedFromDefault.length,
    },
  };
}

async function loadAliasDictionaryValues(termType: string): Promise<AliasDictionaryValue[]> {
  const [terms, aliases] = await Promise.all([
    prisma.dictionaryTerm.findMany({
      where: { isActive: true, termType },
      select: { id: true, termType: true, canonicalValue: true, displayName: true },
      orderBy: { canonicalValue: "asc" },
    }),
    prisma.dictionaryAlias.findMany({
      where: { isActive: true, termType },
      select: { termId: true, aliasValue: true },
      orderBy: { aliasValue: "asc" },
    }),
  ]);
  const aliasesByTermId = new Map<string, string[]>();
  for (const alias of aliases) {
    const key = stringifyId(alias.termId);
    aliasesByTermId.set(key, [...(aliasesByTermId.get(key) ?? []), alias.aliasValue]);
  }
  return terms.map((term) => ({
    termId: stringifyId(term.id),
    termType: term.termType,
    canonicalValue: term.canonicalValue,
    displayName: term.displayName,
    aliases: aliasesByTermId.get(stringifyId(term.id)) ?? [],
  }));
}

async function loadArchiveTermOccurrences(terms: string[]): Promise<ArchiveTermOccurrence[]> {
  const patterns = dedupe(terms.filter(Boolean)).map((term) => `%${escapeLikePattern(term)}%`);
  if (patterns.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{
    archive_item_id: bigint;
    archive_id: bigint;
    item_name: string | null;
    searchable_text: string | null;
    matched_value: string;
  }>>(Prisma.sql`
    select
      item.id as archive_item_id,
      item.archive_id,
      item.item_name,
      item.searchable_text,
      matched.value as matched_value
    from agent.contract_archive_items item
    join unnest(${patterns}::text[]) matched(value) on (
      item.item_name ilike matched.value escape '\\'
      or item.searchable_text ilike matched.value escape '\\'
    )
    order by item.updated_at desc, item.id desc
    limit 200
  `);
  return rows.map((row) => ({
    archiveItemId: stringifyId(row.archive_item_id),
    archiveId: stringifyId(row.archive_id),
    itemName: row.item_name,
    matchedValue: row.matched_value.replace(/^%|%$/g, ""),
    source: row.item_name?.includes(row.matched_value.replace(/^%|%$/g, "")) ? "itemName" : "searchableText",
  }));
}

function summarizeSearchResult(result: ArchiveItemSearchResult, index: number): CandidatePoolResultSummary {
  return {
    rank: index + 1,
    archiveItemId: result.archiveItemId,
    archiveId: result.archiveId,
    itemName: result.itemName,
    productType: result.productType,
    similarityScore: result.similarityScore,
    matchReasons: result.matchReasons,
    evidence: result.evidence,
  };
}

function isPreciseResult(item: CandidatePoolResultSummary): boolean {
  const reasons = item.matchReasons.join("\n");
  return (
    reasons.includes("1380")
    && reasons.includes("PVC")
    && reasons.includes("波浪板")
    && reasons.includes("差值 0mm")
  );
}

function aliasGapConfidence(params: {
  alreadyCovered: boolean;
  similarity: number;
  queryOccurrenceCount: number;
  canonicalOccurrenceCount: number;
}) {
  if (params.alreadyCovered) return 1;
  let confidence = params.similarity * 0.75;
  if (params.queryOccurrenceCount > 0) confidence += 0.08;
  if (params.canonicalOccurrenceCount > 0) confidence += 0.08;
  if (params.queryOccurrenceCount > 0 && params.canonicalOccurrenceCount > 0) confidence += 0.05;
  return round(Math.min(confidence, 0.95));
}

function aliasTermSimilarity(left: string, right: string): number {
  const leftNorm = normalizeAlias(left);
  const rightNorm = normalizeAlias(right);
  if (!leftNorm || !rightNorm) return 0;
  if (leftNorm === rightNorm) return 1;
  if (leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) return 0.92;
  const leftChars = new Set([...leftNorm]);
  const rightChars = new Set([...rightNorm]);
  const intersection = [...leftChars].filter((char) => rightChars.has(char)).length;
  const union = new Set([...leftChars, ...rightChars]).size;
  return union === 0 ? 0 : round(intersection / union);
}

function sharedCjkCharacters(left: string, right: string): string[] {
  const rightChars = new Set([...right].filter((char) => /[\u4e00-\u9fff]/u.test(char)));
  return dedupe([...left].filter((char) => rightChars.has(char) && /[\u4e00-\u9fff]/u.test(char)));
}

function includesAnyNormalized(value: string, candidates: string[]): boolean {
  const normalized = normalizeAlias(value);
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeAlias(candidate);
    return normalizedCandidate && (normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized));
  });
}

function statusRank(status: AliasGapSuggestion["status"]) {
  return status === "missing_alias" ? 0 : 1;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function stringifyId(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value ?? "");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeAlias(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function defaultArchiveSearchDiagnosticTerms(queryText = DEFAULT_QUERY): string[] {
  const normalized = normalizeArchiveSearchQuery(queryText);
  return dedupe([...DEFAULT_ALIAS_TERMS, ...normalized.normalizedTokens.filter((token) => /[\u4e00-\u9fff]/u.test(token))]);
}
