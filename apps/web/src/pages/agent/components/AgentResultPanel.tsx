import { FileTextOutlined } from "@/components/ui/icons";
import type { AgentRuntimeToolCall, AgentSqlResult } from "../types";
import { panelClass } from "./AgentChatPanels";

export function AgentResultPanel({
  active,
  result,
  toolCalls,
  onCopySql,
  onExportJson,
  onExportCsv,
}: {
  active: boolean;
  result?: AgentSqlResult;
  toolCalls: AgentRuntimeToolCall[];
  onCopySql: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}) {
  if (!result) {
    return (
      <aside className={panelClass(active, "erp-chat-result")}>
        <div className="erp-chat-result-empty">
          <FileTextOutlined />
          <strong>结果详情会显示在这里</strong>
          <span>包括 SQL、表格数据、告警、财务口径和工具调用。</span>
        </div>
      </aside>
    );
  }

  const rows = result.rows ?? [];
  const fields = result.fields ?? [];

  return (
    <aside className={panelClass(active, "erp-chat-result")}>
      <div className="erp-chat-result-stack">
        <div className="erp-chat-section-head">
          <div>
            <h2>结果详情</h2>
            <p>{result.traceId ? `Trace ${result.traceId}` : "最新回答"}</p>
          </div>
          <div className="erp-chat-actions">
            <button type="button" onClick={onExportJson}>JSON</button>
            <button type="button" onClick={onExportCsv} disabled={!fields.length}>CSV</button>
          </div>
        </div>

        {result.message && <section className="erp-chat-card"><p>{result.message}</p></section>}
        {result.analysis && (
          <section className="erp-chat-card">
            <h3>分析摘要</h3>
            {result.analysis.summary && <p>{result.analysis.summary}</p>}
            <TagList items={result.analysis.highlights} />
            <TagList items={result.analysis.caveats} tone="muted" />
          </section>
        )}
        <ListCard title="需要确认" items={result.clarificationQuestions} />
        <ListCard title="告警" items={result.warnings} tone="warning" />
        {result.error && <section className="erp-chat-card erp-chat-error-text">{result.error}</section>}

        {result.sql && (
          <section className="erp-chat-card">
            <div className="erp-chat-card-title">
              <h3>SQL</h3>
              <button type="button" onClick={onCopySql}>复制</button>
            </div>
            <pre className="erp-chat-sql">{result.sql}</pre>
          </section>
        )}

        <section className="erp-chat-card">
          <div className="erp-chat-card-title">
            <h3>查询结果</h3>
            <span>{result.rowCount ?? rows.length} 行{result.truncated ? "，已截断" : ""}</span>
          </div>
          <ResultTable fields={fields} rows={rows} />
        </section>

        {(result.template || result.financeScope) && (
          <section className="erp-chat-card">
            <h3>口径与模板</h3>
            {result.template && <p>{[result.template.name, result.template.module, result.template.intent].filter(Boolean).join(" / ")}</p>}
            {result.financeScope?.mode && <p>财务模式：{result.financeScope.mode}</p>}
            <TagList items={result.financeScope?.metricNames} />
            {result.financeScope?.disclaimer && <p className="erp-chat-muted">{result.financeScope.disclaimer}</p>}
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
    </aside>
  );
}

function ResultTable({ fields, rows }: { fields: string[]; rows: unknown[][] }) {
  if (!fields.length) return <div className="erp-chat-empty">没有表格数据。</div>;
  return (
    <div className="erp-chat-table-wrap">
      <table className="erp-chat-table">
        <thead>
          <tr>{fields.map((field) => <th key={field}>{field}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {fields.map((field, columnIndex) => <td key={`${field}-${columnIndex}`}>{cellText(row[columnIndex])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListCard({ title, items, tone }: { title: string; items?: string[]; tone?: "warning" }) {
  if (!items?.length) return null;
  return (
    <section className={tone === "warning" ? "erp-chat-card erp-chat-warning" : "erp-chat-card"}>
      <h3>{title}</h3>
      <TagList items={items} />
    </section>
  );
}

function TagList({ items, tone }: { items?: string[]; tone?: "muted" }) {
  if (!items?.length) return null;
  return <div className="erp-chat-tags">{items.map((item) => <span className={tone === "muted" ? "erp-chat-tag-muted" : ""} key={item}>{item}</span>)}</div>;
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

function cellText(value: unknown) {
  if (value == null) return "";
  return typeof value === "object" ? contentSummary(value) : String(value);
}
