import { requestRoutedChatJson } from "../../../ai/llm/index.js";
import type { LlmDictionaryContext } from "../dictionary/matcher.service.js";
import {
  coerceLlmExtractionResult as coerceLlmExtractionResultWithRules,
  normalizeExtraction as normalizeExtractionWithRules,
} from "../normalization/index.js";

export const TWO_STAGE_PROMPT_VERSION = "prisma-two-stage-v2";
const MAX_ITEM_DICTIONARY_TERM_TYPES = 120;

export type PlannedExtractionResult = {
  plan: unknown;
  extraction: unknown;
  normalized: unknown;
  warnings: unknown[];
};

export type PlannedExtractionProvider = "routed_chat_json" | "single_stage_fallback";

export type DocumentPlanItem = {
  item_index: number;
  item_name?: string | null;
  product_type_hint?: string | null;
  product_type_raw?: string | null;
  item_quantity?: string | null;
  block_ids?: string[];
  llm_text_ranges?: Array<{ start_line?: number; end_line?: number }>;
  related_item_indexes?: number[];
  relation_note?: string | null;
};

export type DocumentPlan = {
  document_info?: Record<string, unknown>;
  items: DocumentPlanItem[];
  global_context?: Record<string, unknown> | string | null;
  warnings?: unknown[];
};

export type BatchPlanItemInput = {
  documentId: number;
  extractionResultId: number;
  fileName?: string;
  sheetName?: string;
  plan: DocumentPlan;
  item: DocumentPlanItem;
  llmText: string;
  blocksJson?: any;
};

export type BatchItemExtractResult = {
  documentId: number;
  extractionResultId: number;
  itemIndex: number;
  result: StrictLlmExtractionResult;
};

export async function runPlannedExtraction(params: {
  fileName?: string | null;
  blocksJson: unknown;
  llmModel?: string;
  forceSingleStage?: boolean;
}): Promise<PlannedExtractionResult> {
  const llmText = extractLlmText(params.blocksJson);
  const plan = params.forceSingleStage
    ? buildFallbackPlan(params.blocksJson)
    : await requestPlan({
        fileName: params.fileName,
        blocksJson: params.blocksJson,
        llmText,
        llmModel: params.llmModel,
  });
  const extraction = validatePlannedExtractionContent(await requestExtraction({
    fileName: params.fileName,
    blocksJson: params.blocksJson,
    llmText,
    plan,
    llmModel: params.llmModel,
  }));
  const coerced = coerceLlmExtractionResultWithRules(extraction);
  return {
    plan,
    extraction: coerced,
    normalized: normalizeExtractionWithRules(coerced),
    warnings: Array.isArray((coerced as any)?.warnings) ? (coerced as any).warnings : [],
  };
}

export function normalizeDocumentPlan(value: unknown): DocumentPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Document plan must be an object");
  }
  const root = value as Record<string, any>;
  const items = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.document_plan?.items)
      ? root.document_plan.items
      : [];
  if (!items.length) throw new Error("Document plan must include at least one item");
  return {
    document_info: normalizeRecord(root.document_info ?? root.document_plan?.document_info ?? {}),
    global_context: root.global_context ?? root.document_plan?.global_context ?? null,
    warnings: normalizeWarnings(root.warnings),
    items: items.map((item: any, index: number) => ({
      item_index: Number.isFinite(Number(item?.item_index)) ? Number(item.item_index) : index + 1,
      item_name: trimOrNull(item?.item_name ?? item?.raw_product_name),
      product_type_hint: trimOrNull(item?.product_type_hint),
      product_type_raw: trimOrNull(item?.product_type_raw),
      item_quantity: trimOrNull(item?.item_quantity),
      block_ids: Array.isArray(item?.block_ids) ? item.block_ids.filter((id: unknown) => typeof id === "string") : [],
      llm_text_ranges: Array.isArray(item?.llm_text_ranges)
        ? item.llm_text_ranges.map((range: any) => ({
            start_line: Number.isFinite(Number(range?.start_line)) ? Number(range.start_line) : undefined,
            end_line: Number.isFinite(Number(range?.end_line)) ? Number(range.end_line) : undefined,
          }))
        : [],
      related_item_indexes: Array.isArray(item?.related_item_indexes)
        ? item.related_item_indexes.map((itemIndex: unknown) => Number(itemIndex)).filter(Number.isFinite)
        : [],
      relation_note: trimOrNull(item?.relation_note),
    })),
  };
}

export function numberLlmText(llmText: string): string {
  return llmText
    .split(/\r?\n/g)
    .map((line, index) => `${String(index + 1).padStart(4, "0")}: ${line}`)
    .join("\n");
}

export function buildItemInputText(
  llmText: string,
  blocksJson: any,
  item: DocumentPlanItem,
): { text: string; warnings: unknown[]; rangeSource: "physical_line" | "excel_row" | "block_id" | "full_text" } {
  const byRange = sliceLlmTextByRanges(llmText, item.llm_text_ranges);
  if (byRange.trim()) {
    if (textMatchesItemRange(byRange, item)) return { text: byRange, warnings: [], rangeSource: "physical_line" };
    const mappedByRange = sliceLlmTextByRanges(llmText, mapExcelRowRangesToPhysicalRanges(llmText, item.llm_text_ranges));
    if (mappedByRange.trim() && textMatchesItemRange(mappedByRange, item)) {
      return {
        text: mappedByRange,
        warnings: [
          rangeWarning({
            type: "plan_range_excel_row_mapped",
            message: "planner range looked like Excel Row numbers and was mapped to numbered_llm_text physical line numbers",
            item,
            evidence: { original_ranges: item.llm_text_ranges },
          }),
        ],
        rangeSource: "excel_row",
      };
    }
    return {
      text: byRange,
      warnings: [
        rangeWarning({
          type: "plan_range_suspected_misaligned",
          message: "planner range did not appear to include the planned item anchor; using original range with warning",
          item,
          evidence: { original_ranges: item.llm_text_ranges },
        }),
      ],
      rangeSource: "physical_line",
    };
  }
  const mappedByRange = sliceLlmTextByRanges(llmText, mapExcelRowRangesToPhysicalRanges(llmText, item.llm_text_ranges));
  if (mappedByRange.trim() && textMatchesItemRange(mappedByRange, item)) {
    return {
      text: mappedByRange,
      warnings: [
        rangeWarning({
          type: "plan_range_excel_row_mapped",
          message: "planner range looked like Excel Row numbers and was mapped to numbered_llm_text physical line numbers",
          item,
          evidence: { original_ranges: item.llm_text_ranges },
        }),
      ],
      rangeSource: "excel_row",
    };
  }
  const byBlocks = selectBlocksByIds(blocksJson, item.block_ids);
  if (byBlocks.trim()) return { text: byBlocks, warnings: [], rangeSource: "block_id" };
  return {
    text: llmText,
    warnings: [
      rangeWarning({
        type: "plan_range_suspected_misaligned",
        message: "planner item had no usable llm_text_ranges or block_ids; falling back to full text",
        item,
      }),
    ],
    rangeSource: "full_text",
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
  return results;
}

export function reindexDuplicateResultItems(params: {
  llmResult: any;
  existingExtractionJson?: any;
}): any {
  const items = Array.isArray(params.llmResult?.extraction?.items) ? params.llmResult.extraction.items : [];
  const usedIndexes = new Set<number>();
  for (const item of [...(Array.isArray(params.existingExtractionJson?.items) ? params.existingExtractionJson.items : []), ...items]) {
    const itemIndex = Number(item?.item_index);
    if (Number.isFinite(itemIndex)) usedIndexes.add(itemIndex);
  }
  const duplicateGroups = new Map<number, any[]>();
  for (const item of items) {
    const itemIndex = Number(item.item_index);
    duplicateGroups.set(itemIndex, [...(duplicateGroups.get(itemIndex) ?? []), item]);
  }
  const warnings = (params.llmResult.warnings ??= []);
  const reindexedItems: any[] = [];
  for (const [parentItemIndex, groupItems] of duplicateGroups.entries()) {
    if (groupItems.length <= 1) {
      reindexedItems.push(groupItems[0]);
      continue;
    }
    const assignedItemIndexes = groupItems.map((item, offset) => {
      if (offset === 0) return parentItemIndex;
      const assigned = nextIndexWithMark(usedIndexes);
      item.item_index = assigned;
      return assigned;
    });
    warnings.push({
      type: "item_instance_split_from_indexed_fields",
      message: "同一 planned item 返回了多个 items，已为后续 item 分配未占用 item_index，避免合并覆盖",
      evidence: {
        parentItemIndex,
        assignedItemIndexes,
        sourceFieldNames: groupItems.flatMap((item) =>
          (Array.isArray(item?.raw_fields) ? item.raw_fields : []).map((field: any) => String(field?.field_name ?? "")),
        ),
      },
    });
    reindexedItems.push(...groupItems);
  }
  params.llmResult.extraction.items = reindexedItems.sort((left, right) => Number(left.item_index) - Number(right.item_index));
  return params.llmResult;
}

export function boundaryWarningItemIndexes(warnings: unknown, fallbackItemIndexes: number[]): Set<number> {
  if (!Array.isArray(warnings)) return new Set();
  const result = new Set<number>();
  let hasUnscopedBoundaryWarning = false;
  for (const warning of warnings) {
    const type = warning && typeof warning === "object" && !Array.isArray(warning) ? String((warning as Record<string, unknown>).type ?? "") : "";
    if (type !== "current_item_blocks_mismatch") continue;
    const evidence = (warning as Record<string, unknown>).evidence;
    const itemIndex =
      evidence && typeof evidence === "object" && !Array.isArray(evidence)
        ? Number((evidence as Record<string, unknown>).item_index)
        : Number((warning as Record<string, unknown>).item_index);
    if (Number.isFinite(itemIndex)) result.add(itemIndex);
    else hasUnscopedBoundaryWarning = true;
  }
  if (hasUnscopedBoundaryWarning && !result.size) {
    for (const itemIndex of fallbackItemIndexes) result.add(itemIndex);
  }
  return result;
}

export function coerceLlmExtractionResult(value: unknown): unknown {
  const root = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as any) } : {};
  const extraction = root.extraction && typeof root.extraction === "object" ? root.extraction : root;
  const items = Array.isArray(extraction.items)
    ? extraction.items
    : Array.isArray(root.items)
      ? root.items
      : [];
  return {
    ...root,
    extraction: {
      document_info: normalizeRecord(extraction.document_info ?? root.document_info ?? {}),
      items: items.map((item: unknown, index: number) => normalizeItem(item, index + 1)),
    },
    warnings: normalizeWarnings(root.warnings),
  };
}

export function normalizeExtraction(value: unknown): unknown {
  const coerced = coerceLlmExtractionResult(value) as any;
  const items = Array.isArray(coerced.extraction?.items) ? coerced.extraction.items : [];
  const usedIndexes = new Set<number>();
  const normalizedItems = items.map((item: any, offset: number) => {
    let itemIndex = Number(item.item_index);
    if (!Number.isFinite(itemIndex) || itemIndex <= 0 || usedIndexes.has(itemIndex)) {
      itemIndex = nextIndex(usedIndexes);
    }
    usedIndexes.add(itemIndex);
    return {
      ...item,
      item_index: itemIndex,
      item_name: trimOrNull(item.item_name),
      fields: normalizeRecord(item.fields ?? {}),
      raw_fields: Array.isArray(item.raw_fields) ? item.raw_fields : fieldsToRawFields(item.fields ?? {}, offset),
    };
  });
  return {
    document_info: normalizeRecord(coerced.extraction?.document_info ?? {}),
    items: normalizedItems.sort((left: any, right: any) => left.item_index - right.item_index),
    warnings: normalizeWarnings(coerced.warnings),
  };
}

export type StrictLlmFieldValue = {
  value: string;
  evidence: unknown;
  confidence: number;
};

export type StrictLlmRawField = {
  field_name: string;
  value: string;
  selected?: boolean;
  raw_text?: string;
  evidence: unknown;
  confidence: number;
  qualifier?: Record<string, unknown>;
  split_fields?: Array<Record<string, unknown>>;
};

export type StrictLlmExtractionResult = {
  extraction: {
    document_info?: Record<string, StrictLlmFieldValue>;
    items: Array<{
      item_index: number;
      item_name?: StrictLlmFieldValue;
      item_quantity?: StrictLlmFieldValue;
      item_type_hint?: Record<string, unknown>;
      product_type_hint?: Record<string, unknown>;
      raw_fields: StrictLlmRawField[];
    }>;
  };
  warnings: Array<{ type: string; message: string; evidence?: unknown }>;
};

export function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const objectStart = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");
  const start = [objectStart, arrayStart].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const objectEnd = candidate.lastIndexOf("}");
  const arrayEnd = candidate.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  const jsonText = end >= start ? candidate.slice(start, end + 1) : candidate;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Unable to parse LLM JSON content: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validatePlannedExtractionContent(value: unknown): StrictLlmExtractionResult {
  return validateLlmExtractionResult(typeof value === "string" ? parseJsonContent(value) : value);
}

export function validateBatchPlannedExtractionContent(
  value: unknown,
  inputs: BatchPlanItemInput[],
): BatchItemExtractResult[] {
  const parsed = typeof value === "string" ? parseJsonContent(value) : value;
  if (!isObject(parsed)) throw new Error("Batch extraction JSON result must be an object");
  if (!Array.isArray(parsed.results)) throw new Error('Batch extraction JSON result is missing required field "results"');

  const inputKeys = new Set(inputs.map(batchInputKey));
  const inputsByKey = new Map(inputs.map((input) => [batchInputKey(input), input]));
  const seenKeys = new Set<string>();
  const results: BatchItemExtractResult[] = [];

  for (const [index, item] of parsed.results.entries()) {
    if (!isObject(item)) throw new Error(`results[${index}] must be an object`);
    const documentId = Number(item.documentId);
    const extractionResultId = Number(item.extractionResultId);
    const itemIndex = Number(item.item_index ?? item.itemIndex);
    if (!Number.isFinite(documentId) || !Number.isFinite(extractionResultId) || !Number.isFinite(itemIndex)) {
      throw new Error(`results[${index}] must include numeric documentId, extractionResultId, and item_index`);
    }
    const key = batchResultKey({ documentId, extractionResultId, itemIndex });
    if (!inputKeys.has(key)) throw new Error(`results[${index}] does not match any requested batch item: ${key}`);
    if (seenKeys.has(key)) throw new Error(`Duplicate batch result for ${key}`);
    seenKeys.add(key);

    const input = inputsByKey.get(key);
    const result = validateLlmExtractionResult({
      extraction: item.extraction,
      warnings: item.warnings,
    });
    result.extraction.items = normalizeMergedStrictItems(result.extraction.items, input ? [input.item, ...relatedPlanItems(input)] : []);
    results.push({ documentId, extractionResultId, itemIndex, result });
  }

  for (const key of inputKeys) {
    if (!seenKeys.has(key)) throw new Error(`Batch extraction result is missing requested item: ${key}`);
  }
  return results;
}

export function validateLlmExtractionResult(value: unknown): StrictLlmExtractionResult {
  if (!isObject(value)) throw new Error("LLM JSON result must be an object");
  const extraction = value.extraction;
  if (!isObject(extraction)) throw new Error('LLM JSON result is missing required field "extraction"');
  if (!Array.isArray(extraction.items)) throw new Error('LLM JSON result "extraction.items" must be an array');
  return {
    extraction: {
      ...(extraction.document_info === undefined || extraction.document_info === null
        ? {}
        : { document_info: validateDocumentInfo(extraction.document_info) }),
      items: extraction.items.map((item, itemIndex) => validateExtractionItem(item, itemIndex)),
    },
    warnings: validateStrictWarnings(value.warnings),
  };
}

export function selectPlannedExtractionProvider(params?: {
  forceSingleStage?: boolean;
  llmModel?: string | null;
}): PlannedExtractionProvider {
  if (params?.forceSingleStage) return "single_stage_fallback";
  return "routed_chat_json";
}

export function mapExtractionWarning(value: unknown) {
  if (typeof value === "string") {
    return { code: "llm_warning", type: "llm_warning", message: value, details: {} };
  }
  if (!isObject(value)) {
    return { code: "llm_warning", type: "llm_warning", message: String(value), details: {} };
  }
  const type = typeof value.type === "string" && value.type.trim() ? value.type.trim() : "llm_warning";
  return {
    code: typeof value.code === "string" && value.code.trim() ? value.code.trim() : type,
    type,
    message: typeof value.message === "string" ? value.message : type,
    itemIndex: numberOrUndefined(value.itemIndex ?? value.item_index ?? (value.evidence as any)?.item_index),
    fieldPath: typeof value.fieldPath === "string" ? value.fieldPath : typeof value.field_path === "string" ? value.field_path : undefined,
    details: Object.prototype.hasOwnProperty.call(value, "details")
      ? value.details
      : Object.prototype.hasOwnProperty.call(value, "evidence")
        ? value.evidence
        : {},
  };
}

export function mapExtractionWarnings(value: unknown): ReturnType<typeof mapExtractionWarning>[] {
  return (Array.isArray(value) ? value : []).map(mapExtractionWarning);
}

function validateDocumentInfo(value: unknown): Record<string, StrictLlmFieldValue> {
  if (!isObject(value)) throw new Error('"extraction.document_info" must be an object when present');
  const documentInfo: Record<string, StrictLlmFieldValue> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    documentInfo[key] = validateFieldValue(fieldValue, `extraction.document_info.${key}`);
  }
  return documentInfo;
}

function validateExtractionItem(value: unknown, itemIndex: number): StrictLlmExtractionResult["extraction"]["items"][number] {
  if (!isObject(value)) throw new Error(`extraction.items[${itemIndex}] must be an object`);
  if (typeof value.item_index !== "number") throw new Error(`extraction.items[${itemIndex}].item_index must be a number`);
  if (!Array.isArray(value.raw_fields)) throw new Error(`extraction.items[${itemIndex}].raw_fields must be an array`);
  return {
    item_index: value.item_index,
    ...(value.item_name === undefined || value.item_name === null
      ? {}
      : { item_name: validateFieldValue(value.item_name, `extraction.items[${itemIndex}].item_name`) }),
    ...(value.item_quantity === undefined || value.item_quantity === null
      ? {}
      : { item_quantity: validateFieldValue(value.item_quantity, `extraction.items[${itemIndex}].item_quantity`) }),
    ...(value.item_type_hint === undefined || value.item_type_hint === null
      ? {}
      : { item_type_hint: validateProductTypeHint(value.item_type_hint, `extraction.items[${itemIndex}].item_type_hint`) }),
    ...(value.product_type_hint === undefined || value.product_type_hint === null
      ? {}
      : { product_type_hint: validateProductTypeHint(value.product_type_hint, `extraction.items[${itemIndex}].product_type_hint`) }),
    raw_fields: value.raw_fields.map((rawField, rawFieldIndex) => validateRawField(rawField, itemIndex, rawFieldIndex)),
  };
}

function validateRawField(value: unknown, itemIndex: number, rawFieldIndex: number): StrictLlmRawField {
  const path = `extraction.items[${itemIndex}].raw_fields[${rawFieldIndex}]`;
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  for (const forbidden of ["canonical_value", "term_type", "parsed_value"]) {
    if (Object.prototype.hasOwnProperty.call(value, forbidden)) throw new Error(`${path} must not include ${forbidden}`);
  }
  if (typeof value.field_name !== "string") throw new Error(`${path}.field_name must be a string`);
  if (typeof value.value !== "string") throw new Error(`${path}.value must be a string`);
  if (!Object.prototype.hasOwnProperty.call(value, "evidence")) throw new Error(`${path}.evidence is required`);
  if (typeof value.confidence !== "number") throw new Error(`${path}.confidence must be a number`);
  return {
    field_name: value.field_name,
    value: value.value,
    ...(typeof value.selected === "boolean" ? { selected: value.selected } : {}),
    ...(typeof value.raw_text === "string" ? { raw_text: value.raw_text } : {}),
    evidence: value.evidence,
    confidence: value.confidence,
    ...(isObject(value.qualifier) ? { qualifier: validateQualifier(value.qualifier, `${path}.qualifier`) } : {}),
    ...(Array.isArray(value.split_fields)
      ? { split_fields: value.split_fields.map((splitField, splitIndex) => validateSplitField(splitField, `${path}.split_fields[${splitIndex}]`)) }
      : {}),
  };
}

function validateSplitField(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  if (typeof value.field_name !== "string") throw new Error(`${path}.field_name must be a string`);
  if (typeof value.value !== "string") throw new Error(`${path}.value must be a string`);
  return {
    field_name: value.field_name,
    value: value.value,
    ...(typeof value.selected === "boolean" ? { selected: value.selected } : {}),
    ...(typeof value.raw_text === "string" ? { raw_text: value.raw_text } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, "evidence") ? { evidence: value.evidence } : {}),
    ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {}),
    ...(isObject(value.qualifier) ? { qualifier: validateQualifier(value.qualifier, `${path}.qualifier`) } : {}),
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

function validateQualifier(value: Record<string, unknown>, path: string): Record<string, unknown> {
  const qualifier: Record<string, unknown> = {};
  if (typeof value.position === "string") qualifier.position = value.position === "upper_mold" ? "upper_die" : value.position === "lower_mold" ? "lower_die" : value.position;
  if (typeof value.area === "string") qualifier.area = value.area;
  if (typeof value.layer === "string") qualifier.layer = value.layer;
  if (typeof value.layerIndex === "number") qualifier.layerIndex = value.layerIndex;
  else if (typeof value.layer_index === "number") qualifier.layerIndex = value.layer_index;
  if (typeof value.instanceIndex === "number") qualifier.instanceIndex = value.instanceIndex;
  else if (typeof value.instance_index === "number") qualifier.instanceIndex = value.instance_index;
  if (typeof value.sourceText === "string") qualifier.sourceText = value.sourceText;
  else if (typeof value.source_text === "string") qualifier.sourceText = value.source_text;
  if (!qualifier.position && !qualifier.area && !qualifier.layer && !qualifier.layerIndex && !qualifier.instanceIndex) {
    throw new Error(`${path} must include position, area, layer, layerIndex, or instanceIndex`);
  }
  return qualifier;
}

function validateFieldValue(value: unknown, path: string): StrictLlmFieldValue {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  if (typeof value.value !== "string") throw new Error(`${path}.value must be a string`);
  if (!Object.prototype.hasOwnProperty.call(value, "evidence")) throw new Error(`${path}.evidence is required`);
  if (typeof value.confidence !== "number") throw new Error(`${path}.confidence must be a number`);
  return { value: value.value, evidence: value.evidence, confidence: value.confidence };
}

function validateProductTypeHint(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  if (typeof value.value !== "string") throw new Error(`${path}.value must be a string`);
  return {
    value: value.value,
    ...(typeof value.raw_value === "string" ? { raw_value: value.raw_value } : {}),
    ...(typeof value.display_name === "string" ? { display_name: value.display_name } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, "evidence") ? { evidence: value.evidence } : {}),
    ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {}),
  };
}

function validateStrictWarnings(value: unknown): StrictLlmExtractionResult["warnings"] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('"warnings" must be an array when present');
  return value.map((warning, index) => {
    if (!isObject(warning)) throw new Error(`warnings[${index}] must be an object`);
    if (typeof warning.type !== "string") throw new Error(`warnings[${index}].type must be a string`);
    if (typeof warning.message !== "string") throw new Error(`warnings[${index}].message must be a string`);
    return {
      type: warning.type,
      message: warning.message,
      ...(Object.prototype.hasOwnProperty.call(warning, "evidence") ? { evidence: warning.evidence } : {}),
    };
  });
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMergedStrictItems(
  items: StrictLlmExtractionResult["extraction"]["items"],
  planItems: DocumentPlanItem[],
): StrictLlmExtractionResult["extraction"]["items"] {
  return items.map((item, index) => {
    const planItem = planItems.find((candidate) => candidate.item_index === item.item_index) ?? planItems[index];
    if (!planItem || item.product_type_hint) {
      return {
        ...item,
        item_index: planItem?.item_index ?? item.item_index ?? index + 1,
      };
    }
    return {
      ...item,
      item_index: planItem.item_index,
      product_type_hint: {
        value: planItem.product_type_hint ?? "unknown",
        raw_value: planItem.product_type_raw ?? planItem.item_name ?? "",
        display_name: planItem.product_type_hint ?? "unknown",
        evidence: {},
        confidence: 0.75,
      },
    };
  });
}

function relatedPlanItems(input: BatchPlanItemInput): DocumentPlanItem[] {
  return input.plan.items.filter((other) => input.item.related_item_indexes?.includes(other.item_index));
}

function batchInputKey(input: BatchPlanItemInput): string {
  return batchResultKey({
    documentId: input.documentId,
    extractionResultId: input.extractionResultId,
    itemIndex: input.item.item_index,
  });
}

function batchResultKey(params: { documentId: number; extractionResultId: number; itemIndex: number }): string {
  return `${params.documentId}:${params.extractionResultId}:${params.itemIndex}`;
}

export function filterDictionaryContextForProductType(
  dictionaryContext: LlmDictionaryContext,
  productTypeHint: string | null | undefined,
): LlmDictionaryContext {
  const productType = normalizeProductTypeHintForContext(productTypeHint, dictionaryContext);
  const termTypes = dictionaryContext.term_types
    .filter((termType) => {
      const applicable = termType.applicable_product_types ?? [];
      if (!applicable.length) return true;
      return applicable.includes("common") || applicable.includes(productType);
    })
    .sort((left, right) => dictionaryTermTypePromptScore(right, productType) - dictionaryTermTypePromptScore(left, productType))
    .slice(0, MAX_ITEM_DICTIONARY_TERM_TYPES);
  return {
    product_types: dictionaryContext.product_types,
    term_types: termTypes,
  };
}

export function buildItemExtractSystemPrompt(productTypeHint: string, dictionaryContext?: LlmDictionaryContext): string {
  const productFocus = buildProductTypeFocus(productTypeHint, dictionaryContext);
  return `
你是企业级生产明细表 Item Raw Extraction 专家。你现在只抽取一个 item 或与它强相关的一组 item。

当前 product_type_hint = ${productTypeHint}
抽取重点：${productFocus}

你只做 raw extraction，不做 normalization。

必须遵守：
1. 只输出一个合法 JSON object，不输出 Markdown、解释、代码块或注释。
2. 输出结构必须是当前系统兼容格式：{"extraction":{"document_info":{},"items":[...]},"warnings":[]}。
3. raw_fields 中禁止出现 term_type、canonical_value、parsed_value、dictionary_proposals。
4. value/raw_text 必须保留原文，不要翻译、标准化或改写。
5. 每个 item 必须有 item_index、product_type_hint、raw_fields。
6. 每个 raw_field 必须有 field_name、value、raw_text、evidence、confidence。
7. 如果字段值明显包含多个业务属性，在该 raw_field 上输出 split_fields；split_fields 也只能用中文 field_name 和原文 value。
8. dictionary_context 只用于理解字段边界和字段适用产品范围；不要输出其中的 term_type 或 canonical value。
9. 客户、发货/物流、业务员、制单人、使用市场、国家等文档级字段不能放进 raw_fields，只能写入 document_info。
10. [SEL]、■、☑、✔、✓ 表示选中；[ ]、□ 表示未选中。多选字段只输出选中的选项。
11. 材料/应用/说明混写时必须拆成各自的 split_fields。父 raw_field 的 value/raw_text 保留完整原文用于追溯。
12. "塑料原料"只能放材料牌号/材料名称本身，不得包含膜、板、片、管、模头、产量、温度、规格、比例或备注。
13. "应用类型"只能放制品/用途本身；"模头"、"分配器"等产品/部位词不得并入应用类型。
14. split_fields 自身也必须是单一业务属性，不得在 split_fields 中再次输出完整混填串。
15. 例："PE+CaCo3透气膜"拆为"塑料原料"="PE"、"原料配方"="PE+CaCo3"、"应用类型"="透气膜"。
16. 部位、位置和层位必须写入 qualifier，不要为同一基础概念创建部位专用字段。
17. 两侧板加热输出 field_name="加热配置"、qualifier.area="side_plate"。
18. A/B/C/D 主机、A/B/C/D 层或 A/B/C/D 区的型号、原料、产量按层位聚合并携带 qualifier.layer。
19. field_name 只能是业务概念，禁止把数值写入字段名。例如"测温点距内表面6mm"必须输出 field_name="测温点距内表面"、value="6mm"。
20. 图纸状态、参考产品编号和备注必须分别抽取；例如"按原图纸（与190590#一样做）"拆出图纸状态和参考产品编号="190590"。
21. application 和 plastic material 采用企业口头分类：光学级、弹性体、交联化学发泡等允许作为应用类型；BOPET、BOPE允许作为塑料原料。
`;
}

export function buildBatchItemExtractSystemPrompt(productTypeHint: string, dictionaryContext?: LlmDictionaryContext): string {
  const productFocus = buildProductTypeFocus(productTypeHint, dictionaryContext);
  return `
你是企业级生产明细表 Batch Item Raw Extraction 专家。你现在会收到多个不同 document/extraction 中、相同 product_type_hint 的待抽取 item。

当前批次 product_type_hint = ${productTypeHint}
抽取重点：${productFocus}

你只做 raw extraction，不做 normalization。

必须遵守：
1. 只输出一个合法 JSON object，不输出 Markdown、解释、代码块或注释。
2. 输出结构必须是 {"results":[...]}。
3. results 中必须为每个输入 batch_items 输出一个结果，不能漏项、不能重复、不能输出输入之外的 document/extraction/item。
4. 每个 result 必须带回输入中的 documentId、extractionResultId、item_index。
5. raw_fields 中禁止出现 term_type、canonical_value、parsed_value、dictionary_proposals。
6. value/raw_text 必须保留原文，不要翻译、标准化或改写。
7. 每个 raw_field 必须有 field_name、value、raw_text、evidence、confidence。
8. split_fields 必须覆盖所有有业务意义的片段，且自身也必须是单一业务属性。
9. dictionary_context 只用于理解字段边界和字段适用产品范围；不要输出其中的 term_type 或 canonical value。
10. PE+CaCo3透气膜 应拆为 塑料原料=PE、原料配方=PE+CaCo3、应用类型=透气膜。
11. 两侧板加热 使用 qualifier.area="side_plate"；A/B/C/D 主机使用 qualifier.layer。
12. 测温点距内表面6mm 必须输出 field_name="测温点距内表面"、value="6mm"。
`;
}

function normalizeProductTypeHintForContext(value: unknown, dictionaryContext?: LlmDictionaryContext): string {
  const text = String(value ?? "").trim();
  const allowed = new Set([...(dictionaryContext?.product_types ?? []).map((item) => item.canonical_value), "unknown"]);
  return allowed.has(text) ? text : "unknown";
}

function dictionaryTermTypePromptScore(termType: LlmDictionaryContext["term_types"][number], productType: string): number {
  const applicable = termType.applicable_product_types ?? [];
  const productScore = applicable.includes(productType)
    ? 100
    : applicable.includes("common")
      ? 60
      : applicable.length === 0
        ? 40
        : 0;
  const aliasScore = Math.min(12, termType.aliases?.length ?? 0);
  const valueKindScore = termType.value_kind === "enum" || termType.value_kind === "enums" ? 8 : 4;
  return productScore + aliasScore + valueKindScore;
}

function buildProductTypeFocus(productTypeHint: string, dictionaryContext?: LlmDictionaryContext): string {
  const product = dictionaryContext?.product_types?.find((item) => item.canonical_value === productTypeHint);
  if (!product) return "按当前 item 原文标题和字段边界抽取，不要跨 item 合并。";
  return [product.display_name, product.description, product.aliases?.length ? `别名：${product.aliases.join("、")}` : null]
    .filter(Boolean)
    .join("；");
}

function normalizeItem(value: unknown, fallbackIndex: number) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? (value as any) : {};
  return {
    item_index: Number.isFinite(Number(item.item_index)) ? Number(item.item_index) : fallbackIndex,
    item_name: trimOrNull(item.item_name ?? item.name ?? item.product_name),
    product_type_hint: item.product_type_hint ?? item.item_type_hint ?? null,
    item_quantity: trimOrNull(item.item_quantity ?? item.quantity),
    fields: normalizeRecord(item.fields ?? {}),
    raw_fields: Array.isArray(item.raw_fields) ? item.raw_fields : fieldsToRawFields(item.fields ?? {}, fallbackIndex),
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.trim().replace(/\s+/g, "_");
    if (!normalizedKey) continue;
    result[normalizedKey] =
      typeof nested === "string"
        ? nested.trim()
        : Array.isArray(nested)
          ? nested.map((item) => (typeof item === "string" ? item.trim() : item))
          : nested && typeof nested === "object"
            ? normalizeRecord(nested)
            : nested;
  }
  return result;
}

function normalizeWarnings(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(mapExtractionWarning)
    .filter((item: any) => String(item.message ?? "").trim() || item.type);
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function fieldsToRawFields(fields: unknown, itemIndex: number) {
  const record = normalizeRecord(fields);
  return Object.entries(record).map(([field_name, value]) => ({
    item_index: itemIndex,
    field_name,
    value,
  }));
}

function nextIndex(used: Set<number>): number {
  let index = 1;
  while (used.has(index)) index += 1;
  return index;
}

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractLlmText(blocksJson: unknown): string {
  if (blocksJson && typeof blocksJson === "object" && !Array.isArray(blocksJson)) {
    const record = blocksJson as any;
    if (typeof record.llm_text === "string") return record.llm_text;
    if (Array.isArray(record.blocks)) {
      return record.blocks.map((block: any) => block?.text ?? block?.raw_text ?? "").join("\n");
    }
  }
  return JSON.stringify(blocksJson);
}

function sliceLlmTextByRanges(llmText: string, ranges: DocumentPlanItem["llm_text_ranges"]): string {
  if (!ranges?.length) return "";
  const lines = llmText.split(/\r?\n/g);
  const selected: string[] = [];
  for (const range of ranges) {
    const start = Math.max(1, Number(range.start_line ?? 1));
    const end = Math.min(lines.length, Number(range.end_line ?? range.start_line ?? start));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    selected.push(...lines.slice(start - 1, end));
  }
  return selected.join("\n");
}

function buildExcelRowLineIndex(llmText: string): Map<number, number> {
  const rows = new Map<number, number>();
  llmText.split(/\r?\n/g).forEach((line, index) => {
    const match = line.match(/^Row\s+(\d+)\s*:/i);
    if (match) rows.set(Number(match[1]), index + 1);
  });
  return rows;
}

function mapExcelRowRangesToPhysicalRanges(llmText: string, ranges: DocumentPlanItem["llm_text_ranges"]): DocumentPlanItem["llm_text_ranges"] {
  if (!ranges?.length) return [];
  const rowIndex = buildExcelRowLineIndex(llmText);
  const sortedRows = [...rowIndex.entries()].sort(([left], [right]) => left - right);
  const lineCount = llmText.split(/\r?\n/g).length;
  return ranges
    .map((range) => {
      const startRow = Number(range.start_line);
      const endRow = Number(range.end_line ?? range.start_line);
      const startLine = rowIndex.get(startRow);
      const explicitEndLine = rowIndex.get(endRow);
      if (!startLine) return null;
      const nextRow = sortedRows.find(([row]) => row > endRow);
      const endLine = explicitEndLine ? (nextRow ? nextRow[1] - 1 : lineCount) : startLine;
      return {
        start_line: startLine,
        end_line: Math.max(startLine, endLine),
      };
    })
    .filter((range): range is { start_line: number; end_line: number } => Boolean(range));
}

function normalizeForRangeMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w\u4e00-\u9fa5]/g, "");
}

function itemRangeAnchors(item: DocumentPlanItem): string[] {
  return [item.item_name, item.product_type_raw, item.product_type_hint]
    .map(normalizeForRangeMatch)
    .filter((value) => value.length >= 2);
}

function textMatchesItemRange(text: string, item: DocumentPlanItem): boolean {
  const anchors = itemRangeAnchors(item);
  if (!anchors.length) return true;
  const normalizedText = normalizeForRangeMatch(text);
  return anchors.some((anchor) => normalizedText.includes(anchor));
}

function rangeWarning(params: {
  type: string;
  message: string;
  item: DocumentPlanItem;
  evidence?: Record<string, unknown>;
}) {
  return {
    type: params.type,
    message: params.message,
    evidence: {
      item_index: params.item.item_index,
      item_name: params.item.item_name,
      product_type_hint: params.item.product_type_hint,
      ...(params.evidence ?? {}),
    },
  };
}

function selectBlocksByIds(blocksJson: any, blockIds: string[] | undefined): string {
  if (!blockIds?.length || !Array.isArray(blocksJson?.blocks)) return "";
  const ids = new Set(blockIds);
  return blocksJson.blocks
    .filter((block: any) => ids.has(String(block.block_id ?? block.id)))
    .map((block: any) => block.text ?? block.content?.text ?? block.raw_text ?? "")
    .filter(Boolean)
    .join("\n");
}

function nextIndexWithMark(used: Set<number>): number {
  let index = 1;
  while (used.has(index)) index += 1;
  used.add(index);
  return index;
}

function buildFallbackPlan(blocksJson: unknown) {
  return {
    document_info: {},
    items: [{ item_index: 1, item_name: null, product_type_hint: "unknown" }],
    source: "fallback",
    blocksDigest: JSON.stringify(blocksJson).slice(0, 1000),
  };
}

async function requestPlan(params: {
  fileName?: string | null;
  blocksJson: unknown;
  llmText: string;
  llmModel?: string;
}) {
  const content = await requestRoutedChatJson({
    model: params.llmModel,
    purpose: "product_config_plan",
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "你是产品配置表规划助手。只输出 JSON：{document_info,items:[{item_index,item_name,product_type_hint,item_quantity,block_ids}],warnings?}。",
      },
      {
        role: "user",
        content: JSON.stringify({ fileName: params.fileName, llm_text: params.llmText, blocks: params.blocksJson }),
      },
    ],
    input: { fileName: params.fileName },
    maxTokens: 4000,
  });
  return parseJson(content);
}

async function requestExtraction(params: {
  fileName?: string | null;
  blocksJson: unknown;
  llmText: string;
  plan: unknown;
  llmModel?: string;
}) {
  const content = await requestRoutedChatJson({
    model: params.llmModel,
    purpose: "product_config_extract_planned",
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "你是产品配置表抽取助手。只输出 JSON：{extraction:{document_info,items:[{item_index,item_name,product_type_hint,item_quantity,fields,raw_fields}]},warnings:[]}。",
      },
      {
        role: "user",
        content: JSON.stringify({
          fileName: params.fileName,
          plan: params.plan,
          llm_text: params.llmText,
          blocks: params.blocksJson,
        }),
      },
    ],
    input: { fileName: params.fileName },
    maxTokens: 8000,
  });
  return parseJson(content);
}

function parseJson(content: string): unknown {
  try {
    return parseJsonContent(content);
  } catch {
    return { rawText: content, extraction: { document_info: {}, items: [] }, warnings: [] };
  }
}
