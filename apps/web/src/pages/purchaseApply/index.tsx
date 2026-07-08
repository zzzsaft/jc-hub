import { Typography } from "@/components/ui/core";
import { PurchaseApplyActionBar } from "./components/PurchaseApplyActionBar";
import { PurchaseApplyDetailPanels } from "./components/PurchaseApplyDetailPanels";
import { PurchaseApplyFilterBar } from "./components/PurchaseApplyFilterBar";
import { PurchaseApplyTable } from "./components/PurchaseApplyTable";
import { usePurchaseApplyPageState } from "./hooks/usePurchaseApplyPageState";
import "./styles.less";

export default function PurchaseApplyPage() {
  const state = usePurchaseApplyPageState();

  return (
    <div className="purchase-apply-page">
      <header className="purchase-apply-page__header">
        <div>
          <Typography.Title level={3}>采购申请</Typography.Title>
          <Typography.Text type="secondary">筛选物料需求，维护下单数量、到货日期和来源明细。</Typography.Text>
        </div>
      </header>

      <PurchaseApplyFilterBar
        filters={state.filters}
        loading={state.loading}
        onChange={state.patchFilter}
        onSearch={state.search}
      />

      <PurchaseApplyActionBar
        filters={state.filters}
        selectedCount={state.selectedCount}
        saving={state.saving}
        notice={state.notice}
        onChangeBatchDate={(value) => state.patchFilter("batchArrivalDate", value)}
        onSelectAll={() => state.setAllSelected(true)}
        onClearSelection={() => state.setAllSelected(false)}
        onApplyBatchDate={state.applyBatchArrivalDate}
        onSave={state.save}
      />

      <PurchaseApplyTable
        rows={state.rows}
        activeId={state.activeRow?.id}
        loading={state.loading}
        onActivate={state.setActiveId}
        onPatchRow={state.patchRow}
        onPatchPieces={state.patchPieces}
      />

      <PurchaseApplyDetailPanels
        sources={state.sourceRows}
        pos={state.poRows}
        inventories={state.inventoryRows}
      />
    </div>
  );
}
