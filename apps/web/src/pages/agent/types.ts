export const ERP_AGENT_TYPE = "mastraErpSqlAgent";

export type AgentMessageRole = "user" | "assistant" | "system" | "tool" | string;

export type AgentRuntimeSession = {
  id: string;
  agentType: string;
  title: string | null;
  ownerUserId: string | null;
  status: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AgentRuntimeMessage = {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  content: string | null;
  contentJsonb: unknown;
  createdAt: string;
};

export type AgentRuntimeRun = {
  id: string;
  sessionId: string;
  agentType: string;
  intent: string | null;
  status: string;
  planner: unknown;
  contextSummary: unknown;
  error: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AgentRuntimeToolCall = {
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: string;
  error: unknown;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentSessionListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: AgentRuntimeSession[];
};

export type AgentSessionDetail = {
  session: AgentRuntimeSession;
  messages: AgentRuntimeMessage[];
  runs: AgentRuntimeRun[];
  artifacts: Record<string, unknown>;
};

export type AgentRunDetail = {
  session: AgentRuntimeSession;
  run: AgentRuntimeRun;
  toolCalls: AgentRuntimeToolCall[];
};

export type AgentRunResponse = {
  session: AgentRuntimeSession;
  run: AgentRuntimeRun | null;
  messages: AgentRuntimeMessage[];
  artifacts: Record<string, unknown>;
  context: unknown;
};

export type ResultNarration = {
  summary?: string;
  highlights?: string[];
  caveats?: string[];
};

export type AgentSqlResult = {
  success?: boolean;
  traceId?: string;
  sql?: string;
  fields?: string[];
  rows?: unknown[][];
  rowCount?: number;
  truncated?: boolean;
  warnings?: string[];
  error?: string;
  message?: string;
  analysis?: ResultNarration | null;
  clarificationQuestions?: string[];
  template?: {
    id?: string;
    name?: string;
    intent?: string;
    module?: string;
    score?: number;
  };
  financeScope?: {
    mode?: string;
    metricNames?: string[];
    disclaimer?: string;
    references?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};
