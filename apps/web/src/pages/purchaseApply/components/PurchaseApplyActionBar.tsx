import { Button, DatePicker, Typography } from "@/components/ui/core";
import type { PurchaseApplyFilters } from "../types";

type Props = {
  filters: PurchaseApplyFilters;
  selectedCount: number;
  saving: boolean;
  notice: string;
  onChangeBatchDate: (value: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApplyBatchDate: () => void;
  onSave: () => void;
};

export function PurchaseApplyActionBar({
  filters,
  selectedCount,
  saving,
  notice,
  onChangeBatchDate,
  onSelectAll,
  onClearSelection,
  onApplyBatchDate,
  onSave,
}: Props) {
  return (
    <section className="purchase-apply-actions">
      <Typography.Text>已选择 {selectedCount} 行</Typography.Text>
      <Button onClick={onSelectAll}>全选</Button>
      <Button onClick={onClearSelection}>取消全选</Button>
      <Button type="primary" loading={saving} onClick={onSave}>保存</Button>
      <div className="purchase-apply-actions__date">
        <span>到货日期</span>
        <DatePicker value={filters.batchArrivalDate} onChange={onChangeBatchDate} />
        <Button onClick={onApplyBatchDate}>批量更新</Button>
      </div>
      {notice && <span className="purchase-apply-actions__notice">{notice}</span>}
    </section>
  );
}
