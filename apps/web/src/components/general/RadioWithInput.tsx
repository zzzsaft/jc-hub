import React, { useState } from "react";
import { Form, Input, Radio, Space } from "@/components/ui/core";
import type { FormItemProps, RadioChangeEvent } from "@/components/ui/core";

interface RadioWithInputProps {
  value?: { value: number | string; inputValue?: string };
  onChange?: (radio: { value: number | string; inputValue?: string }) => void;
  disabled?: boolean;
  options?: Array<{
    value: number | string;
    label: React.ReactNode;
    showInput?: boolean;
  }>;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const RadioWithInput: React.FC<RadioWithInputProps> = ({
  value = { value: 1, inputValue: "" },
  onChange,
  disabled = false,
  options = [
    { value: 1, label: "Option A" },
    { value: 2, label: "Option B" },
    { value: 3, label: "Option C" },
    { value: 4, label: "More...", showInput: true },
  ],
  id,
  className,
  style,
}) => {
  const handleRadioChange = (e: RadioChangeEvent) => {
    const newValue = e.target.value;
    const otherValue = options.find((option) => option.showInput)?.value;
    onChange?.({
      value: newValue,
      inputValue: newValue === otherValue ? value.inputValue : "",
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInputValue = e.target.value;
    onChange?.({
      value: value.value,
      inputValue: newInputValue,
    });
  };

  const otherValue = options.find((option) => option.showInput)?.value;
  const showInput = value.value === otherValue;

  return (
    <span id={id} className={className} style={style}>
      <Radio.Group
        onChange={handleRadioChange}
        value={value.value}
        disabled={disabled}
      >
        {/* <Space direction="vertical"> */}
        {options.map((option) => (
          <Radio key={option.value} value={option.value}>
            {option.label}
            {option.showInput && showInput && (
              <Input
                value={value.inputValue || ""}
                onChange={handleInputChange}
                disabled={disabled}
                style={{ width: 120, marginLeft: 12 }}
              />
            )}
          </Radio>
        ))}
        {/* </Space> */}
      </Radio.Group>
    </span>
  );
};

// 表单包装器
interface RadioWithInputFormItemProps extends FormItemProps {
  disabled?: boolean;
  options?: Array<{
    value: number | string;
    label: React.ReactNode;
    showInput?: boolean;
  }>;
}

export const RadioWithInputFormItem: React.FC<RadioWithInputFormItemProps> = ({
  disabled,
  options,
  ...formItemProps
}) => {
  return (
    <Form.Item {...formItemProps}>
      <RadioWithInput
        disabled={disabled}
        options={options}
        id={formItemProps.name?.toString()}
      />
    </Form.Item>
  );
};
