import { apiClient } from "../http/client";
import { ProductSearchResult } from "@/types/types";

export const ProductService = {
  async searchProducts(
    keyword: string,
    field: "code" | "name",
    formType?: string,
    page = 1,
    pageSize = 10
  ) {
    const res = await apiClient.get("/product/search", {
      params: { keyword, field, formType, page, pageSize },
    });
    return res.data as { list: ProductSearchResult[]; total: number };
  },
};
