import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatabaseOutlined } from "@/components/ui/icons";
import type { useAgentChatPageState } from "../hooks/useAgentChatPageState";
import type { AgentRuntimeMessage } from "../types";

export type AgentMobilePanel = "chat" | "sessions" | "result";

type AgentChatState = ReturnType<typeof useAgentChatPageState>;

export function AgentSessionSidebar({
  state,
  active,
  onSelectSession,
}: {
  state: AgentChatState;
  active: boolean;
  onSelectSession: () => void;
}) {
  const navigate = useNavigate();
  const [actionSessionId, setActionSessionId] = useState("");
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const canPrev = state.sessionPage > 1;
  const canNext = state.sessionPage * state.pageSize < state.sessionTotal;
  const actionSession = state.sessions.find((session) => session.id === actionSessionId);

  const stopLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => () => stopLongPress(), []);

  const startLongPress = (sessionId: string) => {
    longPressed.current = false;
    stopLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setActionSessionId(sessionId);
    }, 450);
  };
  const renameActionSession = async () => {
    if (!actionSession) return;
    const title = window.prompt("重命名会话", actionSession.title || "ERP SQL 对话");
    setActionSessionId("");
    if (title != null) await state.renameSession(actionSession.id, title);
  };
  const archiveActionSession = async () => {
    if (!actionSession || !window.confirm("删除这个会话？")) return;
    setActionSessionId("");
    await state.archiveSession(actionSession.id);
  };

  return (
    <aside className={panelClass(active, "erp-chat-sessions")}>
      <div className="erp-chat-section-head">
        <div>
          <h2>ERP SQL 对话</h2>
          <p>{state.sessionTotal} 个会话</p>
        </div>
        <input
          className="erp-chat-session-search"
          value={state.sessionKeyword}
          onChange={(event) => state.setSessionKeyword(event.target.value)}
          placeholder="搜索会话内容..."
        />
      </div>

      <div className="erp-chat-session-list">
        {state.sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            className={session.id === state.selectedSessionId ? "erp-chat-session erp-chat-session-active" : "erp-chat-session"}
            onPointerDown={() => startLongPress(session.id)}
            onPointerLeave={stopLongPress}
            onPointerUp={stopLongPress}
            onContextMenu={(event) => {
              event.preventDefault();
              setActionSessionId(session.id);
            }}
            onClick={() => {
              stopLongPress();
              if (longPressed.current) return;
              onSelectSession();
              void state.selectSession(session.id);
            }}
          >
            <span>{session.title || "ERP SQL 对话"}</span>
            <small>{formatDate(session.updatedAt)}</small>
          </button>
        ))}
        {!state.sessions.length && !state.loadingSessions && (
          <div className="erp-chat-empty">暂无会话，先问一个 ERP 数据问题。</div>
        )}
      </div>

      <div className="erp-chat-pager">
        <button type="button" onClick={() => state.loadSessions(state.sessionPage - 1)} disabled={!canPrev}>
          上一页
        </button>
        <span>{state.sessionPage}</span>
        <button type="button" onClick={() => state.loadSessions(state.sessionPage + 1)} disabled={!canNext}>
          下一页
        </button>
      </div>
      <button type="button" className="erp-chat-home-btn" onClick={() => navigate("/")}>
        主菜单
      </button>
      {actionSession && (
        <div className="erp-chat-session-menu">
          <strong>{actionSession.title || "ERP SQL 对话"}</strong>
          <button type="button" onClick={renameActionSession}>重命名</button>
          <button type="button" className="erp-chat-danger-btn" onClick={archiveActionSession}>删除</button>
          <button type="button" onClick={() => setActionSessionId("")}>取消</button>
        </div>
      )}
    </aside>
  );
}

export function AgentChatMain({
  state,
  active,
  onCloseSessions,
  onOpenResult,
}: {
  state: AgentChatState;
  active: boolean;
  onCloseSessions: () => void;
  onOpenResult: () => void;
}) {
  const resultRowCount = state.activeResult?.rowCount ?? state.activeResult?.rows?.length;

  return (
    <section className={panelClass(active, "erp-chat-main")} onClick={onCloseSessions}>
      <div className="erp-chat-toolbar">
        <div>
          <h1>Agent 对话</h1>
          <p>默认接入 Mastra ERP SQL Agent</p>
        </div>
        <button type="button" onClick={state.archiveCurrent} disabled={!state.selectedSessionId || state.loadingDetail}>
          归档会话
        </button>
      </div>

      {state.error && <div className="erp-chat-alert erp-chat-alert-error">{state.error}</div>}
      {state.notice && <div className="erp-chat-alert">{state.notice}</div>}

      <div className="erp-chat-messages">
        {state.loadingDetail && <div className="erp-chat-empty">正在加载会话...</div>}
        {!state.messages.length && !state.loadingDetail && (
          <div className="erp-chat-welcome">
            <DatabaseOutlined />
            <strong>可以直接问销售、采购、库存、财务指标类问题。</strong>
            <span>例如：最近一个月销售额最高的客户有哪些？</span>
          </div>
        )}
        {state.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
        {state.sending && <div className="erp-chat-thinking">Agent 正在生成 SQL、执行查询并整理结果...</div>}
        {state.activeResult && (
          <button type="button" className="erp-chat-result-pill" onClick={onOpenResult}>
            查看结果{resultRowCount == null ? "" : ` · ${resultRowCount} 行`}{state.activeResult.truncated ? " · 已截断" : ""}
          </button>
        )}
      </div>

      <form
        className="erp-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void state.send();
        }}
      >
        <textarea
          value={state.draft}
          onChange={(event) => state.setDraft(event.target.value)}
          placeholder="输入 ERP 数据问题..."
          rows={3}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void state.send();
            }
          }}
        />
        <button type="submit" className="erp-chat-send-btn" aria-label="发送" disabled={state.sending || !state.draft.trim()}>
          {state.sending ? "..." : "↑"}
        </button>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: AgentRuntimeMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={isUser ? "erp-chat-bubble erp-chat-bubble-user" : "erp-chat-bubble"}>
      <div className="erp-chat-bubble-role">{isUser ? "我" : "Agent"}</div>
      <div className="erp-chat-bubble-content">{message.content || contentSummary(message.contentJsonb)}</div>
      <time>{formatDate(message.createdAt)}</time>
    </article>
  );
}

export function panelClass(active: boolean, base: string) {
  return `${base} ${active ? "erp-chat-mobile-active" : ""}`;
}

function contentSummary(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
