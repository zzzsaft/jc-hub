import React, { useMemo, useRef, useState } from "react";
import { Select, Spin } from "@/components/ui/core";
import type { SelectProps } from "@/components/ui/core";
import debounce from "lodash-es/debounce";

export interface DebounceSelectProps<ValueType = any>
  extends Omit<
    SelectProps<ValueType | ValueType[] | null>,
    "options" | "children"
  > {
  fetchOptions: (search: string) => Promise<ValueType[]>;
  debounceTimeout?: number;
}

export function DebounceSelect<
  ValueType extends {
    key?: string;
    label: React.ReactNode;
    value: string | number;
  } = any
>({
  fetchOptions,
  debounceTimeout = 800,
  // onChange,
  ...props
}: DebounceSelectProps<ValueType>) {
  const [fetching, setFetching] = useState(false);
  const [options, setOptions] = useState<ValueType[]>([]);
  const [searchValue, setSearchValue] = useState<string | undefined>(undefined);
  const fetchRef = useRef(0);

  const debounceFetcher = useMemo(() => {
    const loadOptions = (value: string) => {
      fetchRef.current += 1;
      const fetchId = fetchRef.current;
      setOptions([]);
      setFetching(true);

      if (value === "") {
        // 清空搜索时重置选项和值
        setOptions([]);
        setFetching(false);
        // onChange?.({ label: "", value: "" } as ValueType);
        setSearchValue(undefined);
        return;
      }

      fetchOptions(value).then((newOptions) => {
        if (fetchId !== fetchRef.current) {
          // for fetch callback order
          return;
        }
        setOptions(newOptions);
        setFetching(false);
      });
    };

    return debounce(loadOptions, debounceTimeout);
  }, [fetchOptions, debounceTimeout]);

  const handleKeyDown: React.KeyboardEventHandler<
    HTMLInputElement | HTMLTextAreaElement
  > = (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      if (searchValue === "" || searchValue === undefined) {
        // 已经为空时再次按删除键，完全清空
        setOptions([]);
        // onChange?.({ label: "", value: "", key: "" } as ValueType);
        setSearchValue(undefined);
      }
    }
  };
  const handleChange = (value: ValueType | ValueType[] | null, option: any) => {
    setSearchValue(undefined);
    // onChange?.(value, option);
  };
  return (
    <Select
      labelInValue
      filterOption={false}
      onSearch={debounceFetcher}
      // onChange={handleChange}
      // onInputKeyDown={handleKeyDown}
      notFoundContent={fetching ? <Spin size="small" /> : null}
      {...props}
      options={options}
    />
  );
}
