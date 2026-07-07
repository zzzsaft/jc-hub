import { Divider, Typography } from "@/components/ui/core";
import { OpportunitySearchFilters } from "./components/OpportunitySearchFilters";
import { OpportunitySearchResults } from "./components/OpportunitySearchResults";
import { useOpportunitySearchPageState } from "./hooks/useOpportunitySearchPageState";
import styles from "./opportunitySearchPage.module.less";

const { Title } = Typography;

export default function OpportunitySearchPage() {
  const state = useOpportunitySearchPageState();

  return (
    <div className={styles.opportunitySearchContainer}>
      <Title level={3} className={styles.searchTitle}>
        商机搜索
      </Title>

      <OpportunitySearchFilters
        loading={state.loading}
        selectedCustomer={state.filters.selectedCustomer}
        selectedStatus={state.filters.selectedStatus}
        onCreate={state.handleCreateOpportunity}
        onSearch={state.handleSearch}
        onCustomerChange={(selectedCustomer) => state.setFilters({ selectedCustomer })}
        onStatusChange={(selectedStatus) => state.setFilters({ selectedStatus })}
      />

      <Divider className={styles.searchDivider} />

      <OpportunitySearchResults
        loading={state.loading}
        opportunities={state.opportunities}
        onCreate={state.handleCreateOpportunity}
        onCardClick={state.handleCardClick}
      />
    </div>
  );
}

