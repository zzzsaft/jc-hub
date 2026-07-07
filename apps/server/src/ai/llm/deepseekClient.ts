import OpenAI from "openai";
import { finishLlmCallLog, startLlmCallLog } from "./llmCallLogger.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export type LlmChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function getDeepSeekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  });
}

export async function requestDeepSeekJson(params: {
  client?: OpenAI;
  model?: string;
  purpose: string;
  messages: LlmChatMessage[];
  input?: unknown;
  maxTokens?: number;
}): Promise<string> {
  const client = params.client ?? getDeepSeekClient();
  const model = params.model ?? DEFAULT_DEEPSEEK_MODEL;
  const log = await startLlmCallLog({
    provider: "deepseek",
    model,
    purpose: params.purpose,
    input: params.input ?? { messages: params.messages },
  });

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: params.maxTokens ?? 8000,
      response_format: { type: "json_object" },
      messages: params.messages,
    });
  } catch (error) {
    await finishLlmCallLog(log, { error });
    throw new Error(
      `DeepSeek API call failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    await finishLlmCallLog(log, { output: completion, error: "empty content" });
    throw new Error("DeepSeek returned empty content");
  }

  await finishLlmCallLog(log, { output: completion });
  return content;
}
