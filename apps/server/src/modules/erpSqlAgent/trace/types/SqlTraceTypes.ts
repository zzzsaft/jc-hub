import type { QueryPlan } from "../../planner/index.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";

export type SqlTraceStatus = "running" | "success" | "failed";
export type SqlTraceStage = "intent" | "planner" | "generator" | "guard" | "executor" | "unknown";

export type SqlTraceContext = {
  traceId: string;
  question: string;
  startedAt: number;
  enabled: boolean;
  warnings: string[];
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  rolloutMode?: string;
};

export type SqlTraceStartOptions = {
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  rolloutMode?: string;
};

export type SqlTraceExecutionSnapshot = {
  valid: boolean;
  executed: boolean;
  sql: string;
  fields: string[];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  error?: string;
  elapsedMs?: number;
  previewRows?: unknown[][];
};

export type SqlTraceRepositoryCreateInput = {
  traceId: string;
  question: string;
  status: SqlTraceStatus;
  warnings: string[];
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  rolloutMode?: string;
};

export type SqlTraceRepositoryUpdateInput = {
  status?: SqlTraceStatus;
  plan?: QueryPlan;
  generation?: SqlGenerationResult;
  sqlText?: string;
  guard?: SqlGenerationResult["guardResult"];
  execution?: SqlTraceExecutionSnapshot;
  rowCount?: number;
  elapsedMs?: number;
  errorMessage?: string;
  warnings?: string[];
  assumptions?: string[];
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  rolloutMode?: string;
};

export type SqlTraceRepository = {
  create(input: SqlTraceRepositoryCreateInput): Promise<void>;
  update(traceId: string, input: SqlTraceRepositoryUpdateInput): Promise<void>;
};

export type SqlTraceWriter = {
  start(question: string, options?: SqlTraceStartOptions): Promise<SqlTraceContext>;
  recordPlan(context: SqlTraceContext, plan: QueryPlan): Promise<void>;
  recordGeneration(context: SqlTraceContext, generation: SqlGenerationResult): Promise<void>;
  recordExecution(context: SqlTraceContext, execution: SqlExecutionResult, elapsedMs?: number): Promise<void>;
  recordFailure(context: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void>;
  finish(context: SqlTraceContext, status: SqlTraceStatus): Promise<void>;
};
