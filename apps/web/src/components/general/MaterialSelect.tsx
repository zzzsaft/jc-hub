import React, { useEffect } from "react";
import { Select } from "@/components/ui/core";
import { selectOptions } from "@/utils/value";

interface MaterialSelectProps {
  id?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  /**
   * Custom option groups. Keys are group titles and values are
   * option labels. When omitted the default MATERIAL groups are used.
   */
  options?: Record<string, string[]>;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  mode?: "tags" | "multiple" | undefined;
}
// 模拟数据源
const MATERIAL = {
  高剪切敏感度: ["HDPE", "LDPE", "LLDPE", "POE", "PS-GPPS"],
  中剪切敏感度: ["ABS", "PC", "PET", "PETG", "HIPS", "PP", "PLA"],
  低剪切敏感度: ["TPU", "PVC", "EVA", "TPE-SEBS", "PMMA", "PVB"],
};
const MaterialSelect: React.FC<MaterialSelectProps> = ({
  id,
  value = [],
  onChange,
  options,
  disabled = false,
  placeholder = "输入材料，按回车确认",
  style,
  mode = "tags",
}) => {
  const VALID_TAG = /^[\u4e00-\u9fa5a-zA-Z\d%()（）+-]+$/;
  const handleChange = (newValue: string[]) => {
    if (onChange) {
      const cleaned = newValue
        .map((item) => item.replace(/\s/g, "").toUpperCase())
        .filter((item) => VALID_TAG.test(item));

      onChange(cleaned);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key } = e;
    if (key.length === 1 && !VALID_TAG.test(key)) {
      e.preventDefault();
    }
  };

  return (
    <Select
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      mode={mode}
      onInputKeyDown={handleInputKeyDown}
      options={selectOptions(options ?? MATERIAL)}
      value={value}
      onChange={handleChange}
      style={{ ...style, width: "100%" }}
    />
  );
};

export default MaterialSelect;
