import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Touch as ReactTouch } from "react";
import {
  AgentChatMain,
  AgentSessionSidebar,
  type AgentMobilePanel,
} from "./components/AgentChatPanels";
import { AgentResultDrawer } from "./components/AgentResultDrawer";
import { useAgentChatPageState } from "./hooks/useAgentChatPageState";
import type { AgentRuntimeMessage, AgentSqlResult } from "./types";
import "./styles.css";

export default function AgentChatPlaceholderPage() {
  const state = useAgentChatPageState();
  const [mobilePanel, setMobilePanel] = useState<AgentMobilePanel>("chat");
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [drawerResult, setDrawerResult] = useState<AgentSqlResult>();
  const [resultDrawerOpen, setResultDrawerOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeTarget, setSwipeTarget] = useState<"sessions-open" | "sessions-close" | "result-close" | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const drawerOpenFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => state.setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [state.notice, state.setNotice]);

  const handleTouchMove = (touch: ReactTouch) => {
    if (!touchStart) return;
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    let target = swipeTarget;
    if (!target) {
      if (Math.abs(deltaX) < 12 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      if (mobilePanel === "sessions" && deltaX < 0) target = "sessions-close";
      else if (mobilePanel === "result" && deltaX > 0) target = "result-close";
      else if (mobilePanel === "chat" && deltaX > 0) target = "sessions-open";
      else return;
      setSwipeTarget(target);
    }
    if (target === "sessions-open") {
      setSwipeOffset(Math.max(0, deltaX));
    } else if (target === "sessions-close") {
      setSwipeOffset(Math.min(0, deltaX));
    } else if (target === "result-close") {
      setSwipeOffset(Math.max(0, deltaX));
    }
  };

  const handleTouchEnd = (touch: ReactTouch) => {
    if (!touchStart) return;
    const delta = touch.clientX - touchStart.x;
    if ((swipeTarget === "sessions-open" || (!swipeTarget && mobilePanel === "chat")) && delta > 70) {
      setMobilePanel("sessions");
    }
    if (swipeTarget === "sessions-close" && delta < -70) setMobilePanel("chat");
    if (swipeTarget === "result-close" && delta > 70) closeResult();
    setTouchStart(null);
    setSwipeTarget(null);
    setSwipeOffset(0);
  };

  const openResult = (message: AgentRuntimeMessage) => {
    if (!isRecord(message.contentJsonb)) return;
    if (drawerOpenFrame.current) window.cancelAnimationFrame(drawerOpenFrame.current);
    setDrawerResult(message.contentJsonb as AgentSqlResult);
    if (!resultDrawerOpen) {
      setResultDrawerOpen(false);
      drawerOpenFrame.current = window.requestAnimationFrame(() => {
        setResultDrawerOpen(true);
        drawerOpenFrame.current = null;
      });
    }
    setMobilePanel("result");
  };
  const closeResult = () => {
    if (drawerOpenFrame.current) window.cancelAnimationFrame(drawerOpenFrame.current);
    drawerOpenFrame.current = null;
    setResultDrawerOpen(false);
    setMobilePanel("chat");
  };

  return (
    <div
      className={[
        "erp-chat-workbench",
        mobilePanel === "sessions" && "erp-chat-drawer-open",
        !desktopSidebarOpen && "erp-chat-desktop-sidebar-closed",
        swipeTarget && `erp-chat-swipe-${swipeTarget}`,
      ].filter(Boolean).join(" ")}
      style={{ "--erp-chat-swipe-x": `${swipeOffset}px` } as CSSProperties}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) setTouchStart({ x: touch.clientX, y: touch.clientY });
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        if (touch) handleTouchMove(touch);
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch) handleTouchEnd(touch);
      }}
    >
      <button
        type="button"
        className="erp-chat-floating-menu"
        aria-label="浏览会话"
        onClick={() => setMobilePanel(mobilePanel === "sessions" ? "chat" : "sessions")}
      >
        <span />
        <span />
      </button>
      <button type="button" className="erp-chat-sidebar-reopen" aria-label="打开侧边栏" onClick={() => setDesktopSidebarOpen(true)}>
        AI
      </button>
      <AgentSessionSidebar
        state={state}
        active={mobilePanel === "sessions"}
        onClose={() => setDesktopSidebarOpen(false)}
        onSelectSession={() => setMobilePanel("chat")}
      />
      <AgentChatMain
        state={state}
        active={mobilePanel === "chat"}
        onCloseSessions={() => mobilePanel === "sessions" && setMobilePanel("chat")}
        onOpenResult={openResult}
      />
      <AgentResultDrawer
        key={resultMessageId(drawerResult)}
        open={resultDrawerOpen && Boolean(drawerResult)}
        result={drawerResult}
        toolCalls={state.toolCalls}
        onClose={closeResult}
        onCopySql={state.copySql}
        onExportJson={state.exportJson}
        onExportCsv={state.exportCsv}
      />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultMessageId(result?: AgentSqlResult) {
  return result ? `${result.traceId ?? "result"}:${result.sql ?? result.message ?? ""}` : "empty";
}
