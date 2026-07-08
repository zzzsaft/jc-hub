import type {
  ArchiveItemField,
  DictionaryOptions,
  FieldQualifierPosition,
  QuoteAgentField,
} from "./types";
import { asArray } from "./common.utils";

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
