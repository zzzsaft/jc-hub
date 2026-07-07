import { prisma } from "../../../lib/prisma.js";
import { normalizeArchiveFeatureKey } from "./archiveFeatureKeys.js";

export type SearchPolicyTier = "primary" | "secondary" | "tertiary" | "context" | "excluded";
export type SearchPolicySpace = "similarity" | "keyword" | "quote" | "context";

export type TermTypeSearchPolicy = {
  termType: string;
  tier: SearchPolicyTier;
  spaces: SearchPolicySpace[];
  source: "metadata" | "default";
};

export type TermTypeSearchPolicyWarning = {
  termType: string;
  type: "invalid_tier" | "invalid_space";
  message: string;
  value?: unknown;
};

export type BuiltTermTypeSearchPolicy = {
  byTermType: Record<string, TermTypeSearchPolicy>;
  byTier: Record<SearchPolicyTier, string[]>;
  bySpace: Record<SearchPolicySpace, string[]>;
  warnings: TermTypeSearchPolicyWarning[];
};

export type SearchPolicyDiagnosticsGroup = {
  count: number;
  termTypes: string[];
};

export type SearchPolicyDiagnosticsLegacyConfig = {
  similarityKeys: string[];
  keywordTextFields: string[];
  searchableTextFields: string[];
};

export type SearchPolicyDiagnosticsDiff = {
  legacySimilarityOnly: string[];
  policySimilarityOnly: string[];
  matchedSimilarity: string[];
  matchedDirect: string[];
  matchedViaFeatureKeyBridge: Array<{ featureKey: string; legacyKeys: string[]; policyTermTypes: string[] }>;
  legacyOnlyUnmapped: string[];
  policyOnlyUnmapped: string[];
  legacyKeywordOnly: string[];
  policyKeywordOnly: string[];
  matchedKeyword: string[];
  excludedButLegacySearchable: string[];
  policySearchableButNotLegacy: string[];
};

export type SearchPolicyDiagnostics = {
  activeTermTypeCount: number;
  configuredPolicyCount: number;
  defaultPolicyCount: number;
  warningCount: number;
  byTier: Record<SearchPolicyTier, SearchPolicyDiagnosticsGroup>;
  bySpace: Record<SearchPolicySpace, SearchPolicyDiagnosticsGroup>;
  warnings: TermTypeSearchPolicyWarning[];
  diff: SearchPolicyDiagnosticsDiff;
};

export type TermTypeSearchPolicyRow = {
  termType?: string | null;
  term_type?: string | null;
  metadata?: unknown;
  isActive?: boolean | null;
  is_active?: boolean | null;
};

const SEARCH_POLICY_TIERS = new Set<SearchPolicyTier>(["primary", "secondary", "tertiary", "context", "excluded"]);
const SEARCH_POLICY_SPACES = new Set<SearchPolicySpace>(["similarity", "keyword", "quote", "context"]);

const DEFAULT_SIMILARITY_TERM_TYPES = new Set([
  "product_type",
  "application",
  "plastic_material",
  "effective_width_mm",
  "die_width_mm",
  "thickness_mm",
  "layer_count",
  "heating_zone_count",
  "lip_adjustment_method",
  "deckle_type",
]);

const DEFAULT_KEYWORD_CONTEXT_TERM_TYPES = new Set([
  "application",
  "plastic_material",
  "lip_adjustment_method",
  "deckle_type",
  "model",
  "filter_model",
  "metering_pump_model",
  "note",
  "remarks",
]);

const EMPTY_BY_TIER: Record<SearchPolicyTier, string[]> = {
  primary: [],
  secondary: [],
  tertiary: [],
  context: [],
  excluded: [],
};

const EMPTY_BY_SPACE: Record<SearchPolicySpace, string[]> = {
  similarity: [],
  keyword: [],
  quote: [],
  context: [],
};

export function buildTermTypeSearchPolicy(rows: TermTypeSearchPolicyRow[]): BuiltTermTypeSearchPolicy {
  const byTermType: Record<string, TermTypeSearchPolicy> = {};
  const byTier = cloneGroup(EMPTY_BY_TIER);
  const bySpace = cloneGroup(EMPTY_BY_SPACE);
  const warnings: TermTypeSearchPolicyWarning[] = [];
  const activeRowsByTermType = new Map<string, TermTypeSearchPolicyRow>();

  for (const row of rows) {
    const active = row.isActive ?? row.is_active ?? true;
    const termType = String(row.termType ?? row.term_type ?? "").trim();
    if (!active || !termType) continue;
    activeRowsByTermType.set(termType, row);
  }

  for (const termType of [...activeRowsByTermType.keys()].sort()) {
    const row = activeRowsByTermType.get(termType);
    if (!row) continue;
    const policy = normalizeTermTypePolicy(termType, row.metadata, warnings);
    byTermType[termType] = policy;
    byTier[policy.tier].push(termType);
    for (const space of policy.spaces) bySpace[space].push(termType);
  }

  sortGroups(byTier);
  sortGroups(bySpace);
  return { byTermType, byTier, bySpace, warnings };
}

export async function loadTermTypeSearchPolicy(): Promise<BuiltTermTypeSearchPolicy> {
  const rows = await (prisma.dictionaryTermType as any).findMany({
    where: { isActive: true },
    select: { termType: true, metadata: true, isActive: true },
    orderBy: { termType: "asc" },
  });
  return buildTermTypeSearchPolicy(rows);
}

export function buildSearchPolicyDiagnostics(
  policy: BuiltTermTypeSearchPolicy,
  legacyConfig: SearchPolicyDiagnosticsLegacyConfig,
): SearchPolicyDiagnostics {
  const policies = Object.values(policy.byTermType);
  const legacySimilarity = uniqueSorted(legacyConfig.similarityKeys);
  const policySimilarity = uniqueSorted(policy.bySpace.similarity);
  const bridgedSimilarityDiff = buildBridgedSimilarityDiff(legacySimilarity, policySimilarity);
  const legacyKeyword = uniqueSorted(legacyConfig.keywordTextFields);
  const policyKeyword = uniqueSorted(policy.bySpace.keyword);
  const legacySearchable = uniqueSorted([
    ...legacyConfig.similarityKeys,
    ...legacyConfig.keywordTextFields,
    ...legacyConfig.searchableTextFields,
  ]);
  const policySearchable = uniqueSorted(policies
    .filter((termPolicy) => termPolicy.tier !== "excluded" && termPolicy.spaces.some((space) => SEARCH_POLICY_SPACES.has(space)))
    .map((termPolicy) => termPolicy.termType));

  return {
    activeTermTypeCount: policies.length,
    configuredPolicyCount: policies.filter((termPolicy) => termPolicy.source === "metadata").length,
    defaultPolicyCount: policies.filter((termPolicy) => termPolicy.source === "default").length,
    warningCount: policy.warnings.length,
    byTier: groupedDiagnostics(policy.byTier),
    bySpace: groupedDiagnostics(policy.bySpace),
    warnings: [...policy.warnings],
    diff: {
      legacySimilarityOnly: bridgedSimilarityDiff.legacyOnlyUnmapped,
      policySimilarityOnly: bridgedSimilarityDiff.policyOnlyUnmapped,
      matchedSimilarity: bridgedSimilarityDiff.matchedDirect,
      matchedDirect: bridgedSimilarityDiff.matchedDirect,
      matchedViaFeatureKeyBridge: bridgedSimilarityDiff.matchedViaFeatureKeyBridge,
      legacyOnlyUnmapped: bridgedSimilarityDiff.legacyOnlyUnmapped,
      policyOnlyUnmapped: bridgedSimilarityDiff.policyOnlyUnmapped,
      legacyKeywordOnly: setDifference(legacyKeyword, policyKeyword),
      policyKeywordOnly: setDifference(policyKeyword, legacyKeyword),
      matchedKeyword: setIntersection(legacyKeyword, policyKeyword),
      excludedButLegacySearchable: setIntersection(uniqueSorted(policy.byTier.excluded), legacySearchable),
      policySearchableButNotLegacy: setDifference(policySearchable, legacySearchable),
    },
  };
}

function buildBridgedSimilarityDiff(legacySimilarity: string[], policySimilarity: string[]) {
  const matchedDirect = setIntersection(legacySimilarity, policySimilarity);
  const directlyMatched = new Set(matchedDirect);
  const legacyByFeatureKey = groupByArchiveFeatureKey(legacySimilarity.filter((key) => !directlyMatched.has(key)));
  const policyByFeatureKey = groupByArchiveFeatureKey(policySimilarity.filter((termType) => !directlyMatched.has(termType)));
  const matchedViaFeatureKeyBridge = uniqueSorted([
    ...Object.keys(legacyByFeatureKey),
    ...Object.keys(policyByFeatureKey),
  ])
    .filter((featureKey) => (legacyByFeatureKey[featureKey]?.length ?? 0) > 0 && (policyByFeatureKey[featureKey]?.length ?? 0) > 0)
    .map((featureKey) => ({
      featureKey,
      legacyKeys: legacyByFeatureKey[featureKey],
      policyTermTypes: policyByFeatureKey[featureKey],
    }));
  const bridgedLegacy = new Set(matchedViaFeatureKeyBridge.flatMap((match) => match.legacyKeys));
  const bridgedPolicy = new Set(matchedViaFeatureKeyBridge.flatMap((match) => match.policyTermTypes));

  return {
    matchedDirect,
    matchedViaFeatureKeyBridge,
    legacyOnlyUnmapped: legacySimilarity.filter((key) => !directlyMatched.has(key) && !bridgedLegacy.has(key)),
    policyOnlyUnmapped: policySimilarity.filter((termType) => !directlyMatched.has(termType) && !bridgedPolicy.has(termType)),
  };
}

function groupByArchiveFeatureKey(values: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const value of values) {
    const featureKey = normalizeArchiveFeatureKey(value) ?? value;
    grouped[featureKey] = [...(grouped[featureKey] ?? []), value];
  }
  sortGroups(grouped);
  return grouped;
}

function normalizeTermTypePolicy(
  termType: string,
  metadataValue: unknown,
  warnings: TermTypeSearchPolicyWarning[],
): TermTypeSearchPolicy {
  const metadata = objectRecord(metadataValue);
  const searchPolicy = objectRecord(metadata.searchPolicy);
  const hasMetadataPolicy = Object.keys(searchPolicy).length > 0;
  const defaultPolicy = defaultTermTypePolicy(termType);
  const tier = normalizeTier(termType, searchPolicy.tier, defaultPolicy.tier, warnings);
  const spaces = normalizeSpaces(termType, searchPolicy.spaces, tier, defaultPolicy.spaces, warnings);

  return {
    termType,
    tier,
    spaces,
    source: hasMetadataPolicy ? "metadata" : "default",
  };
}

function defaultTermTypePolicy(termType: string): Pick<TermTypeSearchPolicy, "tier" | "spaces"> {
  const spaces = new Set<SearchPolicySpace>(["keyword", "context"]);
  if (DEFAULT_SIMILARITY_TERM_TYPES.has(termType)) spaces.add("similarity");
  if (DEFAULT_KEYWORD_CONTEXT_TERM_TYPES.has(termType) || DEFAULT_SIMILARITY_TERM_TYPES.has(termType)) spaces.add("quote");
  return {
    tier: DEFAULT_SIMILARITY_TERM_TYPES.has(termType) ? "secondary" : "tertiary",
    spaces: [...spaces],
  };
}

function normalizeTier(
  termType: string,
  value: unknown,
  fallback: SearchPolicyTier,
  warnings: TermTypeSearchPolicyWarning[],
): SearchPolicyTier {
  if (value === undefined || value === null || value === "") return fallback;
  const tier = String(value).trim();
  if (SEARCH_POLICY_TIERS.has(tier as SearchPolicyTier)) return tier as SearchPolicyTier;
  warnings.push({
    termType,
    type: "invalid_tier",
    message: `Invalid search policy tier for ${termType}; using ${fallback}`,
    value,
  });
  return fallback;
}

function normalizeSpaces(
  termType: string,
  value: unknown,
  tier: SearchPolicyTier,
  fallback: SearchPolicySpace[],
  warnings: TermTypeSearchPolicyWarning[],
): SearchPolicySpace[] {
  if (tier === "excluded" && value === undefined) return [];
  if (value === undefined || value === null) return [...fallback];
  const rawSpaces = Array.isArray(value) ? value : [value];
  const spaces: SearchPolicySpace[] = [];
  for (const rawSpace of rawSpaces) {
    const space = String(rawSpace ?? "").trim();
    if (SEARCH_POLICY_SPACES.has(space as SearchPolicySpace)) {
      if (!spaces.includes(space as SearchPolicySpace)) spaces.push(space as SearchPolicySpace);
      continue;
    }
    warnings.push({
      termType,
      type: "invalid_space",
      message: `Invalid search policy space for ${termType}; ignoring ${space || "<empty>"}`,
      value: rawSpace,
    });
  }
  return spaces;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function cloneGroup<T extends string>(group: Record<T, string[]>): Record<T, string[]> {
  return Object.fromEntries(Object.keys(group).map((key) => [key, []])) as unknown as Record<T, string[]>;
}

function sortGroups<T extends string>(group: Record<T, string[]>) {
  for (const key of Object.keys(group) as T[]) group[key].sort();
}

function groupedDiagnostics<T extends string>(group: Record<T, string[]>): Record<T, SearchPolicyDiagnosticsGroup> {
  return Object.fromEntries(
    Object.entries(group).map(([key, termTypes]) => {
      const sortedTermTypes = uniqueSorted(termTypes as string[]);
      return [key, { count: sortedTermTypes.length, termTypes: sortedTermTypes }];
    }),
  ) as Record<T, SearchPolicyDiagnosticsGroup>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function setDifference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => !rightSet.has(value)));
}

function setIntersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => rightSet.has(value)));
}
