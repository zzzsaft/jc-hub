import { useMemo, useState } from "react";
import type { DictionaryTermType, DictionaryValue } from "../types";

interface Props {
  value?: string;
  options: DictionaryTermType[];
  values?: DictionaryValue[];
  onChange: (termType: string, term?: DictionaryTermType) => void;
}

export function TermTypePicker({ value, options, values = [], onChange }: Props) {
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return options.slice(0, 30);
    return options
      .filter((item) => {
        const haystack = [
          item.termType,
          item.displayName,
          item.quoteDisplayName,
          item.category,
          ...(item.aliasNames || []),
          ...(item.aliases || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(text);
      })
      .slice(0, 30);
  }, [keyword, options]);

  return (
    <div className="space-y-2">
      <label className="space-y-1 text-[11px] font-medium text-slate-600">
        <span>选择字段 Key</span>
        <input
          className="h-8 w-full border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500"
          value={keyword}
          placeholder="搜索字段 Key、中文名、分类"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </label>

      <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto border border-slate-200 bg-slate-50 p-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-slate-400">没有匹配的字段 Key</div>
        ) : (
          filtered.map((item) => (
            <button
              key={String(item.id ?? item.termType)}
              type="button"
              className={`border px-2 py-1.5 text-left text-xs ${
                item.termType === value
                  ? "border-blue-400 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
              }`}
              onClick={() => onChange(item.termType || "", item)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{item.displayName || item.termType}</span>
                <span className="text-[11px] text-slate-400">{item.category || "未分类"}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {item.termType} · {item.valueKind || "未设置类型"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
