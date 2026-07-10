import { createConcurrencyLimiter, type ConcurrencyLimiter, type ConcurrencyLimiterMetrics } from "../../../../lib/concurrencyLimiter.js";

let sqlGuardLimiter: ConcurrencyLimiter | undefined;

export function configureSqlGuardConcurrencyLimit(limit: number, maxQueue = nonNegativeInt(process.env.ERP_SQL_GUARD_MAX_QUEUE, 32)): void {
  sqlGuardLimiter = createConcurrencyLimiter(limit, { maxQueue, name: "erp_sql_guard" });
}

export function runSqlGuardLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  sqlGuardLimiter ??= createConcurrencyLimiter(positiveInt(process.env.ERP_SQL_GUARD_CONCURRENCY, 4), { maxQueue: nonNegativeInt(process.env.ERP_SQL_GUARD_MAX_QUEUE, 32), name: "erp_sql_guard" });
  return sqlGuardLimiter(task, signal);
}

export function getSqlGuardConcurrencyMetrics(): ConcurrencyLimiterMetrics {
  sqlGuardLimiter ??= createConcurrencyLimiter(positiveInt(process.env.ERP_SQL_GUARD_CONCURRENCY, 4), { maxQueue: nonNegativeInt(process.env.ERP_SQL_GUARD_MAX_QUEUE, 32), name: "erp_sql_guard" });
  return sqlGuardLimiter.metrics();
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
