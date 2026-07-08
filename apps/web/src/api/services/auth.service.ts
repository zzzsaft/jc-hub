// import type { LoginParams, UserInfo } from '../types/auth.d';
import { Position } from "@/types/types";
import { apiClient } from "../http/client";

export type PermissionItem = {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

export type RolePermissionItem = {
  id: string;
  code: string;
  name: string;
  permissions: string[];
};

export type UserPermissionOverride = {
  permissionCode: string;
  effect: "allow" | "deny";
};

export type UserDirectoryItem = {
  id: string;
  username: string | null;
  name: string;
  roles: string[];
  status: string;
  wecomUserId: string | null;
  erpUserId: string | null;
  employeeNo: string | null;
  mobile: string | null;
  email: string | null;
  position: string | null;
  teamName: string | null;
  mainDepartment: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserDirectoryResponse = {
  items: UserDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const AuthService = {
  async loginWithCode(code: string): Promise<{ token: string }> {
    return (await apiClient.post("/auth/token", { code })).data;
  },

  async loginWithPassword(username: string, password: string): Promise<{ token: string }> {
    return (await apiClient.post("/auth/password/token", { clientId: "jc-hub", username, password })).data;
  },

  async getUserInfo(): Promise<any> {
    return (await apiClient.get("/auth/me")).data;
  },

  async listPermissions(): Promise<{ items: PermissionItem[] }> {
    return (await apiClient.get("/auth/admin/permissions")).data;
  },

  async listRoles(): Promise<{ items: RolePermissionItem[] }> {
    return (await apiClient.get("/auth/admin/roles")).data;
  },

  async updateRolePermissions(roleId: string, permissions: string[]): Promise<{ items: RolePermissionItem[] }> {
    return (await apiClient.patch(`/auth/admin/roles/${roleId}/permissions`, { permissions })).data;
  },

  async listUsers(params: { keyword?: string; page?: number; pageSize?: number } = {}): Promise<UserDirectoryResponse> {
    return (await apiClient.get("/auth/admin/users", { params })).data;
  },

  async listAccounts(keyword = ""): Promise<any> {
    return (await apiClient.get("/auth/admin/accounts", { params: { keyword } })).data;
  },

  async getPermissionOverrides(userId: string): Promise<{ items: UserPermissionOverride[] }> {
    return (await apiClient.get(`/auth/admin/accounts/${userId}/permission-overrides`)).data;
  },

  async updatePermissionOverrides(userId: string, overrides: UserPermissionOverride[]): Promise<{ items: UserPermissionOverride[] }> {
    return (await apiClient.patch(`/auth/admin/accounts/${userId}/permission-overrides`, { overrides })).data;
  },

  async setLocation(location: Position | null): Promise<any> {
    return (await apiClient.post("/auth/location", { location: location }))
      .data;
  },

  async refreshToken(refreshToken: string) {
    return apiClient.post("/auth/refresh", { refreshToken });
  },

  async corpTicket(timestamp: number, nonce: string, url: string) {
    return (
      await apiClient.post("/auth/corp_ticket", {
        timestamp,
        nonce,
        url,
      })
    ).data;
  },

  async agentTicket(timestamp: number, nonce: string, url: string) {
    return (
      await apiClient.post("/auth/agent_ticket", {
        timestamp,
        nonce,
        url,
      })
    ).data;
  },

  async getConfigSignature(url: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = Math.random().toString(36).slice(2, 8);
    const signature = await AuthService.corpTicket(timestamp, nonceStr, url);
    // console.log("getConfigSignature", { timestamp, nonceStr, signature });
    return { timestamp, nonceStr, signature };
  },

  async getAgentSignature(url: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = Math.random().toString(36).slice(2, 8);
    const signature = await AuthService.agentTicket(timestamp, nonceStr, url);
    // console.log("getAgentSignature", { timestamp, nonceStr, signature });
    return { timestamp, nonceStr, signature };
  },

  async redirectJdy(uri: string) {
    return (
      await apiClient.get("/auth/sso/jdy/redirect", {
        params: { redirect_uri: uri },
      })
    ).data?.link;
  },
};
