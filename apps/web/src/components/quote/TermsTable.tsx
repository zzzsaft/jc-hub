import React, { useState, useEffect } from "react";
import { Button, Input } from "@/components/ui/core";
import { EditOutlined, DeleteOutlined, PlusOutlined } from "@/components/ui/icons";
import SortableTable, { DragHandle } from "../general/SortableTable";
import { Clause } from "@/types/types";

interface TermsTableProps {
  value: Clause[];
  onChange?: (data: Clause[]) => void;
}

const TermsTable: React.FC<TermsTableProps> = ({ value, onChange }) => {
  const [data, setData] = useState<Clause[]>(value);

  useEffect(() => {
    setData(value);
  }, [value]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");

  const triggerChange = (list: Clause[]) => {
    setData(list);
    onChange?.(list);
  };

  const handleDragEnd = (list: Clause[]) => {
    // Use id as the order so update ids after drag
    // const newData = list.map((item, idx) => ({
    //   ...item,
    //   id: idx + 1,
    // }));
    // if (editingId !== null) {
    //   const i = list.findIndex((item) => item.id === editingId);
    //   if (i !== -1) {
    //     setEditingId(i + 1);
    //   }
    // }
    triggerChange(list);
  };

  const handleDelete = (id: number) => {
    // const filtered = data.filter((d) => d.id !== id);
    // const newData = filtered.map((item, idx) => ({ ...item, id: idx + 1 }));
    // if (editingId !== null) {
    //   if (editingId === id) {
    //     setEditingId(null);
    //   } else if (editingId > id) {
    //     setEditingId(editingId - 1);
    //   }
    // }
    triggerChange(data.filter((d) => d.id !== id));
  };

  const handleEdit = (record: Clause) => {
    setEditingId(record.id);
    setEditingTitle(record.title);
    setEditingContent(record.content);
  };

  const saveEdit = () => {
    if (editingId === null) return;
    const newData = data.map((item) =>
      item.id === editingId
        ? { ...item, title: editingTitle, content: editingContent }
        : item
    );
    triggerChange(newData);
    setEditingId(null);
  };

  const handleAdd = () => {
    const newId = data.length > 0 ? Math.max(...data.map((d) => d.id)) + 1 : 1;
    const newClause: Clause = { id: newId, title: "", content: "", index: 0 };
    const newData = [...data, newClause];
    triggerChange(newData);
    setEditingId(newId);
    setEditingTitle("");
    setEditingContent("");
  };

  const columns = [
    {
      width: 30,
      render: () => <DragHandle />,
    },
    {
      title: "顺序",
      dataIndex: "index",
      width: 60,
      render: (_: any, record: Clause, index: number) =>
        record.index ?? index + 1,
    },
    {
      title: "条约标题",
      dataIndex: "title",
      width: "30%",
      render: (_: any, record: Clause) =>
        editingId === record.id ? (
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
          />
        ) : (
          record.title
        ),
    },
    {
      title: "条约内容",
      dataIndex: "content",
      render: (_: any, record: Clause) =>
        editingId === record.id ? (
          <Input.TextArea
            autoSize
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
          />
        ) : (
          record.content
        ),
    },
    {
      title: "操作",
      width: 120,
      render: (_: any, record: Clause) =>
        editingId === record.id ? (
          <>
            <Button type="link" onClick={saveEdit}>
              保存
            </Button>
            <Button type="link" onClick={() => setEditingId(null)}>
              取消
            </Button>
          </>
        ) : (
          <>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </>
        ),
    },
  ];

  return (
    <>
      <SortableTable
        columns={columns}
        dataSource={data}
        onDragEnd={handleDragEnd}
        pagination={false}
      />
      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={handleAdd}
        style={{ marginTop: 8 }}
      >
        新增条约
      </Button>
    </>
  );
};

export default TermsTable;
