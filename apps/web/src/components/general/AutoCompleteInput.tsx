import { AutoComplete, Input, InputNumber } from "@/components/ui/core";
import { DefaultOptionType } from "@/components/ui/types";

interface AutoCompleteInputProps {
  id?: string;
  value?: number | null | string;
  onChange?: (value: number | string | null) => void;
  disabled?: boolean;
  options?: DefaultOptionType[];
  addonAfter?: string | null;
  type?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export const AutoCompleteInput: React.FC<AutoCompleteInputProps> = ({
  value,
  id,
  onChange,
  disabled,
  options = [],
  type = "number",
  addonAfter = "mm",
  style,
  placeholder,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // console.log(e);
    onChange?.(inputValue);
    // onChange?.(inputValue);
    // 如果不是有效数字，不触发onChange（保持原值）
  };

  const handleSelect = (selectedValue: string) => {
    onChange?.(selectedValue);
  };

  return (
    <span id={id}>
      <AutoComplete
        options={options}
        value={value?.toString()}
        onSelect={onChange}
        style={style}
        disabled={disabled}
      >
        <Input
          addonAfter={addonAfter}
          type={type}
          value={value?.toString() ?? ""}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
        />
        {/* (
        {type == "number" ? (
          <InputNumber
            controls
            addonAfter={addonAfter}
            value={value}
            onChange={(val) => {
              handleChange(val as any);
            }}
            disabled={disabled}
            placeholder={placeholder}
          />
        ) : (
          <Input
            addonAfter={addonAfter}
            type={type}
            value={value?.toString() ?? ""}
            onChange={handleChange}
            disabled={disabled}
            placeholder={placeholder}
          />
        )}
        ) */}
      </AutoComplete>
    </span>
  );
};
