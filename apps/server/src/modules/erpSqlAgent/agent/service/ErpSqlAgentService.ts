import { sqlExecutorService } from "../../executor/index.js";
import { sqlGeneratorService, type SqlReferenceHint } from "../../generator/index.js";
import { deepSeekIntentExtractor } from "../../intent/index.js";
import { sqlPlannerService } from "../../planner/index.js";
import { SqlExecutionResultSchema } from "../../schemas/index.js";
import { sqlTemplateExecutionService } from "../../templates/service/SqlTemplateExecutionService.js";
import {
  sqlTemplateRepository,
  type ApprovedMetricCandidate,
  type DatasetReferenceCandidate,
  type ExecutableTemplateCandidate,
  type ReferenceFamilyCandidate,
} from "../../templates/repository/SqlTemplateRepository.js";
import { sqlTraceService } from "../../trace/index.js";
import type { SqlTraceContext, SqlTraceStage } from "../../trace/index.js";
import type { ErpSqlQueryValue } from "../../query/index.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type {
  ErpSqlAgentExecutor,
  ErpSqlAgentAskOptions,
  ErpSqlAgentGenerator,
  ErpSqlAgentPlanner,
  ErpSqlAgentResult,
  ErpSqlIntentExtractor,
  SqlTraceWriter,
} from "../types/ErpSqlAgentTypes.js";

type TemplateCandidateRepository = Pick<
  typeof sqlTemplateRepository,
  "findExecutableCandidates" | "findDatasetReferenceCandidates" | "findReferenceCandidates" | "findApprovedMetricCandidates"
>;
type TemplateExecutor = Pick<typeof sqlTemplateExecutionService, "execute">;

const TEMPLATE_MATCH_THRESHOLD = 0.4;
const GENERATED_SQL_ROLLOUT_MODE = "generated_sql_observe";

export class ErpSqlAgentService {
  constructor(
    private readonly planner: ErpSqlAgentPlanner = sqlPlannerService,
    private readonly generator: ErpSqlAgentGenerator = sqlGeneratorService,
    private readonly executor: ErpSqlAgentExecutor = sqlExecutorService,
    private readonly intentExtractor?: ErpSqlIntentExtractor,
    private readonly traceService: SqlTraceWriter = sqlTraceService,
    private readonly templateRepository: TemplateCandidateRepository = sqlTemplateRepository,
    private readonly templateExecutor: TemplateExecutor = sqlTemplateExecutionService,
  ) {}

  async ask(question: string, options: ErpSqlAgentAskOptions = {}): Promise<ErpSqlAgentResult> {
    const trace = await this.startTrace(question, options);
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

    const templateResult = await this.tryTemplateExecution(trace, plan, intentResult);
    if (templateResult) return templateResult;

    let generation: Awaited<ReturnType<ErpSqlAgentGenerator["generate"]>>;
    try {
      const references = await this.findReferences(plan, intentResult);
      if (isFinancePlan(plan, intentResult) && references.length === 0) {
        const error = "Finance SQL requires an approved business metric or approved SQL template.";
        generation = blockedGeneration(plan, error);
        await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
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
      generation = await this.generator.generate(references.length > 0 ? { ...plan, references } : plan);
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

    if (!shouldExecuteGeneratedSql()) {
      const execution = skippedExecution(generation);
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution));
      await this.finishTrace(trace, "success");
      return {
        success: true,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, execution.warnings, trace.warnings),
        assumptions: generation.assumptions,
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

  private async startTrace(question: string, options: ErpSqlAgentAskOptions): Promise<SqlTraceContext> {
    try {
      return await this.traceService.start(question, {
        ...options,
        rolloutMode: currentRolloutMode(),
      });
    } catch (error) {
      return {
        traceId: "trace-start-failed",
        question,
        startedAt: Date.now(),
        enabled: false,
        warnings: [`SQL trace write failed: ${error instanceof Error ? error.message : String(error)}`],
        sessionId: options.sessionId,
        runId: options.runId,
        ownerUserId: options.ownerUserId,
        rolloutMode: currentRolloutMode(),
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

  private async tryTemplateExecution(
    trace: SqlTraceContext,
    plan: QueryPlan,
    intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
  ): Promise<ErpSqlAgentResult | undefined> {
    const slots = slotsFromIntent(intentResult.intent);
    let candidates: ExecutableTemplateCandidate[];
    try {
      candidates = await this.templateRepository.findExecutableCandidates({
        question: plan.question,
        intent: intentResult.intent?.intentType,
        module: intentResult.intent?.module,
        slots,
        limit: 3,
      });
    } catch {
      return undefined;
    }
    for (const candidate of candidates) {
      if (candidate.score < TEMPLATE_MATCH_THRESHOLD) continue;
      const params = bindTemplateParams(candidate, slots);
      if (!params) continue;
      const generation = generationFromTemplate(candidate);
      await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
      const executionStart = Date.now();
      const templateExecution = await this.templateExecutor.execute({
        templateId: candidate.id,
        params,
        maxRows: intentResult.intent?.limit,
      });
      const execution: SqlExecutionResult = { ...templateExecution, generation };
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution, Date.now() - executionStart));
      const success = execution.valid && execution.executed;
      if (!success) await this.recordFailure(trace, "executor", execution.error ?? "SQL template execution failed.");
      await this.finishTrace(trace, success ? "success" : "failed");
      return {
        success,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, execution.warnings, trace.warnings),
        assumptions: generation.assumptions,
        error: execution.error,
        template: {
          id: candidate.id.toString(),
          name: candidate.name,
          intent: candidate.intent,
          module: candidate.module,
          score: candidate.score,
        },
      };
    }
    return undefined;
  }

  private async findReferences(
    plan: QueryPlan,
    intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
  ): Promise<SqlReferenceHint[]> {
    try {
      const common = {
        question: plan.question,
        intent: intentResult.intent?.intentType ?? plan.intent,
        module: isFinancePlan(plan, intentResult) ? "finance" : intentResult.intent?.module ?? plan.modules[0]?.module,
      };
      if (common.module === "finance") {
        const metrics = await this.templateRepository.findApprovedMetricCandidates({ ...common, limit: 3 });
        return metrics.map(mapMetricReference);
      }
      const datasets = await this.templateRepository.findDatasetReferenceCandidates({ ...common, limit: 10 });
      const families = await this.templateRepository.findReferenceCandidates({ ...common, limit: 3 });
      return [...datasets.map(mapDatasetReference), ...families.map(mapFamilyReference)];
    } catch {
      return [];
    }
  }
}

function mapMetricReference(reference: ApprovedMetricCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    metricCode: reference.metricCode,
    metricName: reference.metricName,
    businessDescription: reference.businessDescription,
    calculationSummary: reference.calculationSummary,
    definitionJson: reference.definitionJson,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    sourceType: "metric",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function mapDatasetReference(reference: DatasetReferenceCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    datasetId: reference.datasetId,
    reportName: reference.reportName,
    datasetName: reference.datasetName,
    fields: reference.fields,
    metrics: reference.metrics,
    questionText: reference.questionText,
    timeScope: reference.timeScope,
    businessScenario: reference.businessScenario,
    isFinance: reference.isFinance,
    verified: reference.verified,
    sqlPreview: reference.exampleSql,
    sourceType: "dataset",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function mapFamilyReference(reference: ReferenceFamilyCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    sourceType: "family",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function isFinancePlan(
  plan: QueryPlan,
  intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
): boolean {
  return intentResult.intent?.module === "finance" || plan.modules.some((module) => module.module === "finance");
}

function blockedGeneration(plan: QueryPlan, error: string): SqlGenerationResult {
  return {
    valid: false,
    source: "llm",
    scenario: "financeMetricRequired",
    sql: "",
    intent: plan.intent,
    tables: [],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: {
      valid: false,
      errors: [error],
      warnings: [],
      normalizedSql: "",
      referencedTables: [],
      referencedFields: [],
    },
  };
}

function skippedExecution(generation: SqlGenerationResult): SqlExecutionResult {
  return {
    valid: true,
    executed: false,
    sql: generation.sql,
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [...generation.warnings, "Generated SQL was not executed because ERP_SQL_AGENT_EXECUTE_GENERATED_SQL is not true."],
    generation,
  };
}

function slotsFromIntent(intent: Awaited<ReturnType<ErpSqlIntentExtractor["extract"]>> | undefined): Record<string, ErpSqlQueryValue> {
  if (!intent) return {};
  const slots: Record<string, ErpSqlQueryValue> = {};
  for (const [key, value] of Object.entries(intent.entities)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") slots[key] = value;
  }
  if (intent.dateRange?.to) slots.dueBeforeDate = intent.dateRange.to;
  if (intent.dateRange?.from) slots.fromDate = intent.dateRange.from;
  if (intent.dateRange?.relativeDays) slots.relativeDays = intent.dateRange.relativeDays;
  return slots;
}

function bindTemplateParams(
  template: ExecutableTemplateCandidate,
  slots: Record<string, ErpSqlQueryValue>,
): Record<string, ErpSqlQueryValue> | undefined {
  const required = readParamNames(template.requiredParams);
  if (required.some((name) => slots[name] === undefined || slots[name] === null || slots[name] === "")) return undefined;
  const names = new Set([...required, ...readParamNames(template.optionalParams)]);
  return Object.fromEntries([...names].filter((name) => slots[name] !== undefined).map((name) => [name, slots[name]]));
}

function readParamNames(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function generationFromTemplate(template: ExecutableTemplateCandidate): SqlGenerationResult {
  return {
    valid: true,
    source: "template",
    scenario: "template",
    sql: template.sqlTemplate,
    intent: template.intent,
    tables: readStringArray(template.tables),
    joins: readStringArray(template.joins),
    filters: [],
    assumptions: [`Executed approved SQL template ${template.id.toString()}.`],
    warnings: [],
    guardResult: {
      valid: true,
      errors: [],
      warnings: [],
      normalizedSql: template.sqlTemplate,
      referencedTables: readStringArray(template.tables),
      referencedFields: readStringArray(template.fields),
    },
    references: [{
      familyId: String(template.sourceFamilyId ?? template.sourceDatasetId ?? template.id),
      businessDescription: template.name,
      coreTables: readStringArray(template.tables),
      joins: readStringArray(template.joins),
      exampleSql: template.sqlTemplate,
      sourceType: "template",
      score: template.score,
      matchedSignals: template.matchedSignals,
    }],
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function shouldExecuteGeneratedSql(): boolean {
  return process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL === "true";
}

function currentRolloutMode(): string {
  return shouldExecuteGeneratedSql() ? "generated_sql_execute" : GENERATED_SQL_ROLLOUT_MODE;
}

export const erpSqlAgentService = new ErpSqlAgentService(
  sqlPlannerService,
  sqlGeneratorService,
  sqlExecutorService,
  createDefaultIntentExtractor(),
  sqlTraceService,
);
