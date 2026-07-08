import { Button, Checkbox, DatePicker, Input, InputNumber, Select } from "@/components/ui/core";
import { SearchOutlined } from "@/components/ui/icons";
import { AREA_OPTIONS } from "../constants";
import type { PurchaseApplyFilters } from "../types";
import { normalizeArea } from "../utils";

type Props = {
  filters: PurchaseApplyFilters;
  onChange: <K extends keyof PurchaseApplyFilters>(key: K, value: PurchaseApplyFilters[K]) => void;
  onSearch: () => void;
  loading: boolean;
};

export function PurchaseApplyFilterBar({ filters, onChange, onSearch, loading }: Props) {
  return (
    <section className="purchase-apply-filter">
      <label>
        物料编号
        <Input value={filters.partNum} onChange={(event: any) => onChange("partNum", event.target.value)} />
      </label>
      <label>
        物料描述
        <Input value={filters.partDescription} onChange={(event: any) => onChange("partDescription", event.target.value)} />
      </label>
      <label>
        工单号
        <Input value={filters.jobNum} onChange={(event: any) => onChange("jobNum", event.target.value)} />
      </label>
      <label>
        工单创建起
        <DatePicker value={filters.createdFrom} onChange={(value: string) => onChange("createdFrom", value)} />
      </label>
      <label>
        工单创建止
        <DatePicker value={filters.createdTo} onChange={(value: string) => onChange("createdTo", value)} />
      </label>
      <label>
        需求日期起
        <DatePicker value={filters.requiredFrom} onChange={(value: string) => onChange("requiredFrom", value)} />
      </label>
      <label>
        需求日期止
        <DatePicker value={filters.requiredTo} onChange={(value: string) => onChange("requiredTo", value)} />
      </label>
      <label>
        厂区
        <Select value={filters.area} options={AREA_OPTIONS} onChange={(value: string) => onChange("area", normalizeArea(value))} />
      </label>
      <label className="purchase-apply-filter__compact">
        周期起
        <InputNumber value={filters.cycleFrom} onChange={(event: any) => onChange("cycleFrom", event.target.value)} />
      </label>
      <label className="purchase-apply-filter__compact">
        周期止
        <InputNumber value={filters.cycleTo} onChange={(event: any) => onChange("cycleTo", event.target.value)} />
      </label>
      <Checkbox checked={filters.demandOnly} onChange={(event: any) => onChange("demandOnly", event.target.checked)}>
        需求单
      </Checkbox>
      <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={onSearch}>
        查询
      </Button>
    </section>
  );
}
