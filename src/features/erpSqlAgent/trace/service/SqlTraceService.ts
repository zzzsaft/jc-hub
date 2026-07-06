import { randomUUID } from "node:crypto";
import { sqlTraceRepository } from "../repository/SqlTraceRepository.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type {
  SqlTraceContext,
  SqlTraceRepository,
  SqlTraceStage,
  SqlTraceStatus,
  SqlTraceWriter,
} from "../types/SqlTraceTypes.js";

export class SqlTraceService implements SqlTraceWriter {
  constructor(private readonly repository: SqlTraceRepository = sqlTraceRepository) {}

  async start(question: string): Promise<SqlTraceContext> {
    const context: SqlTraceContext = {
      traceId: randomUUID(),
      question,
      startedAt: Date.now(),
      enabled: process.env.ERP_SQL_AGENT_TRACE_ENABLED === "true",
      warnings: [],
    };
    if (!context.enabled) return context;
    await this.safe(context, () => this.repository.create({
      traceId: context.traceId,
      question,
      status: "running",
      warnings: [],
    }));
    return context;
  }

  async recordPlan(context: SqlTraceContext, plan: QueryPlan): Promise<void> {
    await this.safe(context, () => this.repository.update(context.traceId, { plan }));
  }

  async recordGeneration(context: SqlTraceContext, generation: SqlGenerationResult): Promise<void> {
    await this.safe(context, () => this.repository.update(context.traceId, {
      generation,
      guard: generation.guardResult,
      sqlText: generation.sql,
      warnings: generation.warnings,
      assumptions: generation.assumptions,
    }));
  }

  async recordExecution(context: SqlTraceContext, execution: SqlExecutionResult, elapsedMs?: number): Promise<void> {
    await this.safe(context, () => this.repository.update(context.traceId, {
      execution: {
        valid: execution.valid,
        executed: execution.executed,
        sql: execution.sql,
        fields: execution.fields,
        rowCount: execution.rowCount,
        truncated: execution.truncated,
        warnings: execution.warnings,
        error: execution.error,
        elapsedMs,
        previewRows: execution.rows.slice(0, 5),
      },
      rowCount: execution.rowCount,
      elapsedMs,
      warnings: execution.warnings,
    }));
  }

  async recordFailure(context: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void> {
    await this.safe(context, () => this.repository.update(context.traceId, {
      status: "failed",
      errorMessage: `${stage}: ${errorMessage(error)}`,
      warnings: context.warnings,
    }));
  }

  async finish(context: SqlTraceContext, status: SqlTraceStatus): Promise<void> {
    await this.safe(context, () => this.repository.update(context.traceId, {
      status,
      elapsedMs: Date.now() - context.startedAt,
      warnings: context.warnings,
    }));
  }

  private async safe(context: SqlTraceContext, write: () => Promise<void>): Promise<void> {
    if (!context.enabled) return;
    try {
      await write();
    } catch (error) {
      context.warnings.push(`SQL trace write failed: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const sqlTraceService = new SqlTraceService();
