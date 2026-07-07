import crypto from "node:crypto";

export type InsertMode = "full_insert" | "partial_insert" | "blocked";
export type AgentReadinessLevel = "high" | "medium" | "low" | "blocked";

export type InsertGateInsertability = {
  canInsert: boolean;
  insertMode: InsertMode;
  missingRequiredFields: string[];
  blockingReasons: Array<{ type: string; message: string; itemIndex?: number; details?: Record<string, unknown> }>;
  warnings: Array<{ type: string; message: string; itemIndex?: number; details?: Record<string, unknown> }>;
};

export type InsertGateAgentReadiness = {
  searchable: boolean;
  similarityReady: boolean;
  quoteReady: boolean;
  level: AgentReadinessLevel;
  missingForSearch: string[];
  missingForSimilarity: string[];
  missingForQuote: string[];
  reliableFieldCount: number;
  unresolvedFieldCount: number;
  warnings: Array<{ type: string; message: string; details?: Record<string, unknown> }>;
};

export type InsertGateItemResult = {
  itemIndex: number;
  insertability: InsertGateInsertability;
  agentReadiness: InsertGateAgentReadiness;
  confirmedFields: Record<string, unknown>;
  unresolvedFields: Array<Record<string, unknown>>;
  searchableText: string;
  configSignature: string | null;
  similarityFeatures: Record<string, unknown>;
};

type InsertGateWarning = InsertGateInsertability["warnings"][number];

export type InsertGateResult = {
  insertability: InsertGateInsertability;
  agentReadiness: InsertGateAgentReadiness;
  items: InsertGateItemResult[];
};

export type LegacyArchiveSearchFieldConfig = {
  similarityKeys: string[];
  keywordTextFields: string[];
  searchableTextFields: string[];
};

const SIMILARITY_KEYS = [
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
];

const FIELD_ALIASES = new Map<string, string>([
  ["product_type", "product_type"],
  ["product_type_hint", "product_type"],
  ["application", "application"],
  ["用途", "application"],
  ["plastic_material", "plastic_material"],
  ["material", "plastic_material"],
  ["原料", "plastic_material"],
  ["材料", "plastic_material"],
  ["effective_width_mm", "effective_width_mm"],
  ["effective_width", "effective_width_mm"],
  ["die_effective_width", "effective_width_mm"],
  ["模头有效宽度", "effective_width_mm"],
  ["有效宽度", "effective_width_mm"],
  ["die_width_mm", "die_width_mm"],
  ["die_width", "die_width_mm"],
  ["模头宽度", "die_width_mm"],
  ["thickness_mm", "thickness_mm"],
  ["thickness", "thickness_mm"],
  ["product_effective_thickness", "thickness_mm"],
  ["厚度", "thickness_mm"],
  ["layer_count", "layer_count"],
  ["layers", "layer_count"],
  ["层数", "layer_count"],
  ["heating_zone_count", "heating_zone_count"],
  ["heating_zones", "heating_zone_count"],
  ["加热区数量", "heating_zone_count"],
  ["lip_adjustment_method", "lip_adjustment_method"],
  ["模唇调节", "lip_adjustment_method"],
  ["deckle_type", "deckle_type"],
  ["堵边类型", "deckle_type"],
]);

const ALLOWED_TEXT_FIELDS = new Set([
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

const SAFE_UNITS = new Set(["mm", "m", "kW", "MPa", "°C", "kg", "kg/h", "rpm", "%", "°"]);
const SIMILARITY_READY_MIN_CONFIRMED_FEATURES = 2;

export function getLegacyArchiveSearchFieldConfig(): LegacyArchiveSearchFieldConfig {
  const keywordTextFields = [...ALLOWED_TEXT_FIELDS].sort();
  return {
    similarityKeys: [...SIMILARITY_KEYS].sort(),
    keywordTextFields,
    searchableTextFields: [...keywordTextFields],
  };
}

export function buildAgentReadyInsertGate(params: {
  normalizedExtractionJson: unknown;
  dictionaryProposals?: unknown;
}): InsertGateResult {
  const normalized = objectRecord(params.normalizedExtractionJson);
  const items = Array.isArray(normalized.items) ? normalized.items : [];
  const proposals = collectProposals(params.dictionaryProposals ?? normalized.dictionaryProposals);
  const docInfo = objectRecord(normalized.document_info);

  if (items.length === 0) {
    const insertability = blockedInsertability("document_items", "normalized_extraction_json.items is empty");
    return {
      insertability,
      agentReadiness: {
        searchable: false,
        similarityReady: false,
        quoteReady: false,
        level: "blocked",
        missingForSearch: ["items"],
        missingForSimilarity: ["items"],
        missingForQuote: ["items"],
        reliableFieldCount: 0,
        unresolvedFieldCount: 0,
        warnings: [{ type: "empty_items", message: "No items are available for Agent retrieval" }],
      },
      items: [],
    };
  }

  const itemResults = items.map((item, offset) => buildItemGate({
    item: objectRecord(item),
    itemIndex: itemIndexOf(item, offset),
    docInfo,
    proposals,
  }));
  const blockers = itemResults.flatMap((item) => item.insertability.blockingReasons);
  const warnings = itemResults.flatMap((item) => item.insertability.warnings);
  const unresolvedCount = itemResults.reduce((sum, item) => sum + item.unresolvedFields.length, 0);
  const readinessWarnings = itemResults.flatMap((item) => item.agentReadiness.warnings);
  const insertability: InsertGateInsertability = {
    canInsert: blockers.length === 0,
    insertMode: blockers.length > 0 ? "blocked" : unresolvedCount > 0 || warnings.length > 0 || readinessWarnings.length > 0 ? "partial_insert" : "full_insert",
    missingRequiredFields: [...new Set(blockers.flatMap((blocker) => Object.keys(objectRecord(blocker.details).missing ?? {})))],
    blockingReasons: blockers,
    warnings,
  };
  const agentReadiness = aggregateReadiness(itemResults, insertability);
  return { insertability, agentReadiness, items: itemResults };
}

export function getGateItemResult(
  gate: InsertGateResult | undefined,
  itemIndex: number,
): InsertGateItemResult | undefined {
  return gate?.items.find((item) => Number(item.itemIndex) === Number(itemIndex));
}

function buildItemGate(params: {
  item: Record<string, any>;
  itemIndex: number;
  docInfo: Record<string, unknown>;
  proposals: Array<Record<string, any>>;
}): InsertGateItemResult {
  const productType = productTypeValue(params.item);
  const itemName = scalarText(params.item.item_name ?? params.item.itemName);
  const quantity = scalarText(params.item.item_quantity ?? params.item.itemQuantity);
  const rawEvidence = collectRawEvidence(params.item);
  const itemProposals = params.proposals.filter((proposal) => Number(proposal.itemIndex ?? proposal.item_index ?? params.itemIndex) === params.itemIndex);
  const unresolvedFields: Array<Record<string, unknown>> = itemProposals.map((proposal) => unresolvedFromProposal(proposal));
  const confirmedFields: Record<string, unknown> = {};

  if (productType) confirmedFields.product_type = productType;
  for (const { fieldName, fieldValue, source } of fieldEntries(params.item)) {
    if (hasProposalForField(itemProposals, fieldName)) {
      unresolvedFields.push(unresolvedFromField(fieldName, fieldValue, "candidate_or_dictionary_proposal"));
      continue;
    }
    const confirmed = confirmField(fieldName, fieldValue, source);
    if (confirmed.confirmed) confirmedFields[confirmed.fieldName] = confirmed.value;
    else unresolvedFields.push(unresolvedFromField(fieldName, fieldValue, confirmed.reason));
  }

  const identityBlocked = !productType && !itemName && rawEvidence.length === 0;
  const blockingReasons = identityBlocked
    ? [{
        type: "missing_item_identity",
        message: "Item lacks product_type, item_name, and raw evidence",
        itemIndex: params.itemIndex,
        details: { missing: { product_type: true, item_name: true, raw_evidence: true } },
      }]
    : [];
  const warnings: InsertGateWarning[] = [
    ...dedupeUnresolved(unresolvedFields).map((field) => ({
      type: "unresolved_field",
      message: "Unresolved field preserved for traceability",
      itemIndex: params.itemIndex,
      details: { fieldName: field.fieldName, reason: field.reason, candidateType: field.candidateType },
    })),
  ];
  if (!quantity) {
    warnings.push({
      type: "missing_quantity",
      message: "Quantity is missing; quote readiness is downgraded",
      itemIndex: params.itemIndex,
      details: {},
    });
  }
  if (!productType) {
    warnings.push({
      type: "missing_product_type",
      message: "Product type is missing; similarity and quote readiness are downgraded",
      itemIndex: params.itemIndex,
      details: {},
    });
  }

  const similarityFeatures = buildSimilarityFeatures(confirmedFields);
  const missingForSearch = !itemName && !productType && rawEvidence.length === 0 ? ["item_identity"] : [];
  const similarityFeatureCount = Object.keys(similarityFeatures).filter((key) => key !== "product_type").length;
  const missingForSimilarity = [
    ...(!productType ? ["product_type"] : []),
    ...(similarityFeatureCount < SIMILARITY_READY_MIN_CONFIRMED_FEATURES ? ["confirmed_similarity_features"] : []),
  ];
  const missingForQuote = quoteMissingFields({
    productType,
    quantity,
    confirmedFields,
  });
  const searchable = missingForSearch.length === 0;
  const similarityReady = Boolean(productType && similarityFeatureCount >= SIMILARITY_READY_MIN_CONFIRMED_FEATURES);
  const quoteReady = missingForQuote.length === 0;
  const agentWarnings = [
    ...(!similarityReady ? [{ type: "similarity_not_ready", message: "Confirmed similarity features are insufficient" }] : []),
    ...(!quoteReady ? [{ type: "quote_not_ready", message: "Quote readiness is missing v1 required fields" }] : []),
  ];
  const agentReadiness: InsertGateAgentReadiness = {
    searchable,
    similarityReady,
    quoteReady,
    level: blockingReasons.length > 0 ? "blocked" : searchable && similarityReady && quoteReady ? "high" : searchable && (similarityReady || quoteReady) ? "medium" : searchable ? "low" : "blocked",
    missingForSearch,
    missingForSimilarity,
    missingForQuote,
    reliableFieldCount: Object.keys(confirmedFields).length,
    unresolvedFieldCount: unresolvedFields.length,
    warnings: agentWarnings,
  };
  return {
    itemIndex: params.itemIndex,
    insertability: {
      canInsert: blockingReasons.length === 0,
      insertMode: blockingReasons.length > 0 ? "blocked" : unresolvedFields.length > 0 || warnings.length > 0 || agentWarnings.length > 0 ? "partial_insert" : "full_insert",
      missingRequiredFields: identityBlocked ? ["product_type", "item_name", "raw_evidence"] : [],
      blockingReasons,
      warnings,
    },
    agentReadiness,
    confirmedFields,
    unresolvedFields,
    searchableText: buildSearchableText({
      docInfo: params.docInfo,
      item: params.item,
      confirmedFields,
      unresolvedFields,
      rawEvidence,
    }),
    configSignature: buildConfigSignature(similarityFeatures),
    similarityFeatures,
  };
}

function confirmField(fieldName: string, value: unknown, source?: Record<string, any>): { confirmed: true; fieldName: string; value: unknown } | { confirmed: false; reason: string } {
  const dictionary = objectRecord(source?.dictionary);
  const dictionaryTermType = scalarText(dictionary.term_type);
  const normalizedField = normalizeFieldName(dictionaryTermType ?? fieldName);
  const canonicalField = FIELD_ALIASES.get(normalizedField) ?? FIELD_ALIASES.get(fieldName) ?? normalizedField;
  if (source?.candidate || hasValueNoMatchWarning(source)) return { confirmed: false, reason: "dictionary_candidate_or_value_miss" };
  if (dictionaryTermType && dictionary.matched === false) return { confirmed: false, reason: "dictionary_not_matched" };
  if (dictionaryTermType && dictionary.matched === true) {
    const dictionaryValue = confirmedDictionaryValue(source ?? {}, dictionary);
    if (dictionaryValue !== undefined && dictionaryValue !== null && dictionaryValue !== "") {
      return { confirmed: true, fieldName: canonicalField, value: dictionaryValue };
    }
  }
  if (hasDictionaryMatch(value)) return { confirmed: true, fieldName: canonicalField, value: unwrapValue(value) };
  if (isNumberUnit(value) && value.unit && SAFE_UNITS.has(String(value.unit))) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (isRange(value) && (!value.unit || SAFE_UNITS.has(String(value.unit)))) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (typeof value === "boolean") {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (typeof value === "string" && isIsoLikeDate(value)) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (typeof value === "string" && ALLOWED_TEXT_FIELDS.has(canonicalField)) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string") && ALLOWED_TEXT_FIELDS.has(canonicalField)) {
    return { confirmed: true, fieldName: canonicalField, value };
  }
  return { confirmed: false, reason: "unconfirmed_field_semantics" };
}

function fieldEntries(item: Record<string, any>): Array<{ fieldName: string; fieldValue: unknown; source?: Record<string, any> }> {
  const fields = item.fields;
  if (Array.isArray(fields)) {
    return fields
      .map((field) => objectRecord(field))
      .map((field) => ({
        fieldName: scalarText(objectRecord(field.dictionary).term_type) ?? scalarText(field.field_name) ?? "unknown_field",
        fieldValue: field,
        source: field,
      }));
  }
  return Object.entries(objectRecord(fields)).map(([fieldName, fieldValue]) => ({ fieldName, fieldValue }));
}

function confirmedDictionaryValue(source: Record<string, any>, dictionary: Record<string, any>): unknown {
  const valueKind = scalarText(dictionary.value_kind);
  if (dictionary.number_unit) return dictionary.number_unit;
  if (Object.prototype.hasOwnProperty.call(dictionary, "canonical_value")) return dictionary.canonical_value;
  if (Array.isArray(dictionary.values) && dictionary.values.length > 0) {
    return dictionary.values.map((value) => objectRecord(value).canonicalValue ?? objectRecord(value).canonical_value ?? objectRecord(value).displayName).filter(Boolean);
  }
  if (valueKind === "boolean") return source.raw_value ?? source.raw_text;
  if (valueKind === "date") return source.raw_value ?? source.raw_text;
  if (valueKind === "number") {
    const number = Number(source.raw_value ?? source.raw_text ?? dictionary.normalized_value);
    return Number.isFinite(number) ? number : source.raw_value ?? source.raw_text;
  }
  if (valueKind === "text") return source.raw_value ?? source.raw_text;
  return source.raw_value ?? source.raw_text ?? dictionary.normalized_value;
}

function hasValueNoMatchWarning(source?: Record<string, any>): boolean {
  const warnings = Array.isArray(source?.warnings) ? source.warnings : [];
  return warnings.some((warning) => String(objectRecord(warning).type ?? "").includes("value_no_match"));
}

function buildSimilarityFeatures(confirmedFields: Record<string, unknown>): Record<string, unknown> {
  const features: Record<string, unknown> = {};
  for (const key of SIMILARITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(confirmedFields, key)) continue;
    const value = confirmedFields[key];
    const featureValue = similarityFeatureValue(key, value);
    if (featureValue !== undefined && featureValue !== null && featureValue !== "") features[key] = featureValue;
  }
  return features;
}

function quoteMissingFields(params: {
  productType: string | null;
  quantity: string | null;
  confirmedFields: Record<string, unknown>;
}): string[] {
  const missing = [
    ...(!params.quantity ? ["item_quantity"] : []),
    ...(!params.productType ? ["product_type"] : []),
  ];
  if (params.productType === "flat_die" || params.productType === "coating_die" || params.productType === "blown_film_die") {
    if (!hasAnyConfirmed(params.confirmedFields, ["effective_width_mm", "die_width_mm"])) {
      missing.push("effective_width_mm_or_die_width_mm");
    }
    if (!hasAnyConfirmed(params.confirmedFields, ["plastic_material", "application"])) {
      missing.push("plastic_material_or_application");
    }
  }
  return missing;
}

function hasAnyConfirmed(fields: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = fields[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

function similarityFeatureValue(key: string, value: unknown): unknown {
  if (["effective_width_mm", "die_width_mm", "thickness_mm"].includes(key)) return numericMm(value);
  if (["layer_count", "heating_zone_count"].includes(key)) return numericValue(value);
  return textValue(value) ?? value;
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
  const number = Number(record.value ?? record.min ?? record.max);
  return Number.isFinite(number) ? number : null;
}

function buildSearchableText(params: {
  docInfo: Record<string, unknown>;
  item: Record<string, any>;
  confirmedFields: Record<string, unknown>;
  unresolvedFields: Array<Record<string, unknown>>;
  rawEvidence: string[];
}): string {
  const lines: string[] = [];
  addSection(lines, "DOC", params.docInfo);
  addSection(lines, "ITEM", {
    item_name: params.item.item_name ?? params.item.itemName,
    product_type: productTypeValue(params.item),
    product_type_raw: productTypeRawValue(params.item),
    item_quantity: params.item.item_quantity ?? params.item.itemQuantity,
  });
  addSection(lines, "CONFIRMED", params.confirmedFields);
  for (const field of params.unresolvedFields) addSection(lines, "UNRESOLVED", field);
  for (const evidence of params.rawEvidence) {
    if (evidence) lines.push(`[EVIDENCE] ${evidence}`);
  }
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].join("\n");
}

function addSection(lines: string[], section: string, value: unknown) {
  const text = flattenSearchText(value);
  if (text) lines.push(`[${section}] ${text}`);
}

function flattenSearchText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenSearchText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = flattenSearchText(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function buildConfigSignature(features: Record<string, unknown>): string | null {
  const entries = Object.entries(features).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return null;
  const body = JSON.stringify(Object.fromEntries(entries));
  return crypto.createHash("sha256").update(body).digest("hex");
}

function collectProposals(value: unknown): Array<Record<string, any>> {
  const root = objectRecord(value);
  const proposals = Array.isArray(root.proposals) ? root.proposals : [];
  const nested = Array.isArray(root.items)
    ? root.items.flatMap((item) => Array.isArray(objectRecord(item).proposals) ? objectRecord(item).proposals : [])
    : [];
  return [...proposals, ...nested].map(objectRecord).filter((proposal) => Object.keys(proposal).length > 0);
}

function collectRawEvidence(item: Record<string, any>): string[] {
  const rawFields = Array.isArray(item.raw_fields) ? item.raw_fields : [];
  const fieldRecords = Array.isArray(item.fields) ? item.fields : [];
  return [...rawFields, ...fieldRecords]
    .map((field) => objectRecord(field))
    .flatMap((field) => [
      pairText(field.field_name, field.value ?? field.raw_value),
      scalarText(field.raw_text),
      flattenSearchText(field.evidence),
    ])
    .filter((text): text is string => Boolean(text));
}

function unresolvedFromProposal(proposal: Record<string, any>) {
  return {
    source: "dictionary_proposal",
    candidateType: proposal.candidateType ?? proposal.candidate_type ?? "value",
    termType: proposal.termType ?? proposal.term_type ?? null,
    fieldName: proposal.fieldName ?? proposal.field_name ?? proposal.termType ?? proposal.term_type ?? null,
    fieldPath: proposal.fieldPath ?? proposal.field_path ?? null,
    rawValue: proposal.rawValue ?? proposal.raw_value ?? null,
    reason: proposal.reason ?? "dictionary_candidate",
    evidence: proposal.evidence ?? null,
  };
}

function unresolvedFromField(fieldName: string, value: unknown, reason: string) {
  return {
    source: "normalized_field",
    fieldName,
    rawValue: unwrapValue(value),
    reason,
    evidence: value,
  };
}

function hasProposalForField(proposals: Array<Record<string, any>>, fieldName: string): boolean {
  return proposals.some((proposal) => {
    const path = String(proposal.fieldPath ?? proposal.field_path ?? "");
    const termType = String(proposal.termType ?? proposal.term_type ?? "");
    const candidateType = String(proposal.candidateType ?? proposal.candidate_type ?? "");
    return path.endsWith(`.${fieldName}`) || termType === fieldName || (candidateType === "term_type" && path.includes(fieldName));
  });
}

function dedupeUnresolved(fields: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = JSON.stringify([field.fieldPath, field.fieldName, field.rawValue, field.reason]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateReadiness(items: InsertGateItemResult[], insertability: InsertGateInsertability): InsertGateAgentReadiness {
  const missingForSearch = [...new Set(items.flatMap((item) => item.agentReadiness.missingForSearch))];
  const missingForSimilarity = [...new Set(items.flatMap((item) => item.agentReadiness.missingForSimilarity))];
  const missingForQuote = [...new Set(items.flatMap((item) => item.agentReadiness.missingForQuote))];
  const warnings = items.flatMap((item) => item.agentReadiness.warnings);
  const searchable = insertability.canInsert && items.some((item) => item.agentReadiness.searchable);
  const similarityReady = insertability.canInsert && items.every((item) => item.agentReadiness.similarityReady);
  const quoteReady = insertability.canInsert && items.every((item) => item.agentReadiness.quoteReady);
  return {
    searchable,
    similarityReady,
    quoteReady,
    level: !insertability.canInsert ? "blocked" : searchable && similarityReady && quoteReady ? "high" : searchable && (similarityReady || quoteReady) ? "medium" : searchable ? "low" : "blocked",
    missingForSearch,
    missingForSimilarity,
    missingForQuote,
    reliableFieldCount: items.reduce((sum, item) => sum + item.agentReadiness.reliableFieldCount, 0),
    unresolvedFieldCount: items.reduce((sum, item) => sum + item.agentReadiness.unresolvedFieldCount, 0),
    warnings,
  };
}

function blockedInsertability(field: string, message: string): InsertGateInsertability {
  return {
    canInsert: false,
    insertMode: "blocked",
    missingRequiredFields: [field],
    blockingReasons: [{ type: "missing_required_field", message, details: { missing: { [field]: true } } }],
    warnings: [],
  };
}

function productTypeValue(item: Record<string, any>): string | null {
  const productType = item.itemProductTypeHint ?? item.product_type_hint ?? item.productTypeHint;
  const record = objectRecord(productType);
  const value = scalarText(record.value ?? record.canonical_value ?? productType);
  return value && value !== "unknown" && value !== "未知" ? value : null;
}

function productTypeRawValue(item: Record<string, any>): string | null {
  const productType = item.itemProductTypeHint ?? item.product_type_hint ?? item.productTypeHint;
  const record = objectRecord(productType);
  return scalarText(item.product_type_raw_value ?? record.raw_value ?? productType);
}

function itemIndexOf(item: unknown, fallback: number): number {
  const record = objectRecord(item);
  const number = Number(record.item_index ?? record.itemIndex);
  return Number.isFinite(number) ? number : fallback + 1;
}

function hasDictionaryMatch(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDictionaryMatch);
  const dictionary = objectRecord(objectRecord(value).dictionary);
  return dictionary.matched === true;
}

function unwrapValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapValue);
  const record = objectRecord(value);
  if (Object.keys(record).length === 0) return value;
  if ("value" in record && Object.keys(record).some((key) => ["dictionary", "raw_value", "display_name"].includes(key))) return record.value;
  return value;
}

function isNumberUnit(value: unknown): value is { value: number; unit?: string } {
  const record = objectRecord(value);
  return Number.isFinite(Number(record.value)) && ("unit" in record || "raw_value" in record);
}

function isRange(value: unknown): value is { min: number; max: number; unit?: string } {
  const record = objectRecord(value);
  return Number.isFinite(Number(record.min)) && Number.isFinite(Number(record.max));
}

function isIsoLikeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && Number.isFinite(Date.parse(value));
}

function normalizeFieldName(value: string): string {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

function textValue(value: unknown): string | null {
  const unwrapped = unwrapValue(value);
  if (typeof unwrapped === "string" && unwrapped.trim()) return unwrapped.trim();
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) return String(unwrapped);
  return null;
}

function pairText(key: unknown, value: unknown): string | null {
  const keyText = scalarText(key);
  const valueText = flattenSearchText(value);
  if (!keyText && !valueText) return null;
  return [keyText, valueText].filter(Boolean).join(": ");
}

function scalarText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}
