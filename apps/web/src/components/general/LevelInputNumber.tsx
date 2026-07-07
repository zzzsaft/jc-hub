import type { IntervalInputProps } from "./IntervalInput";
import { IntervalInput } from "./IntervalInput";
import type { IntervalValue } from "@/types/types";

export interface LevelValue {
  level: string;
  value?: IntervalValue | undefined;
}

export interface LevelInputNumberProps
  extends Omit<
    IntervalInputProps,
    "value" | "onChange" | "addonBefore" | "unit" | "units"
  > {
  value?: LevelValue;
  onChange?: (val: LevelValue) => void;
}

const LevelInputNumber: React.FC<LevelInputNumberProps> = ({
  value,
  onChange,
  ...rest
}) => {
  const level = value?.level;
  const handleChange = (val: IntervalValue) => {
    onChange?.({ level: level ?? "", value: val });
  };
  return (
    <IntervalInput
      {...rest}
      addonBefore={level}
      // units={["%"]}
      unit={"%"}
      value={value?.value}
      onChange={handleChange}
    />
  );
};

export default LevelInputNumber;
