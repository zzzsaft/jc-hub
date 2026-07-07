import type {
  ArchiveItemField,
  BatchReviewResponse,
  Candidate,
  CandidateType,
  DictionaryOptions,
  ExtractionDetail,
  FieldQualifierPosition,
  ProductBinding,
  ProductBindingPayload,
  QuoteAgentDocument,
  QuoteAgentField,
  QuoteAgentItem,
  ProductMasterDataTermType,
} from "./types";

export const asArray = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);
export const docId = (document?: QuoteAgentDocument | null) => document?.documentId ?? document?.id ?? "";
export const docName = (document?: QuoteAgentDocument | null) => String(document?.fileName ?? document?.filePath ?? `文档 #${docId(document)}`);
export const responseDocs = (value: any): QuoteAgentDocument[] => value?.items ?? value?.documents ?? value?.data ?? [];
export const errorText = (error: unknown) =>
  (error as any)?.response?.data?.error ?? (error as any)?.response?.data?.message ?? (error as any)?.message ?? String(error);
export const draftKey = (type: CandidateType, id: string | number) => `${type}:${id}`;
export const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);
export const textValue = (value: unknown, fallback = "-") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};

export const getByDotPath = (source: unknown, path: string) => {
  if (!path) return source;
  return path.split(".").reduce<any>((current, segment) => {
    if (current == null) return undefined;
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[key];
  }, source as any);
};

export const setByDotPath = <T,>(source: T, path: string, value: unknown): T => {
  const segments = path.split(".");
  const root: any = Array.isArray(source) ? [...source] : { ...(source as any) };
  let cursor = root;
  segments.forEach((segment, index) => {
    const key: string | number = /^\d+$/.test(segment) ? Number(segment) : segment;
    if (index === segments.length - 1) {
      cursor[key] = value;
      return;
    }
    const nextSegment = segments[index + 1];
    const next = cursor[key];
    cursor[key] = Array.isArray(next)
      ? [...next]
      : next && typeof next === "object"
        ? { ...next }
        : /^\d+$/.test(nextSegment)
          ? []
          : {};
    cursor = cursor[key];
  });
  return root;
};

export const hasEvidence = (value: unknown) => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return String(value).trim() !== "";
};

export const fieldConfidence = (field: ArchiveItemField | QuoteAgentField) => {
  const raw = (field as any).confidence ?? (field as any).dictionary?.confidence ?? (field as any).matchConfidence;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const isLowConfidence = (field: ArchiveItemField | QuoteAgentField) => {
  const confidence = fieldConfidence(field);
  return confidence !== null && confidence < 0.75;
};

export const qualifierLabelMap: Record<FieldQualifierPosition, string> = {
  upper_mold: "上模",
  lower_mold: "下模",
  pre_pump: "泵前",
  post_pump: "泵后",
  pre_mesh: "网前",
  post_mesh: "网后",
  inlet: "入口",
  c_inlet: "C入口",
};

const knownQualifierPositions = new Set<string>(Object.keys(qualifierLabelMap));

export function fieldQualifierPosition(field: ArchiveItemField | QuoteAgentField) {
  const position = String((field as any).qualifier?.position ?? "");
  return knownQualifierPositions.has(position) ? position as FieldQualifierPosition : "";
}

export function fieldQualifierLabel(field: ArchiveItemField | QuoteAgentField) {
  const position = fieldQualifierPosition(field);
  return position ? qualifierLabelMap[position] : "";
}

export const fieldOriginalName = (field: ArchiveItemField | QuoteAgentField) =>
  String(
    (field as any).field_name ||
      (field as any).fieldName ||
      (field as any).name ||
      (field as any).dictionary?.term_type ||
      (field as any).dictionary?.termType ||
      "字段",
  );

export function fieldDisplayName(field: ArchiveItemField | QuoteAgentField, options?: DictionaryOptions) {
  const dictionary = (field as any).dictionary || {};
  const termType = fieldTermType(field);
  const term = options?.termTypes.find((item) => String(item.termType ?? (item as any).term_type ?? "") === termType);
  return String(
    dictionary.normalized_field_name ||
      dictionary.normalizedFieldName ||
      fieldOriginalName(field) ||
      dictionary.quote_display_name ||
      dictionary.quoteDisplayName ||
      term?.quoteDisplayName ||
      term?.displayName ||
      dictionary.term_display_name ||
      dictionary.termDisplayName ||
      dictionary.field_display_name ||
      dictionary.fieldDisplayName,
  );
}

export function fieldDisplayNameWithQualifier(field: ArchiveItemField | QuoteAgentField, options?: DictionaryOptions) {
  const displayName = fieldDisplayName(field, options);
  const qualifierLabel = fieldQualifierLabel(field);
  return qualifierLabel ? `${displayName} · ${qualifierLabel}` : displayName;
}

export const fieldRawValue = (field: ArchiveItemField | QuoteAgentField) =>
  (field as any).raw_value ?? (field as any).rawValue ?? (field as any).value ?? "";

export function fieldStableKey(
  field: ArchiveItemField | QuoteAgentField,
  itemIndex: string | number | undefined,
  index: string | number,
  candidateId?: string | number,
) {
  return [
    itemIndex ?? "x",
    fieldTermType(field),
    fieldQualifierPosition(field),
    (field as any).field_name ?? (field as any).fieldName ?? "",
    fieldRawValue(field),
    candidateId ?? index,
  ].map((value) => String(value ?? "")).join(":");
}

export function hasMeaningfulRawValue(field: ArchiveItemField | QuoteAgentField) {
  const value = String(fieldRawValue(field) ?? "").trim();
  return Boolean(value && value !== "-" && value.toUpperCase() !== "UNKNOWN");
}

export const fieldWarnings = (field: ArchiveItemField | QuoteAgentField) => asArray((field as any).warnings);

export function fieldDictionaryMatched(field: ArchiveItemField | QuoteAgentField) {
  return Boolean((field as any).dictionary?.field_matched === true || (field as any).dictionary?.matched === true);
}

export function fieldDictionaryDisplayName(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  const values = Array.isArray(dictionary.values) ? dictionary.values : [];
  if (values.length) {
    return values
      .map((value: any) => value.displayName || value.display_name || value.canonicalValue || value.canonical_value || value.rawValue || value.raw_value)
      .filter(Boolean)
      .join(" / ");
  }
  return dictionary.display_name || dictionary.displayName || "";
}

export function fieldDisplayValue(field: ArchiveItemField | QuoteAgentField) {
  const displayName = fieldDictionaryDisplayName(field);
  if (displayName) return displayName;
  return hasMeaningfulRawValue(field) ? fieldRawValue(field) : "";
}

export function normalizedFieldText(value: unknown) {
  return String(value ?? "").trim();
}

export function sameFieldText(left: unknown, right: unknown) {
  return normalizedFieldText(left) === normalizedFieldText(right);
}

export function fieldDisplayValueDetail(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  const rawValue = hasMeaningfulRawValue(field) ? normalizedFieldText(fieldRawValue(field)) : "";
  const standardValue = normalizedFieldText(fieldDictionaryDisplayName(field));
  const normalizedValue = normalizedFieldText(dictionary.normalized_value ?? dictionary.normalizedValue);
  const displayValue = standardValue || rawValue;
  const rawMatchesStandard = rawValue && standardValue && sameFieldText(rawValue, standardValue);
  const rawMatchesNormalized = rawValue && normalizedValue && sameFieldText(rawValue, normalizedValue);

  return {
    displayValue,
    rawValue,
    standardValue,
    showRawAndStandard: Boolean(rawValue && standardValue && !rawMatchesStandard && !rawMatchesNormalized),
  };
}

export function roughnessDisplayText(field: ArchiveItemField | QuoteAgentField) {
  const roughness = (field as any).dictionary?.roughness;
  if (!roughness || typeof roughness !== "object") return "";

  const unit = String(roughness.unit || "").trim();
  const rangeMin = roughness.rangeMin;
  const rangeMax = roughness.rangeMax;
  const value = roughness.value;
  const bound = String(roughness.bound || "");
  const grade = String(roughness.grade || "").trim();
  const parts: string[] = [];

  if (grade) parts.push(`等级 ${grade}`);
  if (rangeMin !== undefined && rangeMin !== null && rangeMax !== undefined && rangeMax !== null) {
    parts.push(`范围 ${rangeMin}-${rangeMax}${unit ? ` ${unit}` : ""}`);
  } else if (value !== undefined && value !== null) {
    const symbol = bound === "lt" ? "<" : bound === "lte" ? "<=" : bound === "gt" ? ">" : bound === "gte" ? ">=" : "";
    parts.push(`${symbol}${symbol ? " " : ""}${value}${unit ? ` ${unit}` : ""}`);
  }

  return parts.join("，") || String(roughness.raw || "");
}

export function fieldTermType(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  return String(dictionary.term_type || dictionary.termType || dictionary.normalized_field_name || dictionary.normalizedFieldName || "");
}

export function fieldValueKind(field: ArchiveItemField | QuoteAgentField, options?: DictionaryOptions) {
  const dictionary = (field as any).dictionary || {};
  const directValueKind = dictionary.value_kind || dictionary.valueKind || (field as any).value_kind || (field as any).valueKind;
  if (directValueKind) return String(directValueKind);
  const termType = fieldTermType(field);
  return String(options?.termTypes.find((item) => String(item.termType ?? "") === termType)?.valueKind ?? "");
}

export function isEnumField(field: ArchiveItemField | QuoteAgentField, options?: DictionaryOptions) {
  const valueKind = fieldValueKind(field, options);
  return valueKind === "enum" || valueKind === "enums";
}

export function fieldEnumOptions(field: ArchiveItemField | QuoteAgentField, options?: DictionaryOptions) {
  const dictionary = (field as any).dictionary || {};
  const termType = fieldTermType(field);
  const values = [
    ...asArray(dictionary.values || dictionary.enumValues || (field as any).enumValues),
    ...asArray(options?.values).filter((value: any) => String(value?.termType ?? value?.term_type ?? "") === termType),
  ];
  return values
    .map((value: any) => ({
      canonicalValue: String(value?.canonical_value ?? value?.canonicalValue ?? value?.value ?? value?.enumValue ?? ""),
      displayName: String(value?.display_name ?? value?.displayName ?? value?.label ?? value?.canonical_value ?? value?.canonicalValue ?? value?.value ?? ""),
    }))
    .filter((value) => value.displayName)
    .filter((value, index, array) => array.findIndex((item) => item.displayName === value.displayName) === index);
}

export function isSplitOriginalRetainedField(field: ArchiveItemField | QuoteAgentField) {
  const warningTypes = new Set(fieldWarnings(field).map((warning: any) => warning?.type));
  return (field as any).original === true || warningTypes.has("split_original_retained");
}

export function isSplitDerivedField(field: ArchiveItemField | QuoteAgentField) {
  const warningTypes = new Set(fieldWarnings(field).map((warning: any) => String(warning?.type ?? "")));
  return warningTypes.has("split_value_retained") || warningTypes.has("split_term_type_retained");
}

export const hiddenWarningTypes = new Set([
  "split_original_retained",
  "empty_value",
  "unknown_value",
  "term_type_candidate_previously_rejected",
  "value_candidate_previously_rejected",
]);

export const docInfoFieldTypes = new Set([
  "business_owner",
  "contract_creator",
  "product_number",
  "contract_number",
  "order_number",
  "customer",
  "customer_name",
  "customer_id",
  "date",
  "order_date",
  "delivery_date",
]);

export function hideInMainConfig(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  const termType = String(dictionary.term_type || "");
  return (
    (field as any).original === true ||
    dictionary.field_matched !== true ||
    !termType ||
    docInfoFieldTypes.has(termType) ||
    fieldWarnings(field).some((warning: any) => hiddenWarningTypes.has(String(warning?.type ?? "")))
  );
}

export function isMainConfigField(field: ArchiveItemField | QuoteAgentField) {
  return !hideInMainConfig(field);
}

export function isUnmatchedConfigField(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  const termType = String(dictionary.term_type || "");
  const blockedByWarning = fieldWarnings(field).some((warning: any) => hiddenWarningTypes.has(String(warning?.type ?? "")));
  return (
    (field as any).original !== true &&
    !blockedByWarning &&
    !docInfoFieldTypes.has(termType) &&
    (dictionary.field_matched !== true || !termType)
  );
}

export const bindingToPayload = (binding: ProductBinding): ProductBindingPayload => ({
  productNumber: String(binding.productNumber ?? "").trim(),
  role: binding.role || "unknown",
  quantity: binding.quantity ?? null,
  bindingSource: binding.bindingSource || "manual",
  confidence: binding.confidence ?? null,
  erpProductId: binding.erpProductId ?? null,
  erpParentProductNumber: binding.erpParentProductNumber ?? null,
  erpMatchStatus: binding.erpMatchStatus || "manual",
  priceAmount: binding.price?.amount ?? null,
  priceCurrency: binding.price?.currency ?? null,
  priceSource: binding.price?.source ?? null,
  evidence: binding.evidence,
  note: binding.note ?? null,
});

export const changeSummaryText = (value: unknown) => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => changeSummaryText(item)).join("；");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const path = textValue(record.path, "");
    if (path) {
      const after = record.after ?? record.value;
      if (/^items\.\d+\.fields$/.test(path)) {
        const before = record.before;
        if (Array.isArray(before) && Array.isArray(after)) {
          const maxLength = Math.max(before.length, after.length);
          const changedCount = Array.from({ length: maxLength }).filter((_, index) => JSON.stringify(before[index] ?? null) !== JSON.stringify(after[index] ?? null)).length;
          return `${path}: 更新字段${changedCount ? ` ${changedCount} 项` : ""}`;
        }
        return `${path}: 更新字段列表`;
      }
      if (Array.isArray(after)) return `${path}: 更新列表 ${after.length} 项`;
      if (after && typeof after === "object") return `${path}: 更新对象`;
      return `${path}: ${textValue(after)}`;
    }
    return Object.entries(record).map(([key, item]) => {
      if (Array.isArray(item)) return `${key}: 列表 ${item.length} 项`;
      if (item && typeof item === "object") return `${key}: 对象`;
      return `${key}: ${textValue(item)}`;
    }).join("；");
  }
  return String(value);
};

export type ChangeSummaryDetail = {
  label: string;
  before: string;
  after: string;
};

export function changeSummaryDetails(value: unknown): ChangeSummaryDetail[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const path = textValue(record.path, "");
    const before = record.before;
    const after = record.after ?? record.value;
    if (/^items\.\d+\.fields$/.test(path) && Array.isArray(before) && Array.isArray(after)) {
      const maxLength = Math.max(before.length, after.length);
      return Array.from({ length: maxLength }).flatMap((_, index) => {
        const beforeField = before[index] as ArchiveItemField | QuoteAgentField | undefined;
        const afterField = after[index] as ArchiveItemField | QuoteAgentField | undefined;
        if (JSON.stringify(beforeField ?? null) === JSON.stringify(afterField ?? null)) return [];
        const field = afterField || beforeField;
        return [{
          label: field ? fieldDisplayName(field) : `${path}.${index}`,
          before: beforeField ? textValue(fieldDisplayValue(beforeField), "空") : "空",
          after: afterField ? textValue(fieldDisplayValue(afterField), "空") : "空",
        }];
      });
    }
    if (path) {
      return [{
        label: path,
        before: textValue(before, "空"),
        after: textValue(after, "空"),
      }];
    }
    return [];
  });
}

export const readStorageValue = (key: string) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

export const writeStorageValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export function extractJsonFromText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] || text).trim();
  if (!source) throw new Error("JSON 为空");
  try {
    return JSON.parse(source);
  } catch {
    const startCandidates = [
      source.indexOf("{"),
      source.indexOf("["),
    ].filter((item) => item >= 0);
    const start = Math.min(...startCandidates);
    const end = Math.max(source.lastIndexOf("}"), source.lastIndexOf("]"));
    if (!Number.isFinite(start) || end <= start) throw new Error("没有找到可解析的 JSON");
    return JSON.parse(source.slice(start, end + 1));
  }
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
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

export const detailItems = (detail?: ExtractionDetail | null): QuoteAgentItem[] =>
  asArray(
    detail?.items ||
      (detail as any)?.dictionary_proposals?.items ||
      (detail as any)?.dictionary?.items ||
      (detail as any)?.extraction?.items ||
      (detail as any)?.data?.items,
  );
export const detailWarnings = (detail?: ExtractionDetail | null) =>
  asArray(detail?.warnings || (detail as any)?.dictionary_proposals?.warnings || (detail as any)?.dictionary?.warnings || (detail as any)?.data?.warnings);

export function resultMessage(result: BatchReviewResponse) {
  if (result?.successCount !== undefined || result?.failedCount !== undefined) {
    const affected = Array.isArray(result.affectedDocumentIds) ? result.affectedDocumentIds.length : 0;
    return `提交完成：成功 ${result.successCount ?? 0}，失败 ${result.failedCount ?? 0}，影响文档 ${affected} 个。`;
  }
  if (Array.isArray(result?.affectedDocumentIds)) return `提交完成：影响文档 ${result.affectedDocumentIds.length} 个。`;
  return "操作完成。";
}

export function batchResultMessage(result: BatchReviewResponse) {
  const base = resultMessage(result);
  return result?.candidateRecheckDeferred
    ? `${base}审核已提交，相关文档将在后台刷新。`
    : base;
}

export function dictionaryValue(field: QuoteAgentField) {
  return fieldDisplayValue(field);
}

export function productMasterDataTermType(field: QuoteAgentField): ProductMasterDataTermType | null {
  const termType = String(
    field.dictionary?.term_type ||
      field.dictionary?.termType ||
      field.dictionary?.normalized_field_name ||
      field.dictionary?.normalizedFieldName ||
      "",
  );
  if (termType === "metering_pump_model" || termType === "filter_model") return termType;
  return null;
}

export function isProductMasterDataField(field: QuoteAgentField) {
  return productMasterDataTermType(field) !== null;
}

export function productMasterDataNoMatchWarning(field: QuoteAgentField) {
  return asArray(field.warnings).find((warning: any) => warning.type === "master_data_no_match") as any;
}

export function productMasterDataMatch(field: QuoteAgentField) {
  return (field.masterDataMatch || field.master_data_match || (field as any).master_data || null) as Record<string, any> | null;
}

export function fieldStatus(field: QuoteAgentField) {
  const warningTypes = new Set(asArray(field.warnings).map((warning: any) => warning.type));
  const masterDataMatch = productMasterDataMatch(field);
  if (isProductMasterDataField(field) && masterDataMatch?.matched) return { label: "主数据已匹配", tone: "good" };
  if (isProductMasterDataField(field) && warningTypes.has("master_data_no_match")) return { label: "主数据待选", tone: "warn" };
  if (field.dictionary?.matched) return { label: "已匹配", tone: "good" };
  if (field.candidate) return { label: "待审核", tone: "warn" };
  if (warningTypes.has("split_original_retained") || warningTypes.has("split_value_retained")) return { label: "已拆分", tone: "info" };
  if (warningTypes.has("skipped") || field.dictionary?.skipped) return { label: "已跳过", tone: "muted" };
  if (field.warnings?.length) return { label: "有警告", tone: "bad" };
  return { label: "未匹配", tone: "warn" };
}

export function toneClass(tone: string) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "bad") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "info") return "border-blue-200 bg-blue-50 text-blue-700";
  if (tone === "muted") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function candidateTypeOf(field: QuoteAgentField, candidate?: Candidate): CandidateType | null {
  const direct = field.candidate?.candidate_type ?? candidate?.candidateType;
  if (direct === "term_type" || direct === "term-type") return "term_type";
  if (direct === "value") return "value";
  if (candidate?.rawFieldName && !candidate?.rawValue) return "term_type";
  return candidate ? "value" : null;
}

export function fieldCandidateId(field: QuoteAgentField) {
  return field.candidate?.candidate_id ?? field.candidate?.id ?? "";
}

export function matchCandidate(
  field: QuoteAgentField,
  item: QuoteAgentItem,
  candidates: Candidate[],
  currentDocumentId?: string | number,
  excludedFallbackCandidateIds: Set<string> = new Set(),
) {
  const fieldName = String(field.field_name || "");
  const rawValue = String(field.raw_value || "");
  const candidateFitsField = (candidate: Candidate) => {
    const sameDocument = !currentDocumentId || !candidate.documentId || String(candidate.documentId) === String(currentDocumentId);
    const sameItem = candidate.itemIndex === undefined || item.item_index === undefined || String(candidate.itemIndex) === String(item.item_index);
    const sameField = !candidate.rawFieldName || candidate.rawFieldName === fieldName;
    const sameValue = !candidate.rawValue || candidate.rawValue === rawValue;
    return sameDocument && sameItem && sameField && sameValue;
  };
  const directId = fieldCandidateId(field);
  if (directId) {
    const direct = candidates.find((candidate) => String(candidate.id) === String(directId));
    if (direct && candidateFitsField(direct)) return direct;
    return undefined;
  }

  return candidates.find((candidate) => {
    if (excludedFallbackCandidateIds.has(String(candidate.id))) return false;
    return candidateFitsField(candidate);
  });
}

export function applicabilityWarning(field: QuoteAgentField) {
  return asArray(field.warnings).find((warning: any) => warning.type === "term_type_not_applicable_to_product") as any;
}

export function applicabilityTermType(field: QuoteAgentField, candidate?: Candidate) {
  const warning = applicabilityWarning(field);
  return String(
    warning?.term_type ||
      (candidate as any)?.proposedTermType ||
      candidate?.termType ||
      field.dictionary?.term_type ||
      field.dictionary?.normalized_field_name ||
      "",
  );
}

export function reviewKind(type: CandidateType | null, needsProductApplicability: boolean) {
  if (needsProductApplicability) {
    return { statusLabel: "\u9002\u7528\u5f85\u5ba1", buttonLabel: "\u52a0\u4ea7\u54c1", tone: "info" };
  }
  if (type === "term_type") {
    return { statusLabel: "Key 待审", buttonLabel: "处理 Key", tone: "warn" };
  }
  if (type === "value") {
    return { statusLabel: "值待审", buttonLabel: "处理值", tone: "warn" };
  }
  return null;
}

export function statsOf(items: QuoteAgentItem[], candidates: Candidate[]) {
  const fields = items.flatMap((item) => asArray(item.fields));
  return {
    items: items.length,
    fields: fields.length,
    matched: fields.filter((field) => field.dictionary?.matched).length,
    unmatched: fields.filter((field) => !field.dictionary?.matched).length,
    candidates: candidates.length,
    warnings: fields.reduce((sum, field) => sum + asArray(field.warnings).length, 0) + items.reduce((sum, item) => sum + asArray(item.warnings).length, 0),
  };
}
