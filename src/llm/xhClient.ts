import OpenAI from "openai";
import {
  finishLlmCallLog,
  startLlmCallLog,
} from "./llmCallLogger.js";
import type { LlmChatMessage } from "./deepseekClient.js";

const XH_MODEL_PREFIX = "xh:";
export const DEFAULT_XH_MODEL = `${XH_MODEL_PREFIX}deepseek-v4-flash`;

export function getXhClient(): OpenAI {
  const apiKey = process.env.XH_AUTH_TOKEN;
  const baseURL = normalizeXhBaseUrl(process.env.XH_ADDRESS);

  if (!apiKey) {
    throw new Error("XH_AUTH_TOKEN is not set");
  }
  if (!baseURL) {
    throw new Error("XH_ADDRESS is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

function normalizeXhBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

export function getXhModel(model?: string): string {
  const selectedModel = model || process.env.XH_MODEL || DEFAULT_XH_MODEL;
  return selectedModel.startsWith(XH_MODEL_PREFIX)
    ? selectedModel
    : `${XH_MODEL_PREFIX}${selectedModel}`;
}

export function normalizeXhModel(model?: string): string {
  const selectedModel = getXhModel(model);
  return selectedModel.startsWith(XH_MODEL_PREFIX)
    ? selectedModel.slice(XH_MODEL_PREFIX.length)
    : selectedModel;
}

export async function requestXhChatJson(params: {
  client?: OpenAI;
  model?: string;
  purpose: string;
  messages: LlmChatMessage[];
  input?: unknown;
  maxTokens?: number;
  responseFormat?: "json_object";
}): Promise<string> {
  const client = params.client ?? getXhClient();
  const model = normalizeXhModel(params.model);
  const log = await startLlmCallLog({
    provider: "xh",
    model,
    purpose: params.purpose,
    input: params.input ?? { messages: params.messages },
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: params.maxTokens ?? 8000,
      response_format:
        params.responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
      messages: params.messages,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      await finishLlmCallLog(log, { output: completion, error: "empty content" });
      throw new Error("XH returned empty content");
    }

    await finishLlmCallLog(log, { output: completion });
    return content;
  } catch (error) {
    await finishLlmCallLog(log, { error });
    throw new Error(
      `XH API call failed (${model}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
