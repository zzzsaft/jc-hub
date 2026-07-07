import React, { useEffect, useRef } from "react";
import { App, Select, Tooltip } from "@/components/ui/core";
import type { SelectProps } from "@/components/ui/core";

const { Option } = Select;

type HeatingMethod =
  | "油加温"
  | "加热棒"
  | "加热圈"
  | "铸铝加热板"
  | "铸铜加热板";

interface HeatingMethodSelectProps {
  value?: HeatingMethod | HeatingMethod[];
  onChange?: (value: HeatingMethod | HeatingMethod[]) => void;
  temperature?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Whether to show the "加热圈" option */
  showHeatingRing?: boolean;
  style?: React.CSSProperties;
  id?: string;
  className?: string;
  label?: string;
  required?: boolean;
  status?: "error" | "warning";
}

export const HeatingMethodSelect: React.FC<HeatingMethodSelectProps> = ({
  value = [],
  onChange,
  temperature,
  multiple = false,
  disabled = false,
  showHeatingRing = false,
  style,
  id,
  className,
  label,
  required = false,
  status,
}) => {
  const { message } = App.useApp();
  const selectRef = useRef<any>(null);
  const handleChange = (selected: HeatingMethod | HeatingMethod[] | null) => {
    const selectedMethods = multiple
      ? Array.isArray(selected)
        ? selected
        : selected
        ? [selected]
        : []
      : selected
      ? [selected as HeatingMethod]
      : [];

    const prevMethods = Array.isArray(value) ? value : value ? [value] : [];

    // // 清空选择
    // if (selectedMethods.length === 0) {
    //   onChange?.(multiple ? [] : undefined);
    //   return;
    // }

    // // 选中油加温时只保留油加温
    // if (selectedMethods.includes("油加温")) {
    //   onChange?.(multiple ? ["油加温"] : "油加温");
    //   return;
    // }

    // // 已选油加温再选择其他，仍仅保留油加温
    // if (prevMethods.includes("油加温")) {
    //   message.warning("油加温不能与其他方式同时选择");
    //   onChange?.(multiple ? ["油加温"] : "油加温");
    //   return;
    // }

    // 检查是否同时选择了铸铝和铸铜加热板
    const hasCastAluminum = selectedMethods.includes("铸铝加热板");
    const hasCastCopper = selectedMethods.includes("铸铜加热板");

    if (hasCastAluminum && hasCastCopper) {
      message.warning("不能同时选择铸铝加热板和铸铜加热板");

      // 保留之前的选择（移除最新选择的一个）
      const newValue = prevMethods.includes("铸铝加热板")
        ? prevMethods.filter((m) => m !== "铸铜加热板")
        : prevMethods.filter((m) => m !== "铸铝加热板");

      onChange?.(multiple ? newValue : newValue[0]);
      return;
    }

    onChange?.(multiple ? selectedMethods : selectedMethods[0]);
    if (multiple && selectedMethods.length >= 2) {
      selectRef.current?.blur();
    }
  };

  const isCastAluminumDisabled = temperature
    ?.split("~")
    .some((temp) => Number(temp) >= 330);

  useEffect(() => {
    if (isCastAluminumDisabled && value.includes("铸铝加热板")) {
      if (Array.isArray(value))
        onChange?.(value.filter((m) => m !== "铸铝加热板"));
      message.info(`因温度为超过330℃,加热方式中铸铝加热板已被移除`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCastAluminumDisabled]);

  const methodOptions = [
    { value: "油加温", label: "油加温" },
    { value: "加热棒", label: "加热棒" },
    ...(showHeatingRing ? [{ value: "加热圈", label: "加热圈" }] : []),
    {
      value: "铸铝加热板",
      label: "铸铝加热板",
      disabled: isCastAluminumDisabled,
    },
    { value: "铸铜加热板", label: "铸铜加热板" },
  ];

  const currentValue = multiple
    ? Array.isArray(value)
      ? value
      : value
      ? [value]
      : []
    : Array.isArray(value)
    ? value[0]
    : value;

  const selectProps: SelectProps = {
    value: currentValue,
    onChange: handleChange,
    mode: multiple ? "multiple" : undefined,
    disabled,
    placeholder: "请选择加热方式",
    style: { width: "100%", ...style },
    allowClear: true,
    status,
  };

  return (
    <div id={id} className={className} style={style}>
      {label && (
        <label style={{ display: "block", marginBottom: 8 }}>
          {label}
          {required && <span style={{ color: "red", marginLeft: 4 }}>*</span>}
        </label>
      )}

      <Select ref={selectRef} {...selectProps}>
        {methodOptions.map((option) => (
          <Option
            key={option.value}
            value={option.value}
            disabled={option.disabled || disabled}
          >
            {option.value === "castAluminum" && option.disabled ? (
              <Tooltip title="温度≥330℃时，铸铝加热板不可用">
                <span>{option.label}</span>
              </Tooltip>
            ) : (
              option.label
            )}
          </Option>
        ))}
      </Select>
    </div>
  );
};
