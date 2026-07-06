import { getErpSqlQueryClient } from "../../query/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type {
  SqlExecutionResult,
  SqlExecutorOptions,
  SqlExecutorQueryClient,
} from "../types/SqlExecutorTypes.js";

const DEFAULT_MAX_ROWS = 100;

export class SqlExecutorService {
  constructor(private readonly queryClient?: SqlExecutorQueryClient) {}

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
      const result = await (this.queryClient ?? getErpSqlQueryClient()).query({
        sql: generation.sql,
        maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
      });
      return {
        valid: true,
        executed: true,
        sql: generation.sql,
        fields: result.fields,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        warnings: generation.warnings,
        generation,
      };
    } catch (error) {
      return emptyResult({
        valid: false,
        executed: false,
        generation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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

export const sqlExecutorService = new SqlExecutorService();
