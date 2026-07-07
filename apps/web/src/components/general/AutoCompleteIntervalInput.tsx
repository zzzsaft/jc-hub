import { DefaultOptionType } from "@/components/ui/types";
import { IntervalInput } from "./IntervalInput";
import { useEffect, useState } from "react";
import type { IntervalValue } from "@/types/types";
import { AutoComplete } from "@/components/ui/core";
import { IntervalInputWithUnit } from "./IntervalInputWithUnit";

interface OptionTypeWithLevel extends DefaultOptionType {
  level?: string;
}

interface AutoCompleteInputProps {
  id?: string;
  value?: { value: string | null; level: string | null };
  onChange?: (value: { value: string | null; level: string | null }) => void;
  disabled?: boolean;
  options?: OptionTypeWithLevel[];
  addonAfter?: string | null;
  style?: React.CSSProperties;
  placeholder?: string;
  level?: string;
  addonBefore?: string | null;
}
export const AutoCompleteIntervalInput: React.FC<AutoCompleteInputProps> = ({
  value,
  id,
  onChange,
  disabled,
  options = [],
  addonAfter = null,
  style,
  placeholder,
  level,
  addonBefore = null,
}) => {
  const [levelPrefix, setLevelPrefix] = useState("定制");

  useEffect(() => {
    if (level) {
      const selectedOption = options.find((option) => option.level === level);
      const otherOption = options.find((option) => option.level);
      if (selectedOption && selectedOption.value) {
        handleChange?.(selectedOption.value);
      } else if (otherOption && otherOption.value) {
        handleChange?.(otherOption.value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  useEffect(() => {
    setLevelPrefix(value?.level ?? "定制");
  }, [value]);
  const handleChange = (inputValue: string | number | null) => {
    const selectedOption = options.find((opt) => opt.value === inputValue);
    onChange?.({
      value: inputValue as any,
      level: selectedOption?.level ?? null,
    });
    // } else onChange?.(inputValue);
  };
  return (
    <span id={id}>
      <AutoComplete
        options={options}
        value={value ?? undefined}
        onSelect={(e) => {
          // console.log(e);
          handleChange(e as any);
        }}
        style={style}
        disabled={disabled}
        // onFocus={}
      >
        <IntervalInputWithUnit
          addonAfter={addonAfter}
          value={value?.toString() ?? ""}
          onChange={(e: any) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          extra={true}
          addonBefore={addonBefore ?? levelPrefix}
          decimalPlace={3}
        />
      </AutoComplete>
    </span>
  );
};
