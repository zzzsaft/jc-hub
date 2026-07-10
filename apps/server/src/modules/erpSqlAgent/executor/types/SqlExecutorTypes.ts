import type { ErpSqlQueryOptions, ErpSqlQueryResult } from "../../query/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { ErpSqlAccessAuditReason, ErpSqlAccessScope } from "../../access/index.js";

export type SqlExecutorQueryClient = {
  query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult>;
};

export type SqlExecutorOptions = {
  maxRows?: number;
  accessScope?: ErpSqlAccessScope;
  module?: string;
  signal?: AbortSignal;
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
  auditReasons?: ErpSqlAccessAuditReason[];
  error?: string;
  generation: SqlGenerationResult;
  audit?: {
    renderedSqlHash?: string;
    templateId?: string;
    bindingParams?: Record<string, unknown>;
  };
};
