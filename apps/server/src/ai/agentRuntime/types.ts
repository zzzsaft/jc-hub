export type AgentRuntimeAgentType =
  | "generalAgent"
  | "productConfigAgent"
  | "salesAgent"
  | "quoteAgent"
  | "jdyUploadAgent"
  | string;

export type AgentRuntimeMessageRole = "user" | "assistant" | "system" | "tool";

export type AgentRuntimeRunOptions = {
  sessionId?: string;
  agentType?: AgentRuntimeAgentType;
  message: string;
  ownerUserId?: string | null;
  confirmed?: boolean;
  referenceConfigId?: string;
  llmModel?: string;
  context?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type AgentRuntimeRouteDecision = {
  agentType: AgentRuntimeAgentType;
  confidence: number;
  reason: string;
  needsClarification: boolean;
  clarificationMessage?: string;
};

export type AgentRuntimePlanStep = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
};

export type AgentRuntimePlanLike = {
  intent?: string | null;
  steps?: AgentRuntimePlanStep[];
  [key: string]: unknown;
};

export type AgentRuntimeToolTraceStart = {
  step: AgentRuntimePlanStep;
};

export type AgentRuntimeToolTraceFinish = {
  step: AgentRuntimePlanStep;
  result?: unknown;
  error?: unknown;
  durationMs: number;
};

export type AgentRuntimeExecuteInput = {
  runId: string;
  sessionId: string;
  ownerUserId?: string | null;
  options: AgentRuntimeRunOptions;
  plan: AgentRuntimePlanLike;
  authorizationContext?: unknown;
  onToolStart: (event: AgentRuntimeToolTraceStart) => Promise<void>;
  onToolFinish: (event: AgentRuntimeToolTraceFinish) => Promise<void>;
};

export type AgentRuntimeExecuteResult = {
  context: unknown;
  artifacts?: Record<string, unknown>;
  assistantMessage?: {
    content: string;
    contentJsonb?: unknown;
  };
  contextSummary?: unknown;
};

export type AgentRuntimeAgentHandler = {
  agentType: AgentRuntimeAgentType;
  authorize?: (ownerUserId?: string | null) => Promise<unknown>;
  createPlan: (options: AgentRuntimeRunOptions) => Promise<AgentRuntimePlanLike>;
  executePlan: (
    input: AgentRuntimeExecuteInput,
  ) => Promise<AgentRuntimeExecuteResult>;
  listArtifactsForSession?: (params: {
    sessionId: string;
    ownerUserId?: string | null;
  }) => Promise<Record<string, unknown>>;
};

export type AgentRuntimeSessionSummary = {
  id: string;
  agentType: string;
  title: string | null;
  ownerUserId: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRuntimeMessageSummary = {
  id: string;
  sessionId: string;
  role: string;
  content: string | null;
  contentJsonb: unknown;
  createdAt: Date;
};

export type AgentRuntimeRunSummary = {
  id: string;
  sessionId: string;
  agentType: string;
  intent: string | null;
  status: string;
  planner: unknown;
  contextSummary: unknown;
  error: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRuntimeToolCallSummary = {
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: string;
  error: unknown;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
};
