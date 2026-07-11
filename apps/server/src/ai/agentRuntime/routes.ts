import type { Request, Response } from "express";
import { agentRuntimeService } from "./defaultRuntime.js";
import {
  resolveUserIdOrLocalDev,
  withRequiredUser,
} from "../../routes/routeAuth.js";
import { createLinkedAbortController, OperationAbortedError } from "../../lib/abort.js";
import { runWithPrismaAbortSignal } from "../../lib/prisma.js";

type AgentRuntimeRouteAction = (
  request: Request,
  response: Response,
) => Promise<void>;

function withAgentRuntimeToken(action: AgentRuntimeRouteAction): AgentRuntimeRouteAction {
  return withRequiredUser(action);
}

async function getAgentRuntimeUserId(request: Request): Promise<string | null> {
  const resolvedUserId = (request as Request & { userId?: string }).userId;
  if (resolvedUserId) return resolvedUserId;
  return resolveUserIdOrLocalDev(request);
}

const createSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.createSession({
        agentType: optionalString(request.body?.agentType) ?? undefined,
        ownerUserId: await getAgentRuntimeUserId(request),
        title: optionalString(request.body?.title),
        metadata:
          request.body?.metadata && typeof request.body.metadata === "object"
            ? request.body.metadata
            : {},
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const listSessions = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.listSessions({
        ownerUserId: await getAgentRuntimeUserId(request),
        agentType: optionalString(request.query.agentType) ?? undefined,
        status: optionalString(request.query.status) ?? undefined,
        keyword: optionalString(request.query.keyword) ?? undefined,
        page: optionalNumber(request.query.page),
        pageSize: optionalNumber(request.query.pageSize),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const updateSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.updateSession({
        sessionId: requireString(request.params.sessionId, "sessionId"),
        ownerUserId: await getAgentRuntimeUserId(request),
        title:
          request.body?.title === undefined
            ? undefined
            : optionalString(request.body.title) ?? null,
        status: optionalString(request.body?.status) ?? undefined,
        agentType: optionalString(request.body?.agentType) ?? undefined,
        metadata:
          request.body?.metadata === undefined
            ? undefined
            : request.body?.metadata && typeof request.body.metadata === "object"
              ? request.body.metadata
              : {},
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const runAgent = async (request: Request, response: Response) => {
  const abortScope = createAgentRuntimeRequestAbortScope(request, response);
  try {
    const ownerUserId = await getAgentRuntimeUserId(request);
    response.json(
      await runWithPrismaAbortSignal(abortScope.signal, () => agentRuntimeService.run({
        sessionId: optionalString(request.body?.sessionId) ?? undefined,
        agentType: optionalString(request.body?.agentType) ?? undefined,
        message: requireString(request.body?.message, "message"),
        confirmed: request.body?.confirmed === true,
        referenceConfigId:
          optionalString(request.body?.referenceConfigId) ?? undefined,
        llmModel: optionalString(request.body?.llmModel) ?? undefined,
        context:
          request.body?.context && typeof request.body.context === "object"
            ? request.body.context
            : undefined,
        ownerUserId,
        signal: abortScope.signal,
      })),
    );
  } catch (error) {
    sendError(response, error);
  } finally {
    abortScope.cleanup();
  }
};

const runAgentStream = async (request: Request, response: Response) => {
  const abortScope = createAgentRuntimeRequestAbortScope(request, response);
  try {
    const ownerUserId = await getAgentRuntimeUserId(request);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    const result = await runWithPrismaAbortSignal(abortScope.signal, () => agentRuntimeService.run({
      sessionId: optionalString(request.body?.sessionId) ?? undefined,
      agentType: optionalString(request.body?.agentType) ?? undefined,
      message: requireString(request.body?.message, "message"),
      confirmed: request.body?.confirmed === true,
      referenceConfigId: optionalString(request.body?.referenceConfigId) ?? undefined,
      llmModel: optionalString(request.body?.llmModel) ?? undefined,
      context: request.body?.context && typeof request.body.context === "object" ? request.body.context : undefined,
      ownerUserId,
      signal: abortScope.signal,
      onProgress: (event) => writeSse(response, event.type, event),
    }));
    writeSse(response, "complete", result);
  } catch (error) {
    writeSse(response, "error", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    abortScope.cleanup();
    response.end();
  }
};

export function createAgentRuntimeRequestAbortScope(request: Request, response: Response) {
  const deadlineMs = positiveInt(process.env.ERP_SQL_AGENT_TOTAL_DEADLINE_MS, 120_000);
  const scope = createLinkedAbortController({
    timeoutMs: deadlineMs,
    timeoutCode: "AGENT_RUNTIME_DEADLINE_EXCEEDED",
    timeoutMessage: `agent runtime deadline exceeded after ${deadlineMs}ms`,
  });
  const abortClient = () => scope.controller.abort(new OperationAbortedError("client disconnected", "aborted", "CLIENT_DISCONNECTED", 499));
  const onRequestClose = () => {
    if (!request.complete) abortClient();
  };
  const onResponseClose = () => {
    if (!response.writableEnded) abortClient();
  };
  request.once("aborted", abortClient);
  request.once("close", onRequestClose);
  response.once("close", onResponseClose);
  return {
    signal: scope.signal,
    cleanup: () => {
      request.removeListener("aborted", abortClient);
      request.removeListener("close", onRequestClose);
      response.removeListener("close", onResponseClose);
      scope.cleanup();
    },
  };
}

const getSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.getSessionDetail({
        sessionId: requireString(request.params.sessionId, "sessionId"),
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getRun = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.getRunDetail({
        runId: requireString(request.params.runId, "runId"),
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

export const AgentRuntimeRoutes = [
  { path: "/agentRuntime/sessions", method: "get", action: withAgentRuntimeToken(listSessions) },
  { path: "/agentRuntime/sessions", method: "post", action: withAgentRuntimeToken(createSession) },
  { path: "/agentRuntime/run", method: "post", action: withAgentRuntimeToken(runAgent) },
  { path: "/agentRuntime/run/stream", method: "post", action: withAgentRuntimeToken(runAgentStream) },
  { path: "/agentRuntime/sessions/:sessionId", method: "get", action: withAgentRuntimeToken(getSession) },
  { path: "/agentRuntime/sessions/:sessionId", method: "patch", action: withAgentRuntimeToken(updateSession) },
  { path: "/agentRuntime/runs/:runId", method: "get", action: withAgentRuntimeToken(getRun) },
];

function writeSse(response: Response, event: string, data: unknown) {
  if (response.writableEnded || response.destroyed) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sendError(response: Response, error: unknown) {
  if (response.headersSent || response.destroyed) return;
  const detail = error as { statusCode?: number; code?: string; lifecycleStatus?: string };
  response.status(detail.statusCode ?? (error instanceof Error && error.message === "Forbidden" ? 403 : 400)).json({
    error: error instanceof Error ? error.message : String(error),
    ...(detail.code ? { code: detail.code } : {}),
    ...(detail.lifecycleStatus ? { lifecycleStatus: detail.lifecycleStatus } : {}),
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function optionalNumber(value: unknown): number | undefined {
  const stringValue = optionalString(value);
  if (!stringValue) return undefined;
  const numberValue = Number(stringValue);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
