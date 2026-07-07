import { AutoComplete } from "@/components/ui/core";
import { DefaultOptionType } from "@/components/ui/types";
import { useDebounce } from "use-debounce";
import { useEffect, useState } from "react";
import { PartService } from "@/api/services/part.service";
import { PartSearchResult } from "@/types/types";
import { formatPrice } from "@/utils/value";
import type { FormInstance } from "@/components/ui/core";

interface PartAutoCompleteProps {
  index: number;
  form: FormInstance;
  value?: string;
  onChange?: (value: string) => void;
}

const PartAutoComplete: React.FC<PartAutoCompleteProps> = ({
  index,
  form,
  value,
  onChange,
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [options, setOptions] = useState<DefaultOptionType[]>([]);

  useEffect(() => {
    if (!debouncedSearch) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    PartService.searchParts(debouncedSearch).then((data) => {
      if (cancelled) return;
      const groups: Record<string, DefaultOptionType> = {};
      data.forEach((p) => {
        if (!groups[p.category]) {
          groups[p.category] = { label: p.category, options: [] } as any;
        }
        (groups[p.category].options as DefaultOptionType[]).push({
          label: (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{p.name}</span>
              <span>
                {`${formatPrice(p.price)} / ${p.unit}${
                  p.type === "M" ? " 自制件" : ""
                }`}
              </span>
            </div>
          ),
          value: p.name,
          item: p,
        });
      });
      setOptions(Object.values(groups));
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const handleSearch = (val: string) => {
    setSearch(val);
    onChange?.(val);
  };

  const handleSelect = (_: string, option: DefaultOptionType) => {
    const item = (option as any).item as PartSearchResult;
    form.setFieldValue(["parts", index, "unitPrice"], item.price);
    form.setFieldValue(["parts", index, "unit"], item.unit);
    onChange?.(item.name);
  };

  return (
    <AutoComplete
      value={value}
      options={options}
      onSearch={handleSearch}
      onSelect={handleSelect}
      style={{ width: "100%" }}
      placeholder="物料名称"
    />
  );
};

export default PartAutoComplete;
