import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/core";

interface NumericColonInputProps {
  value?: string;
  onChange?: (value: string) => void;
  [key: string]: any;
}

const RatioInput: React.FC<NumericColonInputProps> = ({
  value = "",
  onChange,
  ...rest
}) => {
  const [internalValue, setInternalValue] = useState(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;

      // 1. 替换非数字字符为冒号
      newValue = newValue.replace(/[^0-9:]/g, ":");

      // 2. 处理连续的冒号
      newValue = newValue.replace(/::+/g, ":");

      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  // 外部value变化时同步内部状态
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  return (
    <Input
      {...rest}
      value={internalValue}
      onChange={handleChange}
      onBlur={() => {
        // 失焦时再次确保没有末尾冒号
        if (internalValue.endsWith(":")) {
          const trimmedValue = internalValue.slice(0, -1);
          setInternalValue(trimmedValue);
          onChange?.(trimmedValue);
        }
      }}
    />
  );
};

export default RatioInput;
