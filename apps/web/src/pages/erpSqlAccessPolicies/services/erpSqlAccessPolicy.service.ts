import { apiClient } from "@/api/http/client";
import type { AccessPolicyAuditLog, ErpSqlAccessPolicy, PolicyListResponse } from "../types";

export const ErpSqlAccessPolicyService = {
  async list(params: Record<string, unknown>): Promise<PolicyListResponse> {
    return (await apiClient.get("/api/erp-sql/access-policies", { params })).data;
  },

  async create(payload: Record<string, unknown>): Promise<ErpSqlAccessPolicy> {
    return (await apiClient.post("/api/erp-sql/access-policies", payload)).data;
  },

  async update(id: string, payload: Record<string, unknown>): Promise<ErpSqlAccessPolicy> {
    return (await apiClient.patch(`/api/erp-sql/access-policies/${id}`, payload)).data;
  },

  async setEnabled(id: string, enabled: boolean): Promise<ErpSqlAccessPolicy> {
    return (await apiClient.post(`/api/erp-sql/access-policies/${id}/${enabled ? "enable" : "disable"}`)).data;
  },

  async archive(id: string): Promise<ErpSqlAccessPolicy> {
    return (await apiClient.delete(`/api/erp-sql/access-policies/${id}`)).data;
  },

  async previewScope(payload: Record<string, unknown>): Promise<unknown> {
    return (await apiClient.post("/api/erp-sql/access-policies/preview-scope", payload)).data;
  },

  async auditLogs(id: string, params: Record<string, unknown>): Promise<{ items: AccessPolicyAuditLog[]; pageInfo: { page: number; pageSize: number; total: number } }> {
    return (await apiClient.get(`/api/erp-sql/access-policies/${id}/audit-logs`, { params })).data;
  },
};
