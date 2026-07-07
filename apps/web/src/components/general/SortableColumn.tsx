import { DragHandle } from "./SortableTable";

export const SortableColumn = {
  // title: "排序",
  // key: "sort",
  width: 30,
  render: (text: string, record: any, index: number) => (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ marginRight: 8 }}>{record.index ?? index + 1}</span>
      <DragHandle disabled={!record.sortable} />
    </div>
  ),
};
