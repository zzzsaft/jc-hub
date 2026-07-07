// import type { LoginParams, UserInfo } from '../types/auth.d';
import { redirect } from "react-router-dom";
import { apiClient } from "../http/client";

export const OpportunityService = {
  async getOpportunity(company?: string[] | null, status?: string[]) {
    const opportunity = await apiClient.get("/opportunity/get", {
      params: { company, status },
    });
    return opportunity.data;
  },
  async getProductCategory() {
    const products = await apiClient.get("/category/get");
    return products.data;
  },
  async getProductPump() {
    const products = await apiClient.get("/product/pump/get");
    return products.data;
  },
  async getProductFilter() {
    const products = await apiClient.get("/product/filter/get");
    return products.data;
  },
};
