import { createConcurrencyLimiter, type ConcurrencyLimiter, type ConcurrencyLimiterMetrics } from "../../lib/concurrencyLimiter.js";

let llmLimiter: ConcurrencyLimiter | undefined;

export function configureLlmConcurrencyLimit(limit: number, maxQueue = nonNegativeInt(process.env.LLM_MAX_QUEUE, 64)): void {
  llmLimiter = createConcurrencyLimiter(limit, { maxQueue, name: "llm" });
}

export function runLlmLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  llmLimiter ??= createConcurrencyLimiter(positiveInt(process.env.LLM_CONCURRENCY_LIMIT, 12), { maxQueue: nonNegativeInt(process.env.LLM_MAX_QUEUE, 64), name: "llm" });
  return llmLimiter(task, signal);
}

export function getLlmConcurrencyMetrics(): ConcurrencyLimiterMetrics {
  llmLimiter ??= createConcurrencyLimiter(positiveInt(process.env.LLM_CONCURRENCY_LIMIT, 12), { maxQueue: nonNegativeInt(process.env.LLM_MAX_QUEUE, 64), name: "llm" });
  return llmLimiter.metrics();
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
