export type RuntimeLifecycleStatus =
  | "not_sent"
  | "queued"
  | "request_sent"
  | "first_token_slow"
  | "stream_slow"
  | "guard/repair_slow"
  | "erp_query_slow"
  | "aborted";

export class OperationAbortedError extends Error {
  readonly name = "AbortError";

  constructor(
    message = "aborted",
    readonly lifecycleStatus: RuntimeLifecycleStatus = "aborted",
    readonly code = "ABORTED",
    readonly statusCode = 499,
  ) {
    super(message);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof OperationAbortedError
    || (error instanceof Error && (error.name === "AbortError" || /aborted|aborterror|canceled/iu.test(error.message)));
}

export function abortErrorFromSignal(signal?: AbortSignal): OperationAbortedError {
  const reason = signal?.reason;
  if (reason instanceof OperationAbortedError) return reason;
  if (reason instanceof Error) return new OperationAbortedError(reason.message);
  return new OperationAbortedError();
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortErrorFromSignal(signal);
}

export function createLinkedAbortController(options: {
  parent?: AbortSignal;
  timeoutMs?: number;
  timeoutStatus?: RuntimeLifecycleStatus;
  timeoutCode?: string;
  timeoutMessage?: string;
} = {}): { controller: AbortController; signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(abortErrorFromSignal(options.parent));
  if (options.parent?.aborted) abortFromParent();
  else options.parent?.addEventListener("abort", abortFromParent, { once: true });

  const timeoutMs = Number(options.timeoutMs);
  const timer = !controller.signal.aborted && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(new OperationAbortedError(
        options.timeoutMessage ?? `deadline exceeded after ${timeoutMs}ms`,
        options.timeoutStatus ?? "aborted",
        options.timeoutCode ?? "DEADLINE_EXCEEDED",
        504,
      )), timeoutMs)
    : undefined;
  timer?.unref();

  return {
    controller,
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      options.parent?.removeEventListener("abort", abortFromParent);
    },
  };
}
