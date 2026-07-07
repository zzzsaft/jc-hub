import { Button, Space } from "@/components/ui/core";
import { PlusOutlined, SearchOutlined } from "@/components/ui/icons";
import { CustomerService } from "@/api/services/customer.service";
import { DebounceSelect } from "@/components/general/DebounceSelect";
import StatusSelector from "@/components/statusSelector";
import styles from "../opportunitySearchPage.module.less";

type OpportunitySearchFiltersProps = {
  loading: boolean;
  selectedCustomer: Array<{ label: string; value: string }> | null;
  selectedStatus: string[];
  onCreate: () => void;
  onSearch: () => void;
  onCustomerChange: (value: Array<{ label: string; value: string }> | null) => void;
  onStatusChange: (value: string[]) => void;
};

export function OpportunitySearchFilters({
  loading,
  selectedCustomer,
  selectedStatus,
  onCreate,
  onSearch,
  onCustomerChange,
  onStatusChange,
}: OpportunitySearchFiltersProps) {
  return (
    <div className={styles.searchControls}>
      <Space size="middle" className={styles.searchInputGroup}>
        <DebounceSelect
          mode="multiple"
          maxCount={5}
          fetchOptions={CustomerService.searchCompanies}
          value={selectedCustomer}
          onChange={(newValue) => onCustomerChange(Array.isArray(newValue) ? newValue as Array<{ label: string; value: string }> : null)}
          showSearch
          placeholder="搜索并选择公司"
          className={styles.searchInput}
          suffixIcon={<SearchOutlined />}
        />

        <StatusSelector value={selectedStatus} onChange={onStatusChange} />
        <Space size={16}>
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch} loading={loading} className={styles.searchButton}>
            搜索
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            创建商机
          </Button>
        </Space>
      </Space>
    </div>
  );
}

