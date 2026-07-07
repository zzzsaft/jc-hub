import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { quoteAgentService } from "../../services/quoteAgent.service";
import type { ContractArchiveStatus, ContractListItem, ContractSummary } from "../../types";
import { errorText } from "../../utils";

const defaultSummary: ContractSummary = {
  uploadedCount: 0,
  normalizedCount: 0,
  archivedCount: 0,
};

type ContractDashboardFilters = {
  status: ContractArchiveStatus | "";
  q: string;
  productNumber: string;
  customerId: string;
  page: number;
  pageSize: number;
};

const defaultContractDashboardFilters: ContractDashboardFilters = {
  status: "",
  q: "",
  productNumber: "",
  customerId: "",
  page: 1,
  pageSize: 20,
};

export function useContractDashboardState() {
  const navigate = useNavigate();
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.contractDashboard",
    defaultContractDashboardFilters,
  );
  const [summary, setSummary] = useState<ContractSummary>(defaultSummary);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const status = filters.status;
  const q = filters.q;
  const productNumber = filters.productNumber;
  const customerId = filters.customerId;
  const page = Number(filters.page) || defaultContractDashboardFilters.page;
  const pageSize = Number(filters.pageSize) || defaultContractDashboardFilters.pageSize;
  const [total, setTotal] = useState(0);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | number>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, listResponse] = await Promise.all([
        quoteAgentService.getContractSummary(),
        quoteAgentService.listContracts({
          page: nextPage,
          pageSize,
          status,
          q: q.trim() || undefined,
          productNumber: productNumber.trim() || undefined,
          customerId: customerId.trim() || undefined,
        }),
      ]);
      setSummary(summaryResponse);
      setContracts(listResponse.items ?? []);
      setTotal(Number(listResponse.total ?? 0));
      setFilters({
        page: Number(listResponse.page ?? nextPage),
        pageSize: Number(listResponse.pageSize ?? pageSize),
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [customerId, page, pageSize, productNumber, q, setFilters, status]);

  useEffect(() => {
    void load(page);
  }, [load]);

  const search = () => {
    setFilters({ page: 1 });
    void load(1);
  };

  const openContract = (contract: ContractListItem) => {
    if (contract.status === "archived" && contract.archiveId) {
      setSelectedArchiveId(contract.archiveId);
      return;
    }
    navigate(`/agent/archive/contracts/${contract.documentId}`);
  };

  const closeArchiveModal = () => setSelectedArchiveId("");

  return {
    contracts,
    customerId,
    error,
    loading,
    page,
    pageSize,
    productNumber,
    q,
    closeArchiveModal,
    selectedArchiveId,
    status,
    summary,
    total,
    load,
    openContract,
    search,
    setCustomerId: (value: string) => setFilters({ customerId: value }),
    setPage: (value: number) => setFilters({ page: value }),
    setPageSize: (value: number) => setFilters({ pageSize: value }),
    setProductNumber: (value: string) => setFilters({ productNumber: value }),
    setQ: (value: string) => setFilters({ q: value }),
    setStatus: (value: ContractArchiveStatus | "") => setFilters({ status: value }),
  };
}
