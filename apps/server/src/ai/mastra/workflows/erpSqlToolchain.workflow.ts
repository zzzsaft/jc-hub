import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type {
  AgentRuntimePlanStep,
  AgentRuntimeToolTraceFinish,
  AgentRuntimeToolTraceStart,
} from "../../agentRuntime/types.js";
import type { SqlExecutionResult } from "../../../modules/erpSqlAgent/executor/index.js";
import type { SqlGenerationResult, SqlReferenceHint } from "../../../modules/erpSqlAgent/generator/index.js";
import type { FinanceSqlMode } from "../../../modules/erpSqlAgent/sqlGuard/index.js";
import { SqlExecutionResultSchema } from "../../../modules/erpSqlAgent/schemas/index.js";
import {
  sqlTraceService,
  type SqlTraceContext,
  type SqlTraceStage,
} from "../../../modules/erpSqlAgent/trace/index.js";
import {
  ErpSqlAskInputSchema,
  type ErpSqlAskInput,
} from "../tools/erpSqlAsk.tool.js";
import {
  runExecuteSqlTemplateTool,
  runExecuteSqlTool,
  runAnalyzeSqlQuestionTool,
  runComposeApprovedCompositeMetricTool,
  runComposeAtomicMetricsTool,
  runExtractSqlIntentTool,
  runFindSqlReferenceTool,
  runFindSqlTemplateTool,
  runGenerateSqlTool,
  runNarrateSqlResultTool,
  runPlanSqlQueryTool,
  runValidateSqlTool,
  slotsFromIntent,
} from "../tools/erpSql/toolchain.tools.js";

const FinanceScopeSchema = z.object({
  mode: z.enum(["strict", "estimate"]),
  metricNames: z.array(z.string()),
  timeField: z.string().optional(),
  amountField: z.string().optional(),
  statusFilter: z.string().optional(),
  taxRefundPolicy: z.string().optional(),
  references: z.array(z.object({
    sourceType: z.string().optional(),
    familyId: z.string().optional(),
    metricCode: z.string().optional(),
    metricName: z.string().optional(),
    datasetId: z.string().optional(),
    reportName: z.string().optional(),
    score: z.number().optional(),
  })),
  disclaimer: z.string().optional(),
});

export const ErpSqlToolchainOutputSchema = z.object({
  success: z.boolean(),
  traceId: z.string(),
  sql: z.string(),
  fields: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  analysis: z
    .object({
      summary: z.string(),
      highlights: z.array(z.string()),
      caveats: z.array(z.string()),
    })
    .nullable(),
  message: z.string(),
  clarificationQuestions: z.array(z.string()).optional(),
  analysisPlan: z.unknown().optional(),
  template: z
    .object({
      id: z.string(),
      familyId: z.string(),
      name: z.string(),
      intent: z.string(),
      module: z.string(),
      score: z.number(),
    })
    .optional(),
  financeScope: FinanceScopeSchema.optional(),
});

export type ErpSqlToolchainOutput = z.infer<typeof ErpSqlToolchainOutputSchema>;

type TraceCallbacks = {
  onToolStart?: (event: AgentRuntimeToolTraceStart) => Promise<void>;
  onToolFinish?: (event: AgentRuntimeToolTraceFinish) => Promise<void>;
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  signal?: AbortSignal;
};

const erpSqlToolchainStep = createStep({
  id: "runErpSqlToolchain",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlToolchainOutputSchema,
  execute: async ({ inputData }) => runErpSqlToolchain(inputData),
});

export const erpSqlToolchainWorkflow = createWorkflow({
  id: "erpSqlToolchainWorkflow",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlToolchainOutputSchema,
})
  .then(erpSqlToolchainStep)
  .commit();

export async function runErpSqlToolchainWorkflow(
  input: ErpSqlAskInput,
  callbacks: TraceCallbacks = {}
): Promise<ErpSqlToolchainOutput> {
  return runErpSqlToolchain(input, callbacks);
}

async function runErpSqlToolchain(
  input: ErpSqlAskInput,
  callbacks: TraceCallbacks = {}
): Promise<ErpSqlToolchainOutput> {
  const trace = await startTrace(input.question, callbacks);
  const step = stepRunner(callbacks);
  let stage: SqlTraceStage = "intent";
  try {
    const intentResult = await step(
      "extract_sql_intent",
      "extractSqlIntent",
      { question: input.question },
      () => runExtractSqlIntentTool(input.question, callbacks.signal)
    );

    stage = "planner";
    const { plan } = await step(
      "plan_sql_query",
      "planSqlQuery",
      { question: input.question, intent: intentResult.intent ?? null },
      () => runPlanSqlQueryTool(input.question, intentResult.intent)
    );
    await recordTrace(trace, () => sqlTraceService.recordPlan(trace, plan));
    const analysisPlanResult = await step(
      "analyze_sql_question",
      "analyzeSqlQuestion",
      { question: input.question },
      () => runAnalyzeSqlQuestionTool(input.question, callbacks.signal)
    );
    if (analysisPlanResult.clarificationQuestions.length > 0) {
      const error = "clarification_required";
      await recordFailure(trace, "planner", error);
      await finishTrace(trace, "failed");
      return formatOutput({
        success: false,
        trace,
        sql: "",
        warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
        error,
        analysis: null,
        clarificationQuestions: analysisPlanResult.clarificationQuestions,
        analysisPlan: analysisPlanResult.analysisPlan,
      });
    }
    const guardModule = financeModule(intentResult.intent, plan);
    const financeMode = resolveFinanceMode(input.question, intentResult.intent, plan, analysisPlanResult.analysisPlan);
    const retrievalQuestion = withRetrievalHints(plan.question, analysisPlanResult.analysisPlan);

    const slots = slotsFromIntent(intentResult.intent);
    const templateResult = await step(
      "find_sql_template",
      "findSqlTemplate",
      { question: retrievalQuestion, intent: intentResult.intent ?? null, slots },
      () =>
        runFindSqlTemplateTool({
          question: retrievalQuestion,
          intent: intentResult.intent,
          slots,
        })
    );

    let generation: SqlGenerationResult;
    let execution: SqlExecutionResult;
    let template;
    let sqlReferences: SqlReferenceHint[] = [];
    if (templateResult.candidate && templateResult.params) {
      stage = "executor";
      const templateRun = await step(
        "execute_sql_template",
        "executeSqlTemplate",
        {
          templateId: templateResult.candidate.id,
          params: templateResult.params,
          maxRows: intentResult.intent?.limit,
        },
        () =>
          runExecuteSqlTemplateTool({
            candidate: templateResult.candidate!,
            params: templateResult.params!,
            maxRows: intentResult.intent?.limit,
          })
      );
      generation = templateRun.generation;
      execution = templateRun.execution;
      template = templateRun.template;
      sqlReferences = generation.references ?? [];
      await recordTrace(trace, () =>
        sqlTraceService.recordGeneration(trace, generation)
      );
    } else if (analysisPlanResult.analysisPlan) {
      stage = "generator";
      let composed = await step(
        "compose_approved_composite_metric",
        "composeApprovedCompositeMetric",
        { question: input.question, financeMode: financeMode ?? "strict" },
        () => runComposeApprovedCompositeMetricTool(input.question, financeMode ?? "strict")
      );
      if (!composed.generation) {
        composed = await step(
          "compose_atomic_metrics",
          "composeAtomicMetrics",
          { question: input.question, metricCount: analysisPlanResult.analysisPlan.metrics.length, financeMode },
          () => runComposeAtomicMetricsTool(input.question, analysisPlanResult.analysisPlan!, financeMode)
        );
      }
      if (!composed.generation) {
        if (composed.error === "clarification_required") {
          const error = "clarification_required";
          await recordFailure(trace, "generator", error);
          await finishTrace(trace, "failed");
          return formatOutput({
            success: false,
            trace,
            sql: "",
            warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
            error,
            analysis: null,
            clarificationQuestions: composed.clarificationQuestions,
            analysisPlan: analysisPlanResult.analysisPlan,
          });
        }
        if (requiresApprovedComposer(analysisPlanResult.analysisPlan?.scenario)) {
          const error = `blocked_missing_metric: ${composed.error ?? "approved composer did not produce SQL"}`;
          await recordFailure(trace, "generator", error);
          await finishTrace(trace, "failed");
          return formatOutput({
            success: false,
            trace,
            sql: "",
            warnings: merge(
              intentResult.warnings,
              plan.warnings,
              analysisPlanResult.warnings,
              financeReviewWarnings(analysisPlanResult.analysisPlan?.scenario, composed.error, composed.missingApprovedMetrics),
              trace.warnings,
            ),
            error,
            analysis: null,
            analysisPlan: {
              ...analysisPlanResult.analysisPlan,
              missingApprovedMetrics: composed.missingApprovedMetrics,
            },
          });
        }
        const referenceResult = await step(
          "find_sql_reference",
          "findSqlReference",
          { question: retrievalQuestion, intent: intentResult.intent ?? null, atomicMetricError: composed.error ?? null },
          () =>
            runFindSqlReferenceTool({
              question: retrievalQuestion,
              intent: intentResult.intent,
              plan,
            })
        );
        sqlReferences = referenceResult.references;
        if (financeMode === "strict" && composed.missingApprovedMetrics?.length) {
          const error = `blocked_missing_metric: 缺少 approved atomic metric: ${composed.missingApprovedMetrics.join(", ")}`;
          await recordFailure(trace, "generator", error);
          await finishTrace(trace, "failed");
          return formatOutput({
            success: false,
            trace,
            sql: "",
            warnings: merge(
              intentResult.warnings,
              plan.warnings,
              analysisPlanResult.warnings,
              [`Reference evidence found: ${referenceResult.references.length}`],
              financeReviewWarnings(analysisPlanResult.analysisPlan?.scenario, composed.error, composed.missingApprovedMetrics),
              trace.warnings,
            ),
            error,
            analysis: null,
            analysisPlan: {
              ...analysisPlanResult.analysisPlan,
              missingApprovedMetrics: composed.missingApprovedMetrics,
            },
          });
        }
        const generated = await step(
          "generate_sql",
          "generateSql",
          { plan, referenceCount: referenceResult.references.length, financeMode, analysisPlan: analysisPlanResult.analysisPlan },
          () => runGenerateSqlTool(plan, referenceResult.references, financeMode, callbacks.signal)
        );
        const validated = await step(
          "validate_sql",
          "validateSql",
          { sql: generated.generation.sql, module: financeMode ? "finance" : guardModule, referenceCount: referenceResult.references.length, financeMode },
          () => runValidateSqlTool(generated.generation.sql, {
            module: financeMode ? "finance" : guardModule,
            references: referenceResult.references,
            financeMode,
          })
        );
        generation = {
          ...generated.generation,
          valid: validated.guardResult.valid,
          guardResult: validated.guardResult,
          warnings: merge(
            generated.generation.warnings,
            validated.guardResult.warnings,
            composed.error ? [`Atomic metric composition skipped: ${composed.error}`] : [],
            financeReviewWarnings(analysisPlanResult.analysisPlan?.scenario, composed.error),
          ),
        };
      } else {
        generation = composed.generation;
        sqlReferences = composed.references ?? generation.references ?? [];
      }
      await recordTrace(trace, () =>
        sqlTraceService.recordGeneration(trace, generation)
      );
      if (!generation.valid) {
        const error = generation.guardResult.errors.join("; ") || "SQL generation is invalid.";
        await recordFailure(trace, "generator", error);
        await finishTrace(trace, "failed");
        return formatOutput({
          success: false,
          trace,
          sql: "",
          warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, generation.warnings, trace.warnings),
          error,
          analysis: null,
          financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
          analysisPlan: analysisPlanResult.analysisPlan,
        });
      }
      if (!shouldExecuteGeneratedSql()) {
        execution = skippedExecution(generation);
      } else {
        stage = "executor";
        execution = (
          await step(
            "execute_sql",
            "executeSql",
            { sql: generation.sql, maxRows: intentResult.intent?.limit },
            () => runExecuteSqlTool(generation, intentResult.intent?.limit)
          )
        ).execution;
      }
    } else {
      stage = "generator";
      const referenceResult = await step(
        "find_sql_reference",
        "findSqlReference",
        { question: retrievalQuestion, intent: intentResult.intent ?? null },
        () =>
          runFindSqlReferenceTool({
            question: retrievalQuestion,
            intent: intentResult.intent,
            plan,
          })
      );
      sqlReferences = referenceResult.references;
      const generated = await step(
        "generate_sql",
        "generateSql",
        { plan, referenceCount: referenceResult.references.length, financeMode },
        () => runGenerateSqlTool(plan, referenceResult.references, financeMode, callbacks.signal)
      );
      const validated = await step(
        "validate_sql",
        "validateSql",
        { sql: generated.generation.sql, module: financeMode ? "finance" : guardModule, referenceCount: referenceResult.references.length, financeMode },
        () => runValidateSqlTool(generated.generation.sql, {
          module: financeMode ? "finance" : guardModule,
          references: referenceResult.references,
          financeMode,
        })
      );
      generation = {
        ...generated.generation,
        valid: validated.guardResult.valid,
        guardResult: validated.guardResult,
        warnings: merge(
          generated.generation.warnings,
          validated.guardResult.warnings
        ),
      };
      await recordTrace(trace, () =>
        sqlTraceService.recordGeneration(trace, generation)
      );
      if (!generation.valid) {
        const error =
          generation.guardResult.errors.join("; ") ||
          "SQL generation is invalid.";
        await recordFailure(trace, "generator", error);
        await finishTrace(trace, "failed");
        return formatOutput({
          success: false,
          trace,
          sql: "",
          warnings: merge(
            intentResult.warnings,
            plan.warnings,
            generation.warnings,
            trace.warnings
          ),
          error,
          analysis: null,
          financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
          analysisPlan: analysisPlanResult.analysisPlan,
        });
      }
      if (!shouldExecuteGeneratedSql()) {
        execution = skippedExecution(generation);
      } else {
      stage = "executor";
      execution = (
        await step(
          "execute_sql",
          "executeSql",
          { sql: generation.sql, maxRows: intentResult.intent?.limit },
          () => runExecuteSqlTool(generation, intentResult.intent?.limit)
        )
      ).execution;
      }
    }

    await recordTrace(trace, () =>
      sqlTraceService.recordExecution(trace, execution)
    );
    const parsedExecution = SqlExecutionResultSchema.safeParse(execution);
    if (!parsedExecution.success) {
      const error = `SQL execution result schema validation failed: ${parsedExecution.error.issues
        .map((issue) => issue.message)
        .join("; ")}`;
      await recordFailure(trace, "executor", error);
      await finishTrace(trace, "failed");
      return formatOutput({
        success: false,
        trace,
        sql: generation.sql,
        warnings: merge(
          intentResult.warnings,
          plan.warnings,
          generation.warnings,
          [error],
          trace.warnings
        ),
        error,
        analysis: null,
        template,
        financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
        analysisPlan: analysisPlanResult.analysisPlan,
      });
    }

    const generatedSqlObserved = !shouldExecuteGeneratedSql() && !parsedExecution.data.executed;
    const success = parsedExecution.data.valid && (parsedExecution.data.executed || generatedSqlObserved);
    if (!success)
      await recordFailure(
        trace,
        "executor",
        parsedExecution.data.error ?? "SQL execution failed."
      );
    await finishTrace(trace, success ? "success" : "failed");
    const warnings = merge(
      intentResult.warnings,
      plan.warnings,
      generation.warnings,
      parsedExecution.data.warnings,
      trace.warnings
    );
    const { analysis } = await step(
      "narrate_sql_result",
      "narrateSqlResult",
      {
        question: plan.question,
        sql: generation.sql,
        rowCount: parsedExecution.data.rowCount,
      },
      () =>
        runNarrateSqlResultTool({
          question: plan.question,
          sql: generation.sql,
          fields: parsedExecution.data.fields,
          rows: parsedExecution.data.rows,
          rowCount: parsedExecution.data.rowCount,
          truncated: parsedExecution.data.truncated,
          warnings,
          source: generation.source,
        })
    );
    return formatOutput({
      success,
      trace,
      sql: generation.sql,
      fields: parsedExecution.data.fields,
      rows: parsedExecution.data.rows,
      rowCount: parsedExecution.data.rowCount,
      truncated: parsedExecution.data.truncated,
      warnings,
      error: parsedExecution.data.error,
      analysis,
      template,
      financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
      analysisPlan: analysisPlanResult.analysisPlan,
    });
  } catch (error) {
    await recordFailure(trace, stage, error);
    await finishTrace(trace, "failed");
    return formatOutput({
      success: false,
      trace,
      sql: "",
      warnings: trace.warnings,
      error: error instanceof Error ? error.message : String(error),
      analysis: null,
    });
  }
}

function stepRunner(callbacks: TraceCallbacks) {
  return async function runStep<T>(
    id: string,
    tool: string,
    args: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const runtimeStep: AgentRuntimePlanStep = { id, tool, args };
    const startedAt = Date.now();
    if (callbacks.signal?.aborted) throw new Error("aborted");
    await callbacks.onToolStart?.({ step: runtimeStep });
    try {
      if (callbacks.signal?.aborted) throw new Error("aborted");
      const result = await fn();
      await callbacks.onToolFinish?.({
        step: runtimeStep,
        result,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await callbacks.onToolFinish?.({
        step: runtimeStep,
        error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}

async function startTrace(question: string, callbacks: TraceCallbacks): Promise<SqlTraceContext> {
  try {
    return await sqlTraceService.start(question, {
      sessionId: callbacks.sessionId,
      runId: callbacks.runId,
      ownerUserId: callbacks.ownerUserId,
      rolloutMode: currentRolloutMode(),
    });
  } catch (error) {
    return {
      traceId: "trace-start-failed",
      question,
      startedAt: Date.now(),
      enabled: false,
      sessionId: callbacks.sessionId,
      runId: callbacks.runId,
      ownerUserId: callbacks.ownerUserId,
      rolloutMode: currentRolloutMode(),
      warnings: [
        `SQL trace write failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
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

function shouldExecuteGeneratedSql(): boolean {
  return process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL === "true";
}

function currentRolloutMode(): string {
  return shouldExecuteGeneratedSql() ? "generated_sql_execute" : "generated_sql_observe";
}

async function recordTrace(
  trace: SqlTraceContext,
  write: () => Promise<void>
): Promise<void> {
  try {
    await write();
  } catch (error) {
    trace.warnings.push(
      `SQL trace write failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function recordFailure(
  trace: SqlTraceContext,
  stage: SqlTraceStage,
  error: unknown
): Promise<void> {
  await recordTrace(trace, () =>
    sqlTraceService.recordFailure(trace, stage, error)
  );
}

async function finishTrace(
  trace: SqlTraceContext,
  status: "success" | "failed"
): Promise<void> {
  await recordTrace(trace, () => sqlTraceService.finish(trace, status));
}

const FINANCE_INTENT_PATTERN = /财务|毛利|利润|收入|成本|费用|金额|税|退款|回款|收款|付款|应收|应付/u;
const FINANCE_ESTIMATE_PATTERN = /估算|大概|大致|粗算|粗略|趋势|决策参考|参考一下|毛利大概/u;
const FINANCE_ESTIMATE_DISCLAIMER = "该结果为估算/决策参考口径，不可用于财务报表、对账、审计或付款结算。";

function detectFinanceMode(question: string, intent: { module?: string | null } | undefined, plan: { modules?: Array<{ module?: string }> }): FinanceSqlMode | undefined {
  if (!isFinanceQuestion(question, intent, plan)) return undefined;
  return FINANCE_ESTIMATE_PATTERN.test(question) ? "estimate" : "strict";
}

function resolveFinanceMode(
  question: string,
  intent: { module?: string | null } | undefined,
  plan: { modules?: Array<{ module?: string }> },
  analysisPlan: { mode?: string; scenario?: string; metrics?: string[] } | undefined,
): FinanceSqlMode | undefined {
  if (!analysisPlan) return detectFinanceMode(question, intent, plan);
  if (isOperationalDecisionPlan(analysisPlan)) return undefined;
  if (financeModule(intent, plan) !== "finance") return undefined;
  return analysisPlan.mode === "decision_support" ? "estimate" : "strict";
}

function financeModule(intent: { module?: string | null } | undefined, plan: { modules?: Array<{ module?: string }> }): string | null | undefined {
  return isFinanceQuestion("", intent, plan) ? "finance" : intent?.module ?? plan.modules?.[0]?.module;
}

function isFinanceQuestion(question: string, intent: { module?: string | null } | undefined, plan: { modules?: Array<{ module?: string }> }): boolean {
  return intent?.module === "finance" || plan.modules?.[0]?.module === "finance" || FINANCE_INTENT_PATTERN.test(question);
}

function isOperationalDecisionPlan(plan: { scenario?: string; metrics?: string[] }): boolean {
  if (plan.scenario === "product_sales_inventory_backlog_trend") return true;
  const metrics = plan.metrics ?? [];
  return metrics.length > 0 && metrics.every((metric) => ["inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"].includes(metric));
}

function buildFinanceScope(
  mode: FinanceSqlMode | undefined,
  generation: SqlGenerationResult,
  references: SqlReferenceHint[],
): z.infer<typeof FinanceScopeSchema> | undefined {
  if (!mode) return undefined;
  const allReferences = references.length ? references : generation.references ?? [];
  const fields = generation.guardResult.referencedFields;
  return {
    mode,
    metricNames: uniqueStrings(allReferences.flatMap((reference) => reference.metricName ? [reference.metricName] : reference.metrics ?? [])),
    timeField: fields.find((field) => /date|duedate|jedate|invoicedate|applydate|postdate|taxdate|日期|时间/iu.test(field)),
    amountField: fields.find((field) => /amount|amt|cost|price|total|subtotal|debit|credit|balance|tax|doc(?:ext)?cost|docinvoiceamt|invoiceamt|金额|成本|税/iu.test(field)),
    statusFilter: fields.find((field) => /status|posted|open|closed|void|cancel|paid|hold|approved|approval|状态|审核|过账|关闭|付款|作废/iu.test(field)),
    taxRefundPolicy: "见 SQL 输出列：税退款口径",
    references: allReferences.map((reference) => ({
      sourceType: reference.sourceType,
      familyId: reference.familyId,
      metricCode: reference.metricCode,
      metricName: reference.metricName,
      datasetId: reference.datasetId,
      reportName: reference.reportName,
      score: reference.score,
    })),
    ...(mode === "estimate" ? { disclaimer: FINANCE_ESTIMATE_DISCLAIMER } : {}),
  };
}

function financeReviewWarnings(
  scenario: string | undefined,
  compositionError: string | undefined,
  missingApprovedMetrics: string[] = [],
): string[] {
  const warnings: string[] = [];
  if (missingApprovedMetrics.length > 0) {
    warnings.push(`finance_review_needed: approve atomic metric definitions: ${missingApprovedMetrics.join(", ")}`);
  }
  if (scenario === "purchase_cost_margin_impact") {
    warnings.push("finance_review_needed: approve PO-to-sales-order bridge before strict purchase margin impact execution");
  } else if (compositionError) {
    warnings.push(`finance_review_needed: approve metric bridge or dimensions for scenario${scenario ? ` ${scenario}` : ""}`);
  }
  return warnings;
}

function withRetrievalHints(question: string, analysisPlan: { retrievalHints?: string[] } | undefined): string {
  const hints = analysisPlan?.retrievalHints?.filter(Boolean) ?? [];
  return hints.length > 0 ? `${question}\n检索提示：${hints.join(" ")}` : question;
}

function requiresApprovedComposer(scenario: string | undefined): boolean {
  return scenario === "customer_product_yoy_trend";
}


function formatOutput(input: {
  success: boolean;
  trace: SqlTraceContext;
  sql: string;
  fields?: string[];
  rows?: unknown[][];
  rowCount?: number;
  truncated?: boolean;
  warnings: string[];
  error?: string;
  analysis: z.infer<typeof ErpSqlToolchainOutputSchema>["analysis"];
  template?: z.infer<typeof ErpSqlToolchainOutputSchema>["template"];
  financeScope?: z.infer<typeof FinanceScopeSchema>;
  clarificationQuestions?: string[];
  analysisPlan?: unknown;
}): ErpSqlToolchainOutput {
  const assumptions = analysisPlanAssumptions(input.analysisPlan);
  const analysis = input.analysis && assumptions.length > 0
    ? { ...input.analysis, caveats: merge(input.analysis.caveats, assumptions) }
    : input.analysis;
  const output = {
    success: input.success,
    traceId: input.trace.traceId,
    sql: input.sql,
    fields: input.fields ?? [],
    rows: input.rows ?? [],
    rowCount: input.rowCount ?? 0,
    truncated: input.truncated ?? false,
    warnings: input.warnings,
    error: input.error,
    analysis,
    message: messageContent(
      input.success,
      input.rowCount ?? 0,
      input.error,
      analysis,
      input.warnings.some((warning) => warning.includes("not executed")),
      input.financeScope,
      assumptions,
    ),
    clarificationQuestions: input.clarificationQuestions,
    analysisPlan: input.analysisPlan,
    template: input.template,
    financeScope: input.financeScope,
  };
  return output;
}

function messageContent(
  success: boolean,
  rowCount: number,
  error: string | undefined,
  analysis: z.infer<typeof ErpSqlToolchainOutputSchema>["analysis"],
  generatedOnly = false,
  financeScope?: z.infer<typeof FinanceScopeSchema>,
  assumptions: string[] = [],
): string {
  const assumptionText = assumptions.length > 0 ? `\n默认口径：${assumptions.join("；")}` : "";
  if (error === "clarification_required") return "这个问题有几个可能口径，直接给结论可能不准。请先确认查询口径。";
  if (error?.startsWith("blocked_missing_metric")) {
    return "当前精确口径还缺少已审批指标，直接计算可能不准。可以先按已审批的近似口径做参考分析，或补齐指标口径后再给精确 SQL。";
  }
  if (!success) return `当前问题没有通过精确 SQL 校验，直接执行可能不准。可以补充口径或改用近似分析口径继续。校验原因：${error ?? "未知"}`;

  const disclaimer = financeScope?.mode === "estimate" && financeScope.disclaimer ? `\n${financeScope.disclaimer}` : "";
  if (generatedOnly) return `SQL 已生成并通过校验，灰度观察模式未自动执行。${assumptionText}${disclaimer}`;
  if (analysis) {
    const highlights = analysis.highlights
      .map((item) => `- ${item}`)
      .join("\n");
    const caveats = analysis.caveats.map((item) => `- ${item}`).join("\n");
    return `${[analysis.summary, highlights, caveats].filter(Boolean).join("\n")}${disclaimer}`;
  }
  if (rowCount === 0) return `SQL 已执行，未查询到数据。${assumptionText}${disclaimer}`;
  return `已生成并执行 SQL，返回 ${rowCount} 行。${assumptionText}${disclaimer}`;
}

function merge(...items: string[][]): string[] {
  return [...new Set(items.flat())];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function analysisPlanAssumptions(analysisPlan: unknown): string[] {
  if (!analysisPlan || typeof analysisPlan !== "object") return [];
  const value = (analysisPlan as { assumptions?: unknown }).assumptions;
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)) : [];
}
