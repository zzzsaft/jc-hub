import { Prisma, type AgentMessage, type AgentRun, type AgentSession, type AgentToolCall } from "@prisma/client";
import { prisma, runWithoutPrismaAbortSignal } from "../../lib/prisma.js";
import { isAbortError } from "../../lib/abort.js";
import { agentRouteClassifier, type AgentRouteClassifier } from "./AgentRouteClassifier.js";
import { protectAgentMessage, protectAgentTitle, protectAuditValue, protectError } from "../audit/dataProtection.js";
import { buildResultColumns } from "../../modules/erpSqlAgent/agent/resultColumnMetadata.js";
import { ConcurrencyLimiterOverloadedError, createConcurrencyLimiter, type ConcurrencyLimiter, type ConcurrencyLimiterMetrics } from "../../lib/concurrencyLimiter.js";
import { buildRecentConversation, encryptConversationText } from "./conversationPayload.js";
import type {
  AgentRuntimeAgentHandler,
  AgentRuntimeAgentType,
  AgentRuntimeMessageSummary,
  AgentRuntimeRunOptions,
  AgentRuntimeRunSummary,
  AgentRuntimeSessionSummary,
  AgentRuntimeToolCallSummary,
} from "./types.js";

type AgentSessionSearchRow = Pick<
  AgentSession,
  "id" | "agentType" | "title" | "ownerUserId" | "status" | "metadataJsonb" | "createdAt" | "updatedAt"
>;

let agentRuntimeLimiter: ConcurrencyLimiter | undefined;

export class AgentRuntimeOverloadedError extends Error {
  readonly statusCode = 429;
  readonly code = "AGENT_OVERLOADED";
  readonly retryable = true;

  constructor() {
    super("Agent runtime is busy");
  }
}

export function configureAgentRuntimeConcurrency(limit: number, maxQueue: number): void {
  agentRuntimeLimiter = createConcurrencyLimiter(limit, { maxQueue, name: "agent_runtime" });
}

export function getAgentRuntimeConcurrencyMetrics(): ConcurrencyLimiterMetrics {
  return getAgentRuntimeLimiter().metrics();
}

export async function runAgentRuntimeLimited<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await getAgentRuntimeLimiter()(task, signal);
  } catch (error) {
    if (error instanceof ConcurrencyLimiterOverloadedError) throw new AgentRuntimeOverloadedError();
    throw error;
  }
}

function getAgentRuntimeLimiter(): ConcurrencyLimiter {
  return agentRuntimeLimiter ??= createConcurrencyLimiter(
    positiveInt(process.env.AGENT_RUNTIME_CONCURRENCY_LIMIT, 2),
    { maxQueue: nonNegativeInt(process.env.AGENT_RUNTIME_MAX_QUEUE, 8), name: "agent_runtime" },
  );
}

export class AgentRuntimeService {
  private readonly handlers = new Map<AgentRuntimeAgentType, AgentRuntimeAgentHandler>();

  constructor(private readonly routeClassifier: AgentRouteClassifier = agentRouteClassifier) {}

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
    const agentType = params.agentType ?? "generalAgent";
    const session = await prisma.agentSession.create({
      data: {
        agentType,
        title: protectAgentTitle(agentType, params.title),
        ownerUserId: params.ownerUserId ?? null,
        status: "active",
        metadataJsonb: toJson(protectAuditValue(params.metadata ?? {}, "metadata")),
      },
    });
    return mapSession(session);
  }

  async listSessions(params?: {
    ownerUserId?: string | null;
    agentType?: AgentRuntimeAgentType;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const keyword = params?.keyword?.trim();
    if (keyword) {
      return this.searchSessions({ ...params, keyword, page, pageSize });
    }
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

  private async searchSessions(params: {
    ownerUserId?: string | null;
    agentType?: AgentRuntimeAgentType;
    status?: string;
    keyword: string;
    page: number;
    pageSize: number;
  }) {
    const filters: Prisma.Sql[] = [];
    if (params.ownerUserId) filters.push(Prisma.sql`s.owner_user_id = ${params.ownerUserId}`);
    if (params.agentType) filters.push(Prisma.sql`s.agent_type = ${params.agentType}`);
    if (params.status) filters.push(Prisma.sql`s.status = ${params.status}`);

    const pattern = `%${escapeLike(params.keyword)}%`;
    filters.push(Prisma.sql`(
      s.title ILIKE ${pattern} ESCAPE ${"\\"}
      OR EXISTS (
        SELECT 1
        FROM agent.agent_messages m
        WHERE m.session_id = s.id
          AND m.content ILIKE ${pattern} ESCAPE ${"\\"}
      )
    )`);

    const whereSql = Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
    const offset = (params.page - 1) * params.pageSize;
    const [items, totalRows] = await Promise.all([
      prisma.$queryRaw<AgentSessionSearchRow[]>(Prisma.sql`
        SELECT
          s.id,
          s.agent_type AS "agentType",
          s.title,
          s.owner_user_id AS "ownerUserId",
          s.status,
          s.metadata_jsonb AS "metadataJsonb",
          s.created_at AS "createdAt",
          s.updated_at AS "updatedAt"
        FROM agent.agent_sessions s
        ${whereSql}
        ORDER BY s.updated_at DESC
        LIMIT ${params.pageSize}
        OFFSET ${offset}
      `),
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM agent.agent_sessions s
        ${whereSql}
      `),
    ]);

    return {
      page: params.page,
      pageSize: params.pageSize,
      total: Number(totalRows[0]?.total ?? 0n),
      items: items.map(mapSession),
    };
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
        title: params.title === undefined ? undefined : protectAgentTitle(params.agentType ?? existing.agentType, params.title),
        status: params.status,
        agentType: params.agentType,
        metadataJsonb: params.metadata === undefined ? undefined : toJson(protectAuditValue(params.metadata, "metadata")),
      },
    });
    return mapSession(session);
  }

  async run(options: AgentRuntimeRunOptions) {
    return runAgentRuntimeLimited(() => this.runUnlocked(options), options.signal);
  }

  private async runUnlocked(options: AgentRuntimeRunOptions) {
    const message = options.message.trim();
    if (!message) throw new Error("message is required");

    const existingSession = options.sessionId ? await this.requireOwnedSession(options.sessionId, options.ownerUserId) : undefined;
    const previousContext = options.context ?? (existingSession ? await this.getLatestContextSummary(String(existingSession.id)) : undefined);
    const conversationContext = existingSession ? await this.getConversationContext(String(existingSession.id), previousContext) : undefined;
    const constrainedAgentType = options.agentType ?? existingSession?.agentType;
    const classification = await this.routeClassifier.classify({
      message,
      context: { previousContext: previousContext ?? null, conversationContext: conversationContext ?? null },
      preferredAgentType: constrainedAgentType,
      signal: options.signal,
    });
    const explicitMismatch = Boolean(constrainedAgentType && classification.agentType !== constrainedAgentType);
    const routeDecision = {
      agentType: classification.agentType,
      confidence: classification.confidence,
      agentConfidence: classification.agentConfidence,
      capabilityConfidence: classification.capabilityConfidence,
      reason: classification.reasonCode,
      needsClarification: classification.needsClarification || explicitMismatch,
      clarificationMessage: explicitMismatch
        ? "当前请求不属于此 Agent 页面，请确认是否切换到建议的 Agent。"
        : classification.clarificationMessage,
      classification,
    };

    if (routeDecision.needsClarification) {
      const session = existingSession
        ?? await this.createSession({
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
    const authorizationContext = handler?.authorize
      ? await handler.authorize(options.ownerUserId)
      : undefined;
    const session = existingSession
      ?? await this.createSession({
          agentType: routeDecision.agentType,
          ownerUserId: options.ownerUserId,
          title: createSessionTitle(message),
          metadata: { routeDecision },
        });

    const sessionId = String(session.id);
    const runtimeConversationContext = conversationContext ?? await this.getConversationContext(sessionId, previousContext);
    const runtimeContext = { ...(previousContext ?? {}), conversationContext: runtimeConversationContext, routeDecision };
    const runOptions = { ...options, context: runtimeContext, agentType: handler?.agentType ?? routeDecision.agentType };
    const userMessage = await this.createMessage({
      sessionId,
      role: "user",
      content: message,
      contentJsonb: { routeDecision, confirmed: options.confirmed === true, context: previousContext ?? null },
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

    const plan = await handler.createPlan(runOptions);
    const run = await prisma.agentRun.create({
      data: {
        sessionId: BigInt(sessionId),
        agentType: handler.agentType,
        intent: typeof plan.intent === "string" ? plan.intent : null,
        status: "running",
        plannerJsonb: toJson(protectAuditValue(plan, "planner")),
        contextSummaryJsonb: {},
      },
    });
    await options.onProgress?.({ type: "run-start", session, run: mapRun(run) });
    const toolCallIdsByStepId = new Map<string, bigint>();

    try {
      const result = await handler.executePlan({
        runId: String(run.id),
        sessionId,
        ownerUserId: options.ownerUserId ?? null,
        options: runOptions,
        plan,
        authorizationContext,
        onToolStart: async ({ step }) => {
          const toolCall = await prisma.agentToolCall.create({
            data: {
              runId: run.id,
              stepId: step.id,
              toolName: step.tool,
              argsJsonb: toJson(protectAuditValue(step.args, "args")),
              status: "running",
            },
          });
          toolCallIdsByStepId.set(step.id, toolCall.id);
          await options.onProgress?.({ type: "tool-start", runId: String(run.id), stepId: step.id, toolName: step.tool });
        },
        onToolFinish: async ({ step, result: stepResult, error, durationMs }) => {
          const id = toolCallIdsByStepId.get(step.id);
          if (!id) return;
          await runWithoutPrismaAbortSignal(() => prisma.agentToolCall.update({
            where: { id },
            data: {
              status: error ? "failed" : "success",
              resultJsonb: error ? undefined : toJson(protectAuditValue(stepResult ?? null, "result")),
              errorJsonb: error ? toJson(protectError(error)) : undefined,
              durationMs,
            },
          }));
          await options.onProgress?.({
            type: "tool-finish",
            runId: String(run.id),
            stepId: step.id,
            toolName: step.tool,
            status: error ? "failed" : "success",
            durationMs,
          });
        },
      });

      const completedRun = await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          contextSummaryJsonb: toJson(protectAuditValue(result.contextSummary ?? result.context ?? {}, "contextSummary")),
        },
      });
      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: result.assistantMessage?.content ?? "Done.",
        contentJsonb: protectAuditValue(result.assistantMessage?.contentJsonb ?? result.context ?? {}, "contentJsonb"),
        displayJsonb: result.assistantMessage?.displayJsonb,
      });
      return {
        session,
        run: mapRun(completedRun),
        messages: [userMessage, assistantMessage],
        artifacts: result.artifacts ?? {},
        context: result.context,
      };
    } catch (error) {
      const failedRun = await runWithoutPrismaAbortSignal(() => prisma.agentRun.update({
        where: { id: run.id },
        data: { status: isAbortError(error) ? "cancelled" : "failed", errorJsonb: toJson(runtimeError(error)) },
      }));
      if (isAbortError(error)) throw error;
      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: error instanceof Error ? error.message : String(error),
        contentJsonb: { error: protectError(error) },
      });
      return { session, run: mapRun(failedRun), messages: [userMessage, assistantMessage], artifacts: {}, context: { error: protectError(error) } };
    }
  }

  async getSessionDetail(params: { sessionId: string; ownerUserId?: string | null }) {
    const session = await this.requireOwnedSession(params.sessionId, params.ownerUserId);
    await this.requireCurrentResultAccess(session.agentType, params.ownerUserId);
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
    displayJsonb?: unknown;
  }) {
    const agentType = (await prisma.agentSession.findUniqueOrThrow({
      where: { id: BigInt(params.sessionId) },
      select: { agentType: true },
    })).agentType;
    const inferenceJsonb = isErpInferenceAgent(agentType) && params.content
      ? encryptConversationText(params.content)
      : undefined;
    const message = await prisma.agentMessage.create({
      data: {
        sessionId: BigInt(params.sessionId),
        role: params.role,
        content: protectAgentMessage(agentType, params.role, params.content),
        contentJsonb: params.contentJsonb === undefined ? undefined : toJson(protectAuditValue(params.contentJsonb, "contentJsonb")),
        displayJsonb: params.displayJsonb === undefined ? undefined : toJson(params.displayJsonb),
        inferenceJsonb: inferenceJsonb === undefined ? undefined : toJson(inferenceJsonb),
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

  private async requireCurrentResultAccess(agentType: string, ownerUserId?: string | null) {
    const handler = this.handlers.get(agentType);
    if (handler?.authorize) await handler.authorize(ownerUserId);
  }

  private async getLatestContextSummary(sessionId: string): Promise<Record<string, unknown> | undefined> {
    const runs = await prisma.agentRun.findMany({
      where: { sessionId: BigInt(sessionId), status: "success" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { contextSummaryJsonb: true },
    });
    for (const run of runs) {
      const context = run.contextSummaryJsonb;
      if (!context || typeof context !== "object" || Array.isArray(context)) continue;
      const record = context as Record<string, unknown>;
      const plan = record.analysisPlan;
      if (plan && typeof plan === "object" && !Array.isArray(plan)) return record;
    }
    return undefined;
  }

  private async getConversationContext(sessionId: string, previousContext: Record<string, unknown> | undefined) {
    const where = { sessionId: BigInt(sessionId), role: { in: ["user", "assistant"] } };
    const [messages, messageCount] = await Promise.all([
      prisma.agentMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, role: true, content: true, inferenceJsonb: true },
      }),
      prisma.agentMessage.count({ where }),
    ]);
    const recentMessages = buildRecentConversation(messages.reverse().map((message) => ({
      ...message,
      role: message.role as "user" | "assistant",
    })));
    const plan = previousContext?.analysisPlan as Record<string, unknown> | undefined;
    const semanticSummary = plan ? [
      `指标:${stringList(plan.metrics).join(",")}`,
      `维度:${stringList(plan.dimensions).join(",")}`,
      `时间:${JSON.stringify(plan.timeRange ?? null)}`,
      `比较:${JSON.stringify(plan.comparison ?? null)}`,
    ].join("；") : undefined;
    return { recentMessages, ...(semanticSummary ? { semanticSummary } : {}), summarizedMessageCount: Math.max(0, messageCount - 12) };
  }
}

function isErpInferenceAgent(agentType: string): boolean {
  return agentType === "erpSqlAgent" || agentType === "mastraErpSqlAgent";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assertOwner(sessionOwnerUserId: string | null, ownerUserId?: string | null) {
  if (ownerUserId && sessionOwnerUserId !== ownerUserId) {
    throw new Error("Forbidden");
  }
}

function createSessionTitle(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 40) || "New session";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function mapSession(session: AgentSessionSearchRow): AgentRuntimeSessionSummary {
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
    contentJsonb: mergeDisplayPayload(message.contentJsonb, message.displayJsonb),
    ...(message.displayJsonb === null ? {} : { displayJsonb: message.displayJsonb }),
    createdAt: message.createdAt,
  };
}

function mergeDisplayPayload(contentJsonb: unknown, displayJsonb: unknown): unknown {
  if (!isRecord(contentJsonb)) return contentJsonb;
  const merged = isRecord(displayJsonb) ? { ...contentJsonb, ...displayJsonb } : { ...contentJsonb };
  if (!Array.isArray(merged.columns) && Array.isArray(merged.fields)) {
    const fields = merged.fields.filter((field): field is string => typeof field === "string");
    const rows = Array.isArray(merged.rows) ? merged.rows.filter((row): row is unknown[] => Array.isArray(row)) : [];
    merged.columns = buildResultColumns(fields, rows, typeof merged.sql === "string" ? merged.sql : "");
  }
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function toJson(value: unknown): any {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function runtimeError(error: unknown) {
  const protectedError = protectError(error);
  const detail = error as { code?: string; lifecycleStatus?: string };
  return {
    ...protectedError,
    ...(detail.code ? { code: detail.code } : {}),
    ...(detail.lifecycleStatus ? { lifecycleStatus: detail.lifecycleStatus } : {}),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
