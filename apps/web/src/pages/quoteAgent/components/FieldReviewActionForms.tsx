import { StandardValueListEditor } from "./StandardValueListEditor";
import { TermTypePicker } from "./TermTypePicker";
import type { DictionaryOptions, DictionaryTermType, DictionaryValue, ReviewAction } from "../types";
import { CategoryInput, EnumValueFields, Field, KindSelect, ProductTypeSelect } from "./FieldReviewFormControls";
import {
  inputClass,
  parseValues,
  textClass,
  valueKeyOf,
  valueListFromPayload,
} from "./fieldReviewPanel.utils";
import type { FormState } from "./fieldReviewPanel.utils";

type Props = {
  action: ReviewAction | "";
  state: FormState;
  options: DictionaryOptions;
  selectedTermType?: DictionaryTermType;
  values: DictionaryValue[];
  selectedEnumLabels: string[];
  rawValue: string;
  rawValueAlreadyExists: boolean;
  targetIsEnum: boolean;
  categoryOptions: string[];
  update: (key: string, value: unknown) => void;
  chooseTermType: (termType: string, term?: DictionaryTermType) => void;
  chooseExistingValue: (valueId: string) => void;
};

export function FieldReviewActionForms({
  action,
  state,
  options,
  selectedTermType,
  values,
  selectedEnumLabels,
  rawValue,
  rawValueAlreadyExists,
  targetIsEnum,
  categoryOptions,
  update,
  chooseTermType,
  chooseExistingValue,
}: Props) {
  if (!action) {
    return (
      <div className="flex min-h-[320px] items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
        请选择一个审核动作，选择后再填写对应表单。
      </div>
    );
  }

  if (action === "create_term_type") {
    return (
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
    );
  }

  if (action === "approve_term_type_as_alias") {
    return (
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
    );
  }

  if (action === "split_term_type") {
    return (
      <Field label="拆分行，格式：termType | 中文名 | valueKind | rawValue | alias1,alias2 | canonicalValue">
        <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.termTypeSplitsText} onChange={(event) => update("termTypeSplitsText", event.target.value)} />
      </Field>
    );
  }

  if (action === "create_value") {
    return (
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
    );
  }

  if (action === "approve_value_as_alias") {
    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Field label="已有标准值">
          <select className={inputClass} value={state.termId} onChange={(event) => chooseExistingValue(event.target.value)}>
            <option value="">请选择</option>
            {values.map((item) => <option key={valueKeyOf(item)} value={valueKeyOf(item)}>{item.displayName || item.canonicalValue}</option>)}
          </select>
        </Field>
        <Field label="aliasNames，一行一个"><textarea className={textClass} value={state.aliasNamesText} onChange={(event) => update("aliasNamesText", event.target.value)} /></Field>
      </div>
    );
  }

  if (action === "move_value_to_other_term_type") {
    return (
      <div className="space-y-3">
        <TermTypePicker value={state.termType} options={options.termTypes} values={options.values} onChange={chooseTermType} />
        <Field label="rawValue"><input className={inputClass} value={state.rawValue} onChange={(event) => update("rawValue", event.target.value)} /></Field>
        <Field label="原因"><textarea className={textClass} value={state.reason} onChange={(event) => update("reason", event.target.value)} /></Field>
      </div>
    );
  }

  if (action === "split_value") {
    return (
      <Field label="拆分行，格式：termType | rawValue">
        <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.splitsText} onChange={(event) => update("splitsText", event.target.value)} />
      </Field>
    );
  }

  if (action === "update_term_type_value_kind") {
    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Field label="字段 Key"><input className={inputClass} value={state.termType} onChange={(event) => update("termType", event.target.value)} /></Field>
        <Field label="字段类型"><KindSelect value={state.valueKind} onChange={(value) => update("valueKind", value)} /></Field>
      </div>
    );
  }

  return (
    <Field label="拒绝原因">
      <textarea className="min-h-36 w-full resize-y border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={state.reason} onChange={(event) => update("reason", event.target.value)} />
    </Field>
  );
}
