import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import {
  getTermTypesForArchiveFeatureKey,
  normalizeArchiveFeatureKey,
} from "./archiveFeatureKeys.js";

export type ArchiveFeatureCoverageRow = {
  id: string | number | bigint;
  archiveId?: string | number | bigint | null;
  itemIndex?: number | null;
  itemName?: string | null;
  productTypeHint?: string | null;
  fieldsJson?: unknown;
  confirmedFieldsJson?: unknown;
  similarityFeaturesJson?: unknown;
  searchableText?: string | null;
  archiveJson?: unknown;
};

export type ArchiveFeatureGap =
  | "similarity_features"
  | "confirmed_similarity_features"
  | "effective_width_mm_or_die_width_mm"
  | "effective_width_mm"
  | "die_width_mm"
  | "thickness_mm"
  | "product_type"
  | "plastic_material"
  | "application"
  | "lip_adjustment_method"
  | "deckle_type"
  | "plastic_material_or_application";

export type ArchiveFeatureBackfillProposal = {
  archiveItemId: string;
  missingFeatureKey: string;
  proposedValue: unknown;
  sourceTermType: string;
  sourceFieldPath: string;
  confidence: number;
  evidence: unknown;
};

export type ArchiveApplicationRecoveryValue = {
  canonicalValue: string;
  matchValues: string[];
};

export type ArchiveFeatureBackfillPlanningContext = {
  applicationValues?: ArchiveApplicationRecoveryValue[];
  structureValues?: Record<string, ArchiveApplicationRecoveryValue[]>;
};

export type ArchiveFeatureCoverageAudit = {
  totalArchives: number;
  totalArchiveItems: number;
  archivesWithSimilarityFeatures: number;
  archivesMissingSimilarityFeatures: number;
  archivesMissingConfirmedSimilarityFeatures: number;
  missing: Record<ArchiveFeatureGap, number>;
  recoverable: Record<ArchiveFeatureGap, number>;
  topMissingTermTypes: Array<{ termType: string; count: number }>;
  samples: Record<ArchiveFeatureGap, Array<Record<string, unknown>>>;
  dryRunBackfill: {
    possibleUpdateCount: number;
    proposals: ArchiveFeatureBackfillProposal[];
  };
};

const AUDITED_FEATURE_KEYS = [
  "product_type",
  "effective_width_mm",
  "die_width_mm",
  "thickness_mm",
  "plastic_material",
  "application",
  "lip_adjustment_method",
  "deckle_type",
];
const SAMPLE_LIMIT = 5;

export function buildArchiveFeatureCoverageAudit(params: {
  rows: ArchiveFeatureCoverageRow[];
  totalArchives?: number;
  proposalSampleLimit?: number;
  planningContext?: ArchiveFeatureBackfillPlanningContext;
}): ArchiveFeatureCoverageAudit {
  const rows = params.rows;
  const classified = rows.map(classifyArchiveFeatureCoverageRow);
  const proposals = planArchiveFeatureBackfill(rows, params.planningContext);
  const gapKeys = [
    "similarity_features",
    "confirmed_similarity_features",
    "effective_width_mm_or_die_width_mm",
    "effective_width_mm",
    "die_width_mm",
    "thickness_mm",
    "product_type",
    "plastic_material",
    "application",
    "lip_adjustment_method",
    "deckle_type",
    "plastic_material_or_application",
  ] as ArchiveFeatureGap[];
  const missing = Object.fromEntries(gapKeys.map((gap) => [gap, 0])) as Record<ArchiveFeatureGap, number>;
  const recoverable = Object.fromEntries(gapKeys.map((gap) => [gap, 0])) as Record<ArchiveFeatureGap, number>;
  const samples = Object.fromEntries(gapKeys.map((gap) => [gap, [] as Array<Record<string, unknown>>])) as Record<ArchiveFeatureGap, Array<Record<string, unknown>>>;
  const missingTermTypeCounts = buildMissingTermTypeCounts(rows);
  const proposalsByItemAndKey = new Set(proposals.map((proposal) => `${proposal.archiveItemId}:${proposal.missingFeatureKey}`));

  for (const item of classified) {
    for (const gap of item.gaps) {
      missing[gap] += 1;
      if (gapRecoverable(item, gap, proposalsByItemAndKey)) recoverable[gap] += 1;
      if (samples[gap].length < SAMPLE_LIMIT) {
        samples[gap].push({
          archiveItemId: item.archiveItemId,
          archiveId: item.archiveId,
          itemIndex: item.itemIndex,
          itemName: item.itemName,
          missing: gap,
          recoverable: gapRecoverable(item, gap, proposalsByItemAndKey),
        });
      }
    }
  }

  return {
    totalArchives: params.totalArchives ?? new Set(rows.map((row) => stringifyId(row.archiveId)).filter(Boolean)).size,
    totalArchiveItems: rows.length,
    archivesWithSimilarityFeatures: classified.filter((item) => !item.gaps.includes("similarity_features")).length,
    archivesMissingSimilarityFeatures: missing.similarity_features,
    archivesMissingConfirmedSimilarityFeatures: missing.confirmed_similarity_features,
    missing,
    recoverable,
    topMissingTermTypes: [...missingTermTypeCounts.entries()]
      .map(([termType, count]) => ({ termType, count }))
      .sort((left, right) => right.count - left.count || left.termType.localeCompare(right.termType))
      .slice(0, 20),
    samples,
    dryRunBackfill: {
      possibleUpdateCount: proposals.length,
      proposals: proposals.slice(0, params.proposalSampleLimit ?? 50),
    },
  };
}

export function classifyArchiveFeatureCoverageRow(row: ArchiveFeatureCoverageRow) {
  const features = objectRecord(row.similarityFeaturesJson);
  const gaps: ArchiveFeatureGap[] = [];
  const hasSimilarityFeatures = Object.keys(features).some((key) => hasValue(features[key]));
  const confirmedSimilarityCount = Object.entries(features)
    .filter(([key, value]) => key !== "product_type" && hasValue(value))
    .length;
  const hasEffectiveWidth = hasValue(features.effective_width_mm);
  const hasDieWidth = hasValue(features.die_width_mm);
  const hasPlasticMaterial = hasValue(features.plastic_material);
  const hasApplication = hasValue(features.application);

  if (!hasSimilarityFeatures) gaps.push("similarity_features");
  if (confirmedSimilarityCount < 2) gaps.push("confirmed_similarity_features");
  if (!hasEffectiveWidth && !hasDieWidth) gaps.push("effective_width_mm_or_die_width_mm");
  if (!hasEffectiveWidth) gaps.push("effective_width_mm");
  if (!hasDieWidth) gaps.push("die_width_mm");
  if (!hasValue(features.thickness_mm)) gaps.push("thickness_mm");
  if (!hasValue(features.product_type)) gaps.push("product_type");
  if (!hasPlasticMaterial) gaps.push("plastic_material");
  if (!hasApplication) gaps.push("application");
  if (!hasValue(features.lip_adjustment_method)) gaps.push("lip_adjustment_method");
  if (!hasValue(features.deckle_type)) gaps.push("deckle_type");
  if (!hasPlasticMaterial && !hasApplication) gaps.push("plastic_material_or_application");

  return {
    archiveItemId: stringifyId(row.id),
    archiveId: stringifyId(row.archiveId),
    itemIndex: row.itemIndex ?? null,
    itemName: row.itemName ?? null,
    gaps,
  };
}

export function planArchiveFeatureBackfill(
  rows: ArchiveFeatureCoverageRow[],
  context: ArchiveFeatureBackfillPlanningContext = {},
): ArchiveFeatureBackfillProposal[] {
  const proposals: ArchiveFeatureBackfillProposal[] = [];
  for (const row of rows) {
    const features = objectRecord(row.similarityFeaturesJson);
    for (const featureKey of AUDITED_FEATURE_KEYS) {
      if (hasValue(features[featureKey])) continue;
      const candidate = findRecoverableFeatureValue(row, featureKey, context);
      if (!candidate) continue;
      proposals.push({
        archiveItemId: stringifyId(row.id),
        missingFeatureKey: featureKey,
        proposedValue: candidate.value,
        sourceTermType: candidate.sourceTermType,
        sourceFieldPath: candidate.sourceFieldPath,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
      });
    }
  }
  return proposals.sort((left, right) => (
    Number(left.archiveItemId) - Number(right.archiveItemId)
    || left.missingFeatureKey.localeCompare(right.missingFeatureKey)
  ));
}

export async function auditArchiveFeatureCoverage(params: {
  limit?: number;
  proposalSampleLimit?: number;
} = {}): Promise<ArchiveFeatureCoverageAudit> {
  const [totalArchives, rows, planningContext] = await Promise.all([
    prisma.contractArchive.count(),
    loadArchiveFeatureCoverageRows(params.limit),
    loadArchiveFeatureBackfillPlanningContext(),
  ]);
  return buildArchiveFeatureCoverageAudit({
    rows,
    totalArchives,
    proposalSampleLimit: params.proposalSampleLimit,
    planningContext,
  });
}

export async function planArchiveFeatureBackfillFromDatabase(params: {
  limit?: number;
} = {}): Promise<ArchiveFeatureBackfillProposal[]> {
  const [rows, planningContext] = await Promise.all([
    loadArchiveFeatureCoverageRows(params.limit),
    loadArchiveFeatureBackfillPlanningContext(),
  ]);
  return planArchiveFeatureBackfill(rows, planningContext);
}

export async function applyArchiveFeatureBackfill(proposals: ArchiveFeatureBackfillProposal[]) {
  let updatedCount = 0;
  for (const proposal of proposals) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.contractArchiveItem.findUnique({
        where: { id: BigInt(proposal.archiveItemId) },
        select: { similarityFeaturesJson: true, updatedAt: true },
      });
      if (!existing) return;
      const before = objectRecord(existing.similarityFeaturesJson);
      if (hasValue(before[proposal.missingFeatureKey])) return;
      const next = {
        ...before,
        [proposal.missingFeatureKey]: proposal.proposedValue,
      };
      await tx.$executeRaw(Prisma.sql`
        update agent.contract_archive_items
        set similarity_features_json = ${JSON.stringify(next)}::jsonb
        where id = ${BigInt(proposal.archiveItemId)}
      `);
      updatedCount += 1;
    });
  }
  return { updatedCount };
}

async function loadArchiveFeatureCoverageRows(limit?: number): Promise<ArchiveFeatureCoverageRow[]> {
  const items = await prisma.contractArchiveItem.findMany({
    take: limit,
    orderBy: { id: "asc" },
    select: {
      id: true,
      archiveId: true,
      itemIndex: true,
      itemName: true,
      productTypeHint: true,
      fieldsJson: true,
      confirmedFieldsJson: true,
      similarityFeaturesJson: true,
      searchableText: true,
    },
  });
  const archiveIds = [...new Set(items.map((item) => item.archiveId).filter(Boolean))];
  const archives = archiveIds.length > 0
    ? await prisma.contractArchive.findMany({
        where: { id: { in: archiveIds } },
        select: { id: true, archiveJson: true },
      })
    : [];
  const archiveJsonById = new Map(archives.map((archive) => [stringifyId(archive.id), archive.archiveJson]));
  return items.map((item) => ({
    ...item,
    archiveJson: archiveJsonById.get(stringifyId(item.archiveId)),
  }));
}

async function loadArchiveFeatureBackfillPlanningContext(): Promise<ArchiveFeatureBackfillPlanningContext> {
  const structureTermTypes = ["application", "lip_adjustment_method", "deckle_type"];
  const [terms, aliases] = await Promise.all([
    prisma.dictionaryTerm.findMany({
      where: { termType: { in: structureTermTypes }, isActive: true },
      select: { id: true, termType: true, canonicalValue: true, displayName: true },
    }),
    prisma.dictionaryAlias.findMany({
      where: { termType: { in: structureTermTypes }, isActive: true },
      select: { termId: true, termType: true, aliasValue: true },
    }),
  ]);
  const aliasesByTermId = new Map<string, string[]>();
  for (const alias of aliases) {
    const key = stringifyId(alias.termId);
    aliasesByTermId.set(key, [...(aliasesByTermId.get(key) ?? []), alias.aliasValue]);
  }
  const valuesByTermType = Object.fromEntries(structureTermTypes.map((termType) => [termType, [] as ArchiveApplicationRecoveryValue[]]));
  for (const term of terms) {
    valuesByTermType[term.termType]?.push({
      canonicalValue: term.canonicalValue,
      matchValues: uniqueStrings([
        term.canonicalValue,
        term.displayName,
        ...(aliasesByTermId.get(stringifyId(term.id)) ?? []),
      ]),
    });
  }
  for (const [termType, values] of Object.entries(valuesByTermType)) {
    valuesByTermType[termType] = values.filter((term) => term.canonicalValue && term.matchValues.length > 0);
  }
  return {
    applicationValues: valuesByTermType.application,
    structureValues: valuesByTermType,
  };
}

function findRecoverableFeatureValue(
  row: ArchiveFeatureCoverageRow,
  featureKey: string,
  context: ArchiveFeatureBackfillPlanningContext,
) {
  const confirmed = objectRecord(row.confirmedFieldsJson);
  const confirmedValue = normalizeFeatureValue(featureKey, confirmed[featureKey]);
  if (hasValue(confirmedValue)) {
    return {
      value: confirmedValue,
      sourceTermType: featureKey,
      sourceFieldPath: "confirmedFieldsJson." + featureKey,
      confidence: 0.9,
      evidence: confirmed[featureKey],
    };
  }
  if (featureKey === "product_type" && validProductTypeValue(row.productTypeHint)) {
    return {
      value: row.productTypeHint,
      sourceTermType: "product_type",
      sourceFieldPath: "productTypeHint",
      confidence: 0.8,
      evidence: row.productTypeHint,
    };
  }
  if (featureKey === "effective_width_mm") {
    const itemNameWidth = widthFromItemName(row.itemName);
    if (itemNameWidth !== null) {
      return {
        value: itemNameWidth,
        sourceTermType: "item_name_width_mm",
        sourceFieldPath: "itemName",
        confidence: 0.76,
        evidence: row.itemName,
      };
    }
  }
  if (featureKey === "application") {
    const itemNameApplication = applicationFromItemName(row.itemName, context.applicationValues ?? []);
    if (itemNameApplication) {
      return {
        value: itemNameApplication.canonicalValue,
        sourceTermType: "item_name_application",
        sourceFieldPath: "itemName",
        confidence: 0.78,
        evidence: {
          itemName: row.itemName,
          matchedValue: itemNameApplication.matchedValue,
        },
      };
    }
  }
  const fieldsCandidate = findInFields(row.fieldsJson, featureKey, "fieldsJson", 0.75);
  if (fieldsCandidate) return fieldsCandidate;
  if (featureKey === "lip_adjustment_method" || featureKey === "deckle_type") {
    const searchableCandidate = structureValueFromText(
      row.itemName,
      context.structureValues?.[featureKey] ?? [],
      featureKey,
      "itemName",
    ) ?? structureValueFromText(
      (row as any).searchableText,
      context.structureValues?.[featureKey] ?? [],
      featureKey,
      "searchableText",
    );
    if (searchableCandidate) return searchableCandidate;
  }
  return findInArchiveJson(row.archiveJson, row.itemIndex, featureKey);
}

function findInArchiveJson(archiveJson: unknown, itemIndex: number | null | undefined, featureKey: string) {
  const normalized = normalizedArchiveExtraction(archiveJson);
  const items = Array.isArray(normalized.items) ? normalized.items : [];
  const target = items.find((value, offset) => {
    const item = objectRecord(value);
    const currentIndex = Number(item.item_index ?? item.itemIndex ?? offset);
    return Number(currentIndex) === Number(itemIndex);
  }) ?? items[0];
  if (!target) return null;
  return findInFields(objectRecord(target).fields, featureKey, "archiveJson.normalizedExtractionJson.items.fields", 0.7);
}

function findInFields(fields: unknown, featureKey: string, sourcePath: string, confidence: number) {
  if (Array.isArray(fields)) {
    for (const [index, rawField] of fields.entries()) {
      const field = objectRecord(rawField);
      const dictionary = objectRecord(field.dictionary);
      if (dictionary.matched === false) continue;
      const termType = String(objectRecord(field.dictionary).term_type ?? field.termType ?? field.term_type ?? field.field_name ?? "").trim();
      if (normalizeArchiveFeatureKey(termType) !== featureKey) continue;
      const rawValue = fieldValue(field);
      const value = normalizeFeatureValue(featureKey, rawValue);
      if (!hasValue(value)) continue;
      return {
        value,
        sourceTermType: termType || featureKey,
        sourceFieldPath: `${sourcePath}[${index}]`,
        confidence,
        evidence: rawField,
      };
    }
    return null;
  }
  const record = objectRecord(fields);
  for (const [key, rawValue] of Object.entries(record)) {
    if (normalizeArchiveFeatureKey(key) !== featureKey) continue;
    const value = normalizeFeatureValue(featureKey, rawValue);
    if (!hasValue(value)) continue;
    return {
      value,
      sourceTermType: key,
      sourceFieldPath: `${sourcePath}.${key}`,
      confidence,
      evidence: rawValue,
    };
  }
  return null;
}

function gapRecoverable(
  item: ReturnType<typeof classifyArchiveFeatureCoverageRow>,
  gap: ArchiveFeatureGap,
  proposalsByItemAndKey: Set<string>,
) {
  const keys = gapFeatureKeys(gap);
  if (keys.length === 0) return false;
  return keys.some((key) => proposalsByItemAndKey.has(`${item.archiveItemId}:${key}`));
}

function gapFeatureKeys(gap: ArchiveFeatureGap): string[] {
  if (gap === "similarity_features" || gap === "confirmed_similarity_features") return AUDITED_FEATURE_KEYS;
  if (gap === "effective_width_mm_or_die_width_mm") return ["effective_width_mm", "die_width_mm"];
  if (gap === "plastic_material_or_application") return ["plastic_material", "application"];
  return [gap];
}

function termTypesForGap(gap: ArchiveFeatureGap): string[] {
  return gapFeatureKeys(gap).flatMap(getTermTypesForArchiveFeatureKey);
}

function buildMissingTermTypeCounts(rows: ArchiveFeatureCoverageRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const features = objectRecord(row.similarityFeaturesJson);
    for (const featureKey of AUDITED_FEATURE_KEYS) {
      if (hasValue(features[featureKey])) continue;
      for (const termType of getTermTypesForArchiveFeatureKey(featureKey)) {
        counts.set(termType, (counts.get(termType) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function normalizedArchiveExtraction(archiveJson: unknown): Record<string, any> {
  const root = objectRecord(archiveJson);
  return objectRecord(objectRecord(root.extraction).normalizedExtractionJson ?? root.normalizedExtractionJson ?? root);
}

function normalizeFeatureValue(featureKey: string, value: unknown): unknown {
  if (["effective_width_mm", "die_width_mm", "thickness_mm"].includes(featureKey)) return numericMm(value);
  if (["product_type", "plastic_material", "application", "lip_adjustment_method", "deckle_type"].includes(featureKey)) return textValue(value) ?? value;
  return value;
}

function fieldValue(field: Record<string, any>): unknown {
  const dictionary = objectRecord(field.dictionary);
  if (dictionary.number_unit) return dictionary.number_unit;
  if (Object.prototype.hasOwnProperty.call(dictionary, "canonical_value")) return dictionary.canonical_value;
  if (Array.isArray(dictionary.values) && dictionary.values.length > 0) {
    return dictionary.values.map((value) => objectRecord(value).canonicalValue ?? objectRecord(value).canonical_value ?? objectRecord(value).displayName).filter(Boolean);
  }
  return field.value ?? field.raw_value ?? field.raw_text;
}

function numericMm(value: unknown): number | null {
  const record = objectRecord(value);
  const numeric = numericValue(value);
  if (numeric === null) return null;
  const unit = String(record.unit ?? "mm");
  if (unit === "m") return numeric * 1000;
  if (unit && unit !== "mm") return null;
  return numeric;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const record = objectRecord(value);
  const number = Number(record.value ?? record.min ?? record.max ?? value);
  return Number.isFinite(number) ? number : null;
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(textValue).find((item) => item !== null) ?? null;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = objectRecord(value);
  if (Object.keys(record).length === 0) return null;
  return textValue(record.value ?? record.canonical_value ?? record.display_name ?? record.raw_value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  return true;
}

function validProductTypeValue(value: unknown): boolean {
  const text = textValue(value);
  return Boolean(text && text !== "unknown" && text !== "未知");
}

function widthFromItemName(value: unknown): number | null {
  const text = textValue(value);
  if (!text) return null;
  const match = text.match(/(?:^|[^\d.])(\d{3,5}(?:\.\d+)?)\s*(?:mm|毫米)\b/i);
  if (!match) return null;
  const width = Number(match[1]);
  return Number.isFinite(width) ? width : null;
}

function applicationFromItemName(
  value: unknown,
  applicationValues: ArchiveApplicationRecoveryValue[],
): { canonicalValue: string; matchedValue: string } | null {
  const text = textValue(value);
  if (!text) return null;
  const matches = applicationValues
    .flatMap((application) => application.matchValues.map((matchValue) => ({
      canonicalValue: application.canonicalValue,
      matchValue,
    })))
    .filter((application) => safeApplicationItemNameMatch(application.matchValue) && text.includes(application.matchValue))
    .sort((left, right) => right.matchValue.length - left.matchValue.length || left.canonicalValue.localeCompare(right.canonicalValue));
  const best = matches[0];
  return best ? { canonicalValue: best.canonicalValue, matchedValue: best.matchValue } : null;
}

function safeApplicationItemNameMatch(value: string): boolean {
  if (value.length < 3) return false;
  if (["光学级"].includes(value)) return false;
  return /(?:膜|板|瓦|管|片|带|布|纸|线|丝|瓶|杯|盒)$/.test(value);
}

function structureValueFromText(
  value: unknown,
  structureValues: ArchiveApplicationRecoveryValue[],
  featureKey: string,
  sourceFieldPath: string,
) {
  const text = textValue(value);
  if (!text) return null;
  const matches = structureValues
    .flatMap((structure) => structure.matchValues.map((matchValue) => ({
      canonicalValue: structure.canonicalValue,
      matchValue,
    })))
    .filter((structure) => safeStructureTextMatch(structure.matchValue) && text.includes(structure.matchValue))
    .sort((left, right) => right.matchValue.length - left.matchValue.length || left.canonicalValue.localeCompare(right.canonicalValue));
  const best = matches[0];
  if (!best) return null;
  return {
    value: best.canonicalValue,
    sourceTermType: featureKey,
    sourceFieldPath,
    confidence: sourceFieldPath === "itemName" ? 0.72 : 0.68,
    evidence: {
      text: text.slice(0, 240),
      matchedValue: best.matchValue,
    },
  };
}

function safeStructureTextMatch(value: string): boolean {
  const text = value.trim();
  if (text.length < 4) return false;
  if (["其他", "无", "none", "other", "自动", "手动", "可调", "固定"].includes(text.toLowerCase())) return false;
  return true;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = textValue(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function stringifyId(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
