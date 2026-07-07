import { ACTION_OPTIONS, BULK_ACTIONS, PRIORITY_ACTIONS, PRIORITY_RELATIONS, RISK_ORDER, candidateTypeLabels, recommendedActionLabels, relationTypeLabels, riskLabels, routeLabels, statusLabels } from "./constants";
import { crText } from "./locales";
import type { ConceptEvidence, ConceptPatternReview, ConceptResolution, ConceptReviewStatus, ConceptResolverFilters, ConceptResolverRun } from "./types";

export const asArray = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

export const textValue = (value: unknown, fallback = "-") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

export const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);

export const errorText = (error: unknown) =>
  (error as any)?.response?.data?.error ?? (error as any)?.response?.data?.message ?? (error as any)?.message ?? String(error);

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
};

export const formatScore = (value: unknown) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue.toFixed(3);
};

export const enumLabel = (value: unknown, labels: Record<string, string>, fallback = "-") => {
  const raw = textValue(value, "");
  if (!raw) return fallback;
  return labels[raw] ?? raw;
};

export const candidateTypeLabel = (value: unknown) => enumLabel(value, candidateTypeLabels);
export const relationTypeLabel = (value: unknown) => enumLabel(value, relationTypeLabels);
export const recommendedActionLabel = (value: unknown) => enumLabel(value, recommendedActionLabels);
export const routeLabel = (value: unknown) => enumLabel(value, routeLabels);
export const riskLabel = (value: unknown) => enumLabel(value, riskLabels);
export const reviewStatusLabel = (value: unknown) => enumLabel(value, statusLabels);

export const normalizeStatusForApi = (status: ConceptReviewStatus) => {
  if (status === "all") return undefined;
  if (status === "applied") return "applied_to_candidates_pending_manual_review";
  return status;
};

export const normalizeResolution = (resolution: ConceptResolution): ConceptResolution => ({
  ...resolution,
  evidence: resolution.evidence ?? resolution.evidenceJsonb ?? {},
  matchedTargets: asArray(resolution.matchedTargets ?? resolution.matchedTargetsJsonb),
  issues: asArray(resolution.issues ?? resolution.issuesJsonb),
});

export const evidenceOf = (resolution?: ConceptResolution | null): ConceptEvidence =>
  (resolution?.evidence ?? resolution?.evidenceJsonb ?? {}) as ConceptEvidence;

export const sampleText = (resolution?: ConceptResolution | null, field: "field" | "value" = "value") => {
  const sample = asArray(evidenceOf(resolution).sampleOccurrences)[0] as any;
  if (!sample) return "";
  return field === "field"
    ? textValue(sample.rawFieldName ?? sample.rawField ?? sample.fieldName, "")
    : textValue(sample.rawValue ?? sample.normalizedValue, "");
};

export const sourceProductType = (resolution?: ConceptResolution | null) => {
  const sample = asArray(evidenceOf(resolution).sampleOccurrences).find((item: any) => item?.sourceProductType) as any;
  return textValue(sample?.sourceProductType, "");
};

export const patternIdentity = (pattern: ConceptPatternReview) => String(pattern.patternKey);

export const enhancePatterns = (
  patterns: ConceptPatternReview[],
  resolutions: ConceptResolution[],
  run?: ConceptResolverRun | null,
): ConceptPatternReview[] => {
  const byPattern = new Map<string, ConceptResolution[]>();
  resolutions.map(normalizeResolution).forEach((resolution) => {
    const key = String(resolution.patternKey ?? "");
    if (!key) return;
    byPattern.set(key, [...(byPattern.get(key) ?? []), resolution]);
  });
  const runSummaryByPattern = new Map<string, Record<string, unknown>>();
  const stats = run?.stats as any;
  const summaries = asArray(stats?.issueSummary?.patternSummary);
  summaries.forEach((item: any) => {
    const key = String(item?.patternKey ?? "");
    if (key) runSummaryByPattern.set(key, item);
  });

  return patterns.map((pattern) => {
    const related = byPattern.get(String(pattern.patternKey)) ?? [];
    const primary = related[0] ?? null;
    const summary = runSummaryByPattern.get(String(pattern.patternKey)) ?? {};
    return {
      ...pattern,
      route: pattern.route ?? primary?.route ?? textValue(summary.route, ""),
      riskLevel: pattern.riskLevel ?? primary?.riskLevel ?? textValue(summary.riskLevel, ""),
      sampleField: pattern.sampleField || sampleText(primary, "field") || textValue(summary.fieldName, ""),
      sampleValue: pattern.sampleValue || sampleText(primary, "value") || textValue(summary.rawValue, ""),
      sourceProductType: pattern.sourceProductType || sourceProductType(primary) || textValue(summary.sourceProductType, ""),
      primaryResolution: primary,
    };
  });
};

export const resolutionsForPattern = (pattern: ConceptPatternReview | null, resolutions: ConceptResolution[]) => {
  if (!pattern) return [];
  return resolutions.map(normalizeResolution).filter((resolution) => String(resolution.patternKey) === String(pattern.patternKey));
};

export const matchesPatternSearch = (pattern: ConceptPatternReview, query: string) => {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  const resolution = pattern.primaryResolution;
  const haystack = [
    pattern.patternKey,
    pattern.sampleField,
    pattern.sampleValue,
    pattern.sourceProductType,
    pattern.candidateType,
    pattern.relationType,
    pattern.recommendedAction,
    pattern.route,
    pattern.riskLevel,
    resolution?.reason,
    sampleText(resolution, "field"),
    sampleText(resolution, "value"),
    ...asArray(evidenceOf(resolution).sampleOccurrences).flatMap((sample: any) => [
      sample?.rawFieldName,
      sample?.rawField,
      sample?.fieldName,
      sample?.rawValue,
      sample?.normalizedValue,
      sample?.sourceProductType,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(value);
};

export const filterPatterns = (patterns: ConceptPatternReview[], filters: ConceptResolverFilters) =>
  patterns.filter((pattern) => {
    if (filters.route && pattern.route !== filters.route) return false;
    if (filters.relationType && pattern.relationType !== filters.relationType) return false;
    if (filters.recommendedAction && pattern.recommendedAction !== filters.recommendedAction) return false;
    if (filters.candidateType !== "all" && pattern.candidateType !== filters.candidateType) return false;
    if (filters.riskLevel !== "all" && pattern.riskLevel !== filters.riskLevel) return false;
    return matchesPatternSearch(pattern, filters.search);
  });

const sortValue = (pattern: ConceptPatternReview, key: ConceptResolverFilters["sortKey"]) => {
  if (key === "riskLevel") return RISK_ORDER[String(pattern.riskLevel ?? "")] ?? 0;
  if (key === "avgScore") return Number(pattern.avgScore ?? 0);
  if (key === "lastResolvedAt") return pattern.lastResolvedAt ? new Date(pattern.lastResolvedAt).getTime() : 0;
  return Number(pattern.candidateCount ?? 0);
};

export const sortPatterns = (patterns: ConceptPatternReview[], filters: ConceptResolverFilters) =>
  [...patterns].sort((left, right) => {
    if (!filters.sortKey) {
      const priority = Number(PRIORITY_RELATIONS.has(String(right.relationType))) - Number(PRIORITY_RELATIONS.has(String(left.relationType)));
      if (priority) return priority;
    }
    const diff = sortValue(left, filters.sortKey) - sortValue(right, filters.sortKey);
    if (diff !== 0) return filters.sortDir === "asc" ? diff : -diff;
    const risk = (RISK_ORDER[String(right.riskLevel)] ?? 0) - (RISK_ORDER[String(left.riskLevel)] ?? 0);
    if (risk) return risk;
    const relationPriority = Number(PRIORITY_RELATIONS.has(String(right.relationType))) - Number(PRIORITY_RELATIONS.has(String(left.relationType)));
    if (relationPriority) return relationPriority;
    const actionPriority = Number(PRIORITY_ACTIONS.has(String(right.recommendedAction))) - Number(PRIORITY_ACTIONS.has(String(left.recommendedAction)));
    if (actionPriority) return actionPriority;
    return Number(right.candidateCount ?? 0) - Number(left.candidateCount ?? 0);
  });

export const actionLabel = (pattern?: ConceptPatternReview | null) => {
  if (!pattern) return crText.actions.selectPattern;
  const action = String(pattern.recommendedAction ?? "");
  const relation = String(pattern.relationType ?? "");
  const route = String(pattern.route ?? "");
  const type = String(pattern.candidateType ?? "");
  const risk = String(pattern.riskLevel ?? "");
  if (route === "auto_reject_pending") return crText.actions.confirmPendingReject;
  if (type === "term_type") return crText.actions.confirmReviewQueue;
  if (["qualifier_variant", "composite_value", "wrong_scope", "split_component", "value_as_type"].includes(relation)) {
    return crText.actions.confirmReviewQueue;
  }
  if (type === "value" && relation === "exact_alias" && action === "add_alias" && risk === "low") {
    return crText.actions.approveAliasCandidate;
  }
  return ACTION_OPTIONS.find((item) => item.value === action)?.label ?? crText.actions.markReviewed;
};

export const isQueueOnlyAction = (pattern?: ConceptPatternReview | null) => {
  if (!pattern) return true;
  return (
    pattern.candidateType === "term_type" ||
    pattern.route === "auto_reject_pending" ||
    ["qualifier_variant", "composite_value", "wrong_scope", "split_component", "value_as_type"].includes(String(pattern.relationType))
  );
};

export const canBulkApply = (patterns: ConceptPatternReview[]) => {
  if (!patterns.length) return { ok: false, reason: crText.validation.choosePattern };
  const relation = String(patterns[0].relationType ?? "");
  const action = String(patterns[0].recommendedAction ?? "");
  if (!BULK_ACTIONS.has(action)) return { ok: false, reason: crText.validation.unsupportedBulkAction(recommendedActionLabel(action)) };
  const same = patterns.every((pattern) => pattern.relationType === relation && pattern.recommendedAction === action);
  if (!same) return { ok: false, reason: crText.validation.sameRelationActionOnly };
  return { ok: true, reason: "" };
};

export const selectedCandidateCount = (patterns: ConceptPatternReview[]) =>
  patterns.reduce((sum, pattern) => sum + Number(pattern.candidateCount ?? pattern.uniqueCandidateCount ?? 0), 0);

export const riskSummary = (patterns: ConceptPatternReview[]) => {
  const counts = patterns.reduce<Record<string, number>>((acc, pattern) => {
    const key = String(pattern.riskLevel ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([risk, count]) => `${riskLabel(risk)}：${count}`).join(" / ") || "-";
};

export const defaultFilters: ConceptResolverFilters = {
  runId: "8",
  status: "pending",
  route: "",
  relationType: "",
  recommendedAction: "",
  candidateType: "all",
  riskLevel: "all",
  search: "",
  limit: 500,
  page: 1,
  pageSize: 30,
  sortKey: "candidateCount",
  sortDir: "desc",
};

const numberParam = (value: string | null, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
};

export const filtersFromSearch = (searchParams: URLSearchParams): ConceptResolverFilters => ({
  ...defaultFilters,
  runId: searchParams.get("runId") ?? defaultFilters.runId,
  status: (searchParams.get("status") as ConceptResolverFilters["status"]) || defaultFilters.status,
  route: searchParams.get("route") ?? defaultFilters.route,
  relationType: searchParams.get("relationType") ?? defaultFilters.relationType,
  recommendedAction: searchParams.get("recommendedAction") ?? defaultFilters.recommendedAction,
  candidateType: (searchParams.get("candidateType") as ConceptResolverFilters["candidateType"]) || defaultFilters.candidateType,
  riskLevel: (searchParams.get("riskLevel") as ConceptResolverFilters["riskLevel"]) || defaultFilters.riskLevel,
  search: searchParams.get("q") ?? defaultFilters.search,
  limit: numberParam(searchParams.get("limit"), defaultFilters.limit),
  page: numberParam(searchParams.get("page"), defaultFilters.page),
  pageSize: numberParam(searchParams.get("pageSize"), defaultFilters.pageSize),
  sortKey: (searchParams.get("sortKey") as ConceptResolverFilters["sortKey"]) || defaultFilters.sortKey,
  sortDir: (searchParams.get("sortDir") as ConceptResolverFilters["sortDir"]) || defaultFilters.sortDir,
});

export const writeFiltersToSearch = (filters: ConceptResolverFilters) => {
  const next = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const queryKey = key === "search" ? "q" : key;
    const defaultValue = (defaultFilters as any)[key];
    if (value === "" || value === defaultValue) return;
    next.set(queryKey, String(value));
  });
  return next;
};

export async function copyPatternKey(value: string) {
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
