import { Form, Tag } from "@/components/ui/core";
import React from "react";

const { CheckableTag } = Tag;

interface CheckableTagGroupProps {
  id?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  options: { label: string; value: string }[];
}

export const CheckableTagGroup: React.FC<CheckableTagGroupProps> = ({
  value = [],
  onChange,
  options,
  id,
}) => {
  const handleChange = (tag: string, checked: boolean) => {
    const nextValue = checked
      ? [...value, tag]
      : value.filter((t) => t !== tag);
    onChange?.(nextValue);
  };

  return (
    <div id={id}>
      {options.map((option) => (
        <CheckableTag
          key={option.value}
          checked={value.includes(option.value)}
          onChange={(checked) => handleChange(option.value, checked)}
        >
          {option.label}
        </CheckableTag>
      ))}
    </div>
  );
};
