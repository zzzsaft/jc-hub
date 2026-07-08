import { apiClient } from "@/api/http/client";
import {
  ERP_AGENT_TYPE,
  type AgentRunDetail,
  type AgentRunResponse,
  type AgentSessionDetail,
  type AgentSessionListResponse,
  type AgentRuntimeSession,
} from "../types";

const unwrap = <T>(response: { data: T }) => response.data;
const slowRequest = { timeout: 120000 };

export const agentRuntimeService = {
  async listSessions(params: { page: number; pageSize: number; keyword?: string }): Promise<AgentSessionListResponse> {
    return unwrap(await apiClient.get("/agentRuntime/sessions", {
      params: { ...params, agentType: ERP_AGENT_TYPE, status: "active" },
      ...slowRequest,
    }));
  },

  async updateSession(sessionId: string, body: { status?: string; title?: string | null }): Promise<AgentRuntimeSession> {
    return unwrap(await apiClient.patch(`/agentRuntime/sessions/${encodeURIComponent(sessionId)}`, body, slowRequest));
  },

  async getSession(sessionId: string): Promise<AgentSessionDetail> {
    return unwrap(await apiClient.get(`/agentRuntime/sessions/${encodeURIComponent(sessionId)}`, slowRequest));
  },

  async runAgent(params: { sessionId?: string; message: string }): Promise<AgentRunResponse> {
    return unwrap(await apiClient.post("/agentRuntime/run", {
      agentType: ERP_AGENT_TYPE,
      confirmed: true,
      sessionId: params.sessionId,
      message: params.message,
    }, slowRequest));
  },

  async getRun(runId: string): Promise<AgentRunDetail> {
    return unwrap(await apiClient.get(`/agentRuntime/runs/${encodeURIComponent(runId)}`, slowRequest));
  },
};
