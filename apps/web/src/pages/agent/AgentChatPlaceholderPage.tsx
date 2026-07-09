import { useEffect, useState } from "react";
import {
  AgentChatMain,
  AgentSessionSidebar,
  type AgentMobilePanel,
} from "./components/AgentChatPanels";
import { AgentResultPanel } from "./components/AgentResultPanel";
import { useAgentChatPageState } from "./hooks/useAgentChatPageState";
import "./styles.css";

export default function AgentChatPlaceholderPage() {
  const state = useAgentChatPageState();
  const [mobilePanel, setMobilePanel] = useState<AgentMobilePanel>("chat");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => state.setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [state.notice, state.setNotice]);

  const handleTouchEnd = (clientX: number) => {
    if (touchStartX === null) return;
    const delta = clientX - touchStartX;
    if (touchStartX < 44 && delta > 70) setMobilePanel("sessions");
    if (mobilePanel === "sessions" && delta < -70) setMobilePanel("chat");
    setTouchStartX(null);
  };

  return (
    <div
      className={mobilePanel === "sessions" ? "erp-chat-workbench erp-chat-drawer-open" : "erp-chat-workbench"}
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
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
      <AgentSessionSidebar state={state} active={mobilePanel === "sessions"} onSelectSession={() => setMobilePanel("chat")} />
      <AgentChatMain
        state={state}
        active={mobilePanel === "chat"}
        onCloseSessions={() => mobilePanel === "sessions" && setMobilePanel("chat")}
        onOpenResult={() => setMobilePanel("result")}
      />
      <AgentResultPanel
        active={mobilePanel === "result"}
        result={state.activeResult}
        toolCalls={state.toolCalls}
        onBack={() => setMobilePanel("chat")}
        onCopySql={state.copySql}
        onExportJson={state.exportJson}
        onExportCsv={state.exportCsv}
      />
    </div>
  );
}
