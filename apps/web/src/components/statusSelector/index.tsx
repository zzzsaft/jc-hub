// src/components/statusSelector/index.tsx
import React from "react";
import { Select, Tag, Typography, Checkbox } from "@/components/ui/core";
import { SelectProps } from "@/components/ui/types";
import "./styles.less";

const { Text } = Typography;

interface StatusOption {
  value: string;
  label: string;
  color?: string;
}

interface StatusSelectorProps extends Omit<SelectProps, "options" | "mode"> {
  options?: StatusOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
}

const StatusSelector: React.FC<StatusSelectorProps> = ({
  options = defaultStatusOptions,
  value = [],
  onChange,
  ...restProps
}) => {
  const allSelected = value.length === options.length;
  const indeterminate = value.length > 0 && value.length < options.length;

  const handleSelectAll = (e: any) => {
    if (onChange) {
      if (e.target.checked) {
        onChange(options.map((opt) => opt.value));
      } else {
        onChange([]);
      }
    }
  };

  return (
    <Select
      mode="multiple"
      placeholder="选择报价状态"
      value={value}
      onChange={onChange}
      options={options}
      className="statusSelector"
      popupRender={(menu) => (
        <>
          <div className="selectAllContainer">
            <Checkbox
              checked={allSelected}
              indeterminate={indeterminate}
              onChange={handleSelectAll}
              className="selectAllCheckbox"
            >
              <Text className="selectAllText">全选</Text>
            </Checkbox>
          </div>
          <div className="dropdownMenu">{menu}</div>
        </>
      )}
      tagRender={(props) => (
        <Tag
          color={
            options.find((opt) => opt.value === props.value)?.color || "default"
          }
          closable={props.closable}
          onClose={props.onClose}
          className="statusTag"
        >
          {props.label}
        </Tag>
      )}
      {...restProps}
    />
  );
};

// 默认状态选项配置
export const defaultStatusOptions: StatusOption[] = [
  { value: "none", label: "未报价", color: "gray" },
  { value: "quoting", label: "报价中", color: "blue" },
  { value: "reviewing", label: "审核中", color: "orange" },
  { value: "completed", label: "报价完成", color: "green" },
];

export default StatusSelector;
