import { prisma } from "../../lib/prisma.js";
import { normalizeAlias } from "./matcher.service.js";
import { stripQualifier } from "./qualifierMatcher.js";

export type SemanticTriageLabel =
  | "qualifier_variant"
  | "qualifier_rematch_found"
  | "qualifier_rematch_miss"
  | "composite_multi_value"
  | "material_classified"
  | "application_classified"
  | "noise"
  | "document_note";

export type SemanticTriageRisk = "high" | "medium" | "low";
export type SemanticTriageGroup = "qualifier" | "composite" | "noise" | "classification";

export type SemanticTriageResult = {
  version: "phase2-v1";
  evaluatedAt: string;
  labels: SemanticTriageLabel[];
  recommendedReviewAction:
    | "review_as_existing_value_variant"
    | "review_composite"
    | "review_material_class"
    | "review_application_class"
    | "reject_as_noise"
    | "reject_or_doc_note"
    | "normal_review";
  confidence: number;
  qualifier?: {
    rawQualifier: string;
    normalizedQualifier: string;
    strippedValue: string;
  };
  rematch?: {
    matched: boolean;
    termType: string;
    canonicalValue?: string;
    termId?: string;
    aliasValue?: string;
    aliasId?: string;
    matchSource?: "term" | "alias";
  };
  composite?: {
    separator: string;
    parts: string[];
  };
  classification?: {
    materialFamily?: string;
    applicationDomain?: string;
    matchedRule: string;
  };
  noise?: {
    type: "placeholder" | "document_info" | "long_note" | "non_config_note";
    matchedSignal: string;
  };
};

export type DictionaryCandidateForTriage = {
  id?: bigint | number | string;
  termType: string;
  rawValue: string;
  evidence?: unknown;
};

export type DictionaryTermForTriage = {
  id: bigint | number | string;
  termType: string;
  canonicalValue: string;
};

export type DictionaryAliasForTriage = {
  id: bigint | number | string;
  termId: bigint | number | string;
  termType: string;
  aliasValue: string;
  normalizedAlias: string;
};

export type SemanticTriageDictionaryContext = {
  terms?: DictionaryTermForTriage[];
  aliases?: DictionaryAliasForTriage[];
  evaluatedAt?: string;
};

const VERSION = "phase2-v1" as const;
const UNIT_RATE_PATTERN = /^(?:kg\/h|g\/10min|ml\/min|m\/min|l\/min|n\/m)$/iu;
const COMPOSITE_SEPARATOR_PATTERN = /(、|，|,|;|；|\||／|\/|\+|(?:和)|(?:与)|(?:及)|(?:或))/u;
const MATERIAL_TERM_TYPE_PATTERN = /(^|_)(material|plastic_material|product_material)(_|$)/iu;
const APPLICATION_TERM_TYPE_PATTERN = /(^|_)(application|usage|use_case)(_|$)/iu;
const DATE_PATTERN = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/u;
const HIGH_RISK_LABELS = new Set<SemanticTriageLabel>(["noise", "document_note", "composite_multi_value"]);
const MEDIUM_RISK_LABELS = new Set<SemanticTriageLabel>([
  "qualifier_variant",
  "qualifier_rematch_found",
  "qualifier_rematch_miss",
]);

const MATERIAL_RULES: Array<{ family: string; pattern: RegExp }> = [
  { family: "pvc", pattern: /PVC|聚氯乙烯/iu },
  { family: "pe", pattern: /(^|[^a-z])PE([^a-z]|$)|聚乙烯/iu },
  { family: "pp", pattern: /(^|[^a-z])PP([^a-z]|$)|聚丙烯/iu },
  { family: "abs", pattern: /ABS/iu },
  { family: "pet", pattern: /PET|聚酯/iu },
  { family: "pc", pattern: /(^|[^a-z])PC([^a-z]|$)|聚碳酸酯/iu },
  { family: "pa", pattern: /(^|[^a-z])PA([^a-z]|$)|尼龙/iu },
  { family: "tpe/tpu", pattern: /TPE|TPU/iu },
  { family: "eva", pattern: /EVA/iu },
];

const APPLICATION_RULES: Array<{ domain: string; pattern: RegExp }> = [
  { domain: "film", pattern: /film|薄?膜/iu },
  { domain: "sheet", pattern: /sheet|片材|板材/iu },
  { domain: "pipe", pattern: /pipe|管材|管道/iu },
  { domain: "profile", pattern: /profile|型材/iu },
  { domain: "coating", pattern: /coating|涂布|涂层/iu },
  { domain: "packaging", pattern: /packaging|包装/iu },
];

export function triageDictionaryCandidate(
  candidate: DictionaryCandidateForTriage,
  context: SemanticTriageDictionaryContext = {},
): SemanticTriageResult {
  const labels: SemanticTriageLabel[] = [];
  const result: SemanticTriageResult = {
    version: VERSION,
    evaluatedAt: context.evaluatedAt ?? new Date().toISOString(),
    labels,
    recommendedReviewAction: "normal_review",
    confidence: 0.5,
  };

  const noise = detectNoiseOrDocumentNote(candidate.rawValue);
  if (noise) {
    labels.push(noise.type === "placeholder" ? "noise" : "document_note");
    result.noise = noise;
  }

  const qualifier = stripQualifier(candidate.rawValue);
  if (qualifier) {
    labels.push("qualifier_variant");
    result.qualifier = qualifier;
    const rematch = findQualifierRematch(candidate.termType, qualifier.strippedValue, context);
    result.rematch = rematch;
    labels.push(rematch.matched ? "qualifier_rematch_found" : "qualifier_rematch_miss");
  }

  const composite = detectCompositeMultiValue(candidate.rawValue);
  if (composite) {
    labels.push("composite_multi_value");
    result.composite = composite;
  }

  const classification = classifyMaterialOrApplication(candidate.termType, candidate.rawValue);
  if (classification?.materialFamily) labels.push("material_classified");
  if (classification?.applicationDomain) labels.push("application_classified");
  if (classification) result.classification = classification;

  result.labels = uniqueLabels(labels);
  result.recommendedReviewAction = recommendAction(result);
  result.confidence = confidenceFor(result);
  return result;
}

export function detectCompositeMultiValue(value: unknown): SemanticTriageResult["composite"] | null {
  const text = String(value ?? "").trim();
  if (!text || UNIT_RATE_PATTERN.test(text.replace(/\s+/g, ""))) return null;
  const match = text.match(COMPOSITE_SEPARATOR_PATTERN);
  if (!match?.[1]) return null;
  const separator = match[1];
  const parts = [
    ...new Set(
      text
        .split(COMPOSITE_SEPARATOR_PATTERN)
        .map((part) => part.trim())
        .filter((part) => part && part !== separator && !COMPOSITE_SEPARATOR_PATTERN.test(part)),
    ),
  ];
  return parts.length > 1 ? { separator, parts } : null;
}

export async function runSemanticTriageForPendingCandidates(params?: {
  candidateIds?: Array<string | number | bigint>;
  limit?: number;
  evaluatedAt?: string;
}) {
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: {
      status: "pending",
      ...(params?.candidateIds?.length ? { id: { in: params.candidateIds.map((id) => BigInt(id)) } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(1000, Math.max(1, params?.limit ?? 500)),
  });
  if (candidates.length === 0) return { scanned: 0, updated: 0, stats: emptySemanticTriageStats() };
  const termTypes = [...new Set(candidates.map((candidate) => candidate.termType))];
  const [terms, aliases] = await Promise.all([
    prisma.dictionaryTerm.findMany({ where: { isActive: true, termType: { in: termTypes } } }),
    prisma.dictionaryAlias.findMany({ where: { isActive: true, termType: { in: termTypes } } }),
  ]);
  let updated = 0;
  const stats = emptySemanticTriageStats();
  for (const candidate of candidates) {
    const semanticTriage = triageDictionaryCandidate(candidate, { terms, aliases, evaluatedAt: params?.evaluatedAt });
    addSemanticTriageStats(stats, semanticTriage);
    const evidence = objectRecord(candidate.evidence);
    await prisma.dictionaryCandidate.update({
      where: { id: candidate.id },
      data: { evidence: { ...evidence, semanticTriage } },
    });
    updated += 1;
  }
  return { scanned: candidates.length, updated, stats };
}

export function getSemanticTriage(value: unknown): SemanticTriageResult | null {
  const evidence = objectRecord(value);
  const semanticTriage = evidence.semanticTriage;
  return semanticTriage && typeof semanticTriage === "object" ? (semanticTriage as SemanticTriageResult) : null;
}

export function summarizeSemanticTriage(value: unknown) {
  const semanticTriage = getSemanticTriage(value);
  if (!semanticTriage) return null;
  return {
    version: semanticTriage.version,
    labels: semanticTriage.labels,
    recommendedReviewAction: semanticTriage.recommendedReviewAction,
    confidence: semanticTriage.confidence,
    qualifier: semanticTriage.qualifier,
    rematch: semanticTriage.rematch,
    composite: semanticTriage.composite,
    classification: semanticTriage.classification,
    noise: semanticTriage.noise,
  };
}

export function semanticTagsFromEvidence(value: unknown): SemanticTriageLabel[] {
  const labels = getSemanticTriage(value)?.labels;
  return Array.isArray(labels)
    ? labels.filter((label): label is SemanticTriageLabel => isSemanticTriageLabel(label))
    : [];
}

export function semanticRiskFromTags(tags: readonly string[]): SemanticTriageRisk {
  if (tags.some((tag) => HIGH_RISK_LABELS.has(tag as SemanticTriageLabel))) return "high";
  if (tags.some((tag) => MEDIUM_RISK_LABELS.has(tag as SemanticTriageLabel))) return "medium";
  return "low";
}

export function semanticGroupMatches(tags: readonly string[], group: string | null | undefined): boolean {
  if (!group) return true;
  if (group === "qualifier") {
    return tags.some((tag) => tag === "qualifier_variant" || tag === "qualifier_rematch_found" || tag === "qualifier_rematch_miss");
  }
  if (group === "composite") return tags.includes("composite_multi_value");
  if (group === "noise") return tags.includes("noise") || tags.includes("document_note");
  if (group === "classification") return tags.includes("material_classified") || tags.includes("application_classified");
  return true;
}

export function semanticTagMatches(tags: readonly string[], tag: string | null | undefined): boolean {
  return !tag || tags.includes(tag);
}

export function semanticRiskMatches(tags: readonly string[], risk: string | null | undefined): boolean {
  return !risk || semanticRiskFromTags(tags) === risk;
}

export function buildGovernancePriority(params: {
  tags: readonly string[];
  occurrenceCount: number;
  confidence?: unknown;
}): number {
  return riskRank(semanticRiskFromTags(params.tags)) * 1_000_000 + Math.max(0, params.occurrenceCount) * 1_000 + confidenceScore(params.confidence);
}

export function emptySemanticTriageStats() {
  return {
    qualifier: 0,
    qualifierRematchFound: 0,
    composite: 0,
    materialApplication: 0,
    noiseDocumentNote: 0,
  };
}

export function addSemanticTriageStats(stats: ReturnType<typeof emptySemanticTriageStats>, semanticTriage: SemanticTriageResult | null) {
  if (!semanticTriage) return stats;
  if (semanticTriage.labels.includes("qualifier_variant")) stats.qualifier += 1;
  if (semanticTriage.labels.includes("qualifier_rematch_found")) stats.qualifierRematchFound += 1;
  if (semanticTriage.labels.includes("composite_multi_value")) stats.composite += 1;
  if (semanticTriage.labels.includes("material_classified") || semanticTriage.labels.includes("application_classified")) {
    stats.materialApplication += 1;
  }
  if (semanticTriage.labels.includes("noise") || semanticTriage.labels.includes("document_note")) stats.noiseDocumentNote += 1;
  return stats;
}

function findQualifierRematch(
  termType: string,
  strippedValue: string,
  context: SemanticTriageDictionaryContext,
): NonNullable<SemanticTriageResult["rematch"]> {
  const normalized = normalizeAlias(strippedValue);
  const term = (context.terms ?? []).find(
    (item) => item.termType === termType && normalizeAlias(item.canonicalValue) === normalized,
  );
  if (term) {
    return {
      matched: true,
      termType,
      canonicalValue: term.canonicalValue,
      termId: String(term.id),
      matchSource: "term",
    };
  }
  const alias = (context.aliases ?? []).find(
    (item) => item.termType === termType && (item.normalizedAlias === normalized || normalizeAlias(item.aliasValue) === normalized),
  );
  if (alias) {
    return {
      matched: true,
      termType,
      aliasValue: alias.aliasValue,
      aliasId: String(alias.id),
      termId: String(alias.termId),
      matchSource: "alias",
    };
  }
  return { matched: false, termType };
}

function classifyMaterialOrApplication(termType: string, rawValue: string): SemanticTriageResult["classification"] | null {
  if (MATERIAL_TERM_TYPE_PATTERN.test(termType)) {
    const rule = MATERIAL_RULES.find((item) => item.pattern.test(rawValue));
    return rule ? { materialFamily: rule.family, matchedRule: `material_family:${rule.family}` } : null;
  }
  if (APPLICATION_TERM_TYPE_PATTERN.test(termType)) {
    const rule = APPLICATION_RULES.find((item) => item.pattern.test(rawValue));
    return rule ? { applicationDomain: rule.domain, matchedRule: `application_domain:${rule.domain}` } : null;
  }
  return null;
}

function detectNoiseOrDocumentNote(rawValue: string): NonNullable<SemanticTriageResult["noise"]> | null {
  const text = String(rawValue ?? "").trim();
  if (!text) return { type: "placeholder", matchedSignal: "empty" };
  if (/^(?:未选|未填写|无|N\/?A|-|—)$/iu.test(text)) return { type: "placeholder", matchedSignal: text };
  if (DATE_PATTERN.test(text)) return { type: "document_info", matchedSignal: "date" };
  const documentSignal = text.match(/客户|合同|订单|图纸|日期|交期|HT-\d+/iu);
  if (documentSignal?.[0]) return { type: "document_info", matchedSignal: documentSignal[0] };
  const noteSignal = text.match(/备注|说明|注意事项/iu);
  if (noteSignal?.[0]) return { type: "non_config_note", matchedSignal: noteSignal[0] };
  if (text.length > 80 || /[。；;，,].*[。；;，,]/u.test(text)) return { type: "long_note", matchedSignal: "long_note" };
  return null;
}

function recommendAction(result: SemanticTriageResult): SemanticTriageResult["recommendedReviewAction"] {
  if (result.labels.includes("noise")) return "reject_as_noise";
  if (result.labels.includes("document_note")) return "reject_or_doc_note";
  if (result.labels.includes("qualifier_rematch_found")) return "review_as_existing_value_variant";
  if (result.labels.includes("composite_multi_value")) return "review_composite";
  if (result.labels.includes("material_classified")) return "review_material_class";
  if (result.labels.includes("application_classified")) return "review_application_class";
  return "normal_review";
}

function confidenceFor(result: SemanticTriageResult): number {
  if (result.labels.includes("noise")) return 0.9;
  if (result.labels.includes("document_note")) return 0.84;
  if (result.labels.includes("qualifier_rematch_found")) return 0.86;
  if (result.labels.includes("composite_multi_value")) return 0.8;
  if (result.labels.includes("material_classified") || result.labels.includes("application_classified")) return 0.74;
  if (result.labels.includes("qualifier_rematch_miss")) return 0.68;
  return 0.5;
}

function uniqueLabels(labels: SemanticTriageLabel[]): SemanticTriageLabel[] {
  return [...new Set(labels)];
}

function isSemanticTriageLabel(value: unknown): value is SemanticTriageLabel {
  return (
    value === "qualifier_variant" ||
    value === "qualifier_rematch_found" ||
    value === "qualifier_rematch_miss" ||
    value === "composite_multi_value" ||
    value === "material_classified" ||
    value === "application_classified" ||
    value === "noise" ||
    value === "document_note"
  );
}

function riskRank(risk: SemanticTriageRisk): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function confidenceScore(value: unknown): number {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(999, Math.round(score * 999)));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
