import { createConcurrencyLimiter, type ConcurrencyLimiterMetrics } from "../../lib/concurrencyLimiter.js";

let limiter = createLimiter();

export function configureAuditDbConcurrency(limit: number, maxQueue: number): void {
  limiter = createConcurrencyLimiter(limit, { maxQueue, name: "audit_db" });
}

export function runAuditDbWrite<T>(write: () => Promise<T>): Promise<T> {
  return limiter(write);
}

export function getAuditDbConcurrencyMetrics(): ConcurrencyLimiterMetrics {
  return limiter.metrics();
}

function createLimiter() {
  return createConcurrencyLimiter(
    positiveInt(process.env.AUDIT_DB_CONCURRENCY, 4),
    { maxQueue: nonNegativeInt(process.env.AUDIT_DB_MAX_QUEUE, 100), name: "audit_db" },
  );
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
