import {
  createConcurrencyLimiter,
  type ConcurrencyLimiter,
  type ConcurrencyLimiterMetrics,
} from "../../../lib/concurrencyLimiter.js";

let erpQueryLimiter: ConcurrencyLimiter | undefined;

export function configureErpQueryConcurrency(limit: number, maxQueue: number): void {
  erpQueryLimiter = createConcurrencyLimiter(limit, { maxQueue, name: "erp_http_query" });
}

export function runErpQueryLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  erpQueryLimiter ??= createConcurrencyLimiter(
    positiveInt(process.env.ERP_QUERY_CONCURRENCY, 4),
    { maxQueue: nonNegativeInt(process.env.ERP_QUERY_MAX_QUEUE, 16), name: "erp_http_query" },
  );
  return erpQueryLimiter(task, signal);
}

export function getErpQueryConcurrencyMetrics(): ConcurrencyLimiterMetrics {
  erpQueryLimiter ??= createConcurrencyLimiter(
    positiveInt(process.env.ERP_QUERY_CONCURRENCY, 4),
    { maxQueue: nonNegativeInt(process.env.ERP_QUERY_MAX_QUEUE, 16), name: "erp_http_query" },
  );
  return erpQueryLimiter.metrics();
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
