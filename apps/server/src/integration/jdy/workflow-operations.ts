import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger.js";
import { prisma } from "../../lib/prisma.js";
import { JdyClient, type JdyWorkflowResponse } from "./client.js";
import { syncJdyWorkflowSnapshot } from "./webhook-service.js";

type JdyWorkflowDb = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;
type JdyWorkflowOperationClient = JdyClient;

export class JdyWorkflowOperationError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public response?: JdyWorkflowResponse
  ) {
    super(message);
  }
}

export type JdyWorkflowOperationInput = {
  action: string;
  actorUserId?: string | null;
  jdyUsername?: string | null;
  instanceId?: string | null;
  taskId?: string | null;
  request: Record<string, unknown>;
  call: (client: JdyWorkflowOperationClient) => Promise<JdyWorkflowResponse>;
  refreshInstanceId?: string | null;
};

export const createDefaultJdyClient = () => {
  const apiKey = process.env.JDY_API_KEY?.trim();
  if (!apiKey) throw new JdyWorkflowOperationError(500, "JDY_API_KEY is not configured");
  return new JdyClient({
    apiKey,
    baseUrl: process.env.JDY_API_BASE_URL,
  });
};

export async function runJdyWorkflowOperation(
  input: JdyWorkflowOperationInput,
  client: JdyWorkflowOperationClient = createDefaultJdyClient(),
  db: JdyWorkflowDb = prisma
) {
  try {
    const response = await input.call(client);
    const success = response.status === "success";
    const logId = await insertOperationLog({
      ...input,
      status: success ? "success" : "failure",
      response,
      errorCode: numberValue(response.code),
      errorMessage: textValue(response.message) || null,
    }, db);

    if (!success) {
      throw new JdyWorkflowOperationError(502, textValue(response.message) || "JDY workflow operation failed", response);
    }

    let syncError: string | null = null;
    if (input.refreshInstanceId) {
      try {
        await syncJdyWorkflowSnapshot(logId, input.refreshInstanceId, client, db);
      } catch (error) {
        syncError = error instanceof Error ? error.message : String(error);
        logger.warn(`[jdy workflow]: snapshot sync failed after ${input.action}: ${syncError}`);
      }
    }

    return { response, operationLogId: logId, syncError };
  } catch (error) {
    if (error instanceof JdyWorkflowOperationError) throw error;
    await insertOperationLog({
      ...input,
      status: "failed",
      response: null,
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, db);
    throw new JdyWorkflowOperationError(502, error instanceof Error ? error.message : String(error));
  }
}

async function insertOperationLog(input: JdyWorkflowOperationInput & {
  status: "success" | "failure" | "failed";
  response: JdyWorkflowResponse | null;
  errorCode: number | null;
  errorMessage: string | null;
}, db: JdyWorkflowDb) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO integration.jdy_flow_operation_logs
      (action, actor_user_id, jdy_username, instance_id, task_id, request_json, response_json,
       status, error_code, error_message, created_at)
    VALUES
      (${input.action}, ${input.actorUserId ?? null}, ${input.jdyUsername ?? null}, ${input.instanceId ?? null},
       ${input.taskId ?? null}, ${input.request as Prisma.InputJsonObject},
       ${input.response ? input.response as Prisma.InputJsonObject : Prisma.JsonNull},
       ${input.status}, ${input.errorCode}, ${input.errorMessage}, CURRENT_TIMESTAMP)
    RETURNING id
  `;
  return rows[0]?.id ?? "";
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
