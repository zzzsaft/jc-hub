import type { ErpSqlQueryOptions, ErpSqlQueryResult } from "../../query/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { ErpSqlAccessAuditReason, ErpSqlAccessScope } from "../../access/index.js";
import type { FinanceSqlMode, SqlGuardReferenceHint } from "../../sqlGuard/index.js";

export type SqlExecutorQueryClient = {
  query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult>;
};

export type SqlExecutorOptions = {
  maxRows?: number;
  accessScope?: ErpSqlAccessScope;
  module?: string;
  /** Preserves the finance evidence used to validate generated SQL after access-scope rewriting. */
  references?: SqlGuardReferenceHint[];
  financeMode?: FinanceSqlMode;
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
