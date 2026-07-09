import { createConcurrencyLimiter, type ConcurrencyLimiter } from "../../../../lib/concurrencyLimiter.js";

let sqlGuardLimiter: ConcurrencyLimiter | undefined;

export function configureSqlGuardConcurrencyLimit(limit: number): void {
  sqlGuardLimiter = createConcurrencyLimiter(limit);
}

export function runSqlGuardLimited<T>(task: () => Promise<T>): Promise<T> {
  return sqlGuardLimiter ? sqlGuardLimiter(task) : task();
}
