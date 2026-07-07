import type { ArchiveItem, ArchiveItemField, QuoteAgentField, QuoteAgentItem } from "../types";
import { asArray, fieldTermType, hasMeaningfulRawValue, textValue } from "../utils";

export type MasterDataCandidate = {
  model: string;
  source: string;
  matchedAttributes: string[];
  conflicts: string[];
  missingAttributes: string[];
  confidenceReason: string;
};

export type ItemMasterDataStatus = {
  match: Record<string, any> | null;
  appliedWarning: Record<string, any> | null;
  needsReviewWarning: Record<string, any> | null;
  noMatchWarning: Record<string, any> | null;
  candidates: MasterDataCandidate[];
  matchedAttributes: string[];
  tooltip: string;
  derivedModelWithoutOriginalField: boolean;
};

const modelTermTypes = new Set(["metering_pump_model", "filter_model"]);

const attributeLabels: Record<string, string> = {
  dimension: "尺寸",
  dimensions: "尺寸",
  size: "尺寸",
  weight: "重量",
  meshDiameter: "滤网直径",
  mesh_diameter: "滤网直径",
  effectiveFilterArea: "有效过滤面积",
  effective_filter_area: "有效过滤面积",
  pumpage: "排量",
  displacement: "排量",
  rotateSpeed: "转速",
  rotate_speed: "转速",
  speed: "转速",
  power: "功率",
  pressure: "压力",
  heatingPower: "加热功率",
  heating_power: "加热功率",
  production: "产量",
};

export function itemMasterDataStatus(item: ArchiveItem | QuoteAgentItem): ItemMasterDataStatus {
  const fields = asArray((item as any).fields) as Array<ArchiveItemField | QuoteAgentField>;
  const warnings = [
    ...(asArray((item as any).warnings) as Array<Record<string, any>>),
    ...fields.flatMap((field) => asArray((field as any).warnings) as Array<Record<string, any>>),
  ];
  const match = itemMasterDataMatch(item) || fields.map(fieldMasterDataMatch).find((value) => value?.matched) || null;
  const needsReviewWarning = warningByType(warnings, "master_data_attribute_match_needs_review");
  const appliedWarning = warningByType(warnings, "master_data_attribute_match_applied");
  const noMatchWarning = warningByType(warnings, "master_data_no_match");
  const matchedAttributes = attributeList(
    match?.matchedAttributes ??
      match?.matched_attributes ??
      appliedWarning?.evidence?.matchedAttributes ??
      appliedWarning?.evidence?.matched_attributes,
  );
  const matchMethod = masterDataMatchMethod(match);

  return {
    match,
    appliedWarning,
    needsReviewWarning,
    noMatchWarning,
    candidates: candidateList(needsReviewWarning?.evidence?.candidates, needsReviewWarning?.evidence),
    matchedAttributes,
    tooltip: masterDataTooltip(matchMethod, matchedAttributes),
    derivedModelWithoutOriginalField: Boolean(match?.matched && matchMethod === "attributes_unique_exact" && !hasModelField(fields)),
  };
}

export function itemMasterDataMatch(item: ArchiveItem | QuoteAgentItem) {
  return ((item as any).masterDataMatch || (item as any).master_data_match || (item as any).master_data || null) as Record<string, any> | null;
}

export function fieldMasterDataMatch(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  return ((field as any).masterDataMatch || (field as any).master_data_match || dictionary.masterDataMatch || dictionary.master_data_match || null) as Record<string, any> | null;
}

export function masterDataModel(match?: Record<string, any> | null) {
  return textValue(match?.model ?? match?.matchedModel ?? match?.matched_model ?? match?.productModel ?? match?.product_model, "");
}

export function masterDataMatchMethod(match?: Record<string, any> | null) {
  return textValue(match?.matchMethod ?? match?.match_method, "");
}

export function masterDataSourceAndId(match?: Record<string, any> | null) {
  const source = textValue(match?.source ?? match?.sourceTable ?? match?.source_table, "");
  const id = textValue(match?.id ?? match?.masterDataId ?? match?.master_data_id ?? match?.recordId ?? match?.record_id, "");
  return [source && `source: ${source}`, id && `id: ${id}`].filter(Boolean).join(" · ");
}

export function fieldIsModelField(field: ArchiveItemField | QuoteAgentField) {
  const termType = fieldTermType(field);
  return modelTermTypes.has(termType) || /(^|_)(model|型号)($|_)/i.test(termType || (field as any).field_name || "");
}

export function attributeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(attributeText).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, raw]) => raw !== undefined && raw !== null && raw !== false && raw !== "")
      .map(([key, raw]) => {
        const label = attributeLabels[key] ?? key;
        return raw === true ? label : `${label}: ${textValue(raw)}`;
      });
  }
  return [];
}

function warningByType(warnings: Array<Record<string, any>>, type: string) {
  return warnings.find((warning) => warning?.type === type) || null;
}

function hasModelField(fields: Array<ArchiveItemField | QuoteAgentField>) {
  return fields.some((field) => fieldIsModelField(field) && hasMeaningfulRawValue(field));
}

function masterDataTooltip(matchMethod: string, matchedAttributes: string[]) {
  if (matchMethod === "model_exact") return "型号精确匹配";
  if (matchMethod === "attributes_unique_exact") {
    return ["属性唯一匹配", matchedAttributes.length ? `命中属性：${matchedAttributes.join("、")}` : ""].filter(Boolean).join("；");
  }
  return matchMethod || "";
}

function candidateList(value: unknown, evidence?: Record<string, any>): MasterDataCandidate[] {
  return asArray(value as any).map((candidate: any) => ({
    model: textValue(candidate?.model ?? candidate?.matchedModel ?? candidate?.matched_model, ""),
    source: textValue(candidate?.source ?? candidate?.sourceTable ?? candidate?.source_table, ""),
    matchedAttributes: attributeList(candidate?.matchedAttributes ?? candidate?.matched_attributes),
    conflicts: evidenceTextList(candidate?.conflicts ?? evidence?.conflicts),
    missingAttributes: evidenceTextList(candidate?.missingAttributes ?? candidate?.missing_attributes ?? evidence?.missingAttributes ?? evidence?.missing_attributes),
    confidenceReason: textValue(candidate?.confidenceReason ?? candidate?.confidence_reason ?? evidence?.confidenceReason ?? evidence?.confidence_reason, ""),
  }));
}

function evidenceTextList(value: unknown) {
  if (Array.isArray(value)) return value.map(evidenceText).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, raw]) => `${attributeLabels[key] ?? key}: ${textValue(raw)}`);
  }
  const text = textValue(value, "");
  return text ? [text] : [];
}

function evidenceText(value: unknown) {
  if (!value || typeof value !== "object") return textValue(value, "");
  const record = value as Record<string, unknown>;
  return textValue(record.message ?? record.reason ?? record.attribute ?? record.name ?? JSON.stringify(record), "");
}

function attributeText(value: unknown) {
  if (!value || typeof value !== "object") return textValue(attributeLabels[String(value)] ?? value, "");
  const record = value as Record<string, unknown>;
  const key = String(record.attribute ?? record.key ?? record.name ?? "");
  const label = attributeLabels[key] ?? key;
  const rawValue = record.value ?? record.matchedValue ?? record.matched_value;
  return [label, rawValue !== undefined && rawValue !== null && rawValue !== "" ? textValue(rawValue) : ""].filter(Boolean).join(": ");
}
