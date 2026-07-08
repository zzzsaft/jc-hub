import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "../constants";
import { PurchaseApplyService } from "../services/purchaseApply.service";
import type { PurchaseApplyFilters, PurchaseApplyRow, PurchaseApplySearchResult } from "../types";
import { calcOrderQty, filterInventories, filterPos, filterSources, validateRows } from "../utils";

export function usePurchaseApplyPageState() {
  const [filters, setFilters] = useState<PurchaseApplyFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<PurchaseApplySearchResult>({ rows: [], sources: [], pos: [], inventories: [] });
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const activeRow = useMemo(() => data.rows.find((row) => row.id === activeId) ?? data.rows[0], [activeId, data.rows]);
  const selectedCount = data.rows.filter((row) => row.selected).length;

  async function search(nextFilters = filters) {
    setLoading(true);
    setNotice("");
    try {
      const result = await PurchaseApplyService.search(nextFilters);
      setData(result);
      setActiveId(result.rows[0]?.id ?? "");
    } finally {
      setLoading(false);
    }
  }

  function patchFilter<K extends keyof PurchaseApplyFilters>(key: K, value: PurchaseApplyFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function patchRow(id: string, patch: Partial<PurchaseApplyRow>) {
    setData((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch, operated: true } : row)),
    }));
  }

  function patchPieces(row: PurchaseApplyRow, pieces: number) {
    patchRow(row.id, { pieces, orderQty: calcOrderQty(row, pieces) });
  }

  function setAllSelected(selected: boolean) {
    setData((current) => ({
      ...current,
      rows: current.rows.map((row) => ({ ...row, selected })),
    }));
  }

  function applyBatchArrivalDate() {
    setData((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.selected ? { ...row, arrivalDate: filters.batchArrivalDate, operated: true } : row,
      ),
    }));
  }

  async function save() {
    const error = validateRows(data.rows);
    if (error) {
      setNotice(error);
      return;
    }
    setSaving(true);
    try {
      const result = await PurchaseApplyService.save(data.rows.filter((row) => row.selected));
      setNotice(`成功生成申请单：${result.applyNum} 共 ${result.count} 行`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void search(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    rows: data.rows,
    activeRow,
    loading,
    saving,
    notice,
    selectedCount,
    sourceRows: filterSources(data.sources, activeRow),
    poRows: filterPos(data.pos, activeRow),
    inventoryRows: filterInventories(data.inventories, activeRow),
    patchFilter,
    patchRow,
    patchPieces,
    search: () => search(),
    save,
    setActiveId,
    setAllSelected,
    applyBatchArrivalDate,
  };
}
