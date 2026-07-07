import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { StandardValueListEditor, type StandardValueListItem } from "./StandardValueListEditor";
import { TermTypePicker } from "./TermTypePicker";
import type {
  Candidate,
  CandidateType,
  DictionaryOptions,
  DictionaryTermType,
  DictionaryValue,
  QuoteAgentField,
  ReviewAction,
  ReviewDraft,
  ReviewOperation,
} from "../types";

interface Props {
  field: QuoteAgentField;
  candidate: Candidate;
  candidateType: CandidateType;
  options: DictionaryOptions;
  draft?: ReviewDraft;
  onSaveDraft: (draft: ReviewDraft) => void;
  onSubmit: (operation: ReviewOperation) => Promise<void>;
  onClose: () => void;
}

type FormState = Record<string, any>;
const valueKinds = ["enum", "enums", "text", "number", "number_unit", "boolean", "date"];

const termActions: Array<{ value: ReviewAction; label: string; hint: string }> = [
  { value: "create_term_type", label: "新增字段 Key", hint: "把原文字段加入字段字典" },
  { value: "approve_term_type_as_alias", label: "作为已有 Key alias", hint: "归并到已有字段 Key" },
  { value: "split_term_type", label: "拆分复合字段", hint: "把复合字段名拆成多个字段 Key" },
  { value: "reject", label: "拒绝", hint: "标记为无效候选" },
];

const valueActions: Array<{ value: ReviewAction; label: string; hint: string }> = [
  { value: "create_value", label: "新增标准值", hint: "为当前字段加入标准枚举值" },
  { value: "approve_value_as_alias", label: "作为已有值 alias", hint: "归并到已有标准值" },
  { value: "move_value_to_other_term_type", label: "移动字段 Key", hint: "候选字段归属错误时使用" },
  { value: "split_value", label: "拆分字段", hint: "一个原始值拆成多项字段" },
  { value: "update_term_type_value_kind", label: "修改字段类型", hint: "调整 enum/text/number 等类型" },
  { value: "reject", label: "拒绝", hint: "标记为无效候选" },
];

const inputClass = "box-border h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500";
const textClass = "box-border min-h-20 w-full min-w-0 resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500";
const labelClass = "min-w-0 space-y-1 text-[11px] font-medium text-slate-600";

const list = (value: unknown) =>
  String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const join = (value: unknown) => (Array.isArray(value) ? value.join("\n") : String(value || ""));
const valueKeyOf = (item: DictionaryValue) => String(item.id ?? (item as any).termId ?? (item as any).term_id ?? item.canonicalValue ?? "");
const rawValueOf = (candidate: Candidate, field: QuoteAgentField) =>
  field.raw_value || candidate.rawValue || candidate.evidence?.sourceRawValue || "";
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
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

const valueListFromPayload = (values: unknown, fallbackRaw = ""): StandardValueListItem[] => {
  if (!Array.isArray(values)) return fallbackRaw ? [valueListItem(fallbackRaw, fallbackRaw, fallbackRaw)] : [valueListItem()];
  const nextValues = values
    .map((item: any) => valueListItem(item?.canonicalValue, item?.displayName, item?.aliasNames))
    .filter((item) => item.canonicalValue || item.displayName || item.aliasNamesText);
  return nextValues.length ? nextValues : [valueListItem(fallbackRaw, fallbackRaw, fallbackRaw)];
};

function initialState(candidate: Candidate, field: QuoteAgentField, candidateType: CandidateType, draft?: ReviewDraft): FormState {
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

function parseValues(text: string) {
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

function payloadFor(action: ReviewAction, state: FormState) {
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

function withFieldQualifier(payload: Record<string, unknown>, field: QuoteAgentField) {
  const qualifier = field.qualifier;
  if (!qualifier || typeof qualifier !== "object" || !Object.keys(qualifier).length) return payload;
  return {
    ...payload,
    qualifier: { ...qualifier },
  };
}

export function FieldReviewPanel({ field, candidate, candidateType, options, draft, onSaveDraft, onSubmit, onClose }: Props) {
  const actions = candidateType === "term_type" ? termActions : valueActions;
  const [action, setAction] = useState<ReviewAction | "">(draft?.action || "");
  const [state, setState] = useState<FormState>(() => initialState(candidate, field, candidateType, draft));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAction(draft?.action || "");
    setState(initialState(candidate, field, candidateType, draft));
  }, [candidate, candidateType, draft, field]);

  const selectedTermType = useMemo(
    () => options.termTypes.find((item) => item.termType === state.termType),
    [options.termTypes, state.termType],
  );
  const values = useMemo(
    () => options.values.filter((item) => !state.termType || item.termType === state.termType),
    [options.values, state.termType],
  );
  const selectedEnumLabels = values
    .map((item) => item.displayName || item.canonicalValue)
    .filter(Boolean);
  const rawValue = rawValueOf(candidate, field);
  const rawValueAlreadyExists = values.some((item) => {
    const aliases = [...(item.aliasNames || []), ...(item.aliases || [])];
    return [item.canonicalValue, item.displayName, ...aliases].some((value) => normalize(value) === normalize(rawValue));
  });
  const targetIsEnum = state.valueKind === "enum" || state.valueKind === "enums";
  const categoryOptions = useMemo(
    () => Array.from(new Set(options.termTypes.map((item) => item.category).filter(Boolean))).sort() as string[],
    [options.termTypes],
  );

  const update = (key: string, value: unknown) => setState((current) => ({ ...current, [key]: value }));
  const chooseExistingValue = (valueId: string) => {
    const selectedValue = values.find((item) => valueKeyOf(item) === valueId);
    setState((current) => ({
      ...current,
      termId: valueId,
      aliasNamesText: current.aliasNamesText || rawValue,
      canonicalValue: selectedValue?.canonicalValue || current.canonicalValue,
      displayName: selectedValue?.displayName || current.displayName,
    }));
  };
  const chooseTermType = (termType: string, term?: DictionaryTermType) => {
    const nextValues = options.values.filter((item) => item.termType === termType);
    const nextRawValueAlreadyExists = nextValues.some((item) => {
      const aliases = [...(item.aliasNames || []), ...(item.aliases || [])];
      return [item.canonicalValue, item.displayName, ...aliases].some((value) => normalize(value) === normalize(rawValue));
    });
    setState((current) => ({
      ...current,
      termType,
      valueKind: term?.valueKind || current.valueKind,
      displayName: term?.displayName || current.displayName,
      quoteDisplayName: term?.quoteDisplayName || current.quoteDisplayName,
      category: term?.category || current.category,
      sortOrder: term?.sortOrder ?? current.sortOrder,
      applicableProductTypes: term?.applicableProductTypes || current.applicableProductTypes,
      addEnumValue: term?.valueKind === "enum" || term?.valueKind === "enums" ? !nextRawValueAlreadyExists : false,
    }));
  };
  const effectiveAction = (): ReviewAction => (
    action === "approve_term_type_as_alias" && state.editTermTypeSettings === true
      ? "create_term_type"
      : action as ReviewAction
  );
  const operation = (): ReviewOperation => ({
    candidateType,
    candidateId: String(candidate.id),
    action: effectiveAction(),
    payload: withFieldQualifier(payloadFor(effectiveAction(), state), field),
  });
  const save = () => {
    onSaveDraft({ ...operation(), label: actions.find((item) => item.value === action)?.label || action, updatedAt: Date.now() });
    onClose();
  };
  const submit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      await onSubmit(operation());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white shadow-2xl md:absolute md:inset-auto md:right-4 md:top-10 md:w-[min(520px,calc(100vw-2rem))] md:border">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{candidateType === "term_type" ? "字段 Key 审核" : "字段值审核"}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            #{candidate.id} · {field.field_name || candidate.rawFieldName || "未命名字段"}
          </div>
        </div>
        <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
        <div className="mb-3 grid grid-cols-1 gap-2 text-xs text-slate-600 xl:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] text-slate-400">原文字段</div>
            <div className="mt-1 break-words text-slate-800">{field.field_name || candidate.rawFieldName || "-"}</div>
          </div>
          <div className="border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] text-slate-400">原始值</div>
            <div className="mt-1 break-words text-slate-800">{rawValue || "-"}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {actions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`qa-action-tab ${action === item.value ? "qa-action-tab-active" : ""}`}
              onClick={() => setAction(item.value)}
            >
              <span className="block text-xs font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-[360px] border border-slate-200 bg-white p-3">
          {!action && (
            <div className="flex min-h-[320px] items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
              请选择一个审核动作，选择后再填写对应表单。
            </div>
          )}

          {action === "create_term_type" && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Field label="字段 Key"><input className={inputClass} value={state.termType} onChange={(event) => update("termType", event.target.value)} /></Field>
              <Field label="中文名"><input className={inputClass} value={state.displayName} onChange={(event) => update("displayName", event.target.value)} /></Field>
              <Field label="报价显示名"><input className={inputClass} value={state.quoteDisplayName} onChange={(event) => update("quoteDisplayName", event.target.value)} /></Field>
              <Field label="分类"><input className={inputClass} value={state.category} onChange={(event) => update("category", event.target.value)} /></Field>
              <Field label="排序"><input className={inputClass} value={state.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></Field>
              <Field label="字段类型"><KindSelect value={state.valueKind} onChange={(value) => update("valueKind", value)} /></Field>
              <Field label="适用产品类型" wide>
                <ProductTypeSelect options={options} value={state.applicableProductTypes || []} onChange={(value) => update("applicableProductTypes", value)} />
              </Field>
              {state.valueKind === "enum" || state.valueKind === "enums" ? (
                <EnumValueFields state={state} update={update} rawValueAlreadyExists={false} />
              ) : null}
              <Field label="字段 alias，一行一个" wide><textarea className={textClass} value={state.aliasNamesText} onChange={(event) => update("aliasNamesText", event.target.value)} /></Field>
              <Field label="说明" wide><textarea className={textClass} value={state.description} onChange={(event) => update("description", event.target.value)} /></Field>
            </div>
          )}

          {action === "approve_term_type_as_alias" && (
            <div className="space-y-3">
              <TermTypePicker value={state.termType} options={options.termTypes} values={options.values} onChange={chooseTermType} />
              {selectedTermType && (
                <div className="flex flex-wrap items-start justify-between gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {selectedTermType.displayName || selectedTermType.termType}
                      <span className="ml-2 border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                        {state.valueKind || "未设置类型"}
                      </span>
                    </div>
                    <div className="mt-1 break-words text-slate-500">
                      字段分类：{selectedTermType.category || "未分类"} · 适用产品类型：{selectedTermType.applicableProductTypes?.join("、") || "全部或未设置"}
                      {(state.valueKind === "enum" || state.valueKind === "enums") && (
                        <>
                          {" · "}
                          <span
                            className="inline-flex cursor-help border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600"
                            title={selectedEnumLabels.length ? selectedEnumLabels.join("、") : "该 Key 当前还没有标准枚举值"}
                          >
                            枚举值 {selectedEnumLabels.length} 个
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="qa-btn qa-btn-secondary qa-btn-sm"
                    type="button"
                    onClick={() => update("editTermTypeSettings", state.editTermTypeSettings !== true)}
                  >
                    {state.editTermTypeSettings === true ? "收起设置" : "修改 Key 设置"}
                  </button>
                </div>
              )}
              {state.editTermTypeSettings === true && (
                <div className="min-w-0 space-y-3 overflow-hidden border border-blue-200 bg-blue-50 p-3">
                  <div className="text-xs text-blue-800">
                    这里修改的是目标字段 Key 本身。字段中文名用于审核和选择，报价单显示名用于最终报价单展示。
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-3">
                    <Field label="字段中文名">
                      <input className={inputClass} value={state.displayName || ""} onChange={(event) => update("displayName", event.target.value)} />
                    </Field>
                    <Field label="报价单显示名">
                      <input className={inputClass} value={state.quoteDisplayName || ""} onChange={(event) => update("quoteDisplayName", event.target.value)} />
                    </Field>
                    <Field label="字段类型">
                      <KindSelect value={state.valueKind} onChange={(value) => update("valueKind", value)} />
                    </Field>
                    <Field label="字段分类">
                      <CategoryInput value={state.category || ""} options={categoryOptions} onChange={(value) => update("category", value)} />
                    </Field>
                    <Field label="适用产品类型" wide>
                      <ProductTypeSelect options={options} value={state.applicableProductTypes || []} onChange={(value) => update("applicableProductTypes", value)} />
                    </Field>
                  </div>
                </div>
              )}
              <Field label="字段 alias，一行一个">
                <textarea className={textClass} value={state.aliasNamesText} onChange={(event) => update("aliasNamesText", event.target.value)} />
              </Field>
              {targetIsEnum && (
                <div className="space-y-2 border border-slate-200 bg-slate-50 p-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={state.addEnumValue === true}
                      disabled={rawValueAlreadyExists}
                      onChange={(event) => update("addEnumValue", event.target.checked)}
                    />
                    同时把“{rawValue || "-"}”加入该 Key 的枚举值
                  </label>
                  {rawValueAlreadyExists ? (
                    <div className="text-xs text-emerald-700">该值已经在目标 Key 的枚举或 alias 中，不需要重复新增。</div>
                  ) : (
                    <EnumValueFields state={state} update={update} rawValueAlreadyExists={rawValueAlreadyExists} />
                  )}
                </div>
              )}
            </div>
          )}

          {action === "split_term_type" && (
            <Field label="拆分行，格式：termType | 中文名 | valueKind | rawValue | alias1,alias2 | canonicalValue">
              <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.termTypeSplitsText} onChange={(event) => update("termTypeSplitsText", event.target.value)} />
            </Field>
          )}

          {action === "create_value" && (
            <div className="space-y-3">
              <StandardValueListEditor
                values={Array.isArray(state.valuesList) ? state.valuesList : valueListFromPayload(parseValues(state.valuesText || ""))}
                onChange={(values) => update("valuesList", values)}
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={state.suppressRawAlias === true} onChange={(event) => update("suppressRawAlias", event.target.checked)} />
                不自动把原始值作为 alias
              </label>
            </div>
          )}

          {action === "approve_value_as_alias" && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Field label="已有标准值">
                <select className={inputClass} value={state.termId} onChange={(event) => chooseExistingValue(event.target.value)}>
                  <option value="">请选择</option>
                  {values.map((item) => <option key={valueKeyOf(item)} value={valueKeyOf(item)}>{item.displayName || item.canonicalValue}</option>)}
                </select>
              </Field>
              <Field label="aliasNames，一行一个"><textarea className={textClass} value={state.aliasNamesText} onChange={(event) => update("aliasNamesText", event.target.value)} /></Field>
            </div>
          )}

          {action === "move_value_to_other_term_type" && (
            <div className="space-y-3">
              <TermTypePicker value={state.termType} options={options.termTypes} values={options.values} onChange={chooseTermType} />
              <Field label="rawValue"><input className={inputClass} value={state.rawValue} onChange={(event) => update("rawValue", event.target.value)} /></Field>
              <Field label="原因"><textarea className={textClass} value={state.reason} onChange={(event) => update("reason", event.target.value)} /></Field>
            </div>
          )}

          {action === "split_value" && (
            <Field label="拆分行，格式：termType | rawValue">
              <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.splitsText} onChange={(event) => update("splitsText", event.target.value)} />
            </Field>
          )}

          {action === "update_term_type_value_kind" && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Field label="字段 Key"><input className={inputClass} value={state.termType} onChange={(event) => update("termType", event.target.value)} /></Field>
              <Field label="字段类型"><KindSelect value={state.valueKind} onChange={(value) => update("valueKind", value)} /></Field>
            </div>
          )}

          {action === "reject" && (
            <Field label="拒绝原因">
              <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.reason} onChange={(event) => update("reason", event.target.value)} />
            </Field>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
        <div className="text-xs text-slate-500">保存草稿后，可在底部批量提交。</div>
        <div className="flex gap-2">
          <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={save} disabled={!action}>保存草稿</button>
          <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={submit} disabled={!action || submitting}>
            {submitting ? "提交中" : "立即提交"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`${labelClass} ${wide ? "xl:col-span-2" : ""}`}><span>{label}</span><div className="min-w-0">{children}</div></label>;
}

function KindSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {valueKinds.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

function CategoryInput({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const [mode, setMode] = useState(options.includes(value) || !value ? "select" : "custom");
  useEffect(() => {
    setMode(options.includes(value) || !value ? "select" : "custom");
  }, [options, value]);

  return (
    <div className="space-y-2">
      <select
        className={inputClass}
        value={mode === "custom" ? "__custom__" : value}
        onChange={(event) => {
          if (event.target.value === "__custom__") {
            setMode("custom");
            return;
          }
          setMode("select");
          onChange(event.target.value);
        }}
      >
        <option value="">未分类</option>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
        <option value="__custom__">自定义</option>
      </select>
      {mode === "custom" && (
        <input
          className={inputClass}
          value={value}
          placeholder="填写新的字段分类"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function EnumValueFields({ state, update, rawValueAlreadyExists }: { state: FormState; update: (key: string, value: unknown) => void; rawValueAlreadyExists: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Field label="枚举 canonicalValue">
        <input className={inputClass} value={state.valueCanonicalValue || ""} disabled={rawValueAlreadyExists} onChange={(event) => update("valueCanonicalValue", event.target.value)} />
      </Field>
      <Field label="枚举显示名">
        <input className={inputClass} value={state.valueDisplayName || ""} disabled={rawValueAlreadyExists} onChange={(event) => update("valueDisplayName", event.target.value)} />
      </Field>
      <Field label="枚举 alias，一行一个" wide>
        <textarea className={textClass} value={state.valueAliasNamesText || ""} disabled={rawValueAlreadyExists} onChange={(event) => update("valueAliasNamesText", event.target.value)} />
      </Field>
    </div>
  );
}

function ProductTypeSelect({ options, value, onChange }: { options: DictionaryOptions; value: string[]; onChange: (value: string[]) => void }) {
  const productTypes = [
    { canonicalValue: "common", displayName: "所有产品 common" },
    ...options.productTypes,
  ].filter((item, index, array) => {
    const product = String(item.canonicalValue || item.value || item.label || item.displayName || "");
    return product && array.findIndex((other) => String(other.canonicalValue || other.value || other.label || other.displayName || "") === product) === index;
  });

  return (
    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto border border-slate-200 p-2">
      {productTypes.map((item) => {
        const product = String(item.canonicalValue || item.value || item.label || item.displayName || "");
        const checked = value.includes(product);
        return (
          <label key={product} className={`inline-flex items-center gap-1 border-l-4 px-2 py-1 text-[11px] shadow-sm ${checked ? "border-blue-600 bg-white text-blue-700 ring-1 ring-blue-200" : "border-l-transparent border-slate-200 bg-white text-slate-600"}`}>
            <input
              className="accent-blue-600"
              type="checkbox"
              checked={checked}
              onChange={(event) => onChange(event.target.checked ? [...value, product] : value.filter((current) => current !== product))}
            />
            {item.displayName || item.label || product}
          </label>
        );
      })}
    </div>
  );
}
