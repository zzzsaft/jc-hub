import React, { useState } from "react";
import { Radio, Input, Space } from "@/components/ui/core";
import type { RadioChangeEvent, RadioGroupProps } from "@/components/ui/types";

interface CustomRadioGroupProps {
  options?: Array<{ label: string; value: string }>;
  onChange?: (radio: { value: number | string; inputValue?: string }) => void;
  showCustomInput?: boolean;
  customInputPlaceholder?: string;
  value?: { value: number | string; inputValue?: string };
}

const CustomRadioGroup: React.FC<CustomRadioGroupProps> = ({
  value,
  onChange,
  options = [],
  showCustomInput = true,
  customInputPlaceholder = "请输入自定义内容",
  ...restProps
}) => {
  const [customValue, setCustomValue] = useState("");
  const isCustomSelected = value?.value === "custom";

  const handleChange = (e: RadioChangeEvent) => {
    // 切换到非自定义选项时清空输入值
    if (e.target.value !== "custom") {
      setCustomValue("");
    }
    onChange?.({
      value: e.target.value,
      inputValue: customValue,
    });
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomValue(e.target.value);
    onChange?.({
      value: value?.value ?? "",
      inputValue: e.target.value,
    });
  };

  return (
    <Space.Compact block style={{ display: "flex", alignItems: "center" }}>
      <Radio.Group
        style={{}}
        value={value?.value}
        onChange={handleChange}
        buttonStyle="solid"
        optionType="button"
        {...restProps}
      >
        {options.map((opt) => (
          <Radio.Button key={opt.value} value={opt.value}>
            {opt.label}
          </Radio.Button>
        ))}
        {showCustomInput && <Radio.Button value="custom">自定义</Radio.Button>}
      </Radio.Group>

      {isCustomSelected && showCustomInput && (
        <Input
          value={value.inputValue}
          onChange={handleCustomInputChange}
          placeholder={customInputPlaceholder}
          style={{ flex: 1 }}
        />
      )}
    </Space.Compact>
  );
};

export default CustomRadioGroup;
