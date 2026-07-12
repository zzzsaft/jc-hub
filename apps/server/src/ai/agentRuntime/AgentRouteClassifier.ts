import { createHash } from "node:crypto";
import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../llm/deepseekClient.js";
import { getErpSqlCapabilities } from "../../modules/erpSqlAgent/capabilities/registry.js";
import { isAbortError } from "../../lib/abort.js";

const AgentTypeSchema = z.enum(["mastraErpSqlAgent", "productConfigAgent", "quoteAgent", "generalAgent"]);
export const AgentRouteClassificationSchema = z.object({
  agentType: AgentTypeSchema,
  isErpDataQuestion: z.boolean(),
  capabilityCode: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  reasonCode: z.string().min(1),
  clarificationMessage: z.string().min(1).optional(),
}).strict();
export type AgentRouteClassification = z.infer<typeof AgentRouteClassificationSchema>;

export type AgentRouteClassifierRequester = (params: {
  purpose: string; messages: LlmChatMessage[]; input: unknown; maxTokens: number; signal?: AbortSignal;
}) => Promise<string>;

export class AgentRouteClassifier {
  private readonly cache = new Map<string, { expiresAt: number; value: AgentRouteClassification }>();
  constructor(
    private readonly requestJson: AgentRouteClassifierRequester = requestDeepSeekJson,
    private readonly ttlMs = positiveInt(process.env.AGENT_ROUTE_CACHE_TTL_MS, 30_000),
    private readonly maxSize = positiveInt(process.env.AGENT_ROUTE_CACHE_SIZE, 200),
    private readonly confidenceThreshold = confidenceValue(process.env.AGENT_ROUTE_CONFIDENCE_THRESHOLD, 0.75),
  ) {}

  async classify(input: {
    message: string;
    context?: unknown;
    preferredAgentType?: string;
    signal?: AbortSignal;
  }): Promise<AgentRouteClassification> {
    const normalizedMessage = input.message.replace(/\s+/gu, " ").trim();
    const contextDigest = createHash("sha256").update(stableJson(input.context ?? null)).digest("hex");
    const key = `${normalizedMessage}\0${contextDigest}\0${input.preferredAgentType ?? ""}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const capabilities = getErpSqlCapabilities().map((item) => ({ code: item.code, status: item.status, modules: item.modules }));
      const payload = {
        message: normalizedMessage,
        recentConversationOrSummary: input.context ?? null,
        preferredAgentType: input.preferredAgentType ?? null,
        agents: ["mastraErpSqlAgent", "productConfigAgent", "quoteAgent", "generalAgent"],
        erpCapabilities: capabilities,
      };
      const content = await this.requestJson({
        purpose: "agent_route_classify",
        input: payload,
        maxTokens: 500,
        signal: input.signal,
        messages: [
          { role: "system", content: "Classify every request into exactly one agent using conversation context. ERP data questions use mastraErpSqlAgent and an exact registry capability code when known. Product configuration uses productConfigAgent; quote creation/actions use quoteAgent; general knowledge uses generalAgent. Ambiguity requires clarification. Return JSON only; never infer from a single keyword." },
          { role: "user", content: JSON.stringify({ ...payload, outputSchema: { agentType: "enum", isErpDataQuestion: "boolean", capabilityCode: "optional string", confidence: "0..1", needsClarification: "boolean", reasonCode: "string", clarificationMessage: "optional string" } }) },
        ],
      });
      const value = AgentRouteClassificationSchema.parse(JSON.parse(content));
      if (value.agentType === "mastraErpSqlAgent" && (!value.isErpDataQuestion || !value.capabilityCode || !capabilities.some((item) => item.code === value.capabilityCode))) throw new Error("ERP classification requires a registered capabilityCode");
      if (value.agentType !== "mastraErpSqlAgent" && value.isErpDataQuestion) throw new Error("ERP data classification must use mastraErpSqlAgent");
      const guarded = value.confidence < this.confidenceThreshold
        ? { ...value, needsClarification: true, reasonCode: "route_confidence_below_threshold", clarificationMessage: "无法高置信度判断应由哪个 Agent 处理，请补充业务目标。" }
        : value;
      this.cache.set(key, { expiresAt: Date.now() + this.ttlMs, value: guarded });
      while (this.cache.size > this.maxSize) this.cache.delete(this.cache.keys().next().value!);
      return guarded;
    } catch (error) {
      if (isAbortError(error)) throw error;
      return unavailable();
    }
  }
}

export const agentRouteClassifier = new AgentRouteClassifier();

function unavailable(): AgentRouteClassification {
  return { agentType: "generalAgent", isErpDataQuestion: false, confidence: 0, needsClarification: true, reasonCode: "route_classifier_unavailable", clarificationMessage: "暂时无法判断该请求应由哪个 Agent 处理，请稍后重试或补充业务目标。" };
}
function stableJson(value: unknown): string { try { return JSON.stringify(canonical(value)); } catch { return String(value); } }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function positiveInt(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function confidenceValue(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback; }
