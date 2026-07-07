// import type { LoginParams, UserInfo } from '../types/auth.d';
import { Position } from "@/types/types";
import { apiClient } from "../http/client";

export const AuthService = {
  async loginWithCode(code: string): Promise<{ token: string }> {
    return (await apiClient.post("/auth/token", { code })).data;
  },

  async getUserInfo(): Promise<any> {
    return (await apiClient.get("/auth/me")).data;
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
