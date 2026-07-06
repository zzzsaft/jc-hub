import type { ErpSqlQueryOptions, ErpSqlQueryResult } from "../../query/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";

export type SqlExecutorQueryClient = {
  query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult>;
};

export type SqlExecutorOptions = {
  maxRows?: number;
};

export type SqlExecutionResult = {
  valid: boolean;
  executed: boolean;
  sql: string;
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  error?: string;
  generation: SqlGenerationResult;
};
