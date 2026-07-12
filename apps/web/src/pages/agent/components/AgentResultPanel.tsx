import type { AgentRuntimeToolCall, AgentSqlResult } from "../types";
import { AgentResultTable, tableData } from "./AgentResultTable";

export function AgentResultPanel({
  result,
  toolCalls,
  onBack,
  onCopySql,
  onExportJson,
  onExportCsv,
}: {
  result?: AgentSqlResult;
  toolCalls: AgentRuntimeToolCall[];
  onBack: () => void;
  onCopySql: (result: AgentSqlResult) => void;
  onExportJson: (result: AgentSqlResult) => void;
  onExportCsv: (result: AgentSqlResult) => void;
}) {
  if (!result) return null;

  const { fields, rows } = tableData(result);

  return (
    <div className="erp-chat-result-stack">
        <div className="erp-chat-section-head">
          <div>
            <h2>结果详情</h2>
            <p>{result.traceId ? `Trace ${result.traceId}` : "最新回答"}</p>
          </div>
          <div className="erp-chat-actions">
            <button type="button" className="erp-chat-result-back" onClick={onBack}>返回</button>
            <button type="button" onClick={() => onExportJson(result)}>JSON</button>
            <button type="button" onClick={() => onExportCsv(result)} disabled={!fields.length}>CSV</button>
          </div>
        </div>

        {result.message && <section className="erp-chat-card"><p>{contentSummary(result.message)}</p></section>}
        {result.analysis && (
          <section className="erp-chat-card">
            <h3>分析摘要</h3>
            {result.analysis.summary && <p>{contentSummary(result.analysis.summary)}</p>}
            <TagList items={result.analysis.highlights} />
            <TagList items={result.analysis.caveats} tone="muted" />
          </section>
        )}
        <ListCard title="需要确认" items={result.clarificationQuestions} />
        <ListCard title="告警" items={result.warnings} tone="warning" />
        {result.error && <section className="erp-chat-card erp-chat-error-text">{contentSummary(result.error)}</section>}

        {result.sql && (
          <section className="erp-chat-card">
            <div className="erp-chat-card-title">
              <h3>SQL</h3>
              <button type="button" onClick={() => onCopySql(result)}>复制</button>
            </div>
            <pre className="erp-chat-sql">{contentSummary(result.sql)}</pre>
          </section>
        )}

        <section className="erp-chat-card">
          <div className="erp-chat-card-title">
            <h3>查询结果</h3>
            <span>{result.rowCount ?? rows.length} 行{result.truncated ? "，已截断" : ""}</span>
          </div>
          {fields.length ? <AgentResultTable result={result} /> : <div className="erp-chat-empty">没有表格数据。</div>}
        </section>

        {(result.template || result.financeScope) && (
          <section className="erp-chat-card">
            <h3>口径与模板</h3>
            {result.template && <p>{[result.template.name, result.template.module, result.template.intent].filter(Boolean).join(" / ")}</p>}
            {result.financeScope?.mode && <p>财务模式：{contentSummary(result.financeScope.mode)}</p>}
            <TagList items={result.financeScope?.metricNames} />
            {result.financeScope?.disclaimer && <p className="erp-chat-muted">{contentSummary(result.financeScope.disclaimer)}</p>}
          </section>
        )}

        <section className="erp-chat-card">
          <h3>工具调用</h3>
          <div className="erp-chat-tool-list">
            {toolCalls.map((tool) => (
              <div key={tool.id} className="erp-chat-tool">
                <span>{tool.toolName}</span>
                <strong>{tool.status}</strong>
                <small>{tool.durationMs == null ? "-" : `${tool.durationMs}ms`}</small>
                {tool.error ? <em>{contentSummary(tool.error)}</em> : null}
              </div>
            ))}
            {!toolCalls.length && <div className="erp-chat-empty">暂无工具调用详情。</div>}
          </div>
        </section>
    </div>
  );
}

function ListCard({ title, items, tone }: { title: string; items?: unknown; tone?: "warning" }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <section className={tone === "warning" ? "erp-chat-card erp-chat-warning" : "erp-chat-card"}>
      <h3>{title}</h3>
      <TagList items={items} />
    </section>
  );
}

function TagList({ items, tone }: { items?: unknown; tone?: "muted" }) {
  if (!Array.isArray(items) || !items.length) return null;
  return <div className="erp-chat-tags">{items.map((item, index) => <span className={tone === "muted" ? "erp-chat-tag-muted" : ""} key={index}>{contentSummary(item)}</span>)}</div>;
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
