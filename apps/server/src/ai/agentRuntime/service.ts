import { Prisma, type AgentMessage, type AgentRun, type AgentSession, type AgentToolCall } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { routeAgentRuntimeMessage } from "./router.js";
import type {
  AgentRuntimeAgentHandler,
  AgentRuntimeAgentType,
  AgentRuntimeMessageSummary,
  AgentRuntimeRunOptions,
  AgentRuntimeRunSummary,
  AgentRuntimeSessionSummary,
  AgentRuntimeToolCallSummary,
} from "./types.js";

export class AgentRuntimeService {
  private readonly handlers = new Map<AgentRuntimeAgentType, AgentRuntimeAgentHandler>();

  registerAgent(handler: AgentRuntimeAgentHandler): this {
    this.handlers.set(handler.agentType, handler);
    return this;
  }

  async createSession(params: {
    agentType?: AgentRuntimeAgentType;
    ownerUserId?: string | null;
    title?: string | null;
    metadata?: unknown;
  }) {
    const session = await prisma.agentSession.create({
      data: {
        agentType: params.agentType ?? "generalAgent",
        title: params.title ?? null,
        ownerUserId: params.ownerUserId ?? null,
        status: "active",
        metadataJsonb: toJson(params.metadata ?? {}),
      },
    });
    return mapSession(session);
  }

  async listSessions(params?: {
    ownerUserId?: string | null;
    agentType?: AgentRuntimeAgentType;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where: Prisma.AgentSessionWhereInput = {};
    if (params?.ownerUserId) where.ownerUserId = params.ownerUserId;
    if (params?.agentType) where.agentType = params.agentType;
    if (params?.status) where.status = params.status;
    const [items, total] = await Promise.all([
      prisma.agentSession.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.agentSession.count({ where }),
    ]);
    return { page, pageSize, total, items: items.map(mapSession) };
  }

  async updateSession(params: {
    sessionId: string;
    ownerUserId?: string | null;
    title?: string | null;
    status?: string;
    agentType?: AgentRuntimeAgentType;
    metadata?: unknown;
  }) {
    const existing = await this.requireOwnedSession(params.sessionId, params.ownerUserId);
    if (params.status !== undefined && !["active", "archived"].includes(params.status)) {
      throw new Error("status must be active or archived");
    }
    const session = await prisma.agentSession.update({
      where: { id: BigInt(existing.id) },
      data: {
        title: params.title,
        status: params.status,
        agentType: params.agentType,
        metadataJsonb: params.metadata === undefined ? undefined : toJson(params.metadata),
      },
    });
    return mapSession(session);
  }

  async run(options: AgentRuntimeRunOptions) {
    const message = options.message.trim();
    if (!message) throw new Error("message is required");

    const routeDecision = options.agentType
      ? {
          agentType: options.agentType,
          confidence: 1,
          reason: "agentType explicitly provided",
          needsClarification: false,
        }
      : routeAgentRuntimeMessage(message);

    if (routeDecision.needsClarification) {
      const session = options.sessionId
        ? await this.requireOwnedSession(options.sessionId, options.ownerUserId)
        : await this.createSession({
            agentType: routeDecision.agentType,
            ownerUserId: options.ownerUserId,
            title: createSessionTitle(message),
            metadata: { routeDecision },
          });
      const userMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "user",
        content: message,
        contentJsonb: { routeDecision },
      });
      const assistantMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "assistant",
        content: routeDecision.clarificationMessage ?? "Please confirm which agent should handle this request.",
        contentJsonb: { routeDecision },
      });
      return { session, run: null, messages: [userMessage, assistantMessage], artifacts: {}, context: { routeDecision } };
    }

    const handler = this.handlers.get(routeDecision.agentType);
    const session = options.sessionId
      ? await this.requireOwnedSession(options.sessionId, options.ownerUserId)
      : await this.createSession({
          agentType: routeDecision.agentType,
          ownerUserId: options.ownerUserId,
          title: createSessionTitle(message),
          metadata: { routeDecision },
        });

    const sessionId = String(session.id);
    const userMessage = await this.createMessage({
      sessionId,
      role: "user",
      content: message,
      contentJsonb: { routeDecision, confirmed: options.confirmed === true, context: options.context ?? null },
    });

    if (!handler) {
      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: `The ${routeDecision.agentType} runtime is reserved but not enabled yet.`,
        contentJsonb: { routeDecision, unsupportedAgentType: routeDecision.agentType },
      });
      return { session, run: null, messages: [userMessage, assistantMessage], artifacts: {}, context: { routeDecision } };
    }

    const plan = await handler.createPlan({ ...options, agentType: handler.agentType });
    const run = await prisma.agentRun.create({
      data: {
        sessionId: BigInt(sessionId),
        agentType: handler.agentType,
        intent: typeof plan.intent === "string" ? plan.intent : null,
        status: "running",
        plannerJsonb: toJson(plan),
        contextSummaryJsonb: {},
      },
    });
    const toolCallIdsByStepId = new Map<string, bigint>();

    try {
      const result = await handler.executePlan({
        runId: String(run.id),
        sessionId,
        ownerUserId: options.ownerUserId ?? null,
        options: { ...options, agentType: handler.agentType },
        plan,
        onToolStart: async ({ step }) => {
          const toolCall = await prisma.agentToolCall.create({
            data: {
              runId: run.id,
              stepId: step.id,
              toolName: step.tool,
              argsJsonb: toJson(step.args),
              status: "running",
            },
          });
          toolCallIdsByStepId.set(step.id, toolCall.id);
        },
        onToolFinish: async ({ step, result: stepResult, error, durationMs }) => {
          const id = toolCallIdsByStepId.get(step.id);
          if (!id) return;
          await prisma.agentToolCall.update({
            where: { id },
            data: {
              status: error ? "failed" : "success",
              resultJsonb: error ? undefined : toJson(stepResult ?? null),
              errorJsonb: error ? toJson(serializeError(error)) : undefined,
              durationMs,
            },
          });
        },
      });

      const completedRun = await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          contextSummaryJsonb: toJson(result.contextSummary ?? result.context ?? {}),
        },
      });
      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: result.assistantMessage?.content ?? "Done.",
        contentJsonb: result.assistantMessage?.contentJsonb ?? result.context ?? {},
      });
      return {
        session,
        run: mapRun(completedRun),
        messages: [userMessage, assistantMessage],
        artifacts: result.artifacts ?? {},
        context: result.context,
      };
    } catch (error) {
      const failedRun = await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "failed", errorJsonb: toJson(serializeError(error)) },
      });
      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: error instanceof Error ? error.message : String(error),
        contentJsonb: { error: serializeError(error) },
      });
      return { session, run: mapRun(failedRun), messages: [userMessage, assistantMessage], artifacts: {}, context: { error: serializeError(error) } };
    }
  }

  async getSessionDetail(params: { sessionId: string; ownerUserId?: string | null }) {
    const session = await this.requireOwnedSession(params.sessionId, params.ownerUserId);
    const [messages, runs, artifacts] = await Promise.all([
      prisma.agentMessage.findMany({ where: { sessionId: BigInt(session.id) }, orderBy: { createdAt: "asc" } }),
      prisma.agentRun.findMany({ where: { sessionId: BigInt(session.id) }, orderBy: { createdAt: "desc" } }),
      this.handlers.get(session.agentType)?.listArtifactsForSession?.({
        sessionId: String(session.id),
        ownerUserId: params.ownerUserId,
      }) ?? Promise.resolve({}),
    ]);
    return { session, messages: messages.map(mapMessage), runs: runs.map(mapRun), artifacts };
  }

  async getRunDetail(params: { runId: string; ownerUserId?: string | null }) {
    const run = await prisma.agentRun.findUnique({ where: { id: BigInt(params.runId) } });
    if (!run) throw new Error(`Agent run not found: ${params.runId}`);
    const session = await this.requireOwnedSession(String(run.sessionId), params.ownerUserId);
    const toolCalls = await prisma.agentToolCall.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } });
    return { session, run: mapRun(run), toolCalls: toolCalls.map(mapToolCall) };
  }

  private async createMessage(params: {
    sessionId: string;
    role: string;
    content?: string | null;
    contentJsonb?: unknown;
  }) {
    const message = await prisma.agentMessage.create({
      data: {
        sessionId: BigInt(params.sessionId),
        role: params.role,
        content: params.content ?? null,
        contentJsonb: params.contentJsonb === undefined ? undefined : toJson(params.contentJsonb),
      },
    });
    await prisma.agentSession.update({
      where: { id: BigInt(params.sessionId) },
      data: { updatedAt: new Date() },
    });
    return mapMessage(message);
  }

  private async requireOwnedSession(sessionId: string, ownerUserId?: string | null) {
    const session = await prisma.agentSession.findUnique({ where: { id: BigInt(sessionId) } });
    if (!session) throw new Error(`Agent session not found: ${sessionId}`);
    assertOwner(session.ownerUserId, ownerUserId);
    return mapSession(session);
  }
}

function assertOwner(sessionOwnerUserId: string | null, ownerUserId?: string | null) {
  if (ownerUserId && sessionOwnerUserId && sessionOwnerUserId !== ownerUserId) {
    throw new Error("Forbidden");
  }
}

function createSessionTitle(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 40) || "New session";
}

function mapSession(session: AgentSession): AgentRuntimeSessionSummary {
  return {
    id: String(session.id),
    agentType: session.agentType,
    title: session.title,
    ownerUserId: session.ownerUserId,
    status: session.status,
    metadata: session.metadataJsonb,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function mapMessage(message: AgentMessage): AgentRuntimeMessageSummary {
  return {
    id: String(message.id),
    sessionId: String(message.sessionId),
    role: message.role,
    content: message.content,
    contentJsonb: message.contentJsonb,
    createdAt: message.createdAt,
  };
}

function mapRun(run: AgentRun): AgentRuntimeRunSummary {
  return {
    id: String(run.id),
    sessionId: String(run.sessionId),
    agentType: run.agentType,
    intent: run.intent,
    status: run.status,
    planner: run.plannerJsonb,
    contextSummary: run.contextSummaryJsonb,
    error: run.errorJsonb,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function mapToolCall(toolCall: AgentToolCall): AgentRuntimeToolCallSummary {
  return {
    id: String(toolCall.id),
    runId: String(toolCall.runId),
    stepId: toolCall.stepId,
    toolName: toolCall.toolName,
    args: toolCall.argsJsonb,
    result: toolCall.resultJsonb,
    status: toolCall.status,
    error: toolCall.errorJsonb,
    durationMs: toolCall.durationMs,
    createdAt: toolCall.createdAt,
    updatedAt: toolCall.updatedAt,
  };
}

function serializeError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

function toJson(value: unknown): any {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
