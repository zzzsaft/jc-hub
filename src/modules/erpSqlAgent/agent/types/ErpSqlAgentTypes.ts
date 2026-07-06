import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { ErpSqlIntent, ErpSqlIntentExtractor } from "../../intent/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type { SqlTraceWriter } from "../../trace/index.js";

export type ErpSqlAgentPlanner = {
  plan(question: string, intent?: ErpSqlIntent): Promise<QueryPlan>;
};

export type ErpSqlAgentGenerator = {
  generate(plan: QueryPlan): Promise<SqlGenerationResult>;
};

export type ErpSqlAgentExecutor = {
  execute(generation: SqlGenerationResult): Promise<SqlExecutionResult>;
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
  template?: {
    id: string;
    name: string;
    intent: string;
    module: string;
    score: number;
  };
};
