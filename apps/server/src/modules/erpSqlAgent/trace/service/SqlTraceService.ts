import { randomUUID } from "node:crypto";
import { auditHash, classifyError, classifyFields, protectAuditValue, protectError, rawAuditPayloadsEnabled } from "../../../../ai/audit/dataProtection.js";
import { sqlTraceRepository } from "../repository/SqlTraceRepository.js";
import { diagnoseSqlFailure } from "../diagnostics.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type {
  SqlTraceContext,
  SqlTraceStartOptions,
  SqlTraceRepository,
  SqlTraceRepositoryUpdateInput,
  SqlTraceStage,
  SqlTraceStatus,
  SqlTraceWriter,
} from "../types/SqlTraceTypes.js";

export class SqlTraceService implements SqlTraceWriter {
  constructor(private readonly repository: SqlTraceRepository = sqlTraceRepository) {}

  async start(question: string, options: SqlTraceStartOptions = {}): Promise<SqlTraceContext> {
    const context: SqlTraceContext = {
      traceId: randomUUID(),
      question,
      startedAt: Date.now(),
      enabled: process.env.NODE_ENV === "production" || process.env.ERP_SQL_AGENT_TRACE_ENABLED === "true",
      warnings: [],
      auditDegraded: false,
      pendingUpdate: {},
      finalized: false,
      sessionId: options.sessionId,
      runId: options.runId,
      ownerUserId: options.ownerUserId,
      rolloutMode: options.rolloutMode,
      accessScope: options.accessScope,
    };
    if (!context.enabled) return context;
    await this.safe(context, () => this.repository.create({
      traceId: context.traceId,
      question: rawAuditPayloadsEnabled() ? question : `[protected sha256:${auditHash(question)}]`,
      questionHash: auditHash(question),
      status: "running",
      warnings: [],
      sessionId: options.sessionId,
      runId: options.runId,
      ownerUserId: options.ownerUserId,
      rolloutMode: options.rolloutMode,
      auditJson: {
        actor: options.ownerUserId ?? "anonymous",
        sessionId: options.sessionId ?? null,
        runId: options.runId ?? null,
        traceId: context.traceId,
        permissionPolicy: "agent.erp-sql:query",
        permissionScope: options.accessScope ? {
          companies: options.accessScope.companies,
          modules: options.accessScope.modules,
          departments: options.accessScope.departments,
          businessUnits: options.accessScope.businessUnits,
          customerNumbers: options.accessScope.customerNumbers === "*" ? "*" : { count: options.accessScope.customerNumbers.length },
          sensitive: options.accessScope.sensitive,
        } : { rolloutMode: options.rolloutMode ?? "default" },
        schemaSnapshotVersion: process.env.ERP_SQL_SCHEMA_SNAPSHOT_VERSION ?? "unknown",
        auditVersion: 1,
      },
    }));
    return context;
  }

  async recordPlan(context: SqlTraceContext, plan: QueryPlan): Promise<void> {
    mergePending(context, {
      plan: protectAuditValue(plan, "plan") as QueryPlan,
      auditJson: { templateFamily: plan.modules?.map((item) => item.module) ?? [] },
    });
  }

  async recordGeneration(context: SqlTraceContext, generation: SqlGenerationResult): Promise<void> {
    const candidateSql = generation.candidateSql ?? generation.sql;
    mergePending(context, {
      generation: protectAuditValue(generation, "generation") as SqlGenerationResult,
      guard: protectAuditValue(generation.guardResult, "guard") as SqlGenerationResult["guardResult"],
      sqlText: rawAuditPayloadsEnabled() ? candidateSql : undefined,
      sqlHash: auditHash(candidateSql),
      warnings: generation.warnings,
      assumptions: generation.assumptions,
      auditJson: {
        templateFamily: [...new Set(generation.references?.map((item) => item.familyId).filter(Boolean) ?? [])],
        metrics: generation.references?.filter((item) => item.sourceType === "metric").map((item) => ({ code: item.metricCode, version: readVersion(item.definitionJson) })) ?? [],
        guardConclusion: generation.guardResult.valid ? "passed" : "rejected",
        semanticConclusion: generation.semanticResult?.status ?? (generation.valid ? "passed" : "rejected"),
        expectedFamilies: generation.semanticResult?.expectedFamilyIds ?? [],
        actualFamilies: generation.semanticResult?.actualFamilyIds ?? [],
        expectedMetrics: generation.semanticResult?.expectedMetricCodes ?? [],
        actualMetrics: generation.semanticResult?.actualMetricCodes ?? [],
      },
    });
  }

  async recordExecution(context: SqlTraceContext, execution: SqlExecutionResult, elapsedMs?: number): Promise<void> {
    mergePending(context, {
      execution: {
        valid: execution.valid,
        executed: execution.executed,
        sqlHash: execution.audit?.renderedSqlHash ?? auditHash(execution.sql),
        fields: execution.fields,
        rowCount: execution.rowCount,
        truncated: execution.truncated,
        warnings: protectAuditValue(execution.warnings, "warnings") as string[],
        error: execution.error ? protectError(execution.error).message : undefined,
        errorCategory: execution.error ? classifyError(execution.error) : undefined,
        elapsedMs,
        fieldCategories: classifyFields(execution.fields),
        bindings: execution.audit?.bindingParams,
      },
      sqlHash: execution.audit?.renderedSqlHash ?? auditHash(execution.sql),
      rowCount: execution.rowCount,
      elapsedMs,
      warnings: execution.warnings,
      auditJson: {
        executionStatus: execution.executed ? (execution.valid ? "success" : "failed") : "not_executed",
        rowCount: execution.rowCount,
        truncated: execution.truncated,
        fieldCategories: classifyFields(execution.fields),
        templateId: execution.audit?.templateId ?? null,
        accessConclusions: execution.auditReasons ?? [],
      },
    });
  }

  async recordFailure(context: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void> {
    const status = classifyError(error) === "cancelled" ? "cancelled" : "failed";
    const diagnostic = diagnoseSqlFailure(stage, error);
    await this.flushTerminal(context, {
      status,
      elapsedMs: Date.now() - context.startedAt,
      errorMessage: `${stage}: ${protectError(error).message}`,
      warnings: context.warnings,
      auditDegraded: context.auditDegraded,
      auditJson: {
        terminalStage: stage,
        errorCategory: classifyError(error),
        terminalStatus: status,
        diagnostic,
        completedAt: new Date().toISOString(),
      },
    });
  }

  async finish(context: SqlTraceContext, status: SqlTraceStatus): Promise<void> {
    await this.flushTerminal(context, {
      status,
      elapsedMs: Date.now() - context.startedAt,
      warnings: context.warnings,
      auditDegraded: context.auditDegraded,
      auditJson: { terminalStatus: status, completedAt: new Date().toISOString() },
    });
  }

  private async flushTerminal(context: SqlTraceContext, terminal: SqlTraceRepositoryUpdateInput): Promise<void> {
    if (!context.enabled || context.finalized) return;
    mergePending(context, terminal);
    const written = await this.safe(context, () => this.repository.update(context.traceId, context.pendingUpdate!));
    if (written) {
      context.finalized = true;
      context.pendingUpdate = {};
    }
  }

  private async safe(context: SqlTraceContext, write: () => Promise<void>): Promise<boolean> {
    if (!context.enabled) return false;
    try {
      await write();
      return true;
    } catch (error) {
      context.auditDegraded = true;
      context.warnings.push(`AUDIT_DEGRADED: SQL trace write failed: ${protectError(error).message}`);
      return false;
    }
  }
}

function mergePending(context: SqlTraceContext, update: SqlTraceRepositoryUpdateInput): void {
  context.pendingUpdate = {
    ...(context.pendingUpdate ?? {}),
    ...update,
    auditJson: {
      ...(context.pendingUpdate?.auditJson ?? {}),
      ...(update.auditJson ?? {}),
    },
  };
}

function readVersion(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).version ?? (value as Record<string, unknown>).metricVersion ?? "unknown"
    : "unknown";
}

export const sqlTraceService = new SqlTraceService();
