import { Table } from "@/components/ui/core";
import type { ColumnsType } from "@/components/ui/types";
import type { AgentResultColumn, AgentSqlResult } from "../types";

const COMPANY_NAMES: Record<string, string> = {
  jctimes: "精诚",
  jingyimt: "澄江",
  jytimes: "精一",
};

export function AgentResultTable({ result, inline = false }: { result: AgentSqlResult; inline?: boolean }) {
  const { fields, rows, columns: metadata } = tableData(result);
  const columns = resultTableColumns(fields, metadata, inline);
  if (!columns.length) return null;
  const dataSource = rows.map((row, rowIndex) => ({
    ...Object.fromEntries(columns.map((column) => [column.key, row[column.index]])),
    key: String(rowIndex),
  })) as ResultTableRow[];
  const tableColumns: ColumnsType<ResultTableRow> = columns.map((column) => ({
    title: column.label,
    key: column.key,
    dataIndex: column.key,
    width: columnWidth(column),
    align: column.dataType === "money" || column.dataType === "percent" || column.dataType === "integer" ? "right" : undefined,
    render: (value) => cellText(column, value),
  }));

  return (
    <div className={inline ? "erp-chat-inline-result" : undefined}>
      <Table<ResultTableRow>
        columns={tableColumns}
        dataSource={dataSource}
        pagination={false}
        preferenceKey={`erp-agent-${inline ? "main" : "detail"}-result`}
      />
    </div>
  );
}

type ResultTableRow = Record<string, unknown> & { key: string };

function resultTableColumns(fields: string[], metadata: AgentResultColumn[], inline: boolean) {
  const columns = fields.map((field, index) => ({
    ...(metadata[index] ?? fallbackColumn(field, index)),
    field,
    index,
  }));
  return inline ? columns.filter((column) => column.inlineVisible) : columns;
}

export function tableData(result: AgentSqlResult): { fields: string[]; rows: unknown[][]; columns: AgentResultColumn[] } {
  const source = resultSource(result);
  const directFields = stringArray(result.fields);
  const fields = directFields.length ? directFields : stringArray(source?.fields);
  const columns = columnArray(result.columns).length ? columnArray(result.columns) : columnArray(source?.columns);
  const directRows = Array.isArray(result.rows) ? result.rows : [];
  const rawRows = directRows.length ? directRows : Array.isArray(source?.rows) ? source.rows : directRows;
  return { fields, columns, rows: rawRows.map((row) => toRow(row, fields)).filter((row): row is unknown[] => row !== null) };
}

function resultSource(result: AgentSqlResult): Record<string, unknown> | undefined {
  for (const value of [result.execution, result.data, result.result]) {
    if (isRecord(value)) return value;
  }
  return undefined;
}

function toRow(value: unknown, fields: string[]): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  const keyByLowerCase = new Map(Object.keys(value).map((key) => [key.toLowerCase(), key]));
  return fields.map((field) => value[keyByLowerCase.get(field.toLowerCase()) ?? field]);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((field): field is string => typeof field === "string") : [];
}

function columnArray(value: unknown): AgentResultColumn[] {
  return Array.isArray(value) ? value.filter(isResultColumn) : [];
}

function fallbackColumn(field: string, index: number): AgentResultColumn {
  return { key: field || `column_${index + 1}`, label: field || "未命名字段", dataType: "text", format: {}, role: "dimension", inlineVisible: true };
}

function columnWidth(column: AgentResultColumn) {
  if (column.role === "technical") return 280;
  if (column.dataType === "money" || column.dataType === "percent" || column.dataType === "integer") return 150;
  return Math.min(Math.max(column.label.length * 18 + 36, 110), 260);
}

function cellText(column: AgentResultColumn, value: unknown) {
  if (column.key === "company" && typeof value === "string") return COMPANY_NAMES[value.toLowerCase()] ?? value;
  if (value == null) return "";
  if (typeof value === "number" && column.dataType === "percent") {
    return `${(value * 100).toFixed(column.format.decimals ?? 2)}%`;
  }
  if (typeof value === "number" && (column.dataType === "money" || column.dataType === "integer")) {
    const formatted = value.toLocaleString("zh-CN", {
      minimumFractionDigits: column.format.decimals ?? 0,
      maximumFractionDigits: column.format.decimals ?? 0,
    });
    return column.format.currencyUnit ? `${formatted} ${column.format.currencyUnit}` : formatted;
  }
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isResultColumn(value: unknown): value is AgentResultColumn {
  return isRecord(value)
    && typeof value.key === "string"
    && typeof value.label === "string"
    && ["text", "money", "percent", "date", "integer"].includes(String(value.dataType))
    && ["dimension", "metric", "technical"].includes(String(value.role))
    && typeof value.inlineVisible === "boolean"
    && isRecord(value.format);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
