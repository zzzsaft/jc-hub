import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/core";

interface StrictUpperSlashInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  style?: React.CSSProperties;
}

const AutoSlashInput: React.FC<StrictUpperSlashInputProps> = ({
  value = "",
  onChange,
  placeholder = "例如: A/B/C",
  maxLength = 20,
  style,
}) => {
  // 格式化显示值（添加斜杠）
  const formatDisplayValue = useCallback((rawValue: string): string => {
    return rawValue
      .replace(/[^A-Z]/g, "") // 移除非大写字母
      .split("")
      .join("/") // 每个字符间加斜杠
      .replace(/\/$/, ""); // 移除末尾斜杠
  }, []);

  // 内部状态管理
  const [displayValue, setDisplayValue] = useState(formatDisplayValue(value));
  const [cursorPos, setCursorPos] = useState(0);
  const [isComposing, setIsComposing] = useState(false);

  // 同步外部value变化
  useEffect(() => {
    setDisplayValue(formatDisplayValue(value));
  }, [value, formatDisplayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposing) return;
    const inputVal = e.target.value;
    const selectionStart = e.target.selectionStart || 0;

    // 1. 移除非字母字符并转为大写
    const cleanValue = inputVal.replace(/[^a-zA-Z]/g, "").toUpperCase();

    // 2. 触发onChange返回纯字母值
    onChange?.(cleanValue);

    // 3. 计算新光标位置
    let newCursorPos = selectionStart;
    if (inputVal.length > displayValue.length) {
      // 新增字符时，光标跳过斜杠
      const addedChars = inputVal.length - displayValue.length;
      newCursorPos = selectionStart + Math.floor(addedChars / 2);
    }

    setCursorPos(Math.min(newCursorPos, cleanValue.length * 2 - 1));
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
    setIsComposing(false);
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>
  ) => {
    setIsComposing(false);
    handleChange(e as any);
  };

  // 控制光标位置
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.setSelectionRange(cursorPos, cursorPos);
  };

  return (
    <Input
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      placeholder={placeholder}
      maxLength={maxLength * 2 - 1} // 考虑斜杠占位
      allowClear
      style={style}
    />
  );
};

export default AutoSlashInput;
