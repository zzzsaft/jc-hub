import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { classifyFields, protectAuditValue } from "../../../../ai/audit/dataProtection.js";
import type { ErpSqlResultScope } from "../types/ErpSqlAgentTypes.js";

export type ResultNarration = {
  summary: string;
  highlights: string[];
  caveats: string[];
  audit: { externalDataSent: boolean; externalRawRowsSent: boolean; fieldCategories: string[] };
};

export type ResultNarratorInput = {
  question: string;
  sql: string;
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  scope?: ErpSqlResultScope;
  source?: string;
  signal?: AbortSignal;
};

export type ResultNarratorRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  responseFormat: "json_object";
  signal?: AbortSignal;
}) => Promise<string>;

const NarrationSchema = z.object({
  summary: z.string().trim().min(1),
  highlights: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
});

const SYSTEM_PROMPT = [
  "你是 ERP SQL 查询结果解读助手，只能基于给定字段和样本行说明结果。",
  "不要编造未提供的总量、趋势、原因或业务结论；不确定就写入 caveats。",
  "输出 JSON only，字段为 summary、highlights、caveats。",
].join("\n");

export class ResultNarratorService {
  constructor(private readonly requestJson: ResultNarratorRequester = requestDeepSeekJson) {}

  async narrate(input: ResultNarratorInput): Promise<ResultNarration> {
    const fieldCategories = classifyFields(input.fields);
    const productSalesRanking = narrateProductSalesRanking(input, fieldCategories);
    if (productSalesRanking) return productSalesRanking;
    const customerSalesRanking = narrateCustomerSalesRanking(input, fieldCategories);
    if (customerSalesRanking) return customerSalesRanking;
    if (!externalNarrationEnabled()) {
      return {
        summary: `SQL 已执行，返回 ${input.rowCount} 行${input.truncated ? "（结果已截断）" : ""}。`,
        highlights: [],
        caveats: [...input.warnings.slice(0, 2), "外部结果叙述默认关闭，未发送 ERP 行数据。"],
        audit: { externalDataSent: false, externalRawRowsSent: false, fieldCategories },
      };
    }
    const rawRowsSent = externalRawRowsEnabled();
    const payload = {
      rowCount: input.rowCount,
      truncated: input.truncated,
      warnings: protectAuditValue(input.warnings, "warnings"),
      source: input.source,
      scope: input.scope,
      fieldCategories,
      aggregates: aggregateRows(input.fields, input.rows),
      external_data_sent: true,
      raw_rows_sent: rawRowsSent,
      ...(rawRowsSent ? { fields: input.fields, rows: input.rows } : {}),
    };
    const content = await this.requestJson({
      purpose: "erp_sql_result_narrate",
      input: payload,
      maxTokens: 1000,
      responseFormat: "json_object",
      signal: input.signal,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            input: payload,
            outputShape: {
              summary: "string，一句话中文结论",
              highlights: "string[]，最多 3 条，基于样本行",
              caveats: "string[]，口径、截断、不确定性或 warning",
            },
          }),
        },
      ],
    });
    const parsed = NarrationSchema.parse(JSON.parse(content));
    return {
      summary: parsed.summary,
      highlights: parsed.highlights.slice(0, 3),
      caveats: parsed.caveats.slice(0, 3),
      audit: { externalDataSent: true, externalRawRowsSent: rawRowsSent, fieldCategories },
    };
  }
}

function narrateProductSalesRanking(input: ResultNarratorInput, fieldCategories: string[]): ResultNarration | null {
  if (!/产品类别|产品分类|产品.*类别/u.test(input.question) || !/销售额|销售金额|接单额/u.test(input.question)) return null;
  const categoryIndex = fieldIndex(input.fields, ["prodcode", "productcategory", "产品类别", "产品分类"]);
  const amountIndex = fieldIndex(input.fields, ["salesamount", "销售额", "销售金额", "接单额"]);
  if (categoryIndex < 0 || amountIndex < 0) return null;
  const rankings = input.rows
    .map((row) => ({ category: String(row[categoryIndex] ?? "").trim() || "未分类", amount: Number(row[amountIndex]) }))
    .filter((row) => Number.isFinite(row.amount))
    .sort((left, right) => right.amount - left.amount);
  if (!rankings.length) return null;
  return {
    summary: `已按销售额从高到低返回 ${input.rowCount} 个产品类别。`,
    highlights: rankings.slice(0, 5).map((row, index) => `${index + 1}. ${row.category}：${formatAmount(row.amount)}`),
    caveats: input.truncated ? ["结果已截断，完整排行请导出 CSV 查看。"] : [],
    audit: { externalDataSent: false, externalRawRowsSent: false, fieldCategories },
  };
}

function narrateCustomerSalesRanking(input: ResultNarratorInput, fieldCategories: string[]): ResultNarration | null {
  if (!/客户/u.test(input.question) || !/销售额|销售金额|接单额/u.test(input.question)) return null;
  const customerIndex = fieldIndex(input.fields, ["customername", "客户名称"]);
  const amountIndex = fieldIndex(input.fields, ["salesamount", "销售额", "销售金额", "接单额"]);
  if (customerIndex < 0 || amountIndex < 0) return null;
  const rankings = input.rows
    .map((row) => ({ customer: row[customerIndex], amount: Number(row[amountIndex]) }))
    .filter((row): row is { customer: string; amount: number } => typeof row.customer === "string" && row.customer.trim() !== "" && Number.isFinite(row.amount))
    .sort((left, right) => right.amount - left.amount);
  if (!rankings.length) return null;
  return {
    summary: `已按接单额从高到低返回 ${input.rowCount} 名客户。`,
    highlights: rankings.slice(0, 5).map((row, index) => `${index + 1}. ${row.customer}：${formatAmount(row.amount)}`),
    caveats: input.truncated ? ["结果已截断，完整排行请导出 CSV 查看。"] : [],
    audit: { externalDataSent: false, externalRawRowsSent: false, fieldCategories },
  };
}

function fieldIndex(fields: string[], names: string[]) {
  return fields.findIndex((field) => names.includes(field.toLowerCase()));
}

function formatAmount(value: number) {
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万元`;
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`;
}

function externalNarrationEnabled(): boolean {
  return process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED === "true"
    && process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED === "true";
}

function externalRawRowsEnabled(): boolean {
  return externalNarrationEnabled() && process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED === "true";
}

function aggregateRows(fields: string[], rows: unknown[][]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field, index) => {
    const values = rows.map((row) => row[index]).filter((value) => value !== null && value !== undefined);
    const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return [`field_${index}`, numbers.length === values.length && numbers.length > 0
      ? { category: classifyFields([field])[0], type: "number", count: numbers.length, min: Math.min(...numbers), max: Math.max(...numbers), average: numbers.reduce((sum, value) => sum + value, 0) / numbers.length }
      : { category: classifyFields([field])[0], type: "redacted", count: values.length }];
  }));
}

export const resultNarratorService = new ResultNarratorService();
