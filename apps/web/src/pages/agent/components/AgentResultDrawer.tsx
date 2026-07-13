import type { AgentComplexAnalysis, AgentRuntimeToolCall, AgentSqlResult } from "../types";
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
        {result.complexAnalysis && <ComplexAnalysisCard analysis={result.complexAnalysis} />}
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

const STEP_LABELS: Record<AgentComplexAnalysis["steps"][number]["id"], string> = {
  sales_growth: "销售趋势",
  inventory: "库存",
  backlog: "未交付",
};

const STATUS_LABELS: Record<AgentComplexAnalysis["steps"][number]["status"], string> = {
  completed: "已完成",
  partial: "部分完成",
  clarification_required: "需要确认",
  unsupported: "暂不支持",
  failed: "失败",
  skipped: "已跳过",
};

function ComplexAnalysisCard({ analysis }: { analysis: AgentComplexAnalysis }) {
  const coverage = analysis.joinCoverage;
  return (
    <section className="erp-chat-card">
      <div className="erp-chat-card-title">
        <h3 className="erp-chat-complex-title">复合查询过程</h3>
        <span>{analysis.status === "completed" ? "已完成" : analysis.status === "partial" ? "部分完成" : "失败"}</span>
      </div>
      <div className="erp-chat-complex-steps">
        {analysis.steps.map((step) => (
          <div className={`erp-chat-complex-step erp-chat-complex-step-${step.status}`} key={step.id}>
            <strong>{STEP_LABELS[step.id]}</strong>
            <span>{STATUS_LABELS[step.status]}</span>
            <small>{step.rowCount} 行</small>
            {step.error && <p>{step.error}</p>}
          </div>
        ))}
      </div>
      {coverage && (
        <p>
          拼接覆盖：{coverage.matchedRows}/{coverage.anchorRows} 个产品（{formatCoverage(coverage.coverageRate)}），
          未匹配 {coverage.unmatchedRows} 个。
        </p>
      )}
    </section>
  );
}

function formatCoverage(value: number) {
  return `${Math.round(value * 100)}%`;
}
