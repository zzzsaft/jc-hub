import { Empty, Table } from "@/components/ui/core";
import type { ColumnsType } from "@/components/ui/types";
import type { PurchaseInventoryDetail, PurchasePoDetail, PurchaseSourceDetail } from "../types";

type Props = {
  sources: PurchaseSourceDetail[];
  pos: PurchasePoDetail[];
  inventories: PurchaseInventoryDetail[];
};

const sourceColumns: ColumnsType<PurchaseSourceDetail> = [
  { title: "工单编号", dataIndex: "jobNum", width: 110 },
  { title: "需求日期", dataIndex: "requiredDate", width: 110 },
  numberColumn("需求数", "requiredQty"),
  numberColumn("已发数", "issuedQty"),
  numberColumn("差额", "balanceQty"),
];

const poColumns: ColumnsType<PurchasePoDetail> = [
  { title: "采购单号", dataIndex: "poNum", width: 100 },
  { title: "供应商", dataIndex: "supplierName", width: 120 },
  { title: "需求日期", dataIndex: "requiredDate", width: 110 },
  numberColumn("未交数", "openQty"),
  { title: "净尺寸", dataIndex: "netSize", width: 80 },
];

const inventoryColumns: ColumnsType<PurchaseInventoryDetail> = [
  { title: "仓库", dataIndex: "warehouse", width: 100 },
  { title: "库位", dataIndex: "bin", width: 80 },
  numberColumn("现存", "onHandQty"),
  numberColumn("预留", "reservedQty"),
  numberColumn("可用", "availableQty"),
];

export function PurchaseApplyDetailPanels({ sources, pos, inventories }: Props) {
  return (
    <section className="purchase-apply-details">
      <DetailTable title="来源明细" rows={sources} columns={sourceColumns} />
      <DetailTable title="PO" rows={pos} columns={poColumns} />
      <DetailTable title="库存" rows={inventories} columns={inventoryColumns} />
    </section>
  );
}

function DetailTable<T extends { id: string }>({ title, rows, columns }: { title: string; rows: T[]; columns: ColumnsType<T> }) {
  return (
    <div className="purchase-apply-detail">
      <div className="purchase-apply-detail__title">{title}</div>
      {rows.length ? <Table columns={columns} dataSource={rows} rowKey="id" pagination={false} /> : <Empty description="暂无明细" />}
    </div>
  );
}

function numberColumn<T>(title: string, dataIndex: keyof T) {
  return {
    title,
    dataIndex: dataIndex as string,
    width: 82,
    align: "right" as const,
    render: (value: number) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
  };
}
