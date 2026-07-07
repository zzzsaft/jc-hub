import { prisma } from "../../lib/prisma.js";

export type LlmCallLogStartParams = {
  provider: string;
  model: string;
  purpose: string;
  input: unknown;
};

export type LlmCallLogHandle = {
  id: bigint;
  startedAt: Date;
} | null;

export async function startLlmCallLog(
  params: LlmCallLogStartParams,
): Promise<LlmCallLogHandle> {
  const startedAt = new Date();
  try {
    const log = await prisma.llmCallLog.create({
      data: {
        provider: params.provider,
        model: params.model,
        purpose: params.purpose,
        inputJsonb: toJson(params.input),
        status: "pending",
        startedAt,
      },
    });
    return { id: log.id, startedAt };
  } catch {
    return null;
  }
}

export async function finishLlmCallLog(
  log: LlmCallLogHandle,
  params: { output?: unknown; error?: unknown },
): Promise<void> {
  if (!log) return;
  const completedAt = new Date();
  const hasError = params.error !== undefined && params.error !== null;
  try {
    await prisma.llmCallLog.update({
      where: { id: log.id },
      data: {
        outputJsonb: params.output === undefined ? undefined : toJson(params.output),
        error: hasError ? errorToString(params.error) : null,
        status: hasError ? "failed" : "success",
        completedAt,
        latencyMs: completedAt.getTime() - log.startedAt.getTime(),
      },
    });
  } catch {
    // Logging failures must not break the caller's LLM flow.
  }
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return typeof error === "string" ? error : JSON.stringify(error);
}

function toJson(value: unknown): any {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}
