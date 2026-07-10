import { abortErrorFromSignal, throwIfAborted } from "./abort.js";

export type ConcurrencyLimiterMetrics = {
  name: string;
  limit: number;
  active: number;
  queued: number;
  started: number;
  completed: number;
  aborted: number;
  overloaded: number;
};

export type ConcurrencyLimiter = {
  <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  readonly active: number;
  readonly queued: number;
  readonly limit: number;
  metrics(): ConcurrencyLimiterMetrics;
};

export class ConcurrencyLimiterOverloadedError extends Error {
  readonly name = "ConcurrencyLimiterOverloadedError";
  readonly statusCode = 429;
  readonly code = "QUEUE_OVERLOADED";

  constructor(readonly limiterName: string) {
    super(`${limiterName} queue is full`);
  }
}

type QueueEntry<T = unknown> = {
  task: () => Promise<T>;
  signal?: AbortSignal;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  onAbort?: () => void;
};

export function createConcurrencyLimiter(
  limit: number,
  options: { maxQueue?: number; name?: string } = {},
): ConcurrencyLimiter {
  const max = Math.max(1, Math.floor(limit));
  const maxQueue = options.maxQueue === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(options.maxQueue));
  const name = options.name ?? "concurrency";
  let active = 0;
  let started = 0;
  let completed = 0;
  let aborted = 0;
  let overloaded = 0;
  const queue: QueueEntry[] = [];

  const start = <T>(entry: QueueEntry<T>): void => {
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
    active += 1;
    started += 1;
    Promise.resolve()
      .then(() => {
        throwIfAborted(entry.signal);
        return entry.task();
      })
      .then(entry.resolve, entry.reject)
      .finally(() => {
        active -= 1;
        completed += 1;
        drain();
      });
  };

  const drain = (): void => {
    while (active < max && queue.length > 0) {
      const entry = queue.shift()!;
      if (entry.signal?.aborted) {
        if (entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
        aborted += 1;
        entry.reject(abortErrorFromSignal(entry.signal));
        continue;
      }
      start(entry);
    }
  };

  const limiter = (<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) {
      aborted += 1;
      return Promise.reject(abortErrorFromSignal(signal));
    }
    if (active < max) {
      return new Promise<T>((resolve, reject) => start({ task, signal, resolve, reject }));
    }
    if (queue.length >= maxQueue) {
      overloaded += 1;
      return Promise.reject(new ConcurrencyLimiterOverloadedError(name));
    }
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = { task, signal, resolve, reject };
      entry.onAbort = () => {
        const index = queue.indexOf(entry as QueueEntry);
        if (index >= 0) queue.splice(index, 1);
        signal?.removeEventListener("abort", entry.onAbort!);
        aborted += 1;
        reject(abortErrorFromSignal(signal));
      };
      signal?.addEventListener("abort", entry.onAbort, { once: true });
      queue.push(entry as QueueEntry);
    });
  }) as ConcurrencyLimiter;

  Object.defineProperties(limiter, {
    active: { get: () => active },
    queued: { get: () => queue.length },
    limit: { get: () => max },
  });
  limiter.metrics = () => ({ name, limit: max, active, queued: queue.length, started, completed, aborted, overloaded });
  return limiter;
}
