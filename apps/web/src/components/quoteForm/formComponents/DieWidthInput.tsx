import React from "react";
import { Select, Space, Form } from "@/components/ui/core";
import type { SelectProps, FormItemProps } from "@/components/ui/core";
import {
  IntervalInput,
  IntervalInputProps,
} from "@/components/general/IntervalInput";

const { Option } = Select;

interface CombinedWidthInputProps {
  value?: {
    widthType?: "product" | "die";
    length?: string;
  };
  onChange?: (value: {
    widthType?: "product" | "die";
    length?: string;
  }) => void;
  disabled?: boolean;
  selectProps?: Omit<SelectProps, "value" | "onChange" | "disabled">;
  intervalProps?: Omit<IntervalInputProps, "value" | "onChange" | "disabled">;
  className?: string;
  style?: React.CSSProperties;
}

export const DieWidthInput: React.FC<CombinedWidthInputProps> = ({
  value = {},
  onChange,
  disabled = false,
  selectProps = {},
  intervalProps = {},
  className,
  style,
}) => {
  const { widthType, length } = value;

  const handleTypeChange = (type: "product" | "die") => {
    onChange?.({ ...value, widthType: type });
  };

  const handleIntervalChange = (val: IntervalInputProps["value"]) => {
    onChange?.({ ...value, length: val?.value });
  };

  return (
    <div
      style={{ display: "flex", gap: 15, width: "100%", ...style }}
      className={className}
    >
      {/* 选择器 - 保留适当间隙 */}
      <Select
        value={widthType}
        onChange={handleTypeChange}
        disabled={disabled}
        style={{ width: "130px" }}
        placeholder="选择宽度类型"
        {...selectProps}
      >
        <Option value="product">制品宽度</Option>
        <Option value="die">口模有效宽度</Option>
      </Select>

      {/* 区间输入 */}
      <div style={{ flex: 1 }}>
        <IntervalInput
          // value={length}
          onChange={handleIntervalChange}
          disabled={disabled}
          // placeholder={["最小值", "最大值"]}
          addonAfter="mm"
          {...intervalProps}
        />
      </div>
    </div>
  );
};

// 表单包装器
interface CombinedWidthFormItemProps extends FormItemProps {
  disabled?: boolean;
  selectProps?: Omit<SelectProps, "value" | "onChange" | "disabled">;
  intervalProps?: Omit<IntervalInputProps, "value" | "onChange" | "disabled">;
}

export const CombinedWidthFormItem: React.FC<CombinedWidthFormItemProps> = ({
  disabled,
  selectProps,
  intervalProps,
  ...formItemProps
}) => {
  return (
    <Form.Item {...formItemProps}>
      <DieWidthInput
        disabled={disabled}
        selectProps={selectProps}
        intervalProps={intervalProps}
      />
    </Form.Item>
  );
};
