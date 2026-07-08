import { filterRows } from "../utils";
import type { PurchaseApplyFilters, PurchaseApplyRow, PurchaseApplySearchResult } from "../types";

const rows: PurchaseApplyRow[] = [
  row("1", "M-2048", "涂布模头密封条", "总厂", "杭州精密橡塑", "A", 86, 120, 12, "pcs", "2026-07-16", 10, 12, 24, 18),
  row("2", "M-3102", "计量泵联轴器", "澄江", "苏州传动", "B", 42, 42, 8, "PCS", "2026-07-20", 1, 42, 35, 5),
  row("3", "M-1160", "分流块加热棒", "总厂", "宁波热工", "安全库存", 64, 80, 16, "pcs", "2026-07-22", 8, 10, 45, 32),
  row("4", "M-7781", "液压站压力表", "澄江", "上海仪表", "C", 20, 25, 3, "EA", "2026-07-18", 1, 25, 18, 6),
  row("5", "M-4520", "厚度仪支架", "总厂", "常州机加", "临采", 12, 15, 2, "套", "2026-07-25", 5, 3, 60, 0),
  row("6", "M-9006", "挤出机温控线", "总厂", "温州电气", "B", 110, 120, 30, "m", "2026-07-28", 20, 6, 50, 44),
  row("7", "M-6621", "模体定位销", "澄江", "无锡标准件", "A", 300, 300, 120, "pcs", "2026-07-30", 1, 300, 15, 210),
  row("8", "M-3875", "流道抛光砂纸", "总厂", "嘉兴耗材", "安全库存", 500, 600, 160, "张", "2026-08-02", 100, 6, 20, 80),
  row("9", "M-5019", "背压阀维修包", "澄江", "上海仪表", "B", 18, 20, 4, "套", "2026-08-05", 1, 20, 38, 3),
  row("10", "M-7204", "换网器铜套", "总厂", "常州机加", "C", 24, 30, 5, "pcs", "2026-08-06", 6, 5, 70, 7),
];

const sources = rows.flatMap((item, index) => [
  source(`${item.id}-1`, item, `JOB-${2600 + index}`, item.requiredQty * 0.6, item.orderQty * 0.3),
  source(`${item.id}-2`, item, `JOB-${2700 + index}`, item.requiredQty * 0.4, item.orderQty * 0.2),
]);

const pos = rows.map((item, index) => ({
  id: item.id,
  partNum: item.partNum,
  area: item.area,
  applyDate: "2026-07-08",
  requiredDate: item.arrivalDate,
  openQty: Math.max(0, item.orderQty - item.stockQty),
  supplierName: item.supplierName,
  poNum: String(1092000 + index),
  netSize: index % 2 === 0 ? "标准" : "定制",
}));

const inventories = rows.map((item, index) => ({
  id: item.id,
  partNum: item.partNum,
  warehouse: item.area === "澄江" ? "CJ-MAIN" : "ZC-MAIN",
  bin: `A-${String(index + 1).padStart(2, "0")}`,
  onHandQty: item.stockQty,
  reservedQty: Math.round(item.stockQty * 0.25),
  availableQty: Math.round(item.stockQty * 0.75),
}));

export const PurchaseApplyService = {
  async search(filters: PurchaseApplyFilters): Promise<PurchaseApplySearchResult> {
    return {
      rows: filterRows(rows, filters).map((item) => ({ ...item })),
      sources,
      pos,
      inventories,
    };
  },

  async save(selectedRows: PurchaseApplyRow[]) {
    return {
      applyNum: `MOCK-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-0001`,
      count: selectedRows.length,
    };
  },
};

function row(
  id: string,
  partNum: string,
  partDescription: string,
  area: "总厂" | "澄江",
  supplierName: string,
  stockLevel: string,
  requiredQty: number,
  orderQty: number,
  monthlyUsage: number,
  unit: string,
  arrivalDate: string,
  packageSpec: number,
  pieces: number,
  purchaseCycle: number,
  stockQty: number,
): PurchaseApplyRow {
  return {
    id,
    selected: false,
    operated: false,
    partNum,
    partDescription,
    needDrawing: id === "3" || id === "5",
    smallBatch: id === "5" || id === "9",
    requiredQty,
    orderQty,
    monthlyUsage,
    unit,
    arrivalDate,
    packageSpec,
    pieces,
    purchaseCycle,
    area,
    stockLevel,
    remark: "",
    stockQty,
    supplierName,
    vendorId: `V${id.padStart(3, "0")}`,
    vendorNum: String(8000 + Number(id)),
  };
}

function source(id: string, item: PurchaseApplyRow, jobNum: string, requiredQty: number, issuedQty: number) {
  return {
    id,
    partNum: item.partNum,
    area: item.area,
    supplierName: item.supplierName,
    jobNum,
    requiredDate: item.arrivalDate,
    requiredQty: Number(requiredQty.toFixed(2)),
    issuedQty: Number(issuedQty.toFixed(2)),
    balanceQty: Number((requiredQty - issuedQty).toFixed(2)),
  };
}
