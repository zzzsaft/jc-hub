import { useMemo, useState } from "react";
import { QuestionCircleOutlined } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/utils";
import type { ArchiveItemField, DictionaryOptions, QuoteAgentField } from "../../types";
import { fieldIsModelField, fieldMasterDataMatch, masterDataMatchMethod, masterDataSourceAndId } from "../masterData";
import {
  fieldConfidence,
  fieldDisplayValue,
  fieldDisplayValueDetail,
  fieldDisplayName,
  fieldDisplayNameWithQualifier,
  fieldDictionaryMatched,
  fieldEnumOptions,
  fieldOriginalName,
  fieldStableKey,
  hasMeaningfulRawValue,
  hasEvidence,
  isEnumField,
  isLowConfidence,
  isMainConfigField,
  isSplitDerivedField,
  fieldValueKind,
  roughnessDisplayText,
  textValue,
} from "../../utils";
import { JsonBlock } from "./JsonBlock";

type Props = {
  fields?: Array<ArchiveItemField | QuoteAgentField>;
  basePath?: string;
  dictionaryOptions?: DictionaryOptions;
  dirtyFieldIndexes?: number[];
  editable?: boolean;
  mode?: "mainConfig" | "hidden";
  onChange?: (path: string, value: unknown, meta?: { fieldIndex?: number }) => void;
};

export function FieldTable({
  fields = [],
  basePath = "",
  dictionaryOptions,
  dirtyFieldIndexes = [],
  editable = false,
  mode = "mainConfig",
  onChange,
}: Props) {
  if (!fields.length) return <div className="qa-archive-empty">暂无字段</div>;
  const visibleFields = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => (mode === "hidden" ? !isMainConfigField(field) : isMainConfigField(field)));
  if (!visibleFields.length) return <div className="qa-archive-empty">暂无可展示字段</div>;
  const updateFieldDictionary = (index: number, dictionaryPatch: Record<string, unknown>) => {
    if (!basePath) return;
    const nextFields = fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      return {
        ...field,
        dictionary: {
          ...((field as any).dictionary || {}),
          ...dictionaryPatch,
        },
      };
    });
    onChange?.(basePath, nextFields, { fieldIndex: index });
  };

  return (
    <div className="overflow-auto rounded border border-slate-200">
      <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-48 px-3 py-2 text-left font-medium text-slate-600">字段</th>
            <th className="w-72 px-3 py-2 text-left font-medium text-slate-600">值</th>
            <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">质量</th>
            <th className="w-44 px-3 py-2 text-left font-medium text-slate-600">依据</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {visibleFields.map(({ field, index }) => {
            const confidence = fieldConfidence(field);
            const evidence = (field as any).evidence;
            const missingEvidence = !hasEvidence(evidence);
            const splitDerived = isSplitDerivedField(field);
            const shouldWarnMissingEvidence = missingEvidence && !splitDerived;
            const matched = fieldDictionaryMatched(field);
            const baseDisplayName = fieldDisplayName(field, dictionaryOptions);
            const displayName = fieldDisplayNameWithQualifier(field, dictionaryOptions);
            const originalName = fieldOriginalName(field);
            const showOriginalHint = baseDisplayName !== originalName;
            const valueDetail = fieldDisplayValueDetail(field);
            const hasRawValue = hasMeaningfulRawValue(field);
            const showUnmatchedWarning = !matched && hasRawValue;
            const warnRow = (isLowConfidence(field) && hasRawValue) || shouldWarnMissingEvidence;
            const dirty = dirtyFieldIndexes.includes(index);
            const roughnessText = roughnessDisplayText(field);
            return (
              <tr key={fieldStableKey(field, basePath || "archive", index)} className={warnRow ? "bg-amber-50/45" : undefined}>
                <td className="px-3 py-2 align-top text-slate-800">
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate">{displayName}</span>
                    {showOriginalHint && (
                      <span className="group relative inline-flex shrink-0">
                        <QuestionCircleOutlined className="text-xs text-slate-400" />
                        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow group-hover:block">
                          原值：{originalName}
                        </span>
                      </span>
                    )}
                    {dirty && (
                      <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] leading-none text-blue-700">
                        未保存
                      </span>
                    )}
                  </span>
                  <FieldMasterDataMeta field={field} />
                </td>
                <td className="px-3 py-2 align-top">
                  {editable && mode === "mainConfig" && fieldValueKind(field, dictionaryOptions) === "enums" ? (
                    <EnumsFieldEditor
                      field={field}
                      dictionaryOptions={dictionaryOptions}
                      onChange={(value) => {
                        updateFieldDictionary(index, {
                          values: value.values,
                          display_name: value.displayName,
                          matched: value.matched,
                          field_matched: true,
                        });
                      }}
                    />
                  ) : editable && mode === "mainConfig" && isEnumField(field, dictionaryOptions) ? (
                    <EnumFieldEditor
                      field={field}
                      dictionaryOptions={dictionaryOptions}
                      onChange={(value) => {
                        updateFieldDictionary(index, {
                          display_name: value.displayName,
                          canonical_value: value.canonicalValue || value.displayName,
                          matched: value.matched,
                          field_matched: true,
                        });
                      }}
                    />
                  ) : editable && mode === "mainConfig" ? (
                    <input
                      className="qa-archive-input"
                      value={textValue(fieldDisplayValue(field), "")}
                      onChange={(event) => updateFieldDictionary(index, { display_name: event.target.value })}
                    />
                  ) : fieldValueKind(field, dictionaryOptions) === "enums" ? (
                    <EnumsValueTags field={field} dictionaryOptions={dictionaryOptions} />
                  ) : valueDetail.showRawAndStandard ? (
                    <div className="space-y-1">
                      <div>
                        <span className="text-xs text-slate-500">原始：</span>
                        {valueDetail.rawValue}
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">标准：</span>
                        {valueDetail.standardValue}
                      </div>
                    </div>
                  ) : (
                    textValue(valueDetail.displayValue)
                  )}
                  {roughnessText && <div className="mt-1 text-xs text-slate-500">{roughnessText}</div>}
                  {showUnmatchedWarning && <div className="mt-1 text-xs text-amber-700">未匹配，显示原始值</div>}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="space-y-1">
                    <span className={isLowConfidence(field) && hasRawValue ? "qa-archive-badge-warn" : "qa-archive-badge"}>
                      {confidence ?? "-"}
                    </span>
                    {shouldWarnMissingEvidence && <span className="qa-archive-badge-warn">缺依据</span>}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  {missingEvidence ? (
                    splitDerived ? (
                      <span className="text-xs text-slate-500">由原始复合字段拆分生成，未单独提供依据</span>
                    ) : (
                      <span className="text-xs text-amber-700">未提供</span>
                    )
                  ) : (
                    <JsonBlock title=" 依据" value={evidence} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EnumFieldEditor({
  field,
  dictionaryOptions,
  onChange,
}: {
  field: ArchiveItemField | QuoteAgentField;
  dictionaryOptions?: DictionaryOptions;
  onChange: (value: { displayName: string; canonicalValue: string; matched: boolean }) => void;
}) {
  const options = fieldEnumOptions(field, dictionaryOptions);
  const currentValue = textValue(fieldDisplayValue(field), "");
  const selectedOption = options.find((option) => option.displayName === currentValue || option.canonicalValue === currentValue);
  const isCustom = Boolean(currentValue && !selectedOption);
  const [customOpen, setCustomOpen] = useState(isCustom);
  const selectValue = customOpen ? "__custom__" : selectedOption?.displayName ?? "";

  return (
    <div className="space-y-2">
      <select
        className="qa-archive-input"
        value={selectValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === "__custom__") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          const option = options.find((item) => item.displayName === nextValue);
          onChange({
            displayName: option?.displayName ?? nextValue,
            canonicalValue: option?.canonicalValue ?? nextValue,
            matched: Boolean(option),
          });
        }}
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={`${option.canonicalValue}-${option.displayName}`} value={option.displayName}>
            {option.displayName}
          </option>
        ))}
        <option value="__custom__">自定义</option>
      </select>
      {customOpen && (
        <input
          className="qa-archive-input"
          placeholder="自定义值"
          value={isCustom ? currentValue : ""}
          onChange={(event) => onChange({ displayName: event.target.value, canonicalValue: event.target.value, matched: false })}
        />
      )}
    </div>
  );
}

function EnumsFieldEditor({
  field,
  dictionaryOptions,
  onChange,
}: {
  field: ArchiveItemField | QuoteAgentField;
  dictionaryOptions?: DictionaryOptions;
  onChange: (value: { displayName: string; values: Array<{ displayName: string; canonicalValue: string; rawValue?: string }>; matched: boolean }) => void;
}) {
  const options = fieldEnumOptions(field, dictionaryOptions);
  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.canonicalValue || option.displayName, option])),
    [options],
  );
  const optionKeyByAlias = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((option) => {
      const key = option.canonicalValue || option.displayName;
      [option.canonicalValue, option.displayName].filter(Boolean).forEach((value) => {
        map.set(normalizeEnumToken(value), key);
      });
    });
    return map;
  }, [options]);
  const selectedValues = currentEnumValues(field)
    .map((value) => optionKeyByAlias.get(normalizeEnumToken(value)) || value)
    .filter((value, index, array) => array.indexOf(value) === index);
  const [selected, setSelected] = useState<string[]>(selectedValues);
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const commit = (nextSelected: string[]) => {
    setSelected(nextSelected);
    const values = nextSelected
      .map((value) => {
        const option = optionMap.get(value);
        return {
          displayName: option?.displayName || value,
          canonicalValue: option?.canonicalValue || value,
          rawValue: value,
        };
      })
      .filter((value) => value.displayName || value.canonicalValue);
    onChange({
      values,
      displayName: values.map((value) => value.displayName || value.canonicalValue).join(" / "),
      matched: values.length > 0 && values.every((value) => optionMap.has(value.canonicalValue)),
    });
  };

  const toggle = (value: string) => {
    commit(
      selectedSet.has(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="qa-archive-input flex min-h-10 w-full items-center gap-2 bg-white text-left hover:border-slate-400"
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selected.length ? (
              selected.map((value) => (
                <span
                  key={value}
                  className="max-w-full rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs leading-5 text-blue-700"
                >
                  {optionMap.get(value)?.displayName || value}
                </span>
              ))
            ) : (
              <span className="text-slate-400">请选择</span>
            )}
          </span>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">多选</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-[--radix-popover-trigger-width] min-w-64 overflow-auto p-1.5">
        {options.length ? (
          options.map((option) => {
            const value = option.canonicalValue || option.displayName;
            const checked = selectedSet.has(value);
            return (
              <button
                key={`${option.canonicalValue}-${option.displayName}`}
                type="button"
                className={cn(
                  "flex w-full appearance-none items-center gap-2 rounded-md border-0 bg-white px-2.5 py-2 text-left text-sm text-slate-700 shadow-none transition hover:bg-slate-50",
                  "focus:outline-none focus:ring-2 focus:ring-blue-100",
                  checked && "bg-blue-50 text-blue-700 hover:bg-blue-50",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggle(value)}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border bg-white",
                    checked ? "border-blue-500 bg-blue-500" : "border-slate-300",
                  )}
                >
                  {checked && <span className="h-1.5 w-2.5 rotate-[-45deg] border-b-2 border-l-2 border-white" />}
                </span>
                <span className="min-w-0 flex-1 break-words leading-5">{option.displayName}</span>
              </button>
            );
          })
        ) : (
          <div className="px-2 py-3 text-sm text-slate-500">暂无可选枚举值</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FieldMasterDataMeta({ field }: { field: ArchiveItemField | QuoteAgentField }) {
  const match = fieldMasterDataMatch(field);
  if (!match || !fieldIsModelField(field)) return null;
  const matchMethod = masterDataMatchMethod(match);
  const sourceAndId = masterDataSourceAndId(match);
  if (!matchMethod && !sourceAndId) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] leading-5">
      {matchMethod && (
        <span className="rounded border border-blue-100 bg-blue-50 px-1.5 text-blue-700">
          {matchMethod}
        </span>
      )}
      {sourceAndId && (
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 text-slate-500">
          {sourceAndId}
        </span>
      )}
    </div>
  );
}

function EnumsValueTags({
  field,
  dictionaryOptions,
}: {
  field: ArchiveItemField | QuoteAgentField;
  dictionaryOptions?: DictionaryOptions;
}) {
  const options = fieldEnumOptions(field, dictionaryOptions);
  const optionByToken = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((option) => {
      const label = option.displayName || option.canonicalValue;
      [option.canonicalValue, option.displayName].filter(Boolean).forEach((value) => {
        map.set(normalizeEnumToken(value), label);
      });
    });
    return map;
  }, [options]);
  const values = currentEnumValues(field)
    .map((value) => optionByToken.get(normalizeEnumToken(value)) || value)
    .filter((value, index, array) => value && array.indexOf(value) === index);

  if (!values.length) return <span>{textValue(fieldDisplayValue(field))}</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="max-w-full rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs leading-5 text-blue-700"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function currentEnumValues(field: ArchiveItemField | QuoteAgentField) {
  const dictionary = (field as any).dictionary || {};
  const values = Array.isArray(dictionary.values) ? dictionary.values : [];
  if (values.length) {
    return values
      .map((value: any) => String(value?.canonicalValue ?? value?.canonical_value ?? value?.displayName ?? value?.display_name ?? value?.rawValue ?? value?.raw_value ?? "").trim())
      .filter(Boolean);
  }

  const direct = dictionary.canonical_value ?? dictionary.canonicalValue ?? dictionary.display_name ?? dictionary.displayName ?? fieldDisplayValue(field);
  if (Array.isArray(direct)) return direct.map((value) => String(value).trim()).filter(Boolean);
  return String(direct ?? "")
    .split(/\s*\/\s*|[,，、]\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeEnumToken(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}
