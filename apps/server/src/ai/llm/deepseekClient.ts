import OpenAI from "openai";
import { runLlmLimited } from "./llmConcurrency.js";
import { finishLlmCallLog, startLlmCallLog, updateLlmCallLogOutput } from "./llmCallLogger.js";
import { abortErrorFromSignal, type RuntimeLifecycleStatus } from "../../lib/abort.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export type LlmChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type DeepSeekExtraBody = Record<string, unknown>;

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
  stream?: boolean;
  signal?: AbortSignal;
  extraBody?: DeepSeekExtraBody;
}): Promise<string> {
  const client = params.client ?? getDeepSeekClient();
  const model = params.model ?? DEFAULT_DEEPSEEK_MODEL;
  const log = await startLlmCallLog({
    provider: "deepseek",
    model,
    purpose: params.purpose,
    input: params.input ?? { messages: params.messages },
  });

  const extraBody = params.extraBody ?? { thinking: { type: "disabled" } };
  const thinkingEnabled = readRecord(readRecord(extraBody).thinking).type === "enabled";
  const requestBody = {
    model,
    ...(thinkingEnabled ? {} : { temperature: 0 }),
    max_tokens: params.maxTokens ?? 8000,
    response_format: { type: "json_object" },
    messages: params.messages,
    ...extraBody,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    [key: string]: unknown;
  };

  const metrics: DeepSeekMetrics = {
    stage: "queued",
    queued_at: new Date().toISOString(),
    lifecycle_status: "not_sent",
  };
  await writeMetrics(log, metrics);
  metrics.lifecycle_status = "queued";
  await writeMetrics(log, metrics);

  try {
    if (params.stream ?? process.env.DEEPSEEK_STREAM !== "false") {
      return await runLlmLimited(() => requestDeepSeekJsonStream(client, requestBody, log, metrics, params.signal), params.signal);
    }

    const completion = await runLlmLimited(async () => {
      markStarted(metrics);
      await writeMetrics(log, metrics);
      return client.chat.completions.create(requestBody, { signal: params.signal });
    }, params.signal);
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      await finishLlmCallLog(log, { output: { completion, metrics: finishMetrics(metrics, content?.length ?? 0, completion.choices[0]?.finish_reason) }, error: "empty content" });
      throw new Error("DeepSeek returned empty content");
    }

    await finishLlmCallLog(log, { output: { completion, metrics: finishMetrics(metrics, content.length, completion.choices[0]?.finish_reason) } });
    return content;
  } catch (error) {
    metrics.stage = params.signal?.aborted ? "aborted" : "failed";
    if (params.signal?.aborted) metrics.lifecycle_status = "aborted";
    await finishLlmCallLog(log, { output: { metrics }, error });
    if (params.signal?.aborted) throw abortErrorFromSignal(params.signal);
    throw new Error(
      `DeepSeek API call failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function requestDeepSeekJsonStream(
  client: OpenAI,
  requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    [key: string]: unknown;
  },
  log: Awaited<ReturnType<typeof startLlmCallLog>>,
  metrics: DeepSeekMetrics,
  signal?: AbortSignal,
): Promise<string> {
  markStarted(metrics);
  await writeMetrics(log, metrics);
  const stream = await client.chat.completions.create({
    ...requestBody,
    stream: true,
  }, { signal });
  metrics.stage = "stream_open";
  metrics.stream_open_at = new Date().toISOString();
  metrics.stream_open_ms = Date.now() - metrics.started_ms_epoch!;
  await writeMetrics(log, metrics);
  let content = "";
  let finishReason: string | null = null;
  let chunkCount = 0;
  let usage: unknown = null;
  let lastProgressAt = Date.now();

  for await (const chunk of stream) {
    chunkCount += 1;
    metrics.chunk_count = chunkCount;
    if (chunkCount === 1) {
      metrics.first_chunk_ms = Date.now() - metrics.started_ms_epoch!;
      metrics.first_chunk_at = new Date().toISOString();
      if (metrics.first_chunk_ms >= positiveInt(process.env.ERP_SQL_LLM_FIRST_TOKEN_SLOW_MS, 5000)) {
        metrics.lifecycle_status = "first_token_slow";
      }
    }
    metrics.last_chunk_ms = Date.now() - metrics.started_ms_epoch!;
    metrics.last_chunk_at = new Date().toISOString();
    if (metrics.last_chunk_ms >= positiveInt(process.env.ERP_SQL_LLM_STREAM_SLOW_MS, 30_000)) {
      metrics.lifecycle_status = "stream_slow";
    }
    const choice = chunk.choices[0];
    const deltaObject = readRecord(choice?.delta);
    const reasoning = deltaObject.reasoning_content;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      metrics.reasoning_chunk_count = (metrics.reasoning_chunk_count ?? 0) + 1;
      metrics.reasoning_length = (metrics.reasoning_length ?? 0) + reasoning.length;
    }
    const delta = choice?.delta?.content;
    if (typeof delta === "string") {
      if (content.length === 0 && delta.length > 0) {
        metrics.first_content_ms = Date.now() - metrics.started_ms_epoch!;
        if (metrics.first_content_ms >= positiveInt(process.env.ERP_SQL_LLM_FIRST_TOKEN_SLOW_MS, 5000)) {
          metrics.lifecycle_status = "first_token_slow";
        }
      }
      content += delta;
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
    if (Date.now() - lastProgressAt > 5000 || chunkCount === 1) {
      metrics.content_length = content.length;
      await writeMetrics(log, metrics);
      lastProgressAt = Date.now();
    }
  }

  const trimmed = content.trim();
  const finalMetrics = finishMetrics(metrics, trimmed.length, finishReason);
  await finishLlmCallLog(log, {
    output: {
      streamed: true,
      content: trimmed,
      metrics: finalMetrics,
      content_length: trimmed.length,
      chunk_count: finalMetrics.chunk_count,
      finish_reason: finishReason,
      usage,
    },
    error:
      !trimmed ? "empty content" :
      finishReason === "length" ? `stream finished by length` :
      undefined,
  });

  if (!trimmed) throw new Error("DeepSeek returned empty content");
  if (finishReason === "length") throw new Error("DeepSeek stream hit max_tokens");
  return trimmed;
}

type DeepSeekMetrics = {
  stage: "queued" | "started" | "stream_open" | "finished" | "failed" | "aborted";
  queued_at: string;
  started_at?: string;
  started_ms_epoch?: number;
  queued_ms?: number;
  stream_open_at?: string;
  stream_open_ms?: number;
  first_chunk_at?: string;
  first_chunk_ms?: number;
  first_content_ms?: number;
  reasoning_chunk_count?: number;
  reasoning_length?: number;
  last_chunk_at?: string;
  last_chunk_ms?: number;
  chunk_count?: number;
  finish_reason?: string | null;
  content_length?: number;
  latencyMs?: number;
  lifecycle_status: RuntimeLifecycleStatus;
};

function markStarted(metrics: DeepSeekMetrics): void {
  const now = Date.now();
  metrics.stage = "started";
  metrics.started_at = new Date(now).toISOString();
  metrics.started_ms_epoch = now;
  metrics.queued_ms = now - Date.parse(metrics.queued_at);
  metrics.lifecycle_status = "request_sent";
}

function finishMetrics(metrics: DeepSeekMetrics, contentLength: number, finishReason?: string | null): DeepSeekMetrics {
  const now = Date.now();
  metrics.stage = "finished";
  metrics.content_length = contentLength;
  metrics.finish_reason = finishReason ?? null;
  metrics.latencyMs = now - (metrics.started_ms_epoch ?? now);
  return metrics;
}

async function writeMetrics(log: Awaited<ReturnType<typeof startLlmCallLog>>, metrics: DeepSeekMetrics): Promise<void> {
  if (process.env.ERP_SQL_LLM_PROGRESS_STDERR === "true") {
    console.error(JSON.stringify({
      type: "llm_lifecycle",
      stage: metrics.stage,
      lifecycle_status: metrics.lifecycle_status,
      queued_ms: metrics.queued_ms,
      stream_open_ms: metrics.stream_open_ms,
      first_chunk_ms: metrics.first_chunk_ms,
      first_content_ms: metrics.first_content_ms,
      reasoning_chunk_count: metrics.reasoning_chunk_count,
      reasoning_length: metrics.reasoning_length,
      last_chunk_ms: metrics.last_chunk_ms,
      chunk_count: metrics.chunk_count,
      content_length: metrics.content_length,
      latencyMs: metrics.latencyMs,
    }));
  }
  await updateLlmCallLogOutput(log, { metrics });
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
