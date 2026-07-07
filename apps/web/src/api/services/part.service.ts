import { apiClient } from "../http/client";
import { PartSearchResult } from "@/types/types";

export const PartService = {
  async searchParts(keyword: string) {
    const res = await apiClient.get("/product/part/search", {
      params: { keyword },
    });
    return res.data as PartSearchResult[];
  },
};
