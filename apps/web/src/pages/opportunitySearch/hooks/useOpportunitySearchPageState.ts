import { useEffect, useState } from "react";
import { message } from "@/components/ui/core";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";

type SelectedCustomer = Array<{ label: string; value: string }> | null;

const defaultOpportunitySearchFilters = {
  selectedCustomer: null as SelectedCustomer,
  selectedStatus: [] as string[],
};

export function useOpportunitySearchPageState() {
  const { filters, setFilters } = usePersistentFilterState(
    "opportunity.search",
    defaultOpportunitySearchFilters,
  );
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<any[]>([]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void handleSearch();
  }, []);

  const handleCreateOpportunity = () => {
    window.open("/opportunities/new", "_blank");
  };

  const handleCardClick = async () => {
    try {
      // Existing behavior is intentionally empty until opportunity navigation is wired.
    } catch (error) {
      message.error("初始化商机失败");
    }
  };

  return {
    filters,
    loading,
    opportunities,
    setFilters,
    handleCardClick,
    handleCreateOpportunity,
    handleSearch,
  };
}

