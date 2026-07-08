import type {
  PurchaseApplyArea,
  PurchaseApplyFilters,
  PurchaseApplyRow,
  PurchaseInventoryDetail,
  PurchasePoDetail,
  PurchaseSourceDetail,
} from "./types";

export function calcOrderQty(row: PurchaseApplyRow, pieces: number) {
  return row.area === "澄江" ? row.orderQty : Number((row.packageSpec * pieces).toFixed(2));
}

export function filterRows(rows: PurchaseApplyRow[], filters: PurchaseApplyFilters) {
  return rows.filter((row) => {
    if (filters.partNum && !row.partNum.toLowerCase().includes(filters.partNum.toLowerCase())) return false;
    if (filters.partDescription && !row.partDescription.includes(filters.partDescription)) return false;
    if (filters.area && row.area !== filters.area) return false;
    if (filters.demandOnly && row.requiredQty <= 0) return false;
    const from = Number(filters.cycleFrom || 0);
    const to = Number(filters.cycleTo || 9999);
    return row.purchaseCycle >= from && row.purchaseCycle <= to;
  });
}

export function filterSources(rows: PurchaseSourceDetail[], active?: PurchaseApplyRow) {
  if (!active) return [];
  return rows.filter((row) => row.partNum === active.partNum && row.area === active.area && row.supplierName === active.supplierName);
}

export function filterPos(rows: PurchasePoDetail[], active?: PurchaseApplyRow) {
  if (!active) return [];
  return rows.filter((row) => row.partNum === active.partNum && row.area === active.area);
}

export function filterInventories(rows: PurchaseInventoryDetail[], active?: PurchaseApplyRow) {
  if (!active) return [];
  return rows.filter((row) => row.partNum === active.partNum);
}

export function validateRows(rows: PurchaseApplyRow[], today = new Date()) {
  const selected = rows.filter((row) => row.selected);
  if (selected.length === 0) return "未选择数据";
  const todayText = today.toISOString().slice(0, 10);
  if (selected.some((row) => Number(row.orderQty) === 0)) return "下单数量为0";
  if (selected.some((row) => row.arrivalDate && row.arrivalDate < todayText)) return "到货日期小于下单日期";
  return "";
}

export function normalizeArea(value: string): PurchaseApplyArea {
  return value === "总厂" || value === "澄江" ? value : "";
}
