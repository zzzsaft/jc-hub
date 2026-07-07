import type {
  Candidate,
  CandidateType,
  ProductMasterDataTermType,
  QuoteAgentField,
  QuoteAgentItem,
} from "./types";
import { asArray } from "./common.utils";
import { fieldDisplayValue } from "./field.utils";

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
    return { statusLabel: "适用待审", buttonLabel: "加产品", tone: "info" };
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
