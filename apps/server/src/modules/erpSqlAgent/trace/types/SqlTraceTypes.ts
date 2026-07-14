import type { QueryPlan } from "../../planner/index.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { ErpSqlAccessScope } from "../../access/index.js";

export type SqlTraceStatus = "running" | "success" | "failed" | "cancelled";
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
  accessScope?: ErpSqlAccessScope;
  auditDegraded: boolean;
  pendingUpdate?: SqlTraceRepositoryUpdateInput;
  finalized?: boolean;
};

export type SqlTraceStartOptions = {
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  rolloutMode?: string;
  accessScope?: ErpSqlAccessScope;
};

export type SqlTraceExecutionSnapshot = {
  valid: boolean;
  executed: boolean;
  sqlHash: string;
  fields: string[];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  error?: string;
  elapsedMs?: number;
  fieldCategories: string[];
  bindings?: Record<string, unknown>;
  errorCategory?: string;
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
  questionHash: string;
  auditJson: Record<string, unknown>;
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
  sqlHash?: string;
  auditDegraded?: boolean;
  auditJson?: Record<string, unknown>;
};

export type SqlTraceRepository = {
  create(input: SqlTraceRepositoryCreateInput): Promise<void>;
  update(traceId: string, input: SqlTraceRepositoryUpdateInput): Promise<void>;
};

export type SqlTraceWriter = {
  start(question: string, options?: SqlTraceStartOptions): Promise<SqlTraceContext>;
  recordPlan(context: SqlTraceContext, plan: QueryPlan): Promise<void>;
  recordGeneration(context: SqlTraceContext, generation: SqlGenerationResult, complexStepId?: string): Promise<void>;
  recordExecution(context: SqlTraceContext, execution: SqlExecutionResult, elapsedMs?: number, complexStepId?: string): Promise<void>;
  recordFailure(context: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void>;
  finish(context: SqlTraceContext, status: SqlTraceStatus): Promise<void>;
};
