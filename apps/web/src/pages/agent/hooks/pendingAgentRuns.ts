import type { AgentRuntimeToolCall } from "../types";

export type PendingAgentRun = {
  clientRunId: string;
  tempMessageId: string;
  submittedSessionId: string;
  resolvedSessionId?: string;
  serverRunId?: string;
  waitingSince: number;
  tools: AgentRuntimeToolCall[];
  status: "active" | "error";
  error?: string;
};

export type PendingAgentRuns = Record<string, PendingAgentRun>;

export function createPendingRun(runs: PendingAgentRuns, run: Omit<PendingAgentRun, "tools" | "status">): PendingAgentRuns {
  return { ...runs, [run.clientRunId]: { ...run, tools: [], status: "active" } };
}

export function startPendingRun(
  runs: PendingAgentRuns,
  clientRunId: string,
  serverRunId: string,
  resolvedSessionId: string,
): PendingAgentRuns {
  const run = runs[clientRunId];
  return run ? { ...runs, [clientRunId]: { ...run, serverRunId, resolvedSessionId, tools: [] } } : runs;
}

export function updatePendingRun(runs: PendingAgentRuns, clientRunId: string, update: Partial<PendingAgentRun>): PendingAgentRuns {
  const run = runs[clientRunId];
  return run ? { ...runs, [clientRunId]: { ...run, ...update } } : runs;
}

export function completePendingRun(runs: PendingAgentRuns, clientRunId: string): PendingAgentRuns {
  const next = { ...runs };
  delete next[clientRunId];
  return next;
}

export function runBelongsToSession(run: PendingAgentRun, sessionId: string): boolean {
  return sessionId === (run.resolvedSessionId ?? run.submittedSessionId);
}

export function canApplyRunResponse(run: PendingAgentRun, currentSessionId: string, responseSessionId: string): boolean {
  return currentSessionId === responseSessionId
    && (run.submittedSessionId === responseSessionId || run.resolvedSessionId === responseSessionId);
}
