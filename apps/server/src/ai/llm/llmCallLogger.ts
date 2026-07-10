import { prisma } from "../../lib/prisma.js";
import { protectAuditValue, protectError } from "../audit/dataProtection.js";
import { runAuditDbWrite } from "../audit/auditDbLimiter.js";

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
  const id = runAuditDbWrite(() => prisma.llmCallLog.create({
      data: {
        provider: params.provider,
        model: params.model,
        purpose: params.purpose,
        inputJsonb: toJson(protectAuditValue(params.input, "input")),
        status: "pending",
        startedAt,
      },
    }))
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
    await runAuditDbWrite(() => prisma.llmCallLog.update({
      where: { id },
      data: {
        outputJsonb: params.output === undefined ? undefined : toJson(protectAuditValue(params.output, "output")),
        error: hasError ? JSON.stringify(protectError(params.error)) : null,
        status: hasError ? "failed" : "success",
        completedAt,
        latencyMs: completedAt.getTime() - log.startedAt.getTime(),
      },
    }));
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
    await runAuditDbWrite(() => prisma.llmCallLog.update({
      where: { id },
      data: { outputJsonb: toJson(protectAuditValue(output, "output")) },
    }));
  } catch {
    // Logging failures must not break the caller's LLM flow.
  }
}

function toJson(value: unknown): any {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}
