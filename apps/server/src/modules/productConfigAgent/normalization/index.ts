import { dictionaryMatcherService, type DictionaryValueKind } from "../dictionary/matcher.service.js";
import {
  applyFieldNameRules,
  applyRawFieldExpansion,
  mergePartFields,
  normalizeFieldKey,
  redirectRawFieldProductType,
  routeDocumentInfoKey,
} from "./rules/index.js";
import {
  isProductConfigAgentModelTermType,
  productConfigAgentMasterDataService,
} from "../masterData.service.js";

export type NormalizedWarning = {
  type: string;
  message: string;
  evidence?: unknown;
};

export type NormalizedRawField = {
  item_index?: number;
  field_name: string;
  value: unknown;
  selected?: boolean;
  original?: boolean;
  raw_text?: string | null;
  split_fields?: Array<Record<string, unknown>>;
  qualifier?: unknown;
  evidence?: unknown;
  confidence?: number;
};

export type NormalizedExtraction = {
  document_info: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  warnings: NormalizedWarning[];
};

const PRODUCT_TYPE_ALIASES = new Map<string, string>([
  ["平模头", "flat_die"],
  ["模头", "flat_die"],
  ["涂布模头", "coating_die"],
  ["吹膜模头", "blown_film_die"],
  ["分配器", "feedblock"],
  ["过滤器", "filter"],
  ["换网器", "filter"],
  ["计量泵", "metering_pump"],
  ["液压站", "hydraulic_station"],
  ["熔体管道", "melt_pipe"],
  ["定型模", "sizing_die"],
  ["风刀", "air_knife"],
  ["气刀", "air_knife"],
  ["静态混合器", "static_mixer"],
  ["喷丝板", "spinneret_plate"],
]);

const UNIT_ALIASES = new Map<string, string>([
  ["毫米", "mm"],
  ["㎜", "mm"],
  ["mm", "mm"],
  ["MM", "mm"],
  ["米", "m"],
  ["m", "m"],
  ["kw", "kW"],
  ["KW", "kW"],
  ["千瓦", "kW"],
  ["mpa", "MPa"],
  ["MPA", "MPa"],
  ["℃", "°C"],
  ["°C", "°C"],
  ["度", "°C"],
  ["kg", "kg"],
  ["KG", "kg"],
  ["套", "set"],
  ["件", "piece"],
]);

const LEGACY_FIELD_NAME_ALIASES = new Map<string, string>([
  ["fastener_type", "screw_type"],
]);

const SURFACE_BASE_TERM_TYPES = new Set([
  "plating_type",
  "plating_thickness",
  "plating_hardness",
  "surface_treatment_note",
  "surface_roughness",
]);

const CHINESE_QUANTITY_DIGITS = new Map<string, number>([
  ["零", 0],
  ["〇", 0],
  ["一", 1],
  ["壹", 1],
  ["二", 2],
  ["贰", 2],
  ["两", 2],
  ["三", 3],
  ["叁", 3],
  ["四", 4],
  ["肆", 4],
  ["五", 5],
  ["伍", 5],
  ["六", 6],
  ["陆", 6],
  ["七", 7],
  ["柒", 7],
  ["八", 8],
  ["捌", 8],
  ["九", 9],
  ["玖", 9],
]);

export function coerceLlmExtractionResult(value: unknown): unknown {
  const root = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as any) } : {};
  const extraction = root.extraction && typeof root.extraction === "object" ? root.extraction : root;
  const items = Array.isArray(extraction.items) ? extraction.items : Array.isArray(root.items) ? root.items : [];
  return {
    ...root,
    extraction: {
      document_info: normalizeRecord(extraction.document_info ?? root.document_info ?? {}),
      items: items.map((item: unknown, index: number) => normalizeItemShape(item, index + 1)),
    },
    warnings: normalizeWarnings(root.warnings),
  };
}

export function normalizeExtraction(value: unknown): NormalizedExtraction {
  const coerced = coerceLlmExtractionResult(value) as any;
  const warnings = normalizeWarnings(coerced.warnings);
  const documentInfo = normalizeDocumentInfo(coerced.extraction?.document_info ?? {}, warnings);
  const items = Array.isArray(coerced.extraction?.items) ? coerced.extraction.items : [];
  const usedIndexes = new Set<number>();
  const preparedItems = items.map((item: any, offset: number) => {
    let itemIndex = Number(item.item_index);
    if (!Number.isFinite(itemIndex) || itemIndex <= 0 || usedIndexes.has(itemIndex)) {
      itemIndex = nextIndex(usedIndexes);
    }
    usedIndexes.add(itemIndex);
    const rawFields = Array.isArray(item.raw_fields) ? item.raw_fields : fieldsToRawFields(item.fields ?? {}, itemIndex);
    const productTypeHint = normalizeProductTypeHint(item.product_type_hint ?? item.item_type_hint, {
      itemName: scalarText(item.item_name ?? item.name ?? item.product_name),
      itemIndex,
      warnings,
    });
    return {
      ...item,
      item_index: itemIndex,
      item_name: scalarText(item.item_name ?? item.name ?? item.product_name),
      product_type_hint: productTypeHint,
      item_quantity: normalizeItemQuantity(item.item_quantity ?? item.quantity),
      raw_fields: rawFields.map((field: unknown) => normalizeRawField(field, itemIndex)),
      warnings: normalizeWarnings(item.warnings),
    };
  });
  const itemsByProductType = new Map<string, any>();
  for (const item of preparedItems) {
    const productType = scalarText(item.product_type_hint?.value ?? item.product_type_hint);
    if (productType && !itemsByProductType.has(productType)) itemsByProductType.set(productType, item);
  }
  const availableProductTypes = new Set(itemsByProductType.keys());
  for (const item of preparedItems) {
    const currentProductType = scalarText(item.product_type_hint?.value ?? item.product_type_hint);
    const retainedFields: NormalizedRawField[] = [];
    for (const rawField of item.raw_fields) {
      const targetProductType = redirectRawFieldProductType({
        rawField,
        currentProductType,
        availableProductTypes,
      });
      const targetItem = targetProductType ? itemsByProductType.get(targetProductType) : null;
      if (targetItem && targetItem !== item) {
        targetItem.raw_fields.push({
          ...rawField,
          item_index: targetItem.item_index,
          evidence: {
            ...(rawField.evidence && typeof rawField.evidence === "object" && !Array.isArray(rawField.evidence)
              ? rawField.evidence
              : {}),
            redirectedFromItemIndex: item.item_index,
            redirectedToProductType: targetProductType,
          },
        });
        warnings.push({
          type: "raw_field_product_redirected",
          message: "字段已按产品类型重定向",
          evidence: { fromItemIndex: item.item_index, toItemIndex: targetItem.item_index, fieldName: rawField.field_name },
        });
      } else {
        retainedFields.push(rawField);
      }
    }
    item.raw_fields = retainedFields;
  }
  const expandedItems = preparedItems.map((item: any) => {
    const productType = scalarText(item.product_type_hint?.value ?? item.product_type_hint);
    const expandedRawFields = applyRawFieldExpansion(item.raw_fields, {
      itemIndex: item.item_index,
      productTypeHint: productType,
      warnings,
    });
    return {
      ...item,
      raw_fields: expandedRawFields,
    };
  });
  const splitItems = splitIndexedInstanceItems(expandedItems, warnings, usedIndexes);
  const normalizedItems = splitItems.map((item: any) => {
    const productType = scalarText(item.product_type_hint?.value ?? item.product_type_hint);
    const fields = normalizeFields(item.raw_fields, warnings, item.item_index, productType);
    return { ...item, fields };
  });
  return {
    document_info: documentInfo,
    items: normalizedItems.sort((left: any, right: any) => Number(left.item_index) - Number(right.item_index)),
    warnings,
  };
}

function splitIndexedInstanceItems(
  items: any[],
  warnings: NormalizedWarning[],
  usedIndexes: Set<number>,
): any[] {
  const result: any[] = [];
  for (const item of items) {
    const rawFields = Array.isArray(item.raw_fields) ? item.raw_fields as NormalizedRawField[] : [];
    const indexed = rawFields
      .map((field) => ({ field, parsed: parseIndexedInstanceFieldName(field.field_name) }))
      .filter((entry): entry is { field: NormalizedRawField; parsed: { baseFieldName: string; instanceIndex: number } } => Boolean(entry.parsed));
    const instanceIndexes = [...new Set(indexed.map((entry) => entry.parsed.instanceIndex))].sort((left, right) => left - right);
    if (instanceIndexes.length < 2) {
      result.push(item);
      continue;
    }
    const primary = findInstancePrimaryFields(rawFields, indexed, instanceIndexes);
    if (!primary) {
      warnings.push({
        type: "item_instance_split_skipped",
        message: "indexed 字段缺少可对齐的实例主键，保持数组归一化",
        evidence: { itemIndex: item.item_index, instanceIndexes, sourceFieldNames: indexed.map((entry) => entry.field.field_name) },
      });
      result.push(item);
      continue;
    }

    const assignedItemIndexes = instanceIndexes.map((instanceIndex, offset) => {
      if (offset === 0) return Number(item.item_index);
      const next = nextIndex(usedIndexes);
      usedIndexes.add(next);
      return next;
    });
    const sourceFieldNames = [...new Set([...indexed.map((entry) => entry.field.field_name), ...[...primary.values()].map((field) => field.field_name)])];
    warnings.push({
      type: "item_instance_split_from_indexed_fields",
      message: "同一 item 内 indexed 字段已按产品实例拆分",
      evidence: { splitFromItemIndex: item.item_index, assignedItemIndexes, sourceFieldNames },
    });

    const primaryFields = new Set(primary.values());
    const commonFields = rawFields.filter((field) => !parseIndexedInstanceFieldName(field.field_name) && !primaryFields.has(field));
    for (const [offset, instanceIndex] of instanceIndexes.entries()) {
      const itemIndex = assignedItemIndexes[offset];
      const primaryField = primary.get(instanceIndex);
      const instanceFields = indexed
        .filter((entry) => entry.parsed.instanceIndex === instanceIndex)
        .map((entry) => ({
          ...entry.field,
          item_index: itemIndex,
          field_name: entry.parsed.baseFieldName,
          evidence: withSplitEvidence(entry.field.evidence, item.item_index, instanceIndex, sourceFieldNames),
        }));
      result.push({
        ...item,
        item_index: itemIndex,
        raw_fields: [
          ...commonFields.map((field) => ({
            ...field,
            item_index: itemIndex,
            ...(offset > 0
              ? { evidence: withSplitEvidence(field.evidence, item.item_index, instanceIndex, sourceFieldNames) }
              : {}),
          })),
          ...(primaryField
            ? [{
                ...primaryField,
                item_index: itemIndex,
                evidence: withSplitEvidence(primaryField.evidence, item.item_index, instanceIndex, sourceFieldNames),
              }]
            : []),
          ...instanceFields,
        ],
        ...(offset > 0
          ? { evidence: withSplitEvidence(item.evidence, item.item_index, instanceIndex, sourceFieldNames) }
          : {}),
      });
    }
  }
  return result;
}

function findInstancePrimaryFields(
  rawFields: NormalizedRawField[],
  indexed: Array<{ field: NormalizedRawField; parsed: { baseFieldName: string; instanceIndex: number } }>,
  instanceIndexes: number[],
): Map<number, NormalizedRawField> | null {
  const counts = new Map<string, Set<number>>();
  for (const entry of indexed) {
    if (!/(?:型号|model)$/iu.test(entry.parsed.baseFieldName)) continue;
    counts.set(entry.parsed.baseFieldName, (counts.get(entry.parsed.baseFieldName) ?? new Set()).add(entry.parsed.instanceIndex));
  }
  for (const [fieldName, indexes] of counts.entries()) {
    if (instanceIndexes.every((index) => indexes.has(index))) {
      return new Map(indexed
        .filter((entry) => entry.parsed.baseFieldName === fieldName)
        .map((entry) => [entry.parsed.instanceIndex, { ...entry.field, field_name: entry.parsed.baseFieldName }]));
    }
  }
  const duplicateModels = new Map<string, NormalizedRawField[]>();
  for (const field of rawFields) {
    const fieldName = normalizeKey(field.field_name);
    if (parseIndexedInstanceFieldName(fieldName) || !/(?:型号|model)$/iu.test(fieldName)) continue;
    duplicateModels.set(fieldName, [...(duplicateModels.get(fieldName) ?? []), field]);
  }
  for (const fields of duplicateModels.values()) {
    if (fields.length === instanceIndexes.length) {
      return new Map(instanceIndexes.map((instanceIndex, offset) => [instanceIndex, fields[offset]]));
    }
  }
  return null;
}

function withSplitEvidence(
  evidence: unknown,
  splitFromItemIndex: number,
  instanceIndex: number,
  sourceFieldNames: string[],
): Record<string, unknown> {
  return {
    ...(evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence as Record<string, unknown> : {}),
    splitFromItemIndex,
    instanceIndex,
    sourceFieldNames,
  };
}

export async function normalizeExtractionWithDictionary(value: unknown): Promise<NormalizedExtraction & {
  dictionaryProposals: Record<string, unknown>;
}> {
  const normalized = normalizeExtraction(value) as NormalizedExtraction & {
    dictionaryProposals: Record<string, unknown>;
  };
  const proposals: Array<Record<string, unknown>> = [];
  for (const item of normalized.items as any[]) {
    const rawFields = Array.isArray(item.raw_fields) ? item.raw_fields : [];
    const nextFields: Record<string, unknown> = {};
    for (const rawField of rawFields) {
      if (isTraceOnlyRawField(rawField)) continue;
      const rawFieldName = String(rawField.field_name ?? "").trim();
      if (!rawFieldName) continue;
      const termTypeMatch = await dictionaryMatcherService.matchTermType(
        rawFieldName,
        scalarText(item.product_type_hint?.value ?? item.product_type_hint) ?? undefined,
      );
      if (!termTypeMatch.matched || termTypeMatch.termTypes.length === 0) {
        proposals.push({
          candidateType: "term_type",
          termType: "unknown_field",
          rawValue: rawFieldName,
          itemIndex: item.item_index,
          fieldPath: `$.items[${Number(item.item_index) - 1}].raw_fields.${rawFieldName}`,
          reason: "missing_field_alias",
        });
        const fallbackKey = normalizeKey(rawFieldName);
        if (fallbackKey) nextFields[fallbackKey] = normalizeStructuredValue(rawField.value, fallbackKey, normalized.warnings);
        continue;
      }
      const termType = chooseTermType(termTypeMatch.termTypes);
      const context = await dictionaryMatcherService.getTermTypeContext(termType);
      const coerced = shouldPreserveLayerStructureValue(rawField, termType)
        ? { value: String(rawField.value ?? "").trim() }
        : await normalizeDictionaryValue({
            termType,
            rawValue: rawField.value,
            valueKind: context.valueKind,
            collectCandidates: metadataCollectCandidates(context.metadata),
            warnings: normalized.warnings,
          });
      const { key: ruleTermType, value: fieldValue } = applyFieldNameRules(rawField, coerced.value, {
        itemIndex: item.item_index,
        productTypeHint: scalarText(item.product_type_hint?.value ?? item.product_type_hint),
        warnings: normalized.warnings,
      });
      const targetTermType = SURFACE_BASE_TERM_TYPES.has(ruleTermType) ? ruleTermType : termType;
      if (coerced.proposal) {
        proposals.push({
          ...coerced.proposal,
          termType: targetTermType,
          itemIndex: item.item_index,
          fieldPath: `$.items[${Number(item.item_index) - 1}].fields.${targetTermType}`,
        });
      }
      const nextValue = isIndexedValue(fieldValue) ? fieldValue.value : fieldValue;
      if (nextValue === null || nextValue === undefined || nextValue === "") continue;
      const outputValue = retargetFieldDictionaryTermType(nextValue, targetTermType);
      if (Object.prototype.hasOwnProperty.call(nextFields, targetTermType)) {
        nextFields[targetTermType] = mergeFieldValue(nextFields[targetTermType], outputValue);
      } else {
        nextFields[targetTermType] = outputValue;
      }
    }
    if (Object.keys(nextFields).length > 0) {
      item.fields = await applyMasterDataMatches(nextFields, normalized.warnings);
    }
  }
  normalized.dictionaryProposals = {
    items: normalized.items.map((item: any) => ({
      itemIndex: item.item_index,
      proposals: proposals.filter((proposal) => Number(proposal.itemIndex) === Number(item.item_index)),
    })),
    proposals,
  };
  return normalized;
}

function retargetFieldDictionaryTermType(value: unknown, termType: string): unknown {
  if (Array.isArray(value)) return value.map((item) => retargetFieldDictionaryTermType(item, termType));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next = { ...record };
  if (Object.prototype.hasOwnProperty.call(next, "value")) {
    next.value = retargetFieldDictionaryTermType(next.value, termType);
  }
  if (record.dictionary && typeof record.dictionary === "object" && !Array.isArray(record.dictionary)) {
    next.dictionary = { ...(record.dictionary as Record<string, unknown>), term_type: termType };
  }
  return next;
}

function shouldPreserveLayerStructureValue(rawField: NormalizedRawField, termType: string): boolean {
  if (termType !== "plastic_material" && termType !== "layer_role") return false;
  const evidence = rawField.evidence && typeof rawField.evidence === "object" ? rawField.evidence as Record<string, unknown> : {};
  return evidence.splitRule === "layer_material_structure_split";
}

async function applyMasterDataMatches(
  fields: Record<string, unknown>,
  warnings: NormalizedWarning[],
): Promise<Record<string, unknown>> {
  const next = { ...fields };
  for (const [termType, value] of Object.entries(next)) {
    if (!isProductConfigAgentModelTermType(termType)) continue;
    if (!hasDictionaryMatch(value)) continue;
    const rawValue = scalarText(extractFieldValue(value));
    if (!rawValue) continue;
    const match = await safeMasterDataCall(
      () => productConfigAgentMasterDataService.matchModel({ termType, rawValue }),
      warnings,
      { termType, rawValue, stage: "model" },
    );
    if (!match) continue;
    next[termType] = attachMasterDataMatch(value, match);
    if (!match.matched) {
      warnings.push({
        type: "master_data_model_no_match",
        message: "主数据型号未匹配",
        evidence: { termType, rawValue, source: match.source },
      });
    }
  }

  for (const termType of ["filter_model", "metering_pump_model"] as const) {
    if (!isProductConfigAgentModelTermType(termType)) continue;
    if (!Object.prototype.hasOwnProperty.call(next, termType)) continue;
    const current = next[termType] as any;
    if (current?.masterDataMatch?.matched === true) continue;
    const attributes = Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, flattenFieldValues(value)]),
    );
    const result = await safeMasterDataCall(
      () => productConfigAgentMasterDataService.matchModelByAttributes({ termType, attributes }),
      warnings,
      { termType, stage: "attributes" },
    );
    if (!result) continue;
    if (result.reason === "insufficient_attributes") continue;
    if (result.masterDataMatch.matched) {
      next[termType] = attachMasterDataMatch(next[termType] ?? (result.masterDataMatch as any).model ?? "", result.masterDataMatch);
      warnings.push({
        type: "master_data_attribute_match_applied",
        message: "已按属性唯一匹配主数据型号",
        evidence: { termType, masterDataMatch: result.masterDataMatch },
      });
    } else {
      warnings.push({
        type:
          result.reason === "multiple_matches"
            ? "master_data_attribute_multiple_matches"
            : "master_data_attribute_no_match",
        message: "主数据属性匹配未唯一命中",
        evidence: { termType, reason: result.reason, candidateCount: result.candidateCount },
      });
    }
  }
  return next;
}

function hasDictionaryMatch(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDictionaryMatch);
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as any).dictionary,
  );
}

async function safeMasterDataCall<T>(
  fn: () => Promise<T>,
  warnings: NormalizedWarning[],
  evidence: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    warnings.push({
      type: "master_data_match_unavailable",
      message: "主数据匹配暂不可用",
      evidence: {
        ...evidence,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

function attachMasterDataMatch(value: unknown, match: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => attachMasterDataMatch(item, match));
  if (value && typeof value === "object") return { ...(value as Record<string, unknown>), masterDataMatch: match };
  return { value, masterDataMatch: match };
}

function extractFieldValue(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return record.value ?? record.raw_value ?? record.display_name ?? value;
  }
  return value;
}

function flattenFieldValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenFieldValues);
  const extracted = extractFieldValue(value);
  if (extracted === value) return [value].filter((item) => item !== undefined && item !== null);
  return flattenFieldValues(extracted);
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;
    result[normalizedKey] = normalizeNestedValue(nested);
  }
  return result;
}

export function normalizeWarnings(value: unknown): NormalizedWarning[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { type: "llm_warning", message: item };
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return {
          type: typeof record.type === "string" ? record.type : "llm_warning",
          message: typeof record.message === "string" ? record.message : JSON.stringify(item),
          ...(Object.prototype.hasOwnProperty.call(record, "evidence") ? { evidence: record.evidence } : {}),
        };
      }
      return { type: "llm_warning", message: String(item) };
    })
    .filter((item) => item.message || item.type);
}

export function parseIndexedInstanceFieldName(fieldName: string): { baseFieldName: string; instanceIndex: number } | null {
  const trimmed = fieldName.trim();
  const match = trimmed.match(/^(.+?)(?:[\s_-]*(?:#|第)?(\d+)(?:组|号|段|层|区)?)$/);
  if (!match) return null;
  const baseFieldName = normalizeKey(match[1]);
  const instanceIndex = Number(match[2]);
  if (!baseFieldName || !Number.isFinite(instanceIndex) || instanceIndex <= 0) return null;
  return { baseFieldName, instanceIndex };
}

function normalizeItemShape(value: unknown, fallbackIndex: number) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? (value as any) : {};
  const rawFields = Array.isArray(item.raw_fields) ? item.raw_fields : fieldsToRawFields(item.fields ?? {}, fallbackIndex);
  return {
    item_index: Number.isFinite(Number(item.item_index)) ? Number(item.item_index) : fallbackIndex,
    item_name: scalarText(item.item_name ?? item.name ?? item.product_name),
    product_type_hint: item.product_type_hint ?? item.item_type_hint ?? null,
    item_quantity: normalizeItemQuantity(item.item_quantity ?? item.quantity),
    fields: Array.isArray(item.fields) ? {} : normalizeRecord(item.fields ?? {}),
    raw_fields: rawFields,
    warnings: normalizeWarnings(item.warnings),
  };
}

function normalizeItemQuantity(value: unknown): string | null {
  const raw = scalarText(unwrapLlmValue(value));
  if (!raw) return null;
  if (/^(?:共|总计)?[（(]\s*[）)](?:套|件|台|个)?$/u.test(raw.replace(/\s+/g, ""))) return null;
  const numeric = raw.match(/^\s*(\d+(?:\.\d+)?)\s*(?:套|件|台|个|pcs?|sets?)?\s*$/iu);
  if (numeric) return numeric[1];
  const compact = raw.replace(/\s+/g, "");
  const chinese = compact.match(/^([零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟]+)(?:套|件|台|个)?$/u);
  if (!chinese) return raw;
  const parsed = parseChineseInteger(chinese[1]);
  return parsed === null ? raw : String(parsed);
}

function parseChineseInteger(value: string): number | null {
  if (CHINESE_QUANTITY_DIGITS.has(value)) return CHINESE_QUANTITY_DIGITS.get(value) ?? null;
  const normalized = value
    .replace(/拾/g, "十")
    .replace(/佰/g, "百")
    .replace(/仟/g, "千");
  let total = 0;
  let current = 0;
  for (const char of normalized) {
    const digit = CHINESE_QUANTITY_DIGITS.get(char);
    if (digit !== undefined) {
      current = digit;
      continue;
    }
    const unit = char === "十" ? 10 : char === "百" ? 100 : char === "千" ? 1000 : 0;
    if (!unit) return null;
    total += (current || 1) * unit;
    current = 0;
  }
  return total + current;
}

function normalizeDocumentInfo(value: unknown, warnings: NormalizedWarning[]) {
  const record = normalizeRecord(value);
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    const routed = routeDocumentInfoKey(key);
    const normalizedValue = normalizeStructuredValue(nested, key, warnings);
    if (normalizedValue === null || normalizedValue === undefined || normalizedValue === "") continue;
    if (typeof normalizedValue === "string" && /^(?:unknown|未知|未明确)$/iu.test(normalizedValue.trim())) continue;
    result[routed] = normalizedValue;
    if (routed !== key) result[key] = normalizedValue;
  }
  return result;
}

function normalizeFields(
  rawFields: NormalizedRawField[],
  warnings: NormalizedWarning[],
  itemIndex: number,
  productTypeHint?: string | null,
) {
  const fields: Record<string, unknown> = {};
  for (const rawField of rawFields) {
    if (isTraceOnlyRawField(rawField)) continue;
    const key = normalizeFieldKey(rawField.field_name);
    if (!key) continue;
    const structured = normalizeStructuredValue(rawField.value, key, warnings);
    const { key: targetKey, value: normalizedValue } = applyFieldNameRules(rawField, structured, {
      itemIndex,
      productTypeHint,
      warnings,
    });
    if (isIndexedValue(normalizedValue)) {
      const existing = Array.isArray(fields[targetKey]) ? (fields[targetKey] as unknown[]) : [];
      existing[normalizedValue.instanceIndex - 1] = normalizedValue.value;
      fields[targetKey] = existing;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(fields, targetKey)) {
      fields[targetKey] = mergeFieldValue(fields[targetKey], normalizedValue);
    } else {
      fields[targetKey] = normalizedValue;
    }
  }
  return normalizeMergedFieldValues(mergePartFields(fields, warnings, itemIndex), warnings);
}

function isIndexedValue(value: unknown): value is { value: unknown; instanceIndex: number } {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "instanceIndex" in value &&
      Number.isFinite(Number((value as any).instanceIndex)),
  );
}

function normalizeMergedFieldValues(fields: Record<string, unknown>, warnings: NormalizedWarning[]) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      normalized[key] = normalizeStructuredValue(value, key, warnings);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function normalizeRawField(value: unknown, fallbackItemIndex: number): NormalizedRawField {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { item_index: fallbackItemIndex, field_name: "value", value };
  }
  const record = value as Record<string, unknown>;
  const fieldName = scalarText(record.field_name ?? record.name ?? record.key) ?? "value";
  return {
    item_index: Number.isFinite(Number(record.item_index)) ? Number(record.item_index) : fallbackItemIndex,
    field_name: normalizeLegacyFieldName(fieldName),
    value: record.value ?? record.raw_value ?? record.text ?? null,
    selected: typeof record.selected === "boolean" ? record.selected : undefined,
    original: record.original === true,
    raw_text: scalarText(record.raw_text),
    split_fields: Array.isArray(record.split_fields) ? record.split_fields as Array<Record<string, unknown>> : undefined,
    qualifier: record.qualifier,
    evidence: record.evidence,
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : undefined,
  };
}

function normalizeLegacyFieldName(fieldName: string): string {
  return LEGACY_FIELD_NAME_ALIASES.get(fieldName.trim()) ?? fieldName;
}

function normalizeStructuredValue(value: unknown, fieldName: string, warnings: NormalizedWarning[]): unknown {
  const unwrapped = unwrapLlmValue(value);
  if (typeof unwrapped !== "string") return normalizeNestedValue(unwrapped);
  const trimmed = unwrapped.trim();
  if (!trimmed) return null;
  if (/\[(SEL| )\]/.test(trimmed)) return splitSelections(trimmed);
  if (/(?:合同|订单|编号|客户|国家|contract_number|order_number|product_number|customer_id|country)/iu.test(fieldName)) return trimmed;
  if (/date|日期|交期/u.test(fieldName)) return trimmed;
  if (/单位$/u.test(fieldName)) return trimmed;
  const range = parseRange(trimmed);
  if (range) return range;
  const numberUnit = parseNumberUnit(trimmed);
  if (numberUnit) return numberUnit;
  const selections = splitSelections(trimmed);
  if (selections.length > 1) return selections;
  if (/备注|说明|note/i.test(fieldName)) return { value: trimmed, kind: "note" };
  const danglingUnchecked = /\[ \]/.test(trimmed);
  if (danglingUnchecked) {
    warnings.push({ type: "unchecked_option_ignored", message: "未选中选项不会作为最终值", evidence: { fieldName, value: trimmed } });
  }
  return trimmed.replace(/\[(?:SEL| )\]\s*/g, "").trim();
}

function unwrapLlmValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "value")) return record.value;
  }
  return value;
}

function splitSelections(value: string) {
  const optionMatches = [...value.matchAll(/\[(SEL| )\]\s*([^\n\r]+)/g)];
  if (optionMatches.length) {
    return optionMatches
      .filter((match) => match[1] === "SEL")
      .map((match) => match[2].replace(/option_set:.*/i, "").trim())
      .filter(Boolean);
  }
  if (!/[、,，;；/]/.test(value)) return [];
  return value
    .split(/[、,，;；/]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRange(value: string) {
  const dualUnitMatch = value.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Zμ%°℃㎜\u4e00-\u9fa5/]+)\s*(?:-|~|～|至|到)\s*(-?\d+(?:\.\d+)?)\s*(?:[a-zA-Zμ%°℃㎜\u4e00-\u9fa5/]+)?/);
  if (dualUnitMatch) {
    const unit = normalizeUnit(dualUnitMatch[2]);
    return {
      min: Number(dualUnitMatch[1]),
      max: Number(dualUnitMatch[3]),
      ...(unit ? { unit } : {}),
      raw_value: value,
    };
  }
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*(?:-|~|～|至|到)\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Zμ%°℃㎜\u4e00-\u9fa5]*)/);
  if (!match) return null;
  const unit = normalizeUnit(match[3]);
  return {
    min: Number(match[1]),
    max: Number(match[2]),
    ...(unit ? { unit } : {}),
    raw_value: value,
  };
}

function parseNumberUnit(value: string) {
  if (/[°度]\s*(?:阻流棒|斜挤出|安装)/u.test(value)) return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Zμ%°℃㎜\u4e00-\u9fa5]+(?:\s*\/\s*[a-zA-Zμ%°℃㎜\u4e00-\u9fa5]+)?)$/);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: normalizeUnit(match[2]) ?? match[2],
    raw_value: value,
  };
}

function normalizeUnit(unit: string | undefined) {
  if (!unit?.trim()) return null;
  const normalized = unit.trim().replace(/\s*\/\s*/g, "/");
  return UNIT_ALIASES.get(normalized) ?? normalized;
}

function normalizeProductTypeHint(
  value: unknown,
  context?: { itemName?: string | null; itemIndex?: number; warnings?: NormalizedWarning[] },
) {
  const raw = scalarText(unwrapLlmValue(value));
  if (!raw || raw.toLowerCase() === "unknown" || raw === "未知") {
    const inferred = inferProductTypeFromItemName(context?.itemName);
    if (inferred) {
      context?.warnings?.push({
        type: "product_type_inferred_from_item_name",
        message: "产品类型已从 item_name 推断",
        evidence: { itemIndex: context.itemIndex, itemName: context.itemName, productType: inferred },
      });
      return { value: inferred, raw_value: context?.itemName ?? raw ?? null, confidence: 0.78, source: "item_name" };
    }
    return { value: "unknown", raw_value: raw ?? null, confidence: 0 };
  }
  const normalized = PRODUCT_TYPE_ALIASES.get(raw) ?? PRODUCT_TYPE_ALIASES.get(raw.toLowerCase()) ?? raw;
  return { value: normalized, raw_value: raw, confidence: normalized === raw ? 0.7 : 0.9 };
}

function inferProductTypeFromItemName(itemName: string | null | undefined): string | null {
  const compactName = String(itemName ?? "").replace(/\s+/g, "");
  if (!compactName) return null;
  const matches = [...PRODUCT_TYPE_ALIASES.entries()]
    .filter(([alias]) => compactName.includes(alias))
    .sort((left, right) => right[0].length - left[0].length);
  return matches[0]?.[1] ?? null;
}

function mergeFieldValue(existing: unknown, next: unknown) {
  if (Array.isArray(existing)) return [...existing, next];
  return [existing, next];
}

function fieldsToRawFields(fields: unknown, itemIndex: number): NormalizedRawField[] {
  if (Array.isArray(fields)) return fields.map((field) => normalizeRawField(field, itemIndex));
  const record = normalizeRecord(fields);
  return Object.entries(record).map(([field_name, value]) => ({ item_index: itemIndex, field_name, value }));
}

function isTraceOnlyRawField(rawField: NormalizedRawField): boolean {
  if (rawField.original === true) return true;
  const evidence = rawField.evidence && typeof rawField.evidence === "object" ? rawField.evidence as Record<string, unknown> : {};
  if (evidence.ruleId === "split_original_retained" || evidence.type === "split_original_retained") return true;
  return false;
}

function normalizeNestedValue(nested: unknown): unknown {
  if (typeof nested === "string") return nested.trim();
  if (Array.isArray(nested)) return nested.map((item) => (typeof item === "string" ? item.trim() : normalizeNestedValue(item)));
  if (nested && typeof nested === "object") return normalizeRecord(nested);
  return nested;
}

function normalizeKey(key: string): string {
  return String(key ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[：:]+$/g, "")
    .trim();
}

function scalarText(value: unknown): string | null {
  const unwrapped = unwrapLlmValue(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  const text = String(unwrapped).trim();
  return text || null;
}

function nextIndex(used: Set<number>): number {
  let index = 1;
  while (used.has(index)) index += 1;
  return index;
}

function chooseTermType(termTypes: string[]): string {
  return [...termTypes].sort((left, right) => right.length - left.length)[0];
}

async function normalizeDictionaryValue(params: {
  termType: string;
  rawValue: unknown;
  valueKind: DictionaryValueKind;
  collectCandidates?: boolean;
  warnings: NormalizedWarning[];
}): Promise<{ value: unknown; proposal?: Record<string, unknown> }> {
  const rawText = scalarText(params.rawValue);
  if (!rawText) return { value: normalizeNestedValue(params.rawValue) };
  if (params.valueKind === "number" || params.valueKind === "number_unit") {
    const numberUnit = parseNumberUnit(rawText) ?? parseRange(rawText);
    if (numberUnit && typeof numberUnit === "object" && "unit" in numberUnit) {
      const unitMatch = await dictionaryMatcherService.matchUnit(String((numberUnit as any).unit));
      if (unitMatch.matched) {
        return { value: { ...numberUnit, unit: unitMatch.canonicalUnit, display_unit: unitMatch.displayUnit } };
      }
      return {
        value: numberUnit,
        proposal: {
          candidateType: "unit",
          termType: "unit",
          rawValue: String((numberUnit as any).unit),
          reason: "missing_unit_alias",
        },
      };
    }
    const numeric = Number(rawText);
    if (Number.isFinite(numeric)) return { value: numeric };
  }
  if (params.valueKind === "boolean") {
    const booleanValue = parseBoolean(rawText);
    if (booleanValue !== null) return { value: booleanValue };
  }
  if (params.valueKind === "date") {
    const dateValue = Date.parse(rawText);
    if (Number.isFinite(dateValue)) return { value: rawText };
  }
  if (params.valueKind === "enums") {
    const values = splitSelections(rawText);
    if (values.length > 1) {
      const matched = [];
      const missing = [];
      const retained = [];
      for (const value of values) {
        const cleaned = normalizeEnumCandidateText(value, params.termType);
        if (!cleaned || isNoisyEnumCandidateValue(cleaned, params.termType)) continue;
        retained.push(cleaned);
        const match = await dictionaryMatcherService.matchValue(params.termType, cleaned);
        if (match.matched) matched.push(match.canonicalValue ?? cleaned);
        else missing.push(cleaned);
      }
      return {
        value: matched.length ? matched : retained.length ? retained : values,
        proposal: missing.length
          ? {
              candidateType: "value",
              termType: params.termType,
              rawValue: missing.join("、"),
              reason: "missing_multi_value_alias",
            }
          : undefined,
      };
    }
  }
  if (params.valueKind === "enum" || params.valueKind === "enums" || params.valueKind === "text") {
    const isEnumKind = params.valueKind === "enum" || params.valueKind === "enums";
    const matchText = isEnumKind ? normalizeEnumCandidateText(rawText, params.termType) : rawText;
    if (!matchText || (isEnumKind && isNoisyEnumCandidateValue(matchText, params.termType))) {
      return { value: null };
    }
    const match = await dictionaryMatcherService.matchValue(params.termType, matchText);
    if (match.matched) {
      return {
        value: {
          value: match.canonicalValue ?? matchText,
          raw_value: rawText,
          display_name: match.displayName,
          dictionary: {
            term_type: params.termType,
            term_id: match.termId ? String(match.termId) : undefined,
            alias_id: match.aliasId ? String(match.aliasId) : undefined,
            match_method: match.matchMethod,
            confidence: match.confidence,
            risk_level: match.riskLevel,
          },
        },
      };
    }
    return {
      value: isEnumKind ? matchText : normalizeStructuredValue(matchText, params.termType, params.warnings),
      proposal:
        params.valueKind === "enum" || params.valueKind === "enums" || params.collectCandidates === true
          ? {
              candidateType: "value",
              termType: params.termType,
              rawValue: matchText,
              reason: "missing_value_alias",
            }
          : undefined,
    };
  }
  return { value: normalizeStructuredValue(rawText, params.termType, params.warnings) };
}

function normalizeEnumCandidateText(value: string, termType?: string): string {
  let text = value.trim().replace(/^[、，,;；\s]+/u, "").replace(/\s+/g, " ");
  text = text.replace(/^(?:其他|其它)\s*[：:]?\s*/u, "").trim();
  const application = text.match(/^应用于[“"']?(.+?)[”"']?领域$/u)?.[1]?.trim();
  if (application) text = application;
  if (termType === "application") {
    text = text
      .replace(/^[、，,;；/]+/u, "")
      .replace(/^\+?\d+%左右的/u, "")
      .replace(/^\d+(?:\.\d+)?\s*mm\s*/iu, "")
      .replace(/^用于/u, "")
      .replace(/\b(?:PP|PS|PMMA|PC|EVA|POE|GPPS)\b/giu, "")
      .replace(/[（(].*?[）)]/gu, "")
      .replace(/模头$/u, "")
      .trim();
  }
  if (termType === "plastic_material") {
    if (/(?:\bmfi|\bat\s*\d|g\s*\/?\s*10\s*min|°c|℃)/iu.test(text)) return "";
    const material = text.match(/\b(?:WPC|PET|CPE|PP|PVDF|LDPE|LLDPE|HDPE|PVC|ABS|PE|EVA|POE|PC|GPPS|PMMA|PS)\b/iu)?.[0];
    if (material) text = material.toUpperCase();
  }
  if (termType === "product_material") {
    text = text
      .replace(/^[A-DＡ-Ｄ]\s*/iu, "")
      .replace(/^[（(]\s*/, "")
      .replace(/[）)]$/u, "")
      .replace(/钢材|不锈钢/gu, "")
      .trim();
    if (/^(?:1\.)?2311A?$/iu.test(text)) text = "1.2311A";
    if (/^3cr13$/iu.test(text)) text = "3Cr13";
  }
  if (termType === "feed_inlet_method") {
    text = text
      .replace(/[（(]\s*与?\d+.*?[）)]/gu, "")
      .replace(/与?\d+\s*互配使用/gu, "")
      .replace(/需方提供尺寸/u, "")
      .trim();
    if (/形状或不同位置进料/u.test(text)) text = "形状或不同位置进料";
  }
  if (termType === "hydraulic_valve_type") text = text.replace(/液压站$/u, "").trim();
  if (termType === "sensor_source") {
    if (/国产/u.test(text)) text = "国产";
    else if (/进口/u.test(text)) text = "进口";
  }
  if (termType === "connection_drawing_status") {
    if (/需方客户提供图纸/u.test(text)) text = "需方客户提供图纸";
    else if (/按原图纸/u.test(text)) text = "按原图纸";
  }
  if (termType === "die_mounting_method") text = text.replace(/[（(].*?[）)]/gu, "").split(/[，,;；]/u)[0]?.trim() ?? text;
  if (termType === "heating_phase" && text === "单") text = "单相";
  if (termType === "heating_phase") text = text.replace(/[（(）)\s]/gu, "");
  if (termType === "lip_adjustment_method") {
    text = text.replace(/^(?:上|下)(?:模唇|模|唇)?/u, "").replace(/^模唇/u, "").trim();
    if (/自动.*推.*拉式/u.test(text)) text = "自动推、拉式微调";
    if (/减力.*推.*拉式机械装置/u.test(text)) text = "减力推拉式机械装置";
  }
  if (termType === "extrusion_fine_adjustment_direction" && /45\s*(?:°|度)?\s*挤出微调朝下/u.test(text)) {
    text = "45°挤出微调朝下";
  }
  return text;
}

function isNoisyEnumCandidateValue(value: string, termType?: string): boolean {
  const text = value.trim();
  const normalized = text.toLowerCase();
  if (!text) return true;
  if (["at", "hz", "v", "kg", "min", "mfi"].includes(normalized)) return true;
  if (/^[、，,;；/]+$/u.test(text)) return true;
  if (/^[0-9.\-~～至到\s]+(?:°c|℃|kg|g|mm|cm|m|min|hz|v)?$/iu.test(text)) return true;
  if (/^[（(]\s*[）)]$/u.test(text) || /^[（(]\s*[^A-Za-z0-9\u4e00-\u9fa5]*\s*[）)]$/u.test(text)) return true;
  if (termType === "heating_phase" && !/^(?:单相|三相)$/u.test(text)) return true;
  if (termType === "application" && /^(?:国内|出口)?使用$/u.test(text)) return true;
  if (termType === "application" && text === "板材") return true;
  if (termType === "application" && /^[A-DＡ-Ｄ]$/iu.test(text)) return true;
  if (termType === "application" && (text.length > 80 || /(?:螺纹套|液压手板孔|油管接头|防撞块)/u.test(text))) return true;
  if (termType === "feed_inlet_method" && /^(?:形状|进料口)$/u.test(text)) return true;
  if (termType === "feed_inlet_method" && !text) return true;
  if (termType === "extruder_orientation" && /按.*图纸.*为准/u.test(text)) return true;
  if (termType === "extrusion_fine_adjustment_direction" && /^\d+(?:\.\d+)?$/u.test(text)) return true;
  if (termType === "plastic_material" && /(?:\bmfi|\bat\s*\d|g\s*\/?\s*10\s*min|°c|℃)/iu.test(text)) return true;
  if (termType === "plastic_material" && /类似沥青/u.test(text)) return true;
  if (/(?:提供图纸日期|图纸接收人签名|^\s*国家\s*[（(])/u.test(text)) return true;
  return false;
}

function metadataCollectCandidates(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as any).collectCandidates === true);
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "是", "有", "需要", "选中"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "否", "无", "不需要", "未选"].includes(normalized)) return false;
  return null;
}
