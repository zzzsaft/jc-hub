import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult, SqlGeneratorPlan } from "../../generator/index.js";
import type { ErpSqlIntent, ErpSqlIntentExtractor } from "../../intent/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type { SqlTraceWriter } from "../../trace/index.js";
import type { ErpSqlAccessScope } from "../../access/index.js";

export type ErpSqlAgentPlanner = {
  plan(question: string, intent?: ErpSqlIntent, signal?: AbortSignal): Promise<QueryPlan>;
};

export type ErpSqlAgentGenerator = {
  generate(plan: SqlGeneratorPlan, signal?: AbortSignal): Promise<SqlGenerationResult>;
};

export type ErpSqlAgentExecutor = {
  execute(generation: SqlGenerationResult, options?: { maxRows?: number; accessScope?: ErpSqlAccessScope; module?: string; signal?: AbortSignal }): Promise<SqlExecutionResult>;
};

export type ErpSqlCustomerCandidate = {
  customerName: string;
  shortName?: string | null;
  customerCode?: string | null;
};

export type ErpSqlCustomerNameResolution =
  | string
  | {
      status: "ambiguous";
      keyword: string;
      candidates: ErpSqlCustomerCandidate[];
    };

export type ErpSqlCustomerNameResolver = (value: string) => Promise<ErpSqlCustomerNameResolution | undefined>;

export type ErpSqlCustomerClarification = {
  status: "pending";
  keyword: string;
  originalQuestion: string;
  candidates: ErpSqlCustomerCandidate[];
};

export type { ErpSqlIntentExtractor };
export type { SqlTraceWriter };

export type ErpSqlAgentResult = {
  success: boolean;
  traceId: string;
  question: string;
  intent?: ErpSqlIntent;
  sql: string;
  plan: QueryPlan;
  generation: SqlGenerationResult;
  execution: SqlExecutionResult | null;
  warnings: string[];
  assumptions: string[];
  error?: string;
  customerClarification?: ErpSqlCustomerClarification;
  template?: {
    id: string;
    name: string;
    intent: string;
    module: string;
    score: number;
  };
};

export type ErpSqlAgentAskOptions = {
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  accessScope?: ErpSqlAccessScope;
  signal?: AbortSignal;
};
