import { useRef, useState } from "react";

type Props = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

const splitAliases = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinAliases = (values: string[]) => values.join("\n");

export function AliasTagInput({ value, placeholder = "添加筛选值", onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const aliases = splitAliases(value);
  const isEmptyDraft = !draft.trim();

  const updateAliases = (nextAliases: string[]) => {
    onChange(joinAliases(Array.from(new Set(nextAliases))));
  };

  const commitDraft = () => {
    const next = splitAliases(draft);
    if (!next.length) return;
    updateAliases([...aliases, ...next]);
    setDraft("");
  };

  const removeAlias = (target: string) => {
    updateAliases(aliases.filter((alias) => alias !== target));
  };

  return (
    <div
      className="flex min-h-10 w-full min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
      onClick={() => inputRef.current?.focus()}
    >
      {aliases.map((alias) => (
        <span
          key={alias}
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 text-sm text-slate-800"
        >
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{alias}</span>
          <button
            type="button"
            aria-label={`删除 ${alias}`}
            className="inline-flex h-4 w-4 shrink-0 appearance-none items-center justify-center rounded border-0 bg-transparent p-0 text-lg leading-none text-slate-500 shadow-none hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-200"
            onClick={(event) => {
              event.stopPropagation();
              removeAlias(alias);
            }}
          >
            ×
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        className={[
          "h-7 min-w-0 flex-[1_1_6rem] bg-transparent text-sm outline-none placeholder:text-slate-400",
          isEmptyDraft
            ? "rounded-md border border-dashed border-slate-300 px-2 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            : "border-0 p-0",
        ].join(" ")}
        value={draft}
        placeholder={isEmptyDraft ? placeholder : ""}
        onBlur={commitDraft}
        onChange={(event) => {
          const next = event.target.value;
          if (/[,，、\n]/.test(next)) {
            updateAliases([...aliases, ...splitAliases(next)]);
            setDraft("");
            return;
          }
          setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            commitDraft();
          }
          if (event.key === "Backspace" && !draft && aliases.length) {
            removeAlias(aliases[aliases.length - 1]);
          }
        }}
      />
    </div>
  );
}
