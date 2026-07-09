import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { ErpSqlIntentSchema, type ErpSqlIntent } from "../types/IntentTypes.js";

export type DeepSeekIntentRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  signal?: AbortSignal;
}) => Promise<string>;

const SYSTEM_PROMPT = [
  "You extract ERP SQL query intent as JSON only.",
  "Never generate SQL.",
  "Use null omission: omit unknown optional fields instead of guessing.",
  "Allowed module values: sales, purchase, production, inventory, finance, custom, unknown.",
  "Allowed intentType values: detail, summary, ranking, trend, anomaly, trace.",
  "Dates must use YYYY-MM-DD when explicit. relativeDays is allowed for phrases like 最近30天.",
].join("\n");

export class DeepSeekIntentExtractor {
  constructor(private readonly requestJson: DeepSeekIntentRequester = requestDeepSeekJson) {}

  async extract(question: string, signal?: AbortSignal): Promise<ErpSqlIntent> {
    const normalizedQuestion = question.trim();
    const content = await this.requestJson({
      purpose: "erp_sql_intent_extract",
      input: { question: normalizedQuestion },
      maxTokens: 1200,
      signal,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            question: normalizedQuestion,
            outputShape: {
              originalQuestion: "string",
              normalizedQuestion: "string",
              module: "optional enum",
              intentType: "optional enum",
              entities: {
                partNum: "optional string",
                poNum: "optional number",
                jobNum: "optional string",
                orderNum: "optional number",
                vendorName: "optional string",
                vendorNum: "optional number",
                customerName: "optional string",
                customerNum: "optional number",
              },
              dateRange: {
                from: "optional YYYY-MM-DD",
                to: "optional YYYY-MM-DD",
                relativeDays: "optional number",
                label: "optional string",
              },
              metrics: "optional string[]",
              groupBy: "optional string[]",
              orderBy: "optional string[]",
              limit: "optional number",
              confidence: "number 0..1",
              warnings: "string[]",
            },
          }),
        },
      ],
    });

    return ErpSqlIntentSchema.parse(JSON.parse(content));
  }
}

export const deepSeekIntentExtractor = new DeepSeekIntentExtractor();
