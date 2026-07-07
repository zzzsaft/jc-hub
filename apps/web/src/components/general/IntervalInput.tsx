import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Form, Input, Select } from "@/components/ui/core";
import type { FormItemProps } from "@/components/ui/core";
import { intervalInputRules } from "@/utils/rules";
import type { IntervalValue } from "@/types/types";
import TailForm from "@/components/ui/proForm";

const DELIMITER = "~";

export interface IntervalInputProps {
  value?: IntervalValue;
  onChange?: (value: IntervalValue) => void;
  placeholder?: string;
  addonAfter?: string | null;
  addonBefore?: string | null;
  /** Display unit inside the input */
  unit?: string;
  /** available units to choose from */
  units?: string[];
  disabled?: boolean;
  /** When true, user cannot modify the value but it remains selectable */
  readOnly?: boolean;
  id?: string;
  extra?: boolean;
  decimalPlace?: number;
  style?: React.CSSProperties;
}

const IntervalInput: React.FC<IntervalInputProps> = forwardRef<
  HTMLInputElement,
  IntervalInputProps
>(
  (
    {
      value,
      onChange = () => {},
      placeholder = "请输入数值",
      disabled = false,
      readOnly = false,
      id,
      addonAfter = null,
      addonBefore = null,
      unit,
      units,
      extra = false,
      style,
      decimalPlace = 2,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(value?.value ?? "");
    const [internalUnit, setInternalUnit] = useState(
      value?.unit ?? unit ?? units?.[0] ?? ""
    );
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<any>(null);
    const lastCursorPos = useRef(0);
    const hasAddon =
      (addonAfter !== null && addonAfter !== undefined) ||
      Boolean(units && units.length);
    useImperativeHandle(ref, () => ({
      ...inputRef.current,
      focus: () => inputRef.current?.focus?.(),
      blur: () => inputRef.current?.blur?.(),
      setSelectionRange: (start: number, end: number) =>
        inputRef.current?.input?.setSelectionRange(start, end),
      get selectionStart() {
        return inputRef.current?.input?.selectionStart;
      },
      get selectionEnd() {
        return inputRef.current?.input?.selectionEnd;
      },
    }));
    // // 正则表达式修正
    // const rangeRegex = new RegExp(
    //   String.raw`/^(\d+(\.\d{0,2})?)(-(\d+(\.\d{0,2})?)?$/`
    // );

    useEffect(() => {
      if (value?.value !== undefined && value?.value !== internalValue) {
        setInternalValue(value?.value ?? "");
      }
      if (value?.unit !== undefined && value?.unit !== internalUnit) {
        setInternalUnit(value?.unit ?? "");
      }
    }, [value?.value, value?.unit]);

    const constructValue = (val: string): IntervalValue => {
      const [frontStr, rearStr] = val.split(DELIMITER);
      return {
        front: frontStr ? parseFloat(frontStr) : NaN,
        rear: rearStr ? parseFloat(rearStr) : NaN,
        value: val,
        unit: internalUnit ?? "",
      };
    };

    const customOnChange = (
      newValue: string,
      newUnit: string = internalUnit
    ) => {
      try {
        const v = constructValue(newValue);
        v.unit = newUnit;
        if (extra) {
          const e = { target: { value: v.value } };
          onChange?.(e as any);
        } else {
          onChange?.(v);
        }
      } catch (error) {
        console.log(error);
      }
    };

    const formatDisplayValue = (val: string) => {
      let display = val;
      if (!isFocused && display.endsWith(DELIMITER)) {
        display = display.slice(0, -1);
      }
      // Skip appending unit when any addon is present
      if (!isFocused && !hasAddon && (internalUnit || unit)) {
        display += internalUnit || unit;
      }
      return display;
    };

    const validateInput = (input: string): boolean => {
      if (input === "") return true;

      const pattern = /^-?\d*(\.\d*)?(~-?\d*(\.\d*)?)?$/;
      if (!pattern.test(input)) return false;

      // 禁止只有后段存在（如 ~2.1）
      if (input.startsWith(DELIMITER)) return false;

      return true;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let input = e.target.value.replace(/[^0-9.\-~]/g, "");

      const delimiterIndex = input.indexOf(DELIMITER);
      if (delimiterIndex !== -1) {
        input =
          input.slice(0, delimiterIndex + 1) +
          input
            .slice(delimiterIndex + 1)
            .replace(new RegExp(DELIMITER, "g"), "");
      }

      const parts = input.split(DELIMITER);
      parts[0] = parts[0].replace(/(?!^)-/g, "");
      if (parts[1] !== undefined) {
        parts[1] = parts[1].replace(/(?!^)-/g, "");
      }

      input = parts.join(DELIMITER);

      if (validateInput(input)) {
        setInternalValue(input);
        customOnChange?.(input);
      }
    };

    const handleFocus = () => {
      if (readOnly) return;
      setIsFocused(true);
      if (!internalValue.includes(DELIMITER)) {
        const newValue = `${internalValue}`;
        setInternalValue(newValue);

        customOnChange?.(newValue);
        setTimeout(() => {
          inputRef.current?.setSelectionRange(newValue.length, newValue.length);
        }, 0);
      }
    };

    const handleBlur = () => {
      setIsFocused(false);
      // console.log(internalValue.split(DELIMITER)[1]);
      if (
        internalValue.includes(DELIMITER) &&
        internalValue.split(DELIMITER)[1] === ""
      ) {
        const newValue = internalValue.replace(DELIMITER, "");
        setInternalValue(newValue);
        customOnChange?.(newValue);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const { key } = e;
      const inputEl = inputRef.current?.input; // ✅ 获取原生 input 元素
      const currentPos = inputEl?.selectionStart ?? 0;

      const allowedKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
      ];

      if (/^[0-9.-]$/.test(key) || allowedKeys.includes(key)) {
        lastCursorPos.current = currentPos;
        return;
      } else {
        e.preventDefault();

        if (!inputEl) return;
        const beforeChar = internalValue[currentPos - 1];
        if (beforeChar === ".") {
          // 🛑 禁止插入 ~ 在小数点后
          return;
        }
        if (internalValue.includes(DELIMITER)) {
          const dashPos = internalValue.indexOf(DELIMITER);
          if (currentPos <= dashPos) {
            inputEl.setSelectionRange(dashPos + 1, dashPos + 1);
          }
          return;
        }

        const before = internalValue.slice(0, currentPos);
        const after = internalValue.slice(currentPos);
        const newValue = before + DELIMITER + after;

        if (validateInput(newValue)) {
          setInternalValue(newValue);
          customOnChange?.(newValue);

          // setTimeout(() => {
          //   inputRef.current?.input?.setSelectionRange(
          //     currentPos + 1,
          //     currentPos + 1
          //   );
          // }, 0);
        }

        return;
      }
    };

    const addonAfterNode =
      units && units.length ? (
        <Select
          size="small"
          value={internalUnit}
          onChange={(val) => {
            setInternalUnit(val);
            customOnChange(internalValue, val);
          }}
        >
          {units.map((u) => (
            <Select.Option key={u} value={u}>
              {u}
            </Select.Option>
          ))}
        </Select>
      ) : (
        addonAfter
      );

    return (
      <Input
        id={id}
        ref={inputRef}
        addonBefore={addonBefore}
        value={formatDisplayValue(internalValue)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        addonAfter={addonAfterNode}
        readOnly={readOnly}
        style={style}
      />
    );
  }
);

// 表单包装器
interface NumberRangeInputFormItemProps extends FormItemProps {
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  addonAfter?: string;
  isSecondNumberGreater?: boolean;
  unit?: string;
  units?: string[];
  readOnly?: boolean;
}

const IntervalInputFormItem: React.FC<NumberRangeInputFormItemProps> = ({
  disabled,
  id,
  placeholder,
  addonAfter,
  isSecondNumberGreater = true,
  unit,
  units,
  readOnly,
  ...formItemProps
}) => {
  return (
    <TailForm.Item
      {...formItemProps}
      rules={[
        ...(formItemProps.rules || []),

        isSecondNumberGreater ? intervalInputRules[0] : intervalInputRules[1],
      ]}
    >
      <IntervalInput
        disabled={disabled}
        id={id}
        placeholder={placeholder}
        addonAfter={addonAfter}
        unit={unit}
        units={units}
        readOnly={readOnly}
      />
    </TailForm.Item>
  );
};

export { IntervalInput, IntervalInputFormItem };
