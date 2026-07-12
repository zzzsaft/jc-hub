import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { agentRuntimeService } from "../services/agentRuntime.service";
import type {
  AgentRuntimeMessage,
  AgentRuntimeSession,
  AgentRuntimeToolCall,
  AgentRunStreamEvent,
  AgentSqlResult,
} from "../types";

const pageSize = 20;
const maxActiveRuns = 2;

export function useAgentChatPageState() {
  const [sessions, setSessions] = useState<AgentRuntimeSession[]>([]);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [messages, setMessages] = useState<AgentRuntimeMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<AgentRuntimeToolCall[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionKeyword, setSessionKeywordState] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingMessageId, setPendingMessageId] = useState("");
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sessionLoadId = useRef(0);
  const activeRuns = useRef(0);

  const loadSessions = useCallback(async (page = sessionPage, keyword = sessionKeyword) => {
    setLoadingSessions(true);
    try {
      const nextKeyword = keyword.trim();
      const response = await agentRuntimeService.listSessions({ page, pageSize, keyword: nextKeyword || undefined });
      setSessions(response.items);
      setSessionPage(response.page);
      setSessionTotal(response.total);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingSessions(false);
    }
  }, [sessionKeyword, sessionPage]);

  const setSessionKeyword = useCallback((keyword: string) => {
    setSessionKeywordState(keyword);
    void loadSessions(1, keyword);
  }, [loadSessions]);

  const loadRun = useCallback(async (runId?: string | null) => {
    if (!runId) {
      setToolCalls([]);
      return;
    }
    try {
      const detail = await agentRuntimeService.getRun(runId);
      setToolCalls(detail.toolCalls);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    const loadId = ++sessionLoadId.current;
    setSelectedSessionId(sessionId);
    setLoadingDetail(true);
    setError("");
    setMessages([]);
    setToolCalls([]);
    try {
      const detail = await agentRuntimeService.getSession(sessionId);
      const runId = detail.runs[0]?.id;
      const run = runId ? await agentRuntimeService.getRun(runId) : undefined;
      if (loadId !== sessionLoadId.current) return;
      setMessages(detail.messages);
      setToolCalls(run?.toolCalls ?? []);
    } catch (err) {
      if (loadId === sessionLoadId.current) setError(errorText(err));
    } finally {
      if (loadId === sessionLoadId.current) setLoadingDetail(false);
    }
  }, []);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || activeRuns.current >= maxActiveRuns) {
      if (activeRuns.current >= maxActiveRuns) setNotice("服务繁忙，请等待当前查询完成");
      return;
    }
    activeRuns.current += 1;
    setDraft("");
    setSending(true);
    setError("");
    setWaitingSince(Date.now());
    setWaitingSeconds(0);
    const tempMessage: AgentRuntimeMessage = {
      id: `temp-${Date.now()}`,
      sessionId: selectedSessionId,
      role: "user",
      content: message,
      contentJsonb: null,
      createdAt: new Date().toISOString(),
    };
    setPendingMessageId(tempMessage.id);
    setMessages((items) => [...items, tempMessage]);

    try {
      const response = await agentRuntimeService.runAgentStream({
        sessionId: selectedSessionId || undefined,
        message,
      }, (event) => applyProgressEvent(event, setSelectedSessionId, setToolCalls));
      setSelectedSessionId(response.session.id);
      setMessages((items) => mergeRunMessages(items, response.messages, tempMessage.id));
      await loadRun(response.run?.id);
      await loadSessions(1, sessionKeyword);
    } catch (err) {
      setMessages((items) => items.filter((item) => item.id !== tempMessage.id));
      setDraft(message);
      setError(errorText(err));
    } finally {
      activeRuns.current -= 1;
      setSending(activeRuns.current > 0);
      setPendingMessageId("");
      setWaitingSince(null);
    }
  }, [draft, loadRun, loadSessions, selectedSessionId, sessionKeyword]);

  useEffect(() => {
    if (waitingSince === null) return;
    const tick = () => setWaitingSeconds(Math.floor((Date.now() - waitingSince) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [waitingSince]);

  const archiveSession = useCallback(async (sessionId: string) => {
    setError("");
    try {
      await agentRuntimeService.updateSession(sessionId, { status: "archived" });
      if (sessionId === selectedSessionId) {
        setSelectedSessionId("");
        setMessages([]);
        setToolCalls([]);
      }
      await loadSessions(1, sessionKeyword);
    } catch (err) {
      setError(errorText(err));
    }
  }, [loadSessions, selectedSessionId, sessionKeyword]);

  const archiveCurrent = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      await archiveSession(selectedSessionId);
    } catch (err) {
      setError(errorText(err));
    }
  }, [archiveSession, selectedSessionId]);

  const newConversation = useCallback(() => {
    setSelectedSessionId("");
    setMessages([]);
    setToolCalls([]);
    setError("");
    setNotice("");
  }, []);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setError("");
    try {
      await agentRuntimeService.updateSession(sessionId, { title: nextTitle });
      setSessions((items) => items.map((item) => item.id === sessionId ? { ...item, title: nextTitle } : item));
      setNotice("会话已重命名");
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const activeResult = useMemo(() => {
    const assistant = [...messages].reverse().find((item) => item.role === "assistant" && isRecord(item.contentJsonb));
    return assistant?.contentJsonb as AgentSqlResult | undefined;
  }, [messages]);

  const copySql = useCallback(async (result = activeResult) => {
    if (!result?.sql) return;
    await copyText(result.sql);
    setNotice("SQL 已复制");
  }, [activeResult?.sql]);

  const exportJson = useCallback((result = activeResult) => {
    if (!result) return;
    download("erp-agent-result.json", JSON.stringify(result, null, 2), "application/json");
  }, [activeResult]);

  const exportCsv = useCallback((result = activeResult) => {
    if (!result?.fields?.length) return;
    download("erp-agent-result.csv", toCsv(result.fields, result.rows ?? []), "text/csv;charset=utf-8");
  }, [activeResult]);

  useEffect(() => {
    void loadSessions(1, "");
  }, []);

  return {
    sessions,
    sessionPage,
    sessionTotal,
    pageSize,
    sessionKeyword,
    selectedSessionId,
    messages,
    toolCalls,
    draft,
    loadingSessions,
    loadingDetail,
    sending,
    pendingMessageId,
    waitingSeconds,
    notice,
    error,
    activeResult,
    setDraft,
    setNotice,
    setSessionKeyword,
    loadSessions,
    selectSession,
    send,
    archiveCurrent,
    newConversation,
    archiveSession,
    renameSession,
    copySql,
    exportJson,
    exportCsv,
  };
}

function applyProgressEvent(
  event: AgentRunStreamEvent,
  setSelectedSessionId: Dispatch<SetStateAction<string>>,
  setToolCalls: Dispatch<SetStateAction<AgentRuntimeToolCall[]>>,
) {
  if (event.type === "run-start") {
    setSelectedSessionId(event.session.id);
    setToolCalls([]);
    return;
  }
  if (event.type === "tool-start") {
    const now = new Date().toISOString();
    setToolCalls((items) => [...items, {
      id: `${event.runId}:${event.stepId}`,
      runId: event.runId,
      stepId: event.stepId,
      toolName: event.toolName,
      args: null,
      result: null,
      status: "running",
      error: null,
      durationMs: null,
      createdAt: now,
      updatedAt: now,
    }]);
    return;
  }
  if (event.type === "tool-finish") {
    setToolCalls((items) => items.map((tool) => tool.stepId === event.stepId && tool.runId === event.runId
      ? { ...tool, status: event.status, durationMs: event.durationMs, updatedAt: new Date().toISOString() }
      : tool));
  }
}

function mergeRunMessages(
  current: AgentRuntimeMessage[],
  received: AgentRuntimeMessage[],
  temporaryMessageId: string,
) {
  const merged = new Map<string, AgentRuntimeMessage>();
  for (const message of current) {
    if (message.id !== temporaryMessageId) merged.set(message.id, message);
  }
  for (const message of received) merged.set(message.id, message);
  return [...merged.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function errorText(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string } } }).response?.data;
    return data?.error || data?.message || "请求失败";
  }
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(fields: string[], rows: unknown[][]) {
  return [fields, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
