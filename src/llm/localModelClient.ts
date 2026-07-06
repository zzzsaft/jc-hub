import OpenAI from "openai";
import { finishLlmCallLog, startLlmCallLog } from "./llmCallLogger.js";
import type { LlmChatMessage } from "./deepseekClient.js";

const DEFAULT_LOCAL_LLM_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_LOCAL_LLM_MODEL = "gemma4:12b";

export function getLocalModelClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LOCAL_LLM_API_KEY || "ollama",
    baseURL: process.env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_LLM_BASE_URL,
  });
}

export function getLocalModelName(model?: string): string {
  return model || process.env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_LLM_MODEL;
}

export async function requestLocalModelJson(params: {
  client?: OpenAI;
  model?: string;
  purpose: string;
  messages: LlmChatMessage[];
  input?: unknown;
  maxTokens?: number;
}): Promise<string> {
  const client = params.client ?? getLocalModelClient();
  const model = getLocalModelName(params.model);
  const log = await startLlmCallLog({
    provider: "local",
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
      `Local LLM API call failed (${model}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    await finishLlmCallLog(log, { output: completion, error: "empty content" });
    throw new Error(`Local LLM returned empty content (${model})`);
  }

  await finishLlmCallLog(log, { output: completion });
  return content;
}
