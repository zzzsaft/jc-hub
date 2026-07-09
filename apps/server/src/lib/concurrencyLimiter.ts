export type ConcurrencyLimiter = <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  return async <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    if (signal?.aborted) throw abortError();
    active += 1;
    try {
      if (signal?.aborted) throw abortError();
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

function abortError(): Error {
  return new Error("aborted");
}
