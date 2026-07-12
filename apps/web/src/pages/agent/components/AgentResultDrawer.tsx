import type { AgentRuntimeToolCall, AgentSqlResult } from "../types";
import { AgentResultPanel } from "./AgentResultPanel";

type AgentResultDrawerProps = {
  open: boolean;
  result?: AgentSqlResult;
  toolCalls: AgentRuntimeToolCall[];
  onClose: () => void;
  onCopySql: (result: AgentSqlResult) => void;
  onExportJson: (result: AgentSqlResult) => void;
  onExportCsv: (result: AgentSqlResult) => void;
};

export function AgentResultDrawer({ open, result, toolCalls, onClose, onCopySql, onExportJson, onExportCsv }: AgentResultDrawerProps) {
  if (!result) return null;

  return (
    <>
      {open && <button type="button" className="erp-chat-result-backdrop" aria-label="关闭结果详情" onClick={onClose} />}
      <aside className={open ? "erp-chat-result erp-chat-result-drawer-open" : "erp-chat-result"}>
        {result.scope && (
          <section className="erp-chat-card">
            <h3>查询范围</h3>
            <p>能力：{result.scope.capability}</p>
            <p>指标：{result.scope.metrics.join("、") || "-"}</p>
            <p>维度：{result.scope.dimensions.join("、") || "-"}</p>
            <p>筛选：{Object.entries(result.scope.filters).map(([key, value]) => `${key}=${value}`).join("、") || "-"}</p>
            {result.scope.timeRange && <p>时间：{JSON.stringify(result.scope.timeRange)}</p>}
            {result.scope.comparison && <p>比较：{JSON.stringify(result.scope.comparison)}</p>}
            <p>模板覆盖：{result.scope.templateCoverage.join("、") || "无"}</p>
          </section>
        )}
        <AgentResultPanel
          result={result}
          toolCalls={toolCalls}
          onBack={onClose}
          onCopySql={() => onCopySql(result)}
          onExportJson={() => onExportJson(result)}
          onExportCsv={() => onExportCsv(result)}
        />
      </aside>
    </>
  );
}
