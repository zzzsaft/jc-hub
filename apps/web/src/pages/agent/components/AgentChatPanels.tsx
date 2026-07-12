import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloseCircleOutlined, DatabaseOutlined, EditOutlined, HomeOutlined, SearchOutlined } from "@/components/ui/icons";
import type { useAgentChatPageState } from "../hooks/useAgentChatPageState";
import type { AgentRuntimeMessage, AgentRuntimeToolCall } from "../types";
import { AgentResultTable, tableData } from "./AgentResultTable";

export type AgentMobilePanel = "chat" | "sessions" | "result";

type AgentChatState = ReturnType<typeof useAgentChatPageState>;

export function AgentSessionSidebar({
  state,
  active,
  onClose,
  onSelectSession,
}: {
  state: AgentChatState;
  active: boolean;
  onClose: () => void;
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
      <div className="erp-chat-sidebar-head">
        <div className="erp-chat-sidebar-title-row">
          <h2>ERP Agent</h2>
          <div className="erp-chat-sidebar-actions">
            <button type="button" aria-label="关闭侧边栏" onClick={onClose}><CloseCircleOutlined /></button>
            <button type="button" aria-label="返回主页面" onClick={() => navigate("/")}><HomeOutlined /></button>
          </div>
        </div>
        <button type="button" className="erp-chat-new-button" onClick={() => {
          state.newConversation();
          onSelectSession();
        }}>
          <EditOutlined />新聊天
        </button>
        <label className="erp-chat-session-search">
          <SearchOutlined />
          <input
            value={state.sessionKeyword}
            onChange={(event) => state.setSessionKeyword(event.target.value)}
            placeholder="搜索聊天"
          />
        </label>
      </div>

      <div className="erp-chat-session-list">
        {!!state.sessions.length && <p className="erp-chat-session-label">聊天记录</p>}
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
          <div className="erp-chat-empty">暂无聊天记录</div>
        )}
      </div>

      {state.sessionTotal > state.pageSize && (
        <div className="erp-chat-pager">
          <button type="button" onClick={() => state.loadSessions(state.sessionPage - 1)} disabled={!canPrev}>
            上一页
          </button>
          <span>{state.sessionPage}</span>
          <button type="button" onClick={() => state.loadSessions(state.sessionPage + 1)} disabled={!canNext}>
            下一页
          </button>
        </div>
      )}
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
  onOpenResult: (message: AgentRuntimeMessage) => void;
}) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const latestMessageId = state.messages[state.messages.length - 1]?.id;

  // New messages (including the temporary user message and the final Agent reply)
  // must be visible immediately.  Waiting for a session-only scroll leaves the
  // composer on screen while the newly submitted message is below the fold.
  useLayoutEffect(() => {
    if (state.loadingDetail || !state.messages.length) return;
    const messages = messagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [state.loadingDetail, latestMessageId, state.messages.length, state.selectedSessionId]);

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

      <div ref={messagesRef} className="erp-chat-messages">
        {state.loadingDetail && <div className="erp-chat-empty">正在加载会话...</div>}
        {!state.messages.length && !state.loadingDetail && (
          <div className="erp-chat-welcome erp-chat-welcome-desktop">
            <strong>我们先从哪里开始呢？</strong>
            <span>可直接查询销售、采购、库存或财务数据。</span>
          </div>
        )}
        {!state.messages.length && !state.loadingDetail && (
          <div className="erp-chat-welcome erp-chat-welcome-mobile">
            <DatabaseOutlined />
            <strong>可以直接问销售、采购、库存、财务指标类问题。</strong>
            <span>例如：最近一个月销售额最高的客户有哪些？</span>
          </div>
        )}
        {state.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onOpenResult={onOpenResult}
            queryDurationMs={queryDurationMs(state.messages, message.id)}
            waitingSeconds={message.id === state.pendingMessageId ? state.waitingSeconds : undefined}
            waitingTool={message.id === state.pendingMessageId ? state.toolCalls.find((tool) => tool.status === "running") : undefined}
          />
        ))}
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
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void state.send();
            }
          }}
        />
      </form>
    </section>
  );
}

function MessageBubble({ message, onOpenResult, queryDurationMs, waitingSeconds, waitingTool }: {
  message: AgentRuntimeMessage;
  onOpenResult: (message: AgentRuntimeMessage) => void;
  queryDurationMs?: number;
  waitingSeconds?: number;
  waitingTool?: AgentRuntimeToolCall;
}) {
  const isUser = message.role === "user";
  const result = isRecord(message.contentJsonb) ? message.contentJsonb : undefined;
  const hasTable = !isUser && result && tableData(result).fields.length > 0;
  return (
    <>
      <article className={isUser ? "erp-chat-bubble erp-chat-bubble-user" : "erp-chat-bubble"}>
        {!isUser && <div className="erp-chat-bubble-role">
          <>Agent{queryDurationMs != null && <span> · 查询耗时 {formatQueryDuration(queryDurationMs)}</span>}</>
        </div>}
        <div className="erp-chat-bubble-content">{message.content || contentSummary(message.contentJsonb)}</div>
        {hasTable && <AgentResultTable result={result} inline />}
        <div className="erp-chat-bubble-meta">
          <time>{formatDate(message.createdAt)}</time>
          {!isUser && isRecord(message.contentJsonb) && (
            <button type="button" className="erp-chat-message-detail" onClick={() => onOpenResult(message)}>查看详情</button>
          )}
        </div>
      </article>
      {waitingSeconds !== undefined && <WaitingStatus seconds={waitingSeconds} tool={waitingTool} />}
    </>
  );
}

function WaitingStatus({ seconds, tool }: { seconds: number; tool?: AgentRuntimeToolCall }) {
  return (
    <div className="erp-chat-thinking" aria-live="polite">
      <span>{tool ? `正在执行：${toolLabel(tool)}` : "正在创建执行计划"}</span>
      <small>已等待 {formatWait(seconds)}</small>
    </div>
  );
}

function toolLabel(tool: AgentRuntimeToolCall) {
  const labels: Record<string, string> = {
    extract_sql_intent: "理解问题",
    analyze_sql_question: "分析查询需求",
    find_sql_reference: "检索 SQL 参考",
    generate_sql: "生成 SQL",
    validate_sql: "校验 SQL",
    runtime_guard_sql: "执行安全校验",
    execute_sql: "执行 ERP 查询",
    execute_sql_template: "执行 ERP 查询",
    narrate_sql_result: "整理查询结果",
  };
  return labels[tool.stepId] ?? tool.toolName;
}

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function queryDurationMs(messages: AgentRuntimeMessage[], messageId: string) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 1 || messages[index]?.role !== "assistant") return undefined;
  const previousUser = [...messages.slice(0, index)].reverse().find((message) => message.role === "user");
  if (!previousUser) return undefined;
  const duration = new Date(messages[index].createdAt).getTime() - new Date(previousUser.createdAt).getTime();
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

function formatQueryDuration(durationMs: number) {
  return durationMs < 1000 ? "不足 1 秒" : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
