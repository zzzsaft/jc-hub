import type { StandardValueListItem } from "./StandardValueListEditor";
import type {
  Candidate,
  CandidateType,
  DictionaryValue,
  QuoteAgentField,
  ReviewAction,
  ReviewDraft,
} from "../types";

export type FormState = Record<string, any>;

export const valueKinds = ["enum", "enums", "text", "number", "number_unit", "boolean", "date"];

export const termActions: Array<{ value: ReviewAction; label: string; hint: string }> = [
  { value: "create_term_type", label: "新增字段 Key", hint: "把原文字段加入字段字典" },
  { value: "approve_term_type_as_alias", label: "作为已有 Key alias", hint: "归并到已有字段 Key" },
  { value: "split_term_type", label: "拆分复合字段", hint: "把复合字段名拆成多个字段 Key" },
  { value: "reject", label: "拒绝", hint: "标记为无效候选" },
];

export const valueActions: Array<{ value: ReviewAction; label: string; hint: string }> = [
  { value: "create_value", label: "新增标准值", hint: "为当前字段加入标准枚举值" },
  { value: "approve_value_as_alias", label: "作为已有值 alias", hint: "归并到已有标准值" },
  { value: "move_value_to_other_term_type", label: "移动字段 Key", hint: "候选字段归属错误时使用" },
  { value: "split_value", label: "拆分字段", hint: "一个原始值拆成多项字段" },
  { value: "update_term_type_value_kind", label: "修改字段类型", hint: "调整 enum/text/number 等类型" },
  { value: "reject", label: "拒绝", hint: "标记为无效候选" },
];

export const inputClass = "box-border h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500";
export const textClass = "box-border min-h-20 w-full min-w-0 resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500";
export const labelClass = "min-w-0 space-y-1 text-[11px] font-medium text-slate-600";

export const list = (value: unknown) =>
  String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const join = (value: unknown) => (Array.isArray(value) ? value.join("\n") : String(value || ""));
export const valueKeyOf = (item: DictionaryValue) => String(item.id ?? (item as any).termId ?? (item as any).term_id ?? item.canonicalValue ?? "");
export const rawValueOf = (candidate: Candidate, field: QuoteAgentField) =>
  field.raw_value || candidate.rawValue || candidate.evidence?.sourceRawValue || "";
export const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const valueListItemId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const valueListItem = (
  canonicalValue = "",
  displayName = canonicalValue,
  aliasNames: unknown = canonicalValue,
): StandardValueListItem => ({
  id: valueListItemId(),
  canonicalValue: String(canonicalValue || ""),
  displayName: String(displayName || canonicalValue || ""),
  aliasNamesText: join(aliasNames),
});

const valuesTextFromPayload = (values: unknown) =>
  Array.isArray(values)
    ? values
        .map((item: any) => [item.canonicalValue, item.displayName, join(item.aliasNames)].filter(Boolean).join(" | "))
        .join("\n")
    : "";

export const valueListFromPayload = (values: unknown, fallbackRaw = ""): StandardValueListItem[] => {
  if (!Array.isArray(values)) return fallbackRaw ? [valueListItem(fallbackRaw, fallbackRaw, fallbackRaw)] : [valueListItem()];
  const nextValues = values
    .map((item: any) => valueListItem(item?.canonicalValue, item?.displayName, item?.aliasNames))
    .filter((item) => item.canonicalValue || item.displayName || item.aliasNamesText);
  return nextValues.length ? nextValues : [valueListItem(fallbackRaw, fallbackRaw, fallbackRaw)];
};

export function initialState(candidate: Candidate, field: QuoteAgentField, candidateType: CandidateType, draft?: ReviewDraft): FormState {
  if (draft) {
    return {
      ...draft.payload,
      addEnumValue: draft.payload.valueCanonicalValue !== undefined,
      aliasNamesText: join(draft.payload.aliasNames),
      valueAliasNamesText: join(draft.payload.valueAliasNames),
      valuesText: valuesTextFromPayload(draft.payload.values),
      valuesList: valueListFromPayload(draft.payload.values, String(draft.payload.canonicalValue || "")),
      splitsText: Array.isArray(draft.payload.splits)
        ? draft.payload.splits.map((item: any) => `${item.termType || ""} | ${item.rawValue || ""}`).join("\n")
        : "",
      termTypeSplitsText: Array.isArray(draft.payload.splits)
        ? draft.payload.splits
            .map((item: any) => [
              item.termType,
              item.displayName,
              item.valueKind,
              item.rawValue,
              join(item.aliasNames),
              item.canonicalValue,
            ].filter((value) => value !== undefined && value !== null && value !== "").join(" | "))
            .join("\n")
        : "",
    };
  }

  const raw = rawValueOf(candidate, field);
  const name = field.field_name || candidate.rawFieldName || "";
  const primaryDisplayName = candidateType === "value" ? raw : name;
  const primaryAlias = candidateType === "value" ? raw : name || raw;
  return {
    termType: candidate.termType || field.dictionary?.term_type || field.dictionary?.normalized_field_name || "",
    displayName: primaryDisplayName,
    quoteDisplayName: name,
    category: "",
    sortOrder: "",
    valueKind: candidate.valueKind || "text",
    description: candidate.reason || "",
    aliasNamesText: primaryAlias,
    valueCanonicalValue: raw,
    valueDisplayName: raw,
    valueAliasNamesText: raw,
    addEnumValue: true,
    canonicalValue: raw,
    rawValue: raw,
    reason: candidate.reason || "",
    termId: "",
    valuesText: `${raw} | ${raw} | ${raw}`,
    valuesList: [valueListItem(String(raw), String(raw), String(raw))],
    splitsText: `${candidate.termType || ""} | ${raw}`,
    termTypeSplitsText: `${candidate.termType || ""} | ${name} | ${candidate.valueKind || "text"} | ${raw} | ${name}`,
    applicableProductTypes: [],
    editTermTypeSettings: false,
    appendApplicableProductType: true,
    suppressRawAlias: false,
  };
}

export function parseValues(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const [canonicalValue, displayName, aliases] = line.split("|").map((item) => item.trim());
      return { canonicalValue, displayName: displayName || undefined, aliasNames: list(aliases) };
    })
    .filter((item) => item.canonicalValue);
}

function valuesFromState(state: FormState) {
  if (Array.isArray(state.valuesList)) {
    return state.valuesList
      .map((item: StandardValueListItem) => {
        const canonicalValue = String(item.canonicalValue || "").trim();
        return {
          canonicalValue,
          displayName: String(item.displayName || "").trim() || canonicalValue,
          aliasNames: list(item.aliasNamesText),
        };
      })
      .filter((item) => item.canonicalValue);
  }

  return parseValues(state.valuesText || "");
}

function parseSplits(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const [termType, rawValue] = line.split("|").map((item) => item.trim());
      return { termType, rawValue };
    })
    .filter((item) => item.termType && item.rawValue);
}

function parseTermTypeSplits(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const [termType, displayName, valueKind, rawValue, aliases, canonicalValue] = line.split("|").map((item) => item.trim());
      return {
        termType,
        displayName: displayName || undefined,
        valueKind: valueKind || "text",
        rawValue: rawValue || undefined,
        aliasNames: list(aliases),
        canonicalValue: canonicalValue || undefined,
      };
    })
    .filter((item) => item.termType);
}

export function payloadFor(action: ReviewAction, state: FormState) {
  if (action === "create_term_type") {
    return {
      termType: state.termType,
      displayName: state.displayName,
      quoteDisplayName: state.quoteDisplayName,
      category: state.category,
      sortOrder: state.sortOrder === "" ? undefined : Number(state.sortOrder),
      valueKind: state.valueKind,
      description: state.description,
      applicableProductTypes: state.applicableProductTypes || [],
      aliasNames: list(state.aliasNamesText),
      valueCanonicalValue: state.valueCanonicalValue,
      valueDisplayName: state.valueDisplayName,
      valueAliasNames: list(state.valueAliasNamesText),
    };
  }
  if (action === "approve_term_type_as_alias") {
    const shouldAddEnumValue = state.addEnumValue === true && (state.valueKind === "enum" || state.valueKind === "enums");
    return {
      termType: state.termType,
      valueKind: state.valueKind,
      aliasNames: list(state.aliasNamesText),
      valueCanonicalValue: shouldAddEnumValue ? state.valueCanonicalValue : undefined,
      valueDisplayName: shouldAddEnumValue ? state.valueDisplayName : undefined,
      valueAliasNames: shouldAddEnumValue ? list(state.valueAliasNamesText) : [],
      appendApplicableProductType: state.appendApplicableProductType === true,
    };
  }
  if (action === "split_term_type") return { splits: parseTermTypeSplits(state.termTypeSplitsText || "") };
  if (action === "create_value") {
    const values = valuesFromState(state);
    const primaryValue = values[0];
    return {
      termType: state.termType,
      canonicalValue: primaryValue?.canonicalValue || state.canonicalValue,
      displayName: primaryValue?.displayName || state.displayName,
      aliasNames: primaryValue?.aliasNames?.length ? primaryValue.aliasNames : list(state.aliasNamesText),
      values,
      suppressCandidateRawAlias: state.suppressRawAlias === true,
    };
  }
  if (action === "approve_value_as_alias") return { termId: state.termId, aliasNames: list(state.aliasNamesText) };
  if (action === "move_value_to_other_term_type") return { termType: state.termType, rawValue: state.rawValue, reason: state.reason };
  if (action === "split_value") return { splits: parseSplits(state.splitsText || "") };
  if (action === "update_term_type_value_kind") return { termType: state.termType, valueKind: state.valueKind };
  return { reason: state.reason };
}

export function withFieldQualifier(payload: Record<string, unknown>, field: QuoteAgentField) {
  const qualifier = field.qualifier;
  if (!qualifier || typeof qualifier !== "object" || !Object.keys(qualifier).length) return payload;
  return {
    ...payload,
    qualifier: { ...qualifier },
  };
}
