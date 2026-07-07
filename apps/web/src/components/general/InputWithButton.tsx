import React from "react";
import { Input, Button, Space } from "@/components/ui/core";
import type { InputProps, ButtonProps } from "@/components/ui/core";

export interface InputWithButtonProps
  extends Omit<InputProps, "value" | "onChange"> {
  /** Controlled value for the input */
  value?: string;
  /** Change handler for the input */
  onChange?: (value: string) => void;
  /** Text inside the button */
  buttonText?: React.ReactNode;
  /** Props passed to Button component */
  buttonProps?: ButtonProps;
  /** Click handler for the button */
  onButtonClick?: () => void;
  /** Disable both input and button */
  disabled?: boolean;
}

const InputWithButton: React.FC<InputWithButtonProps> = ({
  value,
  onChange,
  buttonText = "Submit",
  buttonProps,
  onButtonClick,
  disabled = false,
  ...inputProps
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <Space.Compact style={{ width: "100%" }}>
      <Input
        value={value}
        onChange={handleChange}
        disabled={disabled}
        {...inputProps}
      />
      <Button
        type="primary"
        onClick={onButtonClick}
        disabled={disabled}
        {...buttonProps}
      >
        {buttonText}
      </Button>
    </Space.Compact>
  );
};

export default InputWithButton;
