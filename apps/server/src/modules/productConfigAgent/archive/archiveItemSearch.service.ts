import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { normalizeArchiveSearchQuery } from "./queryNormalizer.js";

export type ArchiveItemSearchParams = {
  queryText: string;
  productType?: string;
  materials?: string[];
  application?: string;
  lipAdjustmentMethod?: string;
  deckleType?: string;
  widthMm?: number;
  limit?: number;
};

export type ArchiveItemSearchResult = {
  archiveItemId: string;
  archiveId: string;
  documentId: string | null;
  itemName: string | null;
  productType: string | null;
  similarityScore: number;
  matchReasons: string[];
  confirmedFields: Record<string, unknown>;
  unresolvedFieldsSummary: Array<{
    fieldName?: string;
    rawValue?: unknown;
    reason?: string;
    candidateType?: string;
  }>;
  agentReadiness: Record<string, unknown>;
  searchableTextSummary: string | null;
  evidence: {
    archiveId: string;
    archiveTitle?: string | null;
    documentId?: string | null;
    fileName?: string | null;
    itemIndex?: number | null;
    sourceProductNumber?: string | null;
  };
};

export type ArchiveItemSearchResponse = {
  source: "archive_item_search";
  supported: true;
  query: {
    queryText: string;
    tokens: string[];
    normalizedMaterials?: string[];
    productType?: string;
    materials?: string[];
    application?: string;
    lipAdjustmentMethod?: string;
    deckleType?: string;
    widthMm?: number;
    limit: number;
  };
  results: ArchiveItemSearchResult[];
  warnings: string[];
  usageRules: {
    confirmedFields: string;
    unresolvedFields: string;
    quoteReadyFalseMeansNoDirectQuote: true;
    noQuoteAgentCall: true;
    noEmbedding: true;
  };
};

type ArchiveItemSearchRow = {
  archive_item_id: bigint | number | string;
  archive_id: bigint | number | string;
  document_id: bigint | number | string | null;
  item_index: number | null;
  item_name: string | null;
  product_type_hint: string | null;
  source_product_number: string | null;
  confirmed_fields_json: unknown;
  unresolved_fields_json: unknown;
  agent_readiness_json: unknown;
  searchable_text: string | null;
  similarity_features_json: unknown;
  archive_title: string | null;
  file_name: string | null;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIN_CANDIDATE_LIMIT = 250;
const CANDIDATE_LIMIT_MULTIPLIER = 25;
const MAX_CANDIDATE_LIMIT = 1000;
const SEARCH_USAGE_RULES = {
  confirmedFields: "confirmedFields can be treated as reliable historical configuration.",
  unresolvedFields: "unresolvedFieldsSummary is reference-only and must not be used as confirmed configuration or quote basis.",
  quoteReadyFalseMeansNoDirectQuote: true,
  noQuoteAgentCall: true,
  noEmbedding: true,
} as const;

export class ArchiveItemSearchService {
  async searchArchiveItems(params: ArchiveItemSearchParams): Promise<ArchiveItemSearchResponse> {
    const queryText = normalizeString(params.queryText) ?? "";
    const inputMaterials = normalizeStringArray(params.materials);
    const normalizedQuery = normalizeArchiveSearchQuery(queryText, inputMaterials);
    const tokens = normalizedQuery.normalizedTokens;
    const normalizedMaterials = normalizedQuery.normalizedMaterials;
    const productType = normalizeString(params.productType);
    const materials = dedupeStrings([...inputMaterials, ...normalizedMaterials]);
    const application = normalizeString(params.application);
    const lipAdjustmentMethod = normalizeString(params.lipAdjustmentMethod);
    const deckleType = normalizeString(params.deckleType);
    const widthMm = finiteNumber(params.widthMm);
    const limit = normalizeLimit(params.limit);

    const responseBase = {
      source: "archive_item_search" as const,
      supported: true as const,
      query: {
        queryText,
        tokens,
        ...(normalizedMaterials.length > 0 ? { normalizedMaterials } : {}),
        ...(productType ? { productType } : {}),
        ...(inputMaterials.length > 0 ? { materials: inputMaterials } : {}),
        ...(application ? { application } : {}),
        ...(lipAdjustmentMethod ? { lipAdjustmentMethod } : {}),
        ...(deckleType ? { deckleType } : {}),
        ...(widthMm !== undefined ? { widthMm } : {}),
        limit,
      },
      usageRules: SEARCH_USAGE_RULES,
    };

    if (
      !queryText
      && tokens.length === 0
      && !productType
      && materials.length === 0
      && !application
      && !lipAdjustmentMethod
      && !deckleType
      && widthMm === undefined
    ) {
      return {
        ...responseBase,
        results: [],
        warnings: ["queryText or at least one structured search hint is required"],
      };
    }

    const fullQueryPattern = queryText ? `%${escapeLikePattern(queryText)}%` : null;
    const tokenPatterns = tokens.map((token) => `%${escapeLikePattern(token)}%`);
    const productTypePattern = productType ? `%${escapeLikePattern(productType)}%` : null;
    const materialPatterns = materials.map((material) => `%${escapeLikePattern(material)}%`);
    const applicationPattern = application ? `%${escapeLikePattern(application)}%` : null;
    const lipAdjustmentPattern = lipAdjustmentMethod ? `%${escapeLikePattern(lipAdjustmentMethod)}%` : null;
    const decklePattern = deckleType ? `%${escapeLikePattern(deckleType)}%` : null;
    const candidateLimit = calculateArchiveItemCandidateLimit(limit);

    const rows = await prisma.$queryRaw<ArchiveItemSearchRow[]>(Prisma.sql`
      select
        item.id as archive_item_id,
        item.archive_id,
        item.document_id,
        item.item_index,
        item.item_name,
        item.product_type_hint,
        item.source_product_number,
        item.confirmed_fields_json,
        item.unresolved_fields_json,
        item.agent_readiness_json,
        item.searchable_text,
        item.similarity_features_json,
        archive.title as archive_title,
        document.file_name
      from agent.contract_archive_items item
      inner join agent.contract_archives archive on archive.id = item.archive_id
      left join agent.documents document on document.id = item.document_id
      where
        (${fullQueryPattern}::text is not null and item.searchable_text ilike ${fullQueryPattern} escape '\\')
        or (cardinality(${tokenPatterns}::text[]) > 0 and exists (
          select 1 from unnest(${tokenPatterns}::text[]) token_pattern
          where item.searchable_text ilike token_pattern escape '\\'
             or item.confirmed_fields_json::text ilike token_pattern escape '\\'
             or item.similarity_features_json::text ilike token_pattern escape '\\'
             or item.item_name ilike token_pattern escape '\\'
             or item.product_type_hint ilike token_pattern escape '\\'
        ))
        or (${productTypePattern}::text is not null and (
          item.product_type_hint ilike ${productTypePattern} escape '\\'
          or item.similarity_features_json->>'product_type' ilike ${productTypePattern} escape '\\'
          or item.confirmed_fields_json->>'product_type' ilike ${productTypePattern} escape '\\'
        ))
        or (cardinality(${materialPatterns}::text[]) > 0 and exists (
          select 1 from unnest(${materialPatterns}::text[]) material_pattern
          where item.similarity_features_json->>'plastic_material' ilike material_pattern escape '\\'
             or item.confirmed_fields_json->>'plastic_material' ilike material_pattern escape '\\'
             or item.similarity_features_json->>'product_material' ilike material_pattern escape '\\'
             or item.confirmed_fields_json->>'product_material' ilike material_pattern escape '\\'
             or item.similarity_features_json::text ilike material_pattern escape '\\'
             or item.confirmed_fields_json::text ilike material_pattern escape '\\'
        ))
        or (${applicationPattern}::text is not null and (
          item.similarity_features_json->>'application' ilike ${applicationPattern} escape '\\'
          or item.confirmed_fields_json->>'application' ilike ${applicationPattern} escape '\\'
        ))
        or (${lipAdjustmentPattern}::text is not null and (
          item.similarity_features_json->>'lip_adjustment_method' ilike ${lipAdjustmentPattern} escape '\\'
          or item.confirmed_fields_json->>'lip_adjustment_method' ilike ${lipAdjustmentPattern} escape '\\'
          or item.similarity_features_json::text ilike ${lipAdjustmentPattern} escape '\\'
          or item.confirmed_fields_json::text ilike ${lipAdjustmentPattern} escape '\\'
        ))
        or (${decklePattern}::text is not null and (
          item.similarity_features_json->>'deckle_type' ilike ${decklePattern} escape '\\'
          or item.confirmed_fields_json->>'deckle_type' ilike ${decklePattern} escape '\\'
          or item.similarity_features_json::text ilike ${decklePattern} escape '\\'
          or item.confirmed_fields_json::text ilike ${decklePattern} escape '\\'
        ))
        or (${widthMm ?? null}::double precision is not null and (
          jsonb_typeof(item.similarity_features_json->'effective_width_mm') = 'number'
          or jsonb_typeof(item.similarity_features_json->'die_width_mm') = 'number'
          or jsonb_typeof(item.confirmed_fields_json->'effective_width_mm') = 'number'
          or jsonb_typeof(item.confirmed_fields_json->'die_width_mm') = 'number'
        ))
      order by
        case when ${fullQueryPattern}::text is not null and item.searchable_text ilike ${fullQueryPattern} escape '\\' then 1 else 0 end desc,
        case when ${productTypePattern}::text is not null and (
          item.product_type_hint ilike ${productTypePattern} escape '\\'
          or item.similarity_features_json->>'product_type' ilike ${productTypePattern} escape '\\'
          or item.confirmed_fields_json->>'product_type' ilike ${productTypePattern} escape '\\'
        ) then 1 else 0 end desc,
        case when cardinality(${materialPatterns}::text[]) > 0 and exists (
          select 1 from unnest(${materialPatterns}::text[]) material_pattern
          where item.similarity_features_json->>'plastic_material' ilike material_pattern escape '\\'
             or item.confirmed_fields_json->>'plastic_material' ilike material_pattern escape '\\'
             or item.similarity_features_json->>'product_material' ilike material_pattern escape '\\'
             or item.confirmed_fields_json->>'product_material' ilike material_pattern escape '\\'
        ) then 1 else 0 end desc,
        case when ${applicationPattern}::text is not null and (
          item.similarity_features_json->>'application' ilike ${applicationPattern} escape '\\'
          or item.confirmed_fields_json->>'application' ilike ${applicationPattern} escape '\\'
        ) then 1 else 0 end desc,
        case when ${widthMm ?? null}::double precision is not null and (
          jsonb_typeof(item.similarity_features_json->'effective_width_mm') = 'number'
          or jsonb_typeof(item.similarity_features_json->'die_width_mm') = 'number'
          or jsonb_typeof(item.confirmed_fields_json->'effective_width_mm') = 'number'
          or jsonb_typeof(item.confirmed_fields_json->'die_width_mm') = 'number'
        ) then 1 else 0 end desc,
        item.id asc
      limit ${candidateLimit}
    `);

    const results = rows
      .map((row) => mapArchiveItemSearchResult(row, {
        queryText,
        tokens,
        productType,
        materials,
        application,
        lipAdjustmentMethod,
        deckleType,
        widthMm,
      }))
      .filter((result) => result.similarityScore > 0 || result.matchReasons.length > 0)
      .sort((left, right) => right.similarityScore - left.similarityScore || Number(BigInt(right.archiveItemId) - BigInt(left.archiveItemId)))
      .slice(0, limit);

    return {
      ...responseBase,
      results,
      warnings: results.length === 0 ? ["no archive item matches found"] : [],
    };
  }
}

export const archiveItemSearchService = new ArchiveItemSearchService();

export function tokenizeArchiveSearchQuery(queryText: string): string[] {
  return normalizeArchiveSearchQuery(queryText).normalizedTokens;
}

export function calculateArchiveItemCandidateLimit(limit: number): number {
  const normalizedLimit = normalizeLimit(limit);
  return Math.min(MAX_CANDIDATE_LIMIT, Math.max(MIN_CANDIDATE_LIMIT, normalizedLimit * CANDIDATE_LIMIT_MULTIPLIER));
}

function mapArchiveItemSearchResult(
  row: ArchiveItemSearchRow,
  query: {
    queryText: string;
    tokens: string[];
    productType?: string;
    materials: string[];
    application?: string;
    lipAdjustmentMethod?: string;
    deckleType?: string;
    widthMm?: number;
  },
): ArchiveItemSearchResult {
  const confirmedFields = objectRecord(row.confirmed_fields_json);
  const unresolvedFields = Array.isArray(row.unresolved_fields_json) ? row.unresolved_fields_json : [];
  const agentReadiness = objectRecord(row.agent_readiness_json);
  const features = objectRecord(row.similarity_features_json);
  const searchableText = row.searchable_text ?? "";
  const match = scoreArchiveItemSearchMatch({ row, confirmedFields, features, searchableText, agentReadiness, query });
  const productType = textValue(features.product_type) ?? textValue(confirmedFields.product_type) ?? row.product_type_hint ?? null;

  return {
    archiveItemId: stringifyId(row.archive_item_id),
    archiveId: stringifyId(row.archive_id),
    documentId: row.document_id === null || row.document_id === undefined ? null : stringifyId(row.document_id),
    itemName: row.item_name ?? null,
    productType,
    similarityScore: match.score,
    matchReasons: match.reasons,
    confirmedFields,
    unresolvedFieldsSummary: unresolvedFields.slice(0, 12).map(summarizeUnresolvedField),
    agentReadiness,
    searchableTextSummary: summarizeSearchableText(searchableText),
    evidence: {
      archiveId: stringifyId(row.archive_id),
      archiveTitle: row.archive_title ?? null,
      documentId: row.document_id === null || row.document_id === undefined ? null : stringifyId(row.document_id),
      fileName: row.file_name ?? null,
      itemIndex: row.item_index ?? null,
      sourceProductNumber: row.source_product_number ?? null,
    },
  };
}

function scoreArchiveItemSearchMatch(params: {
  row: ArchiveItemSearchRow;
  confirmedFields: Record<string, unknown>;
  features: Record<string, unknown>;
  searchableText: string;
  agentReadiness: Record<string, unknown>;
  query: {
    queryText: string;
    tokens: string[];
    productType?: string;
    materials: string[];
    application?: string;
    lipAdjustmentMethod?: string;
    deckleType?: string;
    widthMm?: number;
  };
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const searchable = buildSearchHaystack(params).toLowerCase();

  if (params.query.queryText && searchable.includes(params.query.queryText.toLowerCase())) {
    score += 0.12;
    reasons.push(`整句关键词命中：${params.query.queryText}`);
  }

  const matchedTokens = params.query.tokens.filter((token) => searchable.includes(token.toLowerCase()));
  if (params.query.tokens.length > 0 && matchedTokens.length > 0) {
    score += 0.18 * (matchedTokens.length / params.query.tokens.length);
    reasons.push(`关键词命中：${matchedTokens.join(", ")}`);
  }

  const actualProductType = textValue(params.features.product_type) ?? textValue(params.confirmedFields.product_type) ?? params.row.product_type_hint;
  if (params.query.productType && textMatches(actualProductType, params.query.productType)) {
    score += 0.2;
    reasons.push(`产品类型匹配：${actualProductType}`);
  }

  const actualMaterial = textValue(params.features.plastic_material)
    ?? textValue(params.confirmedFields.plastic_material)
    ?? textValue(params.features.product_material)
    ?? textValue(params.confirmedFields.product_material);
  const matchedMaterials = params.query.materials.filter((material) => (
    textMatches(actualMaterial, material) || textIncludes(searchable, material)
  ));
  if (matchedMaterials.length > 0) {
    score += 0.18;
    reasons.push(`材料匹配：${matchedMaterials.join(", ")}`);
  }

  const actualApplication = textValue(params.features.application) ?? textValue(params.confirmedFields.application);
  if (params.query.application && textMatches(actualApplication, params.query.application)) {
    score += 0.14;
    reasons.push(`应用匹配：${actualApplication}`);
  }

  const actualLipAdjustmentMethod = textValue(params.features.lip_adjustment_method) ?? textValue(params.confirmedFields.lip_adjustment_method);
  if (params.query.lipAdjustmentMethod && textMatches(actualLipAdjustmentMethod, params.query.lipAdjustmentMethod)) {
    score += 0.08;
    reasons.push(`模唇调节方式匹配：${actualLipAdjustmentMethod}`);
  }

  const actualDeckleType = textValue(params.features.deckle_type) ?? textValue(params.confirmedFields.deckle_type);
  if (params.query.deckleType && textMatches(actualDeckleType, params.query.deckleType)) {
    score += 0.08;
    reasons.push(`堵边/调幅结构匹配：${actualDeckleType}`);
  }

  if (params.query.widthMm !== undefined) {
    const historicalWidth = widthFromFeatures(params.features, params.confirmedFields) ?? widthFromText(searchable);
    if (historicalWidth !== null) {
      const diff = Math.abs(params.query.widthMm - historicalWidth);
      const tolerance = Math.max(100, params.query.widthMm * 0.1);
      const closeness = 1 - Math.min(diff / tolerance, 1);
      score += 0.2 * closeness;
      reasons.push(`宽度接近：目标 ${formatMm(params.query.widthMm)}mm，历史 ${formatMm(historicalWidth)}mm，差值 ${formatMm(diff)}mm`);
    }
  }

  if (params.agentReadiness.searchable === true) score += 0.03;
  if (params.agentReadiness.similarityReady === true) score += 0.03;
  if (params.agentReadiness.level === "high" || params.agentReadiness.level === "medium") score += 0.02;

  if (reasons.length === 0 && params.row.item_name) reasons.push(`归档 item：${params.row.item_name}`);
  return { score: clampScore(score), reasons };
}

function summarizeUnresolvedField(value: unknown) {
  const record = objectRecord(value);
  return {
    ...(record.fieldName || record.field_name ? { fieldName: String(record.fieldName ?? record.field_name) } : {}),
    ...(Object.prototype.hasOwnProperty.call(record, "rawValue") || Object.prototype.hasOwnProperty.call(record, "raw_value")
      ? { rawValue: record.rawValue ?? record.raw_value }
      : {}),
    ...(record.reason ? { reason: String(record.reason) } : {}),
    ...(record.candidateType || record.candidate_type ? { candidateType: String(record.candidateType ?? record.candidate_type) } : {}),
  };
}

function widthFromFeatures(features: Record<string, unknown>, confirmedFields: Record<string, unknown>): number | null {
  return numericMm(features.effective_width_mm)
    ?? numericMm(features.die_width_mm)
    ?? numericMm(confirmedFields.effective_width_mm)
    ?? numericMm(confirmedFields.die_width_mm);
}

function numericMm(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const record = objectRecord(value);
  const number = Number(record.value ?? record.min ?? record.max);
  if (!Number.isFinite(number)) return null;
  const unit = String(record.unit ?? "mm");
  if (unit === "m") return number * 1000;
  if (unit && unit !== "mm") return null;
  return number;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ") || null;
  const record = objectRecord(value);
  const text = record.canonicalValue ?? record.canonical_value ?? record.displayName ?? record.display_name ?? record.value;
  return typeof text === "string" || typeof text === "number" || typeof text === "boolean" ? String(text).trim() || null : null;
}

function textMatches(actual: unknown, expected: string): boolean {
  const actualText = textValue(actual);
  return Boolean(actualText && actualText.toLowerCase().includes(expected.toLowerCase()));
}

function textIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function widthFromText(value: string): number | null {
  const match = value.match(/(?:^|[^\d.])(\d{3,5}(?:\.\d+)?)\s*(?:mm|毫米)\b/i);
  if (!match) return null;
  const width = Number(match[1]);
  return Number.isFinite(width) ? width : null;
}

function summarizeSearchableText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

function normalizeString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(value.map(normalizeString).filter((item): item is string => Boolean(item)));
}

function normalizeLimit(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(number)));
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function stringifyId(value: bigint | number | string): string {
  return String(value);
}

function buildSearchHaystack(params: {
  row: ArchiveItemSearchRow;
  confirmedFields: Record<string, unknown>;
  features: Record<string, unknown>;
  searchableText: string;
}) {
  return [
    params.searchableText,
    params.row.item_name,
    params.row.product_type_hint,
    JSON.stringify(params.confirmedFields),
    JSON.stringify(params.features),
  ].filter(Boolean).join(" ");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = /[A-Za-z]/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
