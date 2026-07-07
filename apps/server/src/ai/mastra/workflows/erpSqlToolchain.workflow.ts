import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type {
  AgentRuntimePlanStep,
  AgentRuntimeToolTraceFinish,
  AgentRuntimeToolTraceStart,
} from "../../agentRuntime/types.js";
import type { SqlExecutionResult } from "../../../modules/erpSqlAgent/executor/index.js";
import type { SqlGenerationResult } from "../../../modules/erpSqlAgent/generator/index.js";
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
  runExtractSqlIntentTool,
  runFindSqlReferenceTool,
  runFindSqlTemplateTool,
  runGenerateSqlTool,
  runNarrateSqlResultTool,
  runPlanSqlQueryTool,
  runValidateSqlTool,
  slotsFromIntent,
} from "../tools/erpSql/toolchain.tools.js";

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
  template: z
    .object({
      id: z.string(),
      name: z.string(),
      intent: z.string(),
      module: z.string(),
      score: z.number(),
    })
    .optional(),
});

export type ErpSqlToolchainOutput = z.infer<typeof ErpSqlToolchainOutputSchema>;

type TraceCallbacks = {
  onToolStart?: (event: AgentRuntimeToolTraceStart) => Promise<void>;
  onToolFinish?: (event: AgentRuntimeToolTraceFinish) => Promise<void>;
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
  const trace = await startTrace(input.question);
  const step = stepRunner(callbacks);
  let stage: SqlTraceStage = "intent";
  try {
    const intentResult = await step(
      "extract_sql_intent",
      "extractSqlIntent",
      { question: input.question },
      () => runExtractSqlIntentTool(input.question)
    );

    stage = "planner";
    const { plan } = await step(
      "plan_sql_query",
      "planSqlQuery",
      { question: input.question, intent: intentResult.intent ?? null },
      () => runPlanSqlQueryTool(input.question, intentResult.intent)
    );
    await recordTrace(trace, () => sqlTraceService.recordPlan(trace, plan));

    const slots = slotsFromIntent(intentResult.intent);
    const templateResult = await step(
      "find_sql_template",
      "findSqlTemplate",
      { question: plan.question, intent: intentResult.intent ?? null, slots },
      () =>
        runFindSqlTemplateTool({
          question: plan.question,
          intent: intentResult.intent,
          slots,
        })
    );

    let generation: SqlGenerationResult;
    let execution: SqlExecutionResult;
    let template;
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
      await recordTrace(trace, () =>
        sqlTraceService.recordGeneration(trace, generation)
      );
    } else {
      stage = "generator";
      const referenceResult = await step(
        "find_sql_reference",
        "findSqlReference",
        { question: plan.question, intent: intentResult.intent ?? null },
        () =>
          runFindSqlReferenceTool({
            question: plan.question,
            intent: intentResult.intent,
            plan,
          })
      );
      const generated = await step(
        "generate_sql",
        "generateSql",
        { plan, referenceCount: referenceResult.references.length },
        () => runGenerateSqlTool(plan, referenceResult.references)
      );
      const validated = await step(
        "validate_sql",
        "validateSql",
        { sql: generated.generation.sql },
        () => runValidateSqlTool(generated.generation.sql)
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
          sql: generation.sql,
          warnings: merge(
            intentResult.warnings,
            plan.warnings,
            generation.warnings,
            trace.warnings
          ),
          error,
          analysis: null,
        });
      }
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
      });
    }

    const success = parsedExecution.data.valid && parsedExecution.data.executed;
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
    await callbacks.onToolStart?.({ step: runtimeStep });
    try {
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

async function startTrace(question: string): Promise<SqlTraceContext> {
  try {
    return await sqlTraceService.start(question);
  } catch (error) {
    return {
      traceId: "trace-start-failed",
      question,
      startedAt: Date.now(),
      enabled: false,
      warnings: [
        `SQL trace write failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
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
}): ErpSqlToolchainOutput {
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
    analysis: input.analysis,
    message: messageContent(
      input.success,
      input.rowCount ?? 0,
      input.error,
      input.analysis
    ),
    template: input.template,
  };
  return output;
}

function messageContent(
  success: boolean,
  rowCount: number,
  error: string | undefined,
  analysis: z.infer<typeof ErpSqlToolchainOutputSchema>["analysis"]
): string {
  if (!success) return `SQL 查询失败：${error ?? "未知错误"}`;
  if (analysis) {
    const highlights = analysis.highlights
      .map((item) => `- ${item}`)
      .join("\n");
    const caveats = analysis.caveats.map((item) => `- ${item}`).join("\n");
    return [analysis.summary, highlights, caveats].filter(Boolean).join("\n");
  }
  if (rowCount === 0) return "SQL 已执行，未查询到数据。";
  return `已生成并执行 SQL，返回 ${rowCount} 行。`;
}

function merge(...items: string[][]): string[] {
  return [...new Set(items.flat())];
}
