import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DictionaryOptions } from "../types";
import { inputClass, labelClass, textClass, valueKinds } from "./fieldReviewPanel.utils";
import type { FormState } from "./fieldReviewPanel.utils";

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`${labelClass} ${wide ? "xl:col-span-2" : ""}`}><span>{label}</span><div className="min-w-0">{children}</div></label>;
}

export function KindSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {valueKinds.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

export function CategoryInput({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
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

export function EnumValueFields({ state, update, rawValueAlreadyExists }: { state: FormState; update: (key: string, value: unknown) => void; rawValueAlreadyExists: boolean }) {
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

export function ProductTypeSelect({ options, value, onChange }: { options: DictionaryOptions; value: string[]; onChange: (value: string[]) => void }) {
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
