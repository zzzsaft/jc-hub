import React, { useState } from "react";
import { Input, Select, Space, Form, InputNumber, AutoComplete } from "@/components/ui/core";
import type { FormItemProps } from "@/components/ui/core";
import { Rule } from "@/components/ui/types";
import { AutoCompleteInput } from "@/components/general/AutoCompleteInput";

const { Option } = Select;

interface PhaseValue {
  type: string;
  custom?: string;
}

interface PowerInputProps {
  id?: string;
  value?: {
    voltage?: number;
    frequency?: number;
    phase?: string;
  };
  onChange?: (value: {
    voltage?: number;
    frequency?: number;
    phase?: string;
  }) => void;
  disabled?: boolean;
}

const PowerInput: React.FC<PowerInputProps> = ({
  id,
  value = {},
  onChange,
  disabled = false,
}) => {
  const { voltage, frequency, phase } = value;

  const handleVoltageChange = (e: string | number | null) => {
    if (isNaN(Number(e))) return;
    onChange?.({
      ...value,
      voltage: e ? Number(e) : undefined,
    });
  };

  const handleFrequencyChange = (e: string | number | null) => {
    onChange?.({
      ...value,
      frequency: e ? Number(e) : undefined,
    });
  };

  const handlePhaseTypeChange = (e: any) => {
    onChange?.({
      ...value,
      phase: e,
    });
  };

  return (
    <span id={id}>
      <Space.Compact style={{ width: "100%" }}>
        {/* 电压输入 */}
        <AutoCompleteInput
          placeholder="电压"
          value={voltage}
          disabled={disabled}
          onChange={handleVoltageChange}
          style={{ minWidth: "80px" }}
          options={[{ value: "220" }, { value: "380" }]}
          addonAfter="V"
        />
        <AutoCompleteInput
          placeholder="频率"
          value={frequency}
          disabled={disabled}
          onChange={handleFrequencyChange}
          style={{ minWidth: "80px" }}
          options={[{ value: "50" }, { value: "60" }]}
          addonAfter="Hz"
        />
        <AutoCompleteInput
          placeholder="相"
          value={phase}
          disabled={disabled}
          onChange={handlePhaseTypeChange}
          style={{ minWidth: "70px" }}
          options={[{ value: "单相" }, { value: "三相" }]}
          addonAfter={null}
          type="text"
        />
      </Space.Compact>
    </span>
  );
};

// 表单包装器
interface PowerInputFormItemProps extends FormItemProps {
  disabled?: boolean;
}

const PowerInputFormItem: React.FC<PowerInputFormItemProps> = ({
  disabled,
  ...formItemProps
}) => {
  return (
    <Form.Item {...formItemProps}>
      <PowerInput disabled={disabled} />
    </Form.Item>
  );
};

export { PowerInput, PowerInputFormItem };
