import { z } from "zod";
import type { LlmChatMessage } from "../../../../llm/deepseekClient.js";
import { requestRoutedChatJson } from "../../../../llm/routedChatClient.js";

export type ResultNarration = {
  summary: string;
  highlights: string[];
  caveats: string[];
};

export type ResultNarratorInput = {
  question: string;
  sql: string;
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  source?: string;
};

export type ResultNarratorRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  responseFormat: "json_object";
}) => Promise<string>;

const MAX_ROWS = 50;
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
  constructor(private readonly requestJson: ResultNarratorRequester = requestRoutedChatJson) {}

  async narrate(input: ResultNarratorInput): Promise<ResultNarration> {
    const payload = {
      ...input,
      rows: input.rows.slice(0, MAX_ROWS),
      sampleRowCount: Math.min(input.rows.length, MAX_ROWS),
    };
    const content = await this.requestJson({
      purpose: "erp_sql_result_narrate",
      input: payload,
      maxTokens: 1000,
      responseFormat: "json_object",
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
    };
  }
}

export const resultNarratorService = new ResultNarratorService();
