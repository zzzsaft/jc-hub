import { createConcurrencyLimiter, type ConcurrencyLimiter } from "../../lib/concurrencyLimiter.js";

let llmLimiter: ConcurrencyLimiter | undefined;

export function configureLlmConcurrencyLimit(limit: number): void {
  llmLimiter = createConcurrencyLimiter(limit);
}

export function runLlmLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  llmLimiter ??= createConcurrencyLimiter(Number(process.env.LLM_CONCURRENCY_LIMIT ?? 128));
  return llmLimiter(task, signal);
}
