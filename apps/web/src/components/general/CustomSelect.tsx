import React, { useState, useRef, useEffect } from "react";
import { Select, Input, Button, Divider, Space, Tag } from "@/components/ui/core";
import type { SelectProps } from "@/components/ui/core";
import { PlusOutlined } from "@/components/ui/icons";

export interface CustomSelectProps {
  value?: string[] | string;
  onChange?: (value: string[] | string) => void;
  initialGroups?: Record<string, string[]>;
  initialOptions?: string[];
  placeholder?: string;
  disabled?: boolean;
  mode?: "multiple" | "tags" | undefined;
  custom?: boolean;
  dropdown?: boolean;
  style?: React.CSSProperties;
  showSearch?: boolean;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  mode = undefined,
  value = mode ? [] : "",
  onChange,
  initialGroups = {},
  initialOptions = [],
  placeholder = "请选择",
  disabled = false,
  custom = false,
  dropdown = true,
  style,
  showSearch = false,
}) => {
  const [groups, setGroups] = useState<Record<string, string[]>>(initialGroups);
  const [newItemName, setNewItemName] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const handleAddItem = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      return;
    }

    const newValue = [...value];
    if (!newValue.includes(newItemName.toUpperCase())) {
      if (Array.isArray(value)) {
        newValue.push(newItemName);
        onChange?.(newValue);
      } else onChange?.(newItemName);
    }
    if (value.length > 0 && !groups.flat?.includes(newItemName)) {
      const newGroups = { ...groups };
      if (!newGroups["自定义"]) {
        newGroups["自定义"] = [];
      }
      newGroups["自定义"] = [...newGroups["自定义"], newItemName];
      setGroups(newGroups);
    }
    setNewItemName("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newItemName.trim()) {
      handleAddItem(e as unknown as React.MouseEvent<HTMLButtonElement>);
    }
  };

  const dropdownRender = (menu: React.ReactNode) => (
    <div>
      <div style={{ padding: "8px 8px 8px" }}>
        <Space align="center">
          <Input
            placeholder="输入新选项"
            ref={inputRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value.toString())}
            onKeyDown={handleKeyDown}
            style={{ width: 130 }}
          />
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={handleAddItem}
            disabled={!newItemName.trim()}
          >
            添加
          </Button>
        </Space>
      </div>
      <Divider style={{ margin: "8px 0" }} />
      {menu}
    </div>
  );

  // 将分组数据转换为 Select 需要的格式
  const selectOptions: SelectProps["options"] = Object.entries(groups).map(
    ([groupName, items]) => ({
      label: groupName,
      options: items.map((item) => ({
        label: item,
        value: item,
      })),
    })
  );

  return (
    <Select
      mode={mode}
      style={{ width: "100%", ...style }}
      placeholder={placeholder}
      value={value}
      onChange={(value) => {
        onChange?.(value);
        // console.log(value);
      }}
      popupRender={dropdown ? dropdownRender : undefined}
      //   tagRender={tagRender}
      options={selectOptions}
      open={open}
      onOpenChange={(visible) => setOpen(visible)}
      disabled={disabled}
      showSearch={showSearch}
      filterOption={(input, option) =>
        (option?.label ?? "")
          .toString()
          .toLowerCase()
          .includes(input.toLowerCase())
      }
    />
  );
};

// 表单包装组件
interface GroupedTagSelectFormItemProps extends CustomSelectProps {
  name?: string;
  label?: string;
  rules?: any[];
}

export { CustomSelect };
