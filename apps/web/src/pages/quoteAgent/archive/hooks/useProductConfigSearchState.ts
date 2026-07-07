import { useState } from "react";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { quoteAgentService } from "../../services/quoteAgent.service";
import type { ProductConfigSearchResponse } from "../../types";
import { errorText } from "../../utils";

const defaultProductConfigSearchFilters = {
  productNumber: "",
  customerId: "",
};

export function useProductConfigSearchState() {
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.productConfigSearch",
    defaultProductConfigSearchFilters,
  );
  const productNumber = filters.productNumber;
  const customerId = filters.customerId;
  const [result, setResult] = useState<ProductConfigSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const keyword = productNumber.trim();
    if (!keyword) {
      setError("请填写产品编号");
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResult(
        await quoteAgentService.searchProductConfigs({
          productNumber: keyword,
          customerId: customerId.trim() || undefined,
          includeErp: true,
        }),
      );
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  return {
    customerId,
    error,
    loading,
    productNumber,
    result,
    search,
    setCustomerId: (value: string) => setFilters({ customerId: value }),
    setProductNumber: (value: string) => setFilters({ productNumber: value }),
  };
}
