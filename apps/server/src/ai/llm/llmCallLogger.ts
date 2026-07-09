import { prisma } from "../../lib/prisma.js";

export type LlmCallLogStartParams = {
  provider: string;
  model: string;
  purpose: string;
  input: unknown;
};

export type LlmCallLogHandle = {
  id: Promise<bigint | null>;
  startedAt: Date;
} | null;

export async function startLlmCallLog(
  params: LlmCallLogStartParams,
): Promise<LlmCallLogHandle> {
  if (process.env.LLM_CALL_LOG_DISABLED === "true") return null;
  const startedAt = new Date();
  const id = prisma.llmCallLog.create({
      data: {
        provider: params.provider,
        model: params.model,
        purpose: params.purpose,
        inputJsonb: toJson(params.input),
        status: "pending",
        startedAt,
      },
    })
    .then((log) => log.id)
    .catch(() => null);
  return { id, startedAt };
}

export async function finishLlmCallLog(
  log: LlmCallLogHandle,
  params: { output?: unknown; error?: unknown },
): Promise<void> {
  if (!log) return;
  const completedAt = new Date();
  const hasError = params.error !== undefined && params.error !== null;
  try {
    const id = await log.id;
    if (!id) return;
    await prisma.llmCallLog.update({
      where: { id },
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

export async function updateLlmCallLogOutput(
  log: LlmCallLogHandle,
  output: unknown,
): Promise<void> {
  if (!log) return;
  try {
    const id = await log.id;
    if (!id) return;
    await prisma.llmCallLog.update({
      where: { id },
      data: { outputJsonb: toJson(output) },
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
