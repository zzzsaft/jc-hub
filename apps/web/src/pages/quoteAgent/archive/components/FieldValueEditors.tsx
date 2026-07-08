import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/utils";
import type { ArchiveItemField, DictionaryOptions, QuoteAgentField } from "../../types";
import { fieldDisplayValue, fieldEnumOptions, textValue } from "../../utils";
import { archiveClass } from "../classNames";

export function EnumFieldEditor({
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
        className={archiveClass("qa-archive-input")}
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
          className={archiveClass("qa-archive-input")}
          placeholder="自定义值"
          value={isCustom ? currentValue : ""}
          onChange={(event) => onChange({ displayName: event.target.value, canonicalValue: event.target.value, matched: false })}
        />
      )}
    </div>
  );
}

export function EnumsFieldEditor({
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
          className={archiveClass("qa-archive-input flex min-h-10 w-full items-center gap-2 bg-white text-left hover:border-slate-400")}
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

export function EnumsValueTags({
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
