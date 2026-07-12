import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { classifyFields, protectAuditValue } from "../../../../ai/audit/dataProtection.js";
import type { ErpSqlResultScope } from "../types/ErpSqlAgentTypes.js";

export type ResultNarration = {
  summary: string;
  highlights: string[];
  caveats: string[];
  audit: { externalDataSent: boolean; fieldCategories: string[] };
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
    if (!externalNarrationEnabled()) {
      return {
        summary: `SQL 已执行，返回 ${input.rowCount} 行${input.truncated ? "（结果已截断）" : ""}。`,
        highlights: [],
        caveats: [...input.warnings.slice(0, 2), "外部结果叙述默认关闭，未发送 ERP 行数据。"],
        audit: { externalDataSent: false, fieldCategories },
      };
    }
    const payload = {
      rowCount: input.rowCount,
      truncated: input.truncated,
      warnings: protectAuditValue(input.warnings, "warnings"),
      source: input.source,
      scope: input.scope,
      fieldCategories,
      aggregates: aggregateRows(input.fields, input.rows),
      external_data_sent: true,
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
      audit: { externalDataSent: true, fieldCategories },
    };
  }
}

function externalNarrationEnabled(): boolean {
  return process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED === "true"
    && process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED === "true";
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
