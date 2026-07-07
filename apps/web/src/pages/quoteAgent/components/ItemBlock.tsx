import { QuestionCircleOutlined } from "@/components/ui/icons";
import { FieldReviewPanel } from "./FieldReviewPanel";
import { ProductMasterDataPanel } from "./ProductMasterDataPanel";
import { ProductApplicabilityPanel } from "./ProductApplicabilityPanel";
import type { Candidate, DictionaryOptions, ProductMasterDataTermType, QuoteAgentField, QuoteAgentItem, ReviewDraft, ReviewOperation } from "../types";
import {
  applicabilityWarning,
  asArray,
  candidateTypeOf,
  dictionaryValue,
  draftKey,
  fieldDisplayName,
  fieldDisplayNameWithQualifier,
  fieldQualifierLabel,
  fieldOriginalName,
  fieldStableKey,
  fieldStatus,
  json,
  matchCandidate,
  productMasterDataMatch,
  productMasterDataTermType,
  reviewKind,
  roughnessDisplayText,
  toneClass,
} from "../utils";

export function ItemBlock(props: {
  item: QuoteAgentItem;
  candidates: Candidate[];
  currentDocumentId: string | number;
  extractionResultId?: string | number;
  activeFieldKey: string;
  expandedFieldKey: string;
  drafts: Record<string, ReviewDraft>;
  selectedDraftKeys: string[];
  options: DictionaryOptions;
  hideNonReviewFields: boolean;
  expandedAllFieldItems: string[];
  onOpenReview: (key: string) => void;
  onToggleJson: (key: string) => void;
  onSaveDraft: (draft: ReviewDraft) => void;
  onSubmit: (operations: ReviewOperation[]) => Promise<void>;
  onCloseReview: () => void;
  onToggleAllFields: (itemKey: string) => void;
  onToggleDraft: (key: string) => void;
}) {
  const { item, candidates, currentDocumentId } = props;
  const fields = asArray(item.fields);
  const itemKey = String(item.item_index ?? "unknown");
  const showAllFields = !props.hideNonReviewFields || props.expandedAllFieldItems.includes(itemKey);
  const directCandidateIds = new Set(
    fields
      .map((field) => field.candidate?.candidate_id ?? field.candidate?.id)
      .filter((id) => id !== undefined && id !== null && id !== "")
      .map(String),
  );
  const fieldEntries = fields.map((field, index) => {
    const candidate = matchCandidate(field, item, candidates, currentDocumentId, directCandidateIds);
    const type = candidateTypeOf(field, candidate);
    const productTermType = productMasterDataTermType(field);
    const status = fieldStatus(field);
    const fieldKey = fieldStableKey(field, item.item_index, index, candidate?.id);
    const candidateDraftKey = candidate && type ? draftKey(type, candidate.id) : "";
    const draft = candidateDraftKey ? props.drafts[candidateDraftKey] : undefined;
    const canReview = Boolean(candidate && type && !productTermType);
    const showsProductMasterData = Boolean(productTermType);
    const needsProductApplicability = Boolean(candidate && type === "term_type" && applicabilityWarning(field));
    const reviewMeta = reviewKind(type, needsProductApplicability);
    return { field, index, candidate, type, productTermType, status, fieldKey, candidateDraftKey, draft, canReview, showsProductMasterData, needsProductApplicability, reviewMeta };
  });
  const itemProductMasterTermType = productMasterTermTypeOfItem(item);
  const showsItemProductMasterData = Boolean(
    itemProductMasterTermType && !fieldEntries.some((entry) => entry.productTermType === itemProductMasterTermType),
  );
  const itemProductMasterField = showsItemProductMasterData
    ? productMasterFieldFromItem(item, itemProductMasterTermType as ProductMasterDataTermType)
    : null;
  const hiddenFieldCount = fieldEntries.filter((entry) => !entry.canReview && !entry.showsProductMasterData).length;
  const visibleFieldEntries = showAllFields ? fieldEntries : fieldEntries.filter((entry) => entry.canReview || entry.showsProductMasterData);
  const visibleFieldSections = groupFieldEntriesByQualifier(visibleFieldEntries);
  return (
    <article className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">明细 #{String(item.item_index ?? "-")}</span>
          <span className="text-slate-500">数量 {String(item.item_quantity ?? "-")}</span>
          <span className="text-slate-500">产品类型 {String(item.itemProductTypeHint ?? "-")}</span>
          <span className="text-slate-500">置信度 {String(item.itemProductTypeHintConfidence ?? "-")}</span>
          {asArray(item.warnings).length > 0 && <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">警告 {asArray(item.warnings).length}</span>}
          {props.hideNonReviewFields && hiddenFieldCount > 0 && (
            <button className="qa-btn qa-btn-secondary qa-btn-sm !bg-white" type="button" onClick={() => props.onToggleAllFields(itemKey)}>
              {showAllFields ? "\u6536\u8d77\u666e\u901a\u5b57\u6bb5" : `\u5c55\u5f00\u666e\u901a\u5b57\u6bb5 ${hiddenFieldCount}`}
            </button>
          )}
        </div>
        {item.itemProductTypeHintRawValue && <div className="mt-1 truncate text-xs text-slate-500">原始产品类型：{String(item.itemProductTypeHintRawValue)}</div>}
      </div>
      <div className="divide-y divide-slate-100">
        {visibleFieldEntries.length === 0 && props.hideNonReviewFields && !showsItemProductMasterData ? (
          <div className="flex items-center justify-between gap-3 px-3 py-4 text-sm text-slate-500">
            <span>该明细暂无需处理字段，已隐藏 {hiddenFieldCount} 个普通字段。</span>
            <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => props.onToggleAllFields(itemKey)}>展开查看</button>
          </div>
        ) : null}
        {itemProductMasterField && itemProductMasterTermType && (
          <div className="px-3 py-2">
            <ProductMasterDataPanel
              field={itemProductMasterField}
              item={item}
              termType={itemProductMasterTermType}
              documentId={currentDocumentId}
              extractionResultId={props.extractionResultId}
            />
          </div>
        )}
        {visibleFieldSections.map((section) => (
          <div key={section.key} className="divide-y divide-slate-100">
            {section.label && (
              <div className="bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {section.label}
              </div>
            )}
            {section.entries.map(({ field, index, candidate, type, productTermType, status, fieldKey, candidateDraftKey, draft, canReview, needsProductApplicability, reviewMeta }) => {
          const active = props.activeFieldKey === fieldKey;
          const expanded = props.expandedFieldKey === fieldKey;
          const masterDataMatch = productMasterDataMatch(field);
          const baseFieldName = fieldDisplayName(field, props.options);
          const fieldName = fieldDisplayNameWithQualifier(field, props.options);
          const originalFieldName = fieldOriginalName(field);
          const showOriginalFieldName = baseFieldName !== originalFieldName;
          const displayValue = productTermType
            ? String(masterDataMatch?.model || masterDataMatch?.matchedModel || masterDataMatch?.matched_model || dictionaryValue(field) || "-")
            : dictionaryValue(field) || "-";
          const roughnessText = roughnessDisplayText(field);

          return (
            <div key={fieldKey} className={`relative grid grid-cols-1 gap-2 px-3 py-2 text-sm md:grid-cols-[28px_minmax(120px,150px)_minmax(140px,1fr)_minmax(90px,0.65fr)_96px_118px] md:items-start ${canReview ? "bg-amber-50/40" : "bg-white"}`}>
              <div className="flex items-center md:min-h-9">
                {draft && <input type="checkbox" checked={props.selectedDraftKeys.includes(candidateDraftKey)} onChange={() => props.onToggleDraft(candidateDraftKey)} />}
              </div>
              <div className="min-w-0">
                <div className="inline-flex max-w-full items-center gap-1 font-medium text-slate-800">
                  <span className="truncate">{fieldName}</span>
                  {showOriginalFieldName && (
                    <span className="group relative inline-flex shrink-0">
                      <QuestionCircleOutlined className="text-xs text-slate-400" />
                      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 text-xs font-normal text-slate-700 shadow group-hover:block">
                        原值：{originalFieldName}
                      </span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">字段名</div>
              </div>
              <div className="min-w-0">
                <div className="break-words text-slate-700">{String(field.raw_value || candidate?.rawValue || "-")}</div>
                <div className="text-[11px] text-slate-400">原始值</div>
              </div>
              <div className="min-w-0">
                <div className="break-words text-slate-700">{displayValue}</div>
                {roughnessText && (
                  <div className="mt-1 break-words text-xs text-slate-500">{roughnessText}</div>
                )}
                <div className="text-[11px] text-slate-400">{productTermType ? "主数据型号" : "字典匹配值"}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1 md:min-h-9">
                <span className={`border px-2 py-0.5 text-xs ${toneClass(reviewMeta?.tone || status.tone)}`}>{reviewMeta?.statusLabel || status.label}</span>
                {draft && <span className="border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">待提交</span>}
              </div>
              <div className="flex min-w-0 items-center justify-end gap-1 md:min-h-9">
                <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => props.onToggleJson(expanded ? "" : fieldKey)}>详情</button>
                {canReview && <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={() => props.onOpenReview(active ? "" : fieldKey)}>{reviewMeta?.buttonLabel || "??"}</button>}
              </div>

              {expanded && (
                <pre className="col-span-full max-h-72 overflow-auto border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                  {json({ field, candidate, warnings: field.warnings, evidence: field.evidence, dictionary: field.dictionary, masterDataMatch })}
                </pre>
              )}

              {productTermType && (
                <ProductMasterDataPanel
                  field={field}
                  item={item}
                  termType={productTermType}
                  documentId={currentDocumentId}
                  extractionResultId={props.extractionResultId}
                />
              )}

              {active && candidate && type && (
                needsProductApplicability ? (
                  <ProductApplicabilityPanel
                    field={field}
                    item={item}
                    candidate={candidate}
                    onClose={props.onCloseReview}
                    onSubmit={(operation) => props.onSubmit([operation])}
                  />
                ) : (
                  <FieldReviewPanel
                    field={field}
                    candidate={candidate}
                    candidateType={type}
                    options={props.options}
                    draft={draft}
                    onSaveDraft={props.onSaveDraft}
                    onSubmit={(operation) => props.onSubmit([operation])}
                    onClose={props.onCloseReview}
                  />
                )
              )}
            </div>
          );
            })}
          </div>
        ))}
      </div>
    </article>
  );
}

function groupFieldEntriesByQualifier<T extends { field: QuoteAgentField }>(entries: T[]) {
  const plainEntries: T[] = [];
  const groups: Array<{ key: string; label: string; entries: T[] }> = [];
  const groupByLabel = new Map<string, { key: string; label: string; entries: T[] }>();

  entries.forEach((entry) => {
    const label = fieldQualifierLabel(entry.field);
    if (!label) {
      plainEntries.push(entry);
      return;
    }
    const key = `qualifier:${label}`;
    const group = groupByLabel.get(label) ?? { key, label, entries: [] };
    group.entries.push(entry);
    if (!groupByLabel.has(label)) {
      groupByLabel.set(label, group);
      groups.push(group);
    }
  });

  return [
    ...(plainEntries.length ? [{ key: "plain", label: "", entries: plainEntries }] : []),
    ...groups,
  ];
}

function productMasterTermTypeOfItem(item: QuoteAgentItem): ProductMasterDataTermType | null {
  const productType = String(item.itemProductTypeHint || "").toLowerCase();
  if (productType === "filter") return "filter_model";
  if (productType === "metering_pump") return "metering_pump_model";
  return null;
}

function productMasterFieldFromItem(item: QuoteAgentItem, termType: ProductMasterDataTermType): QuoteAgentField {
  const rawValue = String(item.itemProductTypeHintRawValue || item.item_name || "");
  return {
    field_name: termType === "filter_model" ? "过滤器型号" : "计量泵型号",
    raw_value: rawValue,
    dictionary: {
      term_type: termType,
      normalized_field_name: termType,
    },
    warnings: [{ type: "master_data_no_match" }],
  };
}
