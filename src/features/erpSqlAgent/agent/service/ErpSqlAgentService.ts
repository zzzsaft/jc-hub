import { sqlExecutorService } from "../../executor/index.js";
import { sqlGeneratorService } from "../../generator/index.js";
import { deepSeekIntentExtractor } from "../../intent/index.js";
import { sqlPlannerService } from "../../planner/index.js";
import { SqlExecutionResultSchema } from "../../schemas/index.js";
import { sqlTraceService } from "../../trace/index.js";
import type { SqlTraceContext, SqlTraceStage } from "../../trace/index.js";
import type {
  ErpSqlAgentExecutor,
  ErpSqlAgentGenerator,
  ErpSqlAgentPlanner,
  ErpSqlAgentResult,
  ErpSqlIntentExtractor,
  SqlTraceWriter,
} from "../types/ErpSqlAgentTypes.js";

export class ErpSqlAgentService {
  constructor(
    private readonly planner: ErpSqlAgentPlanner = sqlPlannerService,
    private readonly generator: ErpSqlAgentGenerator = sqlGeneratorService,
    private readonly executor: ErpSqlAgentExecutor = sqlExecutorService,
    private readonly intentExtractor?: ErpSqlIntentExtractor,
    private readonly traceService: SqlTraceWriter = sqlTraceService,
  ) {}

  async ask(question: string): Promise<ErpSqlAgentResult> {
    const trace = await this.startTrace(question);
    let intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>;
    try {
      intentResult = await this.extractIntent(question);
    } catch (error) {
      await this.recordFailure(trace, "intent", error);
      throw error;
    }

    let plan: Awaited<ReturnType<ErpSqlAgentPlanner["plan"]>>;
    try {
      plan = await this.planner.plan(question, intentResult.intent);
      await this.recordTrace(trace, () => this.traceService.recordPlan(trace, plan));
    } catch (error) {
      await this.recordFailure(trace, "planner", error);
      throw error;
    }

    let generation: Awaited<ReturnType<ErpSqlAgentGenerator["generate"]>>;
    try {
      generation = await this.generator.generate(plan);
      await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
    } catch (error) {
      await this.recordFailure(trace, "generator", error);
      throw error;
    }

    if (!generation.valid) {
      const error = generation.guardResult.errors.join("; ") || "SQL generation is invalid.";
      await this.recordFailure(trace, "generator", error);
      await this.finishTrace(trace, "failed");
      return {
        success: false,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution: null,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, trace.warnings),
        assumptions: generation.assumptions,
        error,
      };
    }

    const executionStart = Date.now();
    let execution: Awaited<ReturnType<ErpSqlAgentExecutor["execute"]>>;
    try {
      execution = await this.executor.execute(generation);
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution, Date.now() - executionStart));
    } catch (error) {
      await this.recordFailure(trace, "executor", error);
      throw error;
    }

    const parsedExecution = SqlExecutionResultSchema.safeParse(execution);
    if (!parsedExecution.success) {
      const error = `SQL execution result schema validation failed: ${formatSchemaIssues(parsedExecution.error.issues)}`;
      await this.recordFailure(trace, "executor", error);
      await this.finishTrace(trace, "failed");
      return {
        success: false,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution: null,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, [error], trace.warnings),
        assumptions: generation.assumptions,
        error,
      };
    }

    const success = parsedExecution.data.valid && parsedExecution.data.executed;
    if (!success) {
      await this.recordFailure(trace, "executor", parsedExecution.data.error ?? "SQL execution failed.");
    }
    await this.finishTrace(trace, success ? "success" : "failed");

    return {
      success,
      traceId: trace.traceId,
      question: plan.question,
      intent: intentResult.intent,
      sql: generation.sql,
      plan,
      generation,
      execution: parsedExecution.data,
      warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, parsedExecution.data.warnings, trace.warnings),
      assumptions: generation.assumptions,
      error: parsedExecution.data.error,
    };
  }

  private async startTrace(question: string): Promise<SqlTraceContext> {
    try {
      return await this.traceService.start(question);
    } catch (error) {
      return {
        traceId: "trace-start-failed",
        question,
        startedAt: Date.now(),
        enabled: false,
        warnings: [`SQL trace write failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private async recordTrace(trace: SqlTraceContext, write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      trace.warnings.push(`SQL trace write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async recordFailure(trace: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void> {
    await this.recordTrace(trace, () => this.traceService.recordFailure(trace, stage, error));
  }

  private async finishTrace(trace: SqlTraceContext, status: "success" | "failed"): Promise<void> {
    await this.recordTrace(trace, () => this.traceService.finish(trace, status));
  }

  private async extractIntent(question: string): Promise<{
    intent?: Awaited<ReturnType<ErpSqlIntentExtractor["extract"]>>;
    warnings: string[];
  }> {
    if (!this.intentExtractor) return { warnings: [] };
    try {
      return { intent: await this.intentExtractor.extract(question), warnings: [] };
    } catch (error) {
      return {
        warnings: [`Intent extraction failed; falling back to rule planner: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

function merge(...items: string[][]): string[] {
  return [...new Set(items.flat())];
}

function formatSchemaIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

function createDefaultIntentExtractor(): ErpSqlIntentExtractor | undefined {
  return process.env.ERP_SQL_AGENT_INTENT_ENABLED === "false" ? undefined : deepSeekIntentExtractor;
}

export const erpSqlAgentService = new ErpSqlAgentService(
  sqlPlannerService,
  sqlGeneratorService,
  sqlExecutorService,
  createDefaultIntentExtractor(),
  sqlTraceService,
);
