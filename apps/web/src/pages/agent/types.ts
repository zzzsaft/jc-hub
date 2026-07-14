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

export type AgentRunStreamEvent =
  | { type: "run-start"; session: AgentRuntimeSession; run: AgentRuntimeRun }
  | { type: "tool-start"; runId: string; stepId: string; toolName: string }
  | { type: "tool-finish"; runId: string; stepId: string; toolName: string; status: "success" | "failed"; durationMs: number }
  | { type: "complete"; session: AgentRuntimeSession; run: AgentRuntimeRun | null; messages: AgentRuntimeMessage[]; artifacts: Record<string, unknown>; context: unknown };

export type ResultNarration = {
  summary?: string;
  highlights?: string[];
  caveats?: string[];
};

export type AgentResultColumn = {
  key: string;
  label: string;
  dataType: "text" | "money" | "percent" | "date" | "integer";
  format: {
    decimals?: number;
    percent?: boolean;
    currencyUnit?: string;
  };
  role: "dimension" | "metric" | "technical";
  inlineVisible: boolean;
};

export type AgentComplexAnalysis = {
  scenario: string;
  status: "completed" | "partial" | "failed";
  steps: Array<{
    id: string;
    label: string;
    status: "completed" | "partial" | "clarification_required" | "unsupported" | "failed" | "skipped";
    source?: "template" | "composer" | "llm";
    sqlCount: number;
    rowCount: number;
    error?: string;
  }>;
  joinCoverage: Array<{
    stepId: string;
    keys: string[];
    anchorRows: number;
    matchedRows: number;
    unmatchedRows: number;
    coverageRate: number;
  }>;
  corrections: Array<{ field: string; before: unknown; after: unknown; sourceText: string }>;
  review?: { status: "approved" | "revised" | "rejected"; issues: string[] };
};

export type AgentSqlResult = {
  success?: boolean;
  traceId?: string;
  sql?: string;
  fields?: string[];
  columns?: AgentResultColumn[];
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
  scope?: {
    capability: string;
    metrics: string[];
    dimensions: string[];
    filters: Record<string, string>;
    timeRange?: Record<string, unknown>;
    comparison?: Record<string, unknown>;
    templateCoverage: string[];
  };
  complexAnalysis?: AgentComplexAnalysis;
  [key: string]: unknown;
};
