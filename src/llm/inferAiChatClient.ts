import OpenAI from "openai";
import {
  finishLlmCallLog,
  startLlmCallLog,
} from "./llmCallLogger.js";
import type { LlmChatMessage } from "./deepseekClient.js";

const DEFAULT_INFERAI_BASE_URL = "https://inferaichat.com/v1";
const INFERAI_MODEL_PREFIX = "inferaichat:";
export const DEFAULT_INFERAI_MODEL = `${INFERAI_MODEL_PREFIX}deepseek-v4-flash`;

export function getInferAiChatClient(): OpenAI {
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey) {
    throw new Error("ANTHROPIC_AUTH_TOKEN is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.INFERAI_BASE_URL || DEFAULT_INFERAI_BASE_URL,
  });
}

export function getInferAiChatModel(model?: string): string {
  const selectedModel =
    model ||
    process.env.INFERAI_MODEL ||
    DEFAULT_INFERAI_MODEL;

  return selectedModel.startsWith(INFERAI_MODEL_PREFIX)
    ? selectedModel
    : `${INFERAI_MODEL_PREFIX}${selectedModel}`;
}

export function normalizeInferAiChatModel(model?: string): string {
  const selectedModel = getInferAiChatModel(model);
  return selectedModel.startsWith(INFERAI_MODEL_PREFIX)
    ? selectedModel.slice(INFERAI_MODEL_PREFIX.length)
    : selectedModel;
}

function normalizeInferAiChatCompletion(
  completion: OpenAI.Chat.Completions.ChatCompletion | string
): OpenAI.Chat.Completions.ChatCompletion {
  if (typeof completion !== "string") {
    return completion;
  }

  try {
    return JSON.parse(completion) as OpenAI.Chat.Completions.ChatCompletion;
  } catch {
    return {
      id: "",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: completion,
            refusal: null,
          },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
    };
  }
}

function sanitizeInferAiChatCompletionForLog(
  completion: OpenAI.Chat.Completions.ChatCompletion | null,
): OpenAI.Chat.Completions.ChatCompletion | null {
  if (!completion) {
    return completion;
  }

  return {
    ...completion,
    choices: completion.choices.map((choice) => {
      const message = choice.message as OpenAI.Chat.Completions.ChatCompletionMessage & {
        reasoning_content?: unknown;
        reasoning?: unknown;
        reasoning_details?: unknown;
        thinking?: unknown;
      };
      const {
        reasoning_content: _reasoningContent,
        reasoning: _reasoning,
        reasoning_details: _reasoningDetails,
        thinking: _thinking,
        ...restMessage
      } = message;
      return {
        ...choice,
        message: restMessage,
      };
    }),
  };
}

export async function requestInferAiChatJson(params: {
  client?: OpenAI;
  model?: string;
  purpose: string;
  messages: LlmChatMessage[];
  input?: unknown;
  maxTokens?: number;
  responseFormat?: "json_object";
  plugins?: Array<{ id: string; enabled?: boolean; [key: string]: unknown }>;
  retryEmptyContent?: number;
  stream?: boolean;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
}): Promise<string> {
  const client = params.client ?? getInferAiChatClient();
  const model = normalizeInferAiChatModel(params.model);
  const log = await startLlmCallLog({
    provider: "inferaichat",
    model,
    purpose: params.purpose,
    input: params.input ?? { messages: params.messages },
  });

  const maxAttempts = 1 + Math.max(0, params.retryEmptyContent ?? 0);
  let lastCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const requestBody: Record<string, unknown> = {
        model,
        temperature: 0,
        max_tokens: params.maxTokens ?? 8000,
        messages: params.messages,
      };
      if (params.responseFormat === "json_object") {
        requestBody.response_format = { type: "json_object" };
      }
      if (params.plugins?.length) {
        requestBody.plugins = params.plugins;
      }

      if (params.stream) {
        const content = await requestInferAiChatJsonStream({
          client,
          requestBody,
          model,
          log,
          attempt,
          maxAttempts,
          onStreamProgress: params.onStreamProgress,
        });
        if (content) {
          return content;
        }
        continue;
      }

      const completion = normalizeInferAiChatCompletion(
        (await client.chat.completions.create(
          requestBody as unknown as Parameters<
            typeof client.chat.completions.create
          >[0],
        )) as OpenAI.Chat.Completions.ChatCompletion | string,
      );

      lastCompletion = completion;
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        await finishLlmCallLog(log, {
          output: sanitizeInferAiChatCompletionForLog(completion),
        });
        return content;
      }
    } catch (error) {
      if (isAlreadyLoggedLlmError(error)) {
        throw error;
      }
      await finishLlmCallLog(log, { error });
      throw new Error(
        `InferAIChat API call failed (${model}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await finishLlmCallLog(log, {
    output: sanitizeInferAiChatCompletionForLog(lastCompletion),
    error: `empty content after ${maxAttempts} attempt(s)`,
  });
  throw new Error(
    `InferAIChat returned empty content (${model}) after ${maxAttempts} attempt(s)`,
  );
}

async function requestInferAiChatJsonStream(params: {
  client: OpenAI;
  requestBody: Record<string, unknown>;
  model: string;
  log: Awaited<ReturnType<typeof startLlmCallLog>>;
  attempt: number;
  maxAttempts: number;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
}): Promise<string | null> {
  const stream = (await params.client.chat.completions.create({
    ...(params.requestBody as Record<string, unknown>),
    stream: true,
  } as unknown as Parameters<typeof params.client.chat.completions.create>[0])) as AsyncIterable<any>;

  let content = "";
  let finishReason: string | null = null;
  let usage: unknown = null;
  let chunkCount = 0;
  let lastProgressAt = 0;

  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < 500) {
      return;
    }
    lastProgressAt = now;
    params.onStreamProgress?.({
      contentLength: content.length,
      chunkCount,
      finishReason,
    });
  };

  for await (const chunk of stream) {
    chunkCount += 1;

    if (chunk?.error) {
      await finishLlmCallLog(params.log, {
        output: {
          streamed: true,
          attempt: params.attempt,
          maxAttempts: params.maxAttempts,
          model: params.model,
          partial_content: content,
          partial_length: content.length,
          chunk_count: chunkCount,
          finish_reason: "error",
        },
        error: chunk.error?.message ?? JSON.stringify(chunk.error),
      });
      throw markLlmErrorLogged(
        new Error(
        `InferAIChat stream error (${params.model}): ${
          chunk.error?.message ?? JSON.stringify(chunk.error)
        }`,
        ),
      );
    }

    const choice = chunk?.choices?.[0];
    const deltaContent = choice?.delta?.content;
    if (typeof deltaContent === "string" && deltaContent) {
      content += deltaContent;
    }

    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (chunk?.usage) {
      usage = chunk.usage;
    }

    emitProgress(false);
  }

  const trimmed = content.trim();
  emitProgress(true);

  if (!trimmed) {
    return null;
  }

  await finishLlmCallLog(params.log, {
    output: {
      streamed: true,
      attempt: params.attempt,
      maxAttempts: params.maxAttempts,
      model: params.model,
      content: trimmed,
      content_length: trimmed.length,
      chunk_count: chunkCount,
      finish_reason: finishReason,
      usage,
    },
    error:
      finishReason === "length"
        ? `stream finished by length (${params.model})`
        : undefined,
  });

  if (finishReason === "length") {
    throw markLlmErrorLogged(
      new Error(`InferAIChat stream hit max_tokens (${params.model})`),
    );
  }

  return trimmed;
}

function markLlmErrorLogged<T extends Error>(error: T): T {
  return Object.assign(error, { llmLogged: true });
}

function isAlreadyLoggedLlmError(error: unknown): boolean {
  return Boolean((error as { llmLogged?: boolean })?.llmLogged);
}
