import { useMemo, useRef, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/utils";
import { CheckOutlined, SearchOutlined } from "@/components/ui/icons";

type Option = {
  value: string;
  label: string;
};

type Props = {
  value: string[];
  options: Option[];
  placeholder?: string;
  onChange: (value: string[]) => void;
};

export function ProductScopeMultiSelect({
  value,
  options,
  placeholder = "搜索产品范围",
  onChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );

  const toggle = (nextValue: string) => {
    onChange(
      selected.has(nextValue)
        ? value.filter((item) => item !== nextValue)
        : [...value, nextValue],
    );
  };

  const remove = (nextValue: string) => {
    onChange(value.filter((item) => item !== nextValue));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "flex min-h-10 w-full cursor-text flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left transition",
            "focus:outline-none focus:ring-2 focus:ring-brand-100",
            open ? "border-brand-500 ring-2 ring-brand-100" : "hover:border-slate-400",
          )}
        >
          {value.map((item) => {
            const label = optionMap.get(item)?.label ?? item;
            return (
              <span
                key={item}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 text-sm text-slate-800"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`删除 ${label}`}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-lg leading-none text-slate-500 hover:text-slate-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(item);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  ×
                </span>
              </span>
            );
          })}
          {!value.length && <span className="px-1 text-sm text-slate-400">{placeholder}</span>}
          <SearchOutlined className="ml-auto shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-64 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command
          filter={(itemValue, search) => {
            const option = optionMap.get(itemValue);
            const haystack = `${option?.label ?? ""} ${option?.value ?? itemValue}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>无匹配选项</CommandEmpty>
            {options.map((option) => {
              const checked = selected.has(option.value);
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => toggle(option.value)}
                  className={cn(checked && "bg-brand-50 text-slate-900 aria-selected:bg-brand-50")}
                >
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{option.label}</span>
                  <CheckOutlined className={cn("shrink-0 text-brand-600", checked ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
