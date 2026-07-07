import React, { useState } from "react";
import { Input, Select, Button, Space } from "@/components/ui/core";

interface Props {
  onSearch: (field: "code" | "name", keyword: string) => void;
  loading?: boolean;
}

const ProductSearchBar: React.FC<Props> = ({ onSearch, loading }) => {
  const [field, setField] = useState<"code" | "name">("code");
  const [value, setValue] = useState("");

  const handleSearch = () => {
    if (!value.trim()) return;
    onSearch(field, value.trim());
  };

  return (
    <Space.Compact>
      <Select
        value={field}
        onChange={(val) => setField(val as any)}
        style={{ width: 110 }}
      >
        <Select.Option value="code">产品编号</Select.Option>
        <Select.Option value="name">产品名称</Select.Option>
      </Select>
      <Input
        style={{ width: 200 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={handleSearch}
        placeholder="输入搜索内容"
      />
      <Button type="primary" onClick={handleSearch} loading={loading}>
        搜索
      </Button>
    </Space.Compact>
  );
};

export default ProductSearchBar;
