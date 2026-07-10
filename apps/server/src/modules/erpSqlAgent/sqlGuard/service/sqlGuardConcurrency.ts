import { createConcurrencyLimiter, type ConcurrencyLimiter } from "../../../../lib/concurrencyLimiter.js";

let sqlGuardLimiter: ConcurrencyLimiter | undefined;

export function configureSqlGuardConcurrencyLimit(limit: number): void {
  sqlGuardLimiter = createConcurrencyLimiter(limit);
}

export function runSqlGuardLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return sqlGuardLimiter ? sqlGuardLimiter(task, signal) : task();
}
