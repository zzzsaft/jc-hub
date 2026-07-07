import { apiClient } from "../http/client";
import { QuoteTemplate } from "@/types/types";

export const TemplateService = {
  async getTemplates(params?: {
    formType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const res = await apiClient.get("/template/get", { params });
    return res.data as { list: QuoteTemplate[]; total: number };
  },
  async getTemplate(id: string) {
    const res = await apiClient.get("/template/detail/get", { params: { id } });
    return res.data as QuoteTemplate;
  },
  async createTemplate(data: Partial<QuoteTemplate>) {
    const res = await apiClient.post("/template/create", data);
    return res.data as QuoteTemplate;
  },
  async updateTemplate(id: string, data: Partial<QuoteTemplate>) {
    const res = await apiClient.post("/template/update", { id, ...data });
    return res.data as QuoteTemplate;
  },
  async deleteTemplate(id: string) {
    const res = await apiClient.delete("/template/delete", { params: { id } });
    return res.data;
  },
};
