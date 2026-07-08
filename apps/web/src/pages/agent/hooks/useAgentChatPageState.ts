import { useCallback, useEffect, useMemo, useState } from "react";
import { agentRuntimeService } from "../services/agentRuntime.service";
import type {
  AgentRuntimeMessage,
  AgentRuntimeSession,
  AgentRuntimeToolCall,
  AgentSqlResult,
} from "../types";

const pageSize = 20;

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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
    setSelectedSessionId(sessionId);
    setLoadingDetail(true);
    setError("");
    try {
      const detail = await agentRuntimeService.getSession(sessionId);
      setMessages(detail.messages);
      await loadRun(detail.runs[0]?.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingDetail(false);
    }
  }, [loadRun]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    setSending(true);
    setError("");
    const tempMessage: AgentRuntimeMessage = {
      id: `temp-${Date.now()}`,
      sessionId: selectedSessionId,
      role: "user",
      content: message,
      contentJsonb: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((items) => [...items, tempMessage]);

    try {
      const response = await agentRuntimeService.runAgent({
        sessionId: selectedSessionId || undefined,
        message,
      });
      setSelectedSessionId(response.session.id);
      const detail = await agentRuntimeService.getSession(response.session.id);
      setMessages(detail.messages);
      await loadRun(response.run?.id ?? detail.runs[0]?.id);
      await loadSessions(1, sessionKeyword);
    } catch (err) {
      setMessages((items) => items.filter((item) => item.id !== tempMessage.id));
      setDraft(message);
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }, [draft, loadRun, loadSessions, selectedSessionId, sending, sessionKeyword]);

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

  const copySql = useCallback(async () => {
    if (!activeResult?.sql) return;
    await copyText(activeResult.sql);
    setNotice("SQL 已复制");
  }, [activeResult?.sql]);

  const exportJson = useCallback(() => {
    if (!activeResult) return;
    download("erp-agent-result.json", JSON.stringify(activeResult, null, 2), "application/json");
  }, [activeResult]);

  const exportCsv = useCallback(() => {
    if (!activeResult?.fields?.length) return;
    download("erp-agent-result.csv", toCsv(activeResult.fields, activeResult.rows ?? []), "text/csv;charset=utf-8");
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
    archiveSession,
    renameSession,
    copySql,
    exportJson,
    exportCsv,
  };
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
