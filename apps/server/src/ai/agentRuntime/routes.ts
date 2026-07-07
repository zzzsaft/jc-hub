import type { Request, Response } from "express";
import { agentRuntimeService } from "./defaultRuntime.js";
import {
  resolveUserIdOrLocalDev,
  withRequiredUser,
} from "../../routes/routeAuth.js";

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
  try {
    response.json(
      await agentRuntimeService.run({
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
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

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
  { path: "/agentRuntime/sessions/:sessionId", method: "get", action: withAgentRuntimeToken(getSession) },
  { path: "/agentRuntime/sessions/:sessionId", method: "patch", action: withAgentRuntimeToken(updateSession) },
  { path: "/agentRuntime/runs/:runId", method: "get", action: withAgentRuntimeToken(getRun) },
];

function sendError(response: Response, error: unknown) {
  response.status(error instanceof Error && error.message === "Forbidden" ? 403 : 400).json({
    error: error instanceof Error ? error.message : String(error),
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
