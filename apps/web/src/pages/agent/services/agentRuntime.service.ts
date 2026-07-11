import { apiClient } from "@/api/http/client";
import { getRequestToken } from "@/api/http/interceptors";
import {
  ERP_AGENT_TYPE,
  type AgentRunDetail,
  type AgentRunResponse,
  type AgentRunStreamEvent,
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

  async runAgentStream(
    params: { sessionId?: string; message: string },
    onEvent: (event: AgentRunStreamEvent) => void,
  ): Promise<AgentRunResponse> {
    const response = await fetch(`${apiClient.defaults.baseURL?.replace(/\/$/, "") ?? ""}/agentRuntime/run/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getRequestToken() ? { Authorization: `Bearer ${getRequestToken()}` } : {}),
      },
      body: JSON.stringify({ agentType: ERP_AGENT_TYPE, confirmed: true, ...params }),
    });
    if (!response.ok || !response.body) throw new Error(await response.text() || "请求失败");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed: AgentRunResponse | undefined;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseStreamEvent(frame);
        if (!event) continue;
        if (event.type === "error") throw new Error(String(event.data?.error ?? "请求失败"));
        const payload = { type: event.type, ...event.data } as AgentRunStreamEvent;
        onEvent(payload);
        if (payload.type === "complete") completed = payload;
      }
      if (done) break;
    }
    if (!completed) throw new Error("Agent 响应未完成");
    return completed;
  },

  async getRun(runId: string): Promise<AgentRunDetail> {
    return unwrap(await apiClient.get(`/agentRuntime/runs/${encodeURIComponent(runId)}`, slowRequest));
  },
};

function parseStreamEvent(frame: string): { type: string; data: Record<string, unknown> } | null {
  const type = frame.match(/^event: (.+)$/m)?.[1];
  const data = frame.match(/^data: (.+)$/m)?.[1];
  if (!type || !data) return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? { type, data: parsed } : null;
  } catch {
    return null;
  }
}
