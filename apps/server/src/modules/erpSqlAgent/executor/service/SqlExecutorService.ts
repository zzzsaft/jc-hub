import { getErpSqlQueryClient } from "../../query/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type {
  SqlExecutionResult,
  SqlExecutorOptions,
  SqlExecutorQueryClient,
} from "../types/SqlExecutorTypes.js";
import { applyErpSqlAccessScope, assertModuleAllowed, maskSensitiveResult } from "../../access/index.js";
import { isAbortError } from "../../../../lib/abort.js";
import { sqlGuardService, type SqlGuardOptions } from "../../sqlGuard/index.js";
import { auditHash } from "../../../../ai/audit/dataProtection.js";

const DEFAULT_MAX_ROWS = 100;

export class SqlExecutorService {
  constructor(
    private readonly queryClient?: SqlExecutorQueryClient,
    private readonly requireAccessScope = false,
    private readonly guard: Pick<typeof sqlGuardService, "validate"> = sqlGuardService,
  ) {}

  async execute(generation: SqlGenerationResult, options: SqlExecutorOptions = {}): Promise<SqlExecutionResult> {
    if (!generation.valid) {
      return emptyResult({
        valid: false,
        executed: false,
        generation,
        error: generation.guardResult.errors.join("; ") || "SQL generation is invalid.",
      });
    }

    try {
      if (this.requireAccessScope && !options.accessScope) throw new Error("ERP_SQL_ACCESS_DENIED: execution scope is required");
      if (options.accessScope) assertModuleAllowed(options.accessScope, [options.module ?? "custom"]);
      const sql = options.accessScope ? applyErpSqlAccessScope(generation.sql, options.accessScope) : generation.sql;
      if (options.accessScope) {
        const scopedGuard = await this.guard.validate(sql, scopedGuardOptions(options));
        if (!scopedGuard.valid) throw new Error(`ERP_SQL_ACCESS_DENIED: scoped SQL guard failed: ${scopedGuard.errors.join("; ")}`);
      }
      const result = await (this.queryClient ?? getErpSqlQueryClient()).query({
        sql,
        maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
        signal: options.signal,
      });
      const masked = options.accessScope
        ? maskSensitiveResult({ fields: result.fields, rows: result.rows, scope: options.accessScope })
        : { rows: result.rows, warnings: [], auditReasons: [] };
      return {
        valid: true,
        executed: true,
        sql: generation.sql,
        fields: result.fields,
        rows: masked.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        warnings: [...generation.warnings, ...masked.warnings],
        auditReasons: [...(options.accessScope?.auditReasons ?? []), ...masked.auditReasons],
        generation,
        audit: { renderedSqlHash: auditHash(sql) },
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return emptyResult({
        valid: false,
        executed: false,
        generation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function scopedGuardOptions(options: SqlExecutorOptions): SqlGuardOptions {
  return {
    module: options.module,
    references: options.references,
    financeMode: options.financeMode,
    signal: options.signal,
  };
}

function emptyResult(input: {
  valid: boolean;
  executed: boolean;
  generation: SqlGenerationResult;
  error?: string;
}): SqlExecutionResult {
  return {
    valid: input.valid,
    executed: input.executed,
    sql: input.generation.sql,
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: input.generation.warnings,
    error: input.error,
    generation: input.generation,
  };
}

export const sqlExecutorService = new SqlExecutorService(undefined, true);
