import { Checkbox, DatePicker, Input, InputNumber, Table } from "@/components/ui/core";
import type { ColumnsType } from "@/components/ui/types";
import type { PurchaseApplyRow } from "../types";

type Props = {
  rows: PurchaseApplyRow[];
  activeId?: string;
  loading: boolean;
  onActivate: (id: string) => void;
  onPatchRow: (id: string, patch: Partial<PurchaseApplyRow>) => void;
  onPatchPieces: (row: PurchaseApplyRow, pieces: number) => void;
};

export function PurchaseApplyTable({ rows, activeId, loading, onActivate, onPatchRow, onPatchPieces }: Props) {
  const columns: ColumnsType<PurchaseApplyRow> = [
    {
      title: "选择",
      dataIndex: "selected",
      width: 64,
      align: "center",
      render: (_, row) => (
        <Checkbox
          checked={row.selected}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchRow(row.id, { selected: event.target.checked })}
        />
      ),
    },
    { title: "物料编号", dataIndex: "partNum", width: 110 },
    { title: "物料描述", dataIndex: "partDescription", width: 170 },
    {
      title: "需图纸",
      dataIndex: "needDrawing",
      width: 74,
      align: "center",
      render: (value) => (value ? "是" : "否"),
    },
    {
      title: "小批量",
      dataIndex: "smallBatch",
      width: 82,
      align: "center",
      render: (_, row) => (
        <Checkbox
          checked={row.smallBatch}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchRow(row.id, { smallBatch: event.target.checked })}
        />
      ),
    },
    numberColumn("需求数量", "requiredQty", 92),
    {
      title: "下单数量",
      dataIndex: "orderQty",
      width: 110,
      align: "right",
      render: (_, row) => (
        <InputNumber
          value={row.orderQty}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchRow(row.id, { orderQty: Number(event.target.value || 0) })}
        />
      ),
    },
    numberColumn("月均用量", "monthlyUsage", 92),
    { title: "单位", dataIndex: "unit", width: 70 },
    {
      title: "到货日期",
      dataIndex: "arrivalDate",
      width: 168,
      render: (_, row) => (
        <DatePicker
          value={row.arrivalDate}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(value: string) => onPatchRow(row.id, { arrivalDate: value })}
        />
      ),
    },
    {
      title: "单重/装箱规格",
      dataIndex: "packageSpec",
      width: 130,
      align: "right",
      render: (_, row) => (
        <InputNumber
          value={row.packageSpec}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchRow(row.id, { packageSpec: Number(event.target.value || 0) })}
        />
      ),
    },
    {
      title: "件数",
      dataIndex: "pieces",
      width: 90,
      align: "right",
      render: (_, row) => (
        <InputNumber
          value={row.pieces}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchPieces(row, Number(event.target.value || 0))}
        />
      ),
    },
    numberColumn("采购周期", "purchaseCycle", 90),
    { title: "厂区", dataIndex: "area", width: 76 },
    { title: "库存等级", dataIndex: "stockLevel", width: 96 },
    numberColumn("库存", "stockQty", 80),
    { title: "供应商", dataIndex: "supplierName", width: 130 },
    {
      title: "备注内容",
      dataIndex: "remark",
      width: 220,
      render: (_, row) => (
        <Input
          value={row.remark}
          onClick={(event: any) => event.stopPropagation()}
          onChange={(event: any) => onPatchRow(row.id, { remark: event.target.value })}
        />
      ),
    },
  ];

  return (
    <Table
      className="purchase-apply-table"
      columns={columns}
      dataSource={rows}
      loading={loading}
      rowKey="id"
      pagination={false}
      onRow={(row) => ({
        onClick: () => onActivate(row.id),
        className: row.id === activeId ? "purchase-apply-table__row--active" : "",
      })}
    />
  );
}

function numberColumn(title: string, dataIndex: keyof PurchaseApplyRow, width: number) {
  return {
    title,
    dataIndex,
    width,
    align: "right" as const,
    render: (value: number) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
  };
}
