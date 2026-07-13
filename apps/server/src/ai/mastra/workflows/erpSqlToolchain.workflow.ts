import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type {
  AgentRuntimePlanStep,
  AgentRuntimeToolTraceFinish,
  AgentRuntimeToolTraceStart,
} from "../../agentRuntime/types.js";
import type { SqlExecutionResult } from "../../../modules/erpSqlAgent/executor/index.js";
import type { SqlGenerationResult, SqlReferenceHint } from "../../../modules/erpSqlAgent/generator/index.js";
import type { AnalysisConversationContext, AnalysisPlan, QueryPlan } from "../../../modules/erpSqlAgent/planner/index.js";
import { getErpSqlCapabilities, resolveCapability } from "../../../modules/erpSqlAgent/capabilities/registry.js";
import {
  DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING,
  shouldBypassCompositeCapability,
} from "../../../modules/erpSqlAgent/capabilities/CapabilityDecisionService.js";
import { parseUserDimensionRule } from "../../../modules/erpSqlAgent/planner/service/AnalysisPlanContextService.js";
import { buildResultColumns } from "../../../modules/erpSqlAgent/agent/resultColumnMetadata.js";
import { complexQueryPlanService, type ComplexQueryStepResult } from "../../../modules/erpSqlAgent/complexQuery/index.js";
import type { ErpSqlResultScope } from "../../../modules/erpSqlAgent/agent/types/ErpSqlAgentTypes.js";
import type { FinanceSqlMode } from "../../../modules/erpSqlAgent/sqlGuard/index.js";
import { assertModuleAllowed, requireErpSqlAccessScope, type ErpSqlAccessScope } from "../../../modules/erpSqlAgent/access/index.js";
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
  runDecideSqlCapabilityTool,
  runResolveSqlCapabilityTool,
  runComposeApprovedCompositeMetricTool,
  runComposeAtomicMetricsTool,
  runExtractSqlIntentTool,
  runFindSqlReferenceTool,
  runFindSqlTemplateTool,
  runGenerateSqlTool,
  runNarrateSqlResultTool,
  runPlanSqlQueryTool,
  runValidateSqlRuntimeTool,
  runValidateSqlTool,
  slotsFromIntent,
  governedEntityFilterSlots,
} from "../tools/erpSql/toolchain.tools.js";
import { createLinkedAbortController, isAbortError, throwIfAborted, type RuntimeLifecycleStatus } from "../../../lib/abort.js";
import { complexStepStatus, runErpComplexQuery } from "./erpComplexQueryRunner.js";

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
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    dataType: z.enum(["text", "money", "percent", "date", "integer"]),
    format: z.object({
      decimals: z.number().int().nonnegative().optional(),
      percent: z.boolean().optional(),
      currencyUnit: z.string().optional(),
    }),
    role: z.enum(["dimension", "metric", "technical"]),
    inlineVisible: z.boolean(),
  })),
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
  scope: z.object({
    capability: z.string(),
    metrics: z.array(z.string()),
    dimensions: z.array(z.string()),
    filters: z.record(z.string(), z.string()),
    timeRange: z.unknown().optional(),
    comparison: z.unknown().optional(),
    templateCoverage: z.array(z.string()),
  }).optional(),
  semanticStatus: z.enum(["exact", "estimate", "semantic_mismatch"]).optional(),
  disclaimer: z.string().optional(),
  accessAudit: z.array(z.object({
    code: z.string(),
    category: z.enum(["authorization", "scope", "masking"]),
    message: z.string(),
    fields: z.array(z.string()).optional(),
  })).optional(),
  outcome: z.enum(["execute", "clarify", "unsupported"]),
  capabilityCode: z.string(),
  executionPath: z.enum(["template", "composer", "rule", "llm", "estimate"]).optional(),
  reasonCode: z.string().optional(),
  missingCoverage: z.array(z.string()).optional(),
  complexAnalysis: z.object({
    scenario: z.literal("product_sales_inventory_backlog_trend"),
    status: z.enum(["completed", "partial", "failed"]),
    steps: z.array(z.object({
      id: z.enum(["sales_growth", "inventory", "backlog"]),
      status: z.enum(["completed", "partial", "clarification_required", "unsupported", "failed", "skipped"]),
      rowCount: z.number(),
      error: z.string().optional(),
    })),
    joinCoverage: z.object({
      anchorRows: z.number(),
      matchedRows: z.number(),
      unmatchedRows: z.number(),
      coverageRate: z.number(),
    }).optional(),
  }).optional(),
});

export type ErpSqlToolchainOutput = z.infer<typeof ErpSqlToolchainOutputSchema>;

type TraceCallbacks = {
  onToolStart?: (event: AgentRuntimeToolTraceStart) => Promise<void>;
  onToolFinish?: (event: AgentRuntimeToolTraceFinish) => Promise<void>;
  sessionId?: string;
  runId?: string;
  ownerUserId?: string | null;
  signal?: AbortSignal;
  accessScope?: ErpSqlAccessScope;
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
  const accessScope = requireErpSqlAccessScope(callbacks.accessScope, callbacks.ownerUserId);
  const trace = await startTrace(input.question, callbacks);
  const step = stepRunner(callbacks);
  const previousContext = readPreviousAnalysisContext(input.context);
  let stage: SqlTraceStage = "intent";
  let capabilityCode = "unresolved";
  try {
    const intentResult = await step(
      "extract_sql_intent",
      "extractSqlIntent",
      { question: input.question },
      (signal) => runExtractSqlIntentTool(input.question, signal)
    );

    stage = "planner";
    const { plan } = await step(
      "plan_sql_query",
      "planSqlQuery",
      { question: input.question, intent: intentResult.intent ?? null },
      (signal) => runPlanSqlQueryTool(input.question, intentResult.intent, signal)
    );
    await recordTrace(trace, () => sqlTraceService.recordPlan(trace, plan));
    const modules: string[] = plan.modules.map((item) => item.module);
    const lockedCapability = input.routeCapabilityCode
      ? getErpSqlCapabilities().find((capability) => capability.code === input.routeCapabilityCode)
      : undefined;
    if (input.routeCapabilityCode && !lockedCapability) {
      return capabilityFailure(trace, merge(intentResult.warnings, plan.warnings, trace.warnings), input.routeCapabilityCode, "capability_route_mismatch");
    }
    const capabilityCandidates = lockedCapability ? [lockedCapability] : getErpSqlCapabilities().filter((capability) =>
      capability.modules.some((module) => modules.includes(module))
    );
    const analysisPlanResult = await step(
      "analyze_sql_question",
      "analyzeSqlQuestion",
      { question: input.question },
      (signal) => runAnalyzeSqlQuestionTool(input.question, signal, previousContext.analysisPlan, previousContext.traceId, previousContext.conversation, input.routeCapabilityCode)
    );
    const analyzedPlan = analysisPlanResult.analysisPlan;
    const complexPlan = analyzedPlan ? complexQueryPlanService.build(analyzedPlan) : undefined;
    const diagnosticCompositeOverride = shouldBypassCompositeCapability(analyzedPlan);
    if (analyzedPlan?.scenario === "product_sales_inventory_backlog_trend" && !complexPlan?.ok) {
      return capabilityFailure(
        trace,
        merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
        "complex.product_sales_inventory_backlog",
        complexPlan && !complexPlan.ok ? complexPlan.reason : "invalid_complex_plan",
      );
    }
    if (analyzedPlan && complexPlan?.ok) {
      capabilityCode = "complex.product_sales_inventory_backlog";
      if (input.routeCapabilityCode
        && ![capabilityCode, "finance.composite_decision"].includes(input.routeCapabilityCode)
        && !diagnosticCompositeOverride) {
        return capabilityFailure(trace, merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings), input.routeCapabilityCode, "capability_route_mismatch");
      }
      if (diagnosticCompositeOverride
        && input.routeCapabilityCode
        && ![capabilityCode, "finance.composite_decision"].includes(input.routeCapabilityCode)) {
        trace.warnings.push(DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING);
      }
      const complexDecision = runDecideSqlCapabilityTool(analyzedPlan, resolveCapability(capabilityCode), analyzedPlan.dimensionFilters?.product ? ["partNum"] : []);
      if (complexDecision.outcome !== "execute") {
        return capabilityFailure(trace, merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings), capabilityCode, complexDecision.reasonCode ?? "missing_complex_coverage", complexDecision.missingCoverage);
      }
      assertModuleAllowed(accessScope, ["sales", "inventory"]);
      stage = "executor";
      const complexResult = await runErpComplexQuery({
        question: input.question,
        analysisPlan: analyzedPlan,
        signal: callbacks.signal,
        executeStep: async ({ question, step: queryStep, analysisPlan }, signal) => step(
          `complex_query_${queryStep.id}`,
          "executeComplexQueryStep",
          { capabilityCode: queryStep.capabilityCode, metrics: queryStep.metrics, limit: queryStep.limit },
          async () => executeComplexQueryStep({
            question,
            step: queryStep,
            analysisPlan,
            queryPlan: plan,
            accessScope,
            signal,
          }),
        ),
      });
      await step(
        "compose_complex_query_result",
        "composeComplexQueryResult",
        { status: complexResult.ok ? complexResult.graph.status : complexResult.graph?.status ?? "failed" },
        async () => ({ rowCount: complexResult.ok ? complexResult.composed.rowCount : 0 }),
      );
      const graph = complexResult.graph;
      const complexAnalysis = graph ? {
        scenario: "product_sales_inventory_backlog_trend" as const,
        status: complexResult.ok ? complexResult.composed.status : graph.status,
        steps: graph.steps.map(({ id, status, rowCount, error }) => ({ id, status, rowCount, ...(error ? { error } : {}) })),
        ...(complexResult.ok ? { joinCoverage: complexResult.composed.joinCoverage } : {}),
      } : undefined;
      if (!complexResult.ok) {
        await recordFailure(trace, "executor", complexResult.reason);
        await finishTrace(trace, "failed");
        return formatOutput({
          success: false,
          trace,
          sql: "",
          warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
          error: complexResult.reason,
          analysis: null,
          analysisPlan: analysisPlanResult.analysisPlan,
          outcome: "execute",
          capabilityCode,
          executionPath: "composer",
          complexAnalysis,
        });
      }
      await finishTrace(trace, "success");
      const caveats = [
        "最近3个月按最近三个完整自然月计算；边界月无销售行按销售额 0。",
        ...(complexResult.composed.status === "partial" ? ["部分来源未匹配或子查询未完整完成，空值表示该来源未返回匹配数据。"] : []),
      ];
      return formatOutput({
        success: true,
        trace,
        sql: "",
        fields: complexResult.composed.fields,
        rows: complexResult.composed.rows,
        rowCount: complexResult.composed.rowCount,
        truncated: complexResult.composed.truncated,
        warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, complexResult.composed.warnings, trace.warnings),
        analysis: {
          summary: `已完成销售、库存和未交付的分步查询，返回 ${complexResult.composed.rowCount} 个产品。`,
          highlights: [],
          caveats,
        },
        analysisPlan: analysisPlanResult.analysisPlan,
        scope: buildResultScope(analysisPlanResult.analysisPlan, capabilityCode),
        semanticStatus: complexResult.composed.status === "completed" ? "exact" : "estimate",
        outcome: "execute",
        capabilityCode,
        executionPath: "composer",
        complexAnalysis,
      });
    }
    if (capabilityCandidates.length === 0) {
      return capabilityFailure(trace, merge(intentResult.warnings, plan.warnings, trace.warnings), "unresolved", "capability_unresolved");
    }
    let selectedCapabilityModules = plan.modules.map((item) => item.module);
    {
      const governedFilters = governedEntityFilterSlots(slotsFromIntent(intentResult.intent)).filter((filter) =>
        getErpSqlCapabilities().some((capability) => capability.filterSlots.includes(filter))
      );
      const decisionCapability = diagnosticCompositeOverride
        ? resolveCapability("finance.composite_decision")
        : lockedCapability;
      const decision = decisionCapability
        ? runDecideSqlCapabilityTool(analysisPlanResult.analysisPlan, decisionCapability, governedFilters)
        : runResolveSqlCapabilityTool(analysisPlanResult.analysisPlan, capabilityCandidates, modules, governedFilters);
      capabilityCode = decision.capability;
      if (decision.diagnosticBypass) {
        trace.warnings.push(DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING);
      }
      const routeMismatch = Boolean(lockedCapability && !diagnosticCompositeOverride && (
        (modules.length > 0 && !lockedCapability.modules.some((module) => modules.includes(module)))
        || decision.outcome === "unsupported"
      ));
      if (routeMismatch) {
        await recordFailure(trace, "planner", "capability_route_mismatch");
        await finishTrace(trace, "failed");
        return formatOutput({
          success: false, trace, sql: "", warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
          error: "capability_route_mismatch", analysis: null, analysisPlan: analysisPlanResult.analysisPlan,
          outcome: "clarify", capabilityCode: lockedCapability!.code, reasonCode: "capability_route_mismatch", missingCoverage: decision.missingCoverage,
        });
      }
      if (decision.outcome !== "execute") {
        const clarificationQuestions = clarificationQuestionsForMissingCoverage(decision.missingCoverage);
        await recordFailure(trace, "planner", decision.reasonCode ?? decision.outcome);
        await finishTrace(trace, "failed");
        return formatOutput({
          success: false,
          trace,
          sql: "",
          warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
          error: decision.reasonCode ?? decision.outcome,
          analysis: null,
          analysisPlan: analysisPlanResult.analysisPlan,
          outcome: decision.outcome,
          capabilityCode: decision.capability,
          reasonCode: decision.reasonCode,
          missingCoverage: decision.missingCoverage,
          ...(clarificationQuestions.length > 0 ? { clarificationQuestions } : {}),
        });
      }
      if (decision.capability === "finance.composite_decision") selectedCapabilityModules = ["finance"];
    }
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
        outcome: "clarify",
        capabilityCode,
        reasonCode: "clarification_required",
        missingCoverage: [],
      });
    }
    assertModuleAllowed(accessScope, selectedCapabilityModules);
    const selectedFinanceCapability = capabilityCode === "finance.composite_decision";
    const guardModule = selectedFinanceCapability ? "finance" : financeModule(intentResult.intent, plan);
    const financeMode = selectedFinanceCapability
      ? analysisPlanResult.analysisPlan?.mode === "decision_support" ? "estimate" : "strict"
      : resolveFinanceMode(input.question, intentResult.intent, plan, analysisPlanResult.analysisPlan);
    let effectiveFinanceMode = financeMode;
    const retrievalQuestion = withRetrievalHints(plan.question, analysisPlanResult.analysisPlan);

    const slots = slotsFromIntent(intentResult.intent);
    const templateResult: Awaited<ReturnType<typeof runFindSqlTemplateTool>> = analysisPlanResult.analysisPlan
      ? { candidates: [], timings: [] }
      : await step(
      "find_sql_template",
      "findSqlTemplate",
      {
        question: retrievalQuestion,
        intent: intentResult.intent ?? null,
        slots,
        requiredMetrics: [],
        analysisPlan: undefined,
      },
      (signal) =>
        runFindSqlTemplateTool({
          question: retrievalQuestion,
          intent: intentResult.intent,
          slots,
          requiredMetrics: [],
          analysisPlan: undefined,
        }, signal)
      );

    let generation!: SqlGenerationResult;
    let execution!: SqlExecutionResult;
    let template;
    let sqlReferences: SqlReferenceHint[] = [];
    let templateAccepted = false;
    const templateFallbackWarnings: string[] = [];
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
        (signal) =>
          runExecuteSqlTemplateTool({
            candidate: templateResult.candidate!,
            params: templateResult.params!,
            maxRows: intentResult.intent?.limit,
          }, accessScope, signal, {
            question: input.question,
            queryPlan: plan,
            analysisPlan: analysisPlanResult.analysisPlan,
            financeMode,
          })
      );
      generation = templateRun.generation;
      execution = templateRun.execution;
      template = templateRun.template;
      sqlReferences = generation.references ?? [];
      await recordTrace(trace, () =>
        sqlTraceService.recordGeneration(trace, generation)
      );
      if (!generation.valid) {
        const error = generation.guardResult.errors.join("; ") || "SQL runtime guard rejected template.";
        if (generation.semanticResult?.status === "semantic_mismatch") {
          templateFallbackWarnings.push(`Template ${templateResult.candidate.id} was skipped because its business semantics do not match the question; continuing with internal fallback.`);
          template = undefined;
          sqlReferences = [];
        } else {
          await recordFailure(trace, "guard", error);
          await finishTrace(trace, "failed");
          return formatOutput({
            success: false,
            trace,
            sql: "",
            warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, generation.warnings, trace.warnings),
            error,
            analysis: null,
            template,
            financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
            semanticStatus: generation.semanticResult?.status,
            analysisPlan: analysisPlanResult.analysisPlan,
            outcome: "execute",
            capabilityCode,
          });
        }
      } else {
        templateAccepted = true;
      }
    }
    if (!templateAccepted) {
      if (analysisPlanResult.analysisPlan) {
      stage = "generator";
      let composed = await step(
        "compose_approved_composite_metric",
        "composeApprovedCompositeMetric",
        { question: input.question, financeMode: financeMode ?? "strict" },
        (signal) => runComposeApprovedCompositeMetricTool(input.question, financeMode ?? "strict", accessScope, signal, analysisPlanResult.analysisPlan)
      );
      if (!composed.generation && !composed.error) {
        composed = await step(
          "compose_atomic_metrics",
          "composeAtomicMetrics",
          { question: input.question, metricCount: analysisPlanResult.analysisPlan.metrics.length, financeMode },
          (signal) => runComposeAtomicMetricsTool(
            input.question,
            analysisPlanResult.analysisPlan!,
            financeMode,
            accessScope,
            signal,
            financeMode ? "finance" : plan.modules[0]?.module ?? "custom",
          )
        );
      }
      if (!composed.generation) {
        if (isCompositePlanUnsupported(analysisPlanResult.analysisPlan, composed)) {
          const error = composed.error ?? "approved composite metric coverage is incomplete";
          await recordFailure(trace, "generator", error);
          await finishTrace(trace, "failed");
          return formatOutput({
            success: false,
            trace,
            sql: "",
            warnings: merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
            error,
            analysis: null,
            analysisPlan: analysisPlanResult.analysisPlan,
            outcome: "unsupported",
            capabilityCode,
            reasonCode: "missing_approved_metric_coverage",
            missingCoverage: composed.missingApprovedMetrics ?? [],
          });
        }
        let generationFinanceMode = financeMode;
        const lowConfidenceWarnings: string[] = [];
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
            outcome: "clarify",
            capabilityCode,
            reasonCode: "clarification_required",
            missingCoverage: [],
          });
        }
        if (requiresApprovedComposer(analysisPlanResult.analysisPlan?.scenario)) {
          generationFinanceMode = "estimate";
          lowConfidenceWarnings.push(lowConfidenceMetricWarning(composed.error ?? "approved composer did not produce SQL"));
        }
        const referenceResult = await step(
          "find_sql_reference",
          "findSqlReference",
          { question: retrievalQuestion, intent: intentResult.intent ?? null, atomicMetricError: composed.error ?? null },
          (signal) =>
            runFindSqlReferenceTool({
              question: retrievalQuestion,
              intent: intentResult.intent,
              plan,
            }, signal)
        );
        sqlReferences = referenceResult.references;
        if (isStrictAnalysisBlocked(financeMode, analysisPlanResult.analysisPlan) && composed.error) {
          generationFinanceMode = "estimate";
          lowConfidenceWarnings.push(lowConfidenceMetricWarning(composed.error));
        }
        if (financeMode === "strict" && !hasApprovedFinanceReference(sqlReferences)) {
          generationFinanceMode = "estimate";
          lowConfidenceWarnings.push(lowConfidenceMetricWarning("strict finance question has no approved business metric/template reference"));
        }
        if (financeMode === "strict" && composed.missingApprovedMetrics?.length) {
          generationFinanceMode = "estimate";
          lowConfidenceWarnings.push(lowConfidenceMetricWarning(`缺少 approved atomic metric: ${composed.missingApprovedMetrics.join(", ")}`));
        }
        effectiveFinanceMode = generationFinanceMode;
        const generated = await step(
          "generate_sql",
          "generateSql",
          { plan, referenceCount: referenceResult.references.length, financeMode: generationFinanceMode, analysisPlan: analysisPlanResult.analysisPlan },
          (signal) => runGenerateSqlTool(plan, referenceResult.references, generationFinanceMode, signal, accessScope)
        );
        const validated = await step(
          "validate_sql",
          "validateSql",
          { sql: generated.generation.sql, module: generationFinanceMode ? "finance" : guardModule, referenceCount: referenceResult.references.length, financeMode: generationFinanceMode },
          (signal) => runValidateSqlTool(generated.generation.sql, {
            module: generationFinanceMode ? "finance" : guardModule,
            references: referenceResult.references,
            financeMode: generationFinanceMode,
            signal,
          })
        );
        generation = {
          ...generated.generation,
          valid: validated.guardResult.valid,
          guardResult: validated.guardResult,
          references: generated.generation.references ?? referenceResult.references,
          warnings: merge(
            generated.generation.warnings,
            validated.guardResult.warnings,
            templateFallbackWarnings,
            lowConfidenceWarnings,
            composed.error ? [`Atomic metric composition skipped: ${composed.error}`] : [],
            financeReviewWarnings(analysisPlanResult.analysisPlan?.scenario, composed.error),
          ),
        };
      } else {
        generation = composed.generation;
        sqlReferences = composed.references ?? generation.references ?? [];
      }
      generation = (
        await step(
          "runtime_guard_sql",
          "validateSqlRuntime",
          {
            source: generation.source,
            scenario: generation.scenario,
            financeMode: effectiveFinanceMode,
            referenceCount: generation.references?.length ?? sqlReferences.length,
          },
          (signal) => runValidateSqlRuntimeTool({
            question: input.question,
            generation,
            queryPlan: plan,
            analysisPlan: analysisPlanResult.analysisPlan,
            financeMode: effectiveFinanceMode,
            module: effectiveFinanceMode ? "finance" : undefined,
            lowConfidence: generation.warnings.some(isLowConfidenceMetricWarning),
            devFullAccess: accessScope.devFullAccess,
            signal,
          }),
        )
      ).generation;
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
          semanticStatus: generation.semanticResult?.status,
          analysisPlan: analysisPlanResult.analysisPlan,
          outcome: "execute",
          capabilityCode,
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
            (signal) => runExecuteSqlTool(generation, intentResult.intent?.limit, accessScope, financeMode ? "finance" : plan.modules[0]?.module ?? "custom", signal)
          )
        ).execution;
      }
      } else {
      stage = "generator";
      const referenceResult = await step(
        "find_sql_reference",
        "findSqlReference",
        { question: retrievalQuestion, intent: intentResult.intent ?? null },
        (signal) =>
          runFindSqlReferenceTool({
            question: retrievalQuestion,
            intent: intentResult.intent,
            plan,
          }, signal)
      );
      sqlReferences = referenceResult.references;
      let generationFinanceMode = financeMode;
      const lowConfidenceWarnings: string[] = [];
      if (financeMode === "strict" && !hasApprovedFinanceReference(sqlReferences)) {
        generationFinanceMode = "estimate";
        lowConfidenceWarnings.push(lowConfidenceMetricWarning("strict finance question has no approved business metric/template reference"));
      }
      effectiveFinanceMode = generationFinanceMode;
      const generated = await step(
        "generate_sql",
        "generateSql",
        { plan, referenceCount: referenceResult.references.length, financeMode: generationFinanceMode },
        (signal) => runGenerateSqlTool(plan, referenceResult.references, generationFinanceMode, signal, accessScope)
      );
      const validated = await step(
        "validate_sql",
        "validateSql",
        { sql: generated.generation.sql, module: generationFinanceMode ? "finance" : guardModule, referenceCount: referenceResult.references.length, financeMode: generationFinanceMode },
        (signal) => runValidateSqlTool(generated.generation.sql, {
          module: generationFinanceMode ? "finance" : guardModule,
          references: referenceResult.references,
          financeMode: generationFinanceMode,
          signal,
        })
      );
      generation = {
        ...generated.generation,
        valid: validated.guardResult.valid,
        guardResult: validated.guardResult,
        references: generated.generation.references ?? referenceResult.references,
        warnings: merge(
          generated.generation.warnings,
          validated.guardResult.warnings,
          templateFallbackWarnings,
          lowConfidenceWarnings
        ),
      };
      generation = (
        await step(
          "runtime_guard_sql",
          "validateSqlRuntime",
          {
            source: generation.source,
            scenario: generation.scenario,
            financeMode: effectiveFinanceMode,
            referenceCount: generation.references?.length ?? sqlReferences.length,
          },
          (signal) => runValidateSqlRuntimeTool({
            question: input.question,
            generation,
            queryPlan: plan,
            analysisPlan: analysisPlanResult.analysisPlan,
            financeMode: effectiveFinanceMode,
            module: effectiveFinanceMode ? "finance" : guardModule,
            lowConfidence: generation.warnings.some(isLowConfidenceMetricWarning),
            devFullAccess: accessScope.devFullAccess,
            signal,
          }),
        )
      ).generation;
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
          semanticStatus: generation.semanticResult?.status,
          analysisPlan: analysisPlanResult.analysisPlan,
          outcome: "execute",
          capabilityCode,
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
          (signal) => runExecuteSqlTool(generation, intentResult.intent?.limit, accessScope, financeMode ? "finance" : plan.modules[0]?.module ?? "custom", signal)
        )
      ).execution;
      }
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
        semanticStatus: generation.semanticResult?.status,
        analysisPlan: analysisPlanResult.analysisPlan,
        outcome: "execute",
        capabilityCode,
      });
    }

    const scope = buildResultScope(analysisPlanResult.analysisPlan, capabilityCode, template?.familyId);
    const generatedSqlObserved = !shouldExecuteGeneratedSql() && !parsedExecution.data.executed;
    const success = parsedExecution.data.valid && (parsedExecution.data.executed || generatedSqlObserved);
    const resultScopeError = success
      ? assertResultScope(scope, parsedExecution.data.fields, parsedExecution.data.rows)
      : undefined;
    if (resultScopeError) {
      await recordFailure(trace, "executor", resultScopeError);
      await finishTrace(trace, "failed");
      return formatOutput({
        success: false,
        trace,
        sql: generation.sql,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, parsedExecution.data.warnings, [resultScopeError], trace.warnings),
        error: resultScopeError,
        analysis: null,
        template,
        financeScope: buildFinanceScope(financeMode, generation, sqlReferences),
        semanticStatus: "semantic_mismatch",
        analysisPlan: analysisPlanResult.analysisPlan,
        accessAudit: parsedExecution.data.auditReasons,
        scope,
        outcome: "execute",
        capabilityCode,
      });
    }

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
      templateFallbackWarnings,
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
      (signal) =>
        runNarrateSqlResultTool({
          question: plan.question,
          sql: generation.sql,
          fields: parsedExecution.data.fields,
          rows: parsedExecution.data.rows,
          rowCount: parsedExecution.data.rowCount,
          truncated: parsedExecution.data.truncated,
          warnings,
          source: generation.source,
          scope,
        }, signal)
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
      semanticStatus: generation.semanticResult?.status,
      analysisPlan: analysisPlanResult.analysisPlan,
      accessAudit: parsedExecution.data.auditReasons,
      assumptions: generation.assumptions,
      scope,
      outcome: "execute",
      capabilityCode,
      executionPath: resolveExecutionPath(generation, effectiveFinanceMode),
    });
  } catch (error) {
    await recordFailure(trace, stage, error);
    await finishTrace(trace, /abort|cancel/iu.test(error instanceof Error ? `${error.name} ${error.message}` : String(error)) ? "cancelled" : "failed");
    if (isAbortError(error)) throw error;
    return formatOutput({
      success: false,
      trace,
      sql: "",
      warnings: trace.warnings,
      error: error instanceof Error ? error.message : String(error),
      analysis: null,
      outcome: "unsupported",
      capabilityCode,
      reasonCode: "workflow_failed",
    });
  }
}

async function executeComplexQueryStep(input: {
  question: string;
  step: { id: ComplexQueryStepResult["id"]; metrics: string[]; limit: number };
  analysisPlan: AnalysisPlan;
  queryPlan: QueryPlan;
  accessScope: ErpSqlAccessScope;
  signal: AbortSignal;
}): Promise<ComplexQueryStepResult> {
  const module = input.step.id === "inventory" ? "inventory" : "sales";
  const capabilityDecision = runDecideSqlCapabilityTool(input.analysisPlan, resolveCapability(
    input.step.id === "sales_growth" ? "complex.sales_growth"
      : input.step.id === "inventory" ? "complex.inventory_by_product"
        : "complex.backlog_by_product",
  ), input.analysisPlan.dimensionFilters?.product ? ["partNum"] : []);
  if (capabilityDecision.outcome !== "execute") {
    return {
      id: input.step.id, status: "unsupported", fields: [], rows: [], rowCount: 0, truncated: false, warnings: [],
      error: capabilityDecision.reasonCode ?? "missing_step_capability_coverage",
    };
  }
  const composed = await runComposeAtomicMetricsTool(
    input.question,
    input.analysisPlan,
    undefined,
    input.accessScope,
    input.signal,
    module,
  );
  if (!composed.generation) {
    return {
      id: input.step.id,
      status: composed.error === "clarification_required" ? "clarification_required" : "unsupported",
      fields: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      warnings: [],
      error: composed.error ?? "missing_approved_metric_coverage",
    };
  }
  const { generation } = await runValidateSqlRuntimeTool({
    question: input.question,
    generation: composed.generation,
    queryPlan: input.queryPlan,
    analysisPlan: input.analysisPlan,
    module,
    devFullAccess: input.accessScope.devFullAccess,
    signal: input.signal,
  });
  if (!generation.valid) {
    return {
      id: input.step.id,
      status: "failed",
      fields: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      warnings: generation.warnings,
      semanticStatus: generation.semanticResult?.status,
      error: generation.guardResult.errors.join("; ") || "SQL generation is invalid.",
    };
  }
  const { execution } = await runExecuteSqlTool(
    generation,
    input.step.limit,
    input.accessScope,
    module,
    input.signal,
  );
  return {
    id: input.step.id,
    status: complexStepStatus(execution, generation.semanticResult?.status),
    fields: execution.fields,
    rows: execution.rows,
    rowCount: execution.rowCount,
    truncated: execution.truncated,
    warnings: execution.warnings,
    semanticStatus: generation.semanticResult?.status,
    ...(execution.error ? { error: execution.error } : {}),
  };
}

async function capabilityFailure(
  trace: SqlTraceContext,
  warnings: string[],
  capabilityCode: string,
  reasonCode: string,
  missingCoverage: string[] = [],
): Promise<ErpSqlToolchainOutput> {
  await recordFailure(trace, "planner", reasonCode);
  await finishTrace(trace, "failed");
  return formatOutput({
    success: false, trace, sql: "", warnings: merge(warnings, trace.warnings), error: reasonCode, analysis: null,
    outcome: "unsupported", capabilityCode, reasonCode, missingCoverage,
  });
}

function stepRunner(callbacks: TraceCallbacks) {
  return async function runStep<T>(
    id: string,
    tool: string,
    args: Record<string, unknown>,
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const runtimeStep: AgentRuntimePlanStep = { id, tool, args };
    const startedAt = Date.now();
    const timeout = stepTimeout(id);
    const scope = createLinkedAbortController({
      parent: callbacks.signal,
      timeoutMs: timeout.timeoutMs,
      timeoutStatus: timeout.status,
      timeoutCode: `ERP_SQL_${id.toUpperCase()}_TIMEOUT`,
      timeoutMessage: `${id} exceeded ${timeout.timeoutMs}ms`,
    });
    throwIfAborted(scope.signal);
    try {
      await callbacks.onToolStart?.({ step: runtimeStep });
      throwIfAborted(scope.signal);
      const result = await fn(scope.signal);
      throwIfAborted(scope.signal);
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
    } finally {
      scope.cleanup();
    }
  };
}

function stepTimeout(id: string): { timeoutMs: number; status: RuntimeLifecycleStatus } {
  if (id === "extract_sql_intent" || id === "analyze_sql_question" || id === "narrate_sql_result") {
    return { timeoutMs: positiveInt(process.env.ERP_SQL_LLM_STAGE_TIMEOUT_MS, 15_000), status: "first_token_slow" };
  }
  if (id === "generate_sql") {
    return { timeoutMs: positiveInt(process.env.ERP_SQL_GENERATE_TIMEOUT_MS, 60_000), status: "stream_slow" };
  }
  if (id === "validate_sql" || id === "runtime_guard_sql" || id.startsWith("compose_")) {
    return { timeoutMs: positiveInt(process.env.ERP_SQL_GUARD_STAGE_TIMEOUT_MS, 10_000), status: "guard/repair_slow" };
  }
  if (id === "execute_sql" || id === "execute_sql_template") {
    return { timeoutMs: positiveInt(process.env.ERP_QUERY_STAGE_TIMEOUT_MS, 20_000), status: "erp_query_slow" };
  }
  if (id === "find_sql_reference") {
    return { timeoutMs: positiveInt(process.env.ERP_SQL_REFERENCE_STAGE_TIMEOUT_MS, 5_000), status: "aborted" };
  }
  return { timeoutMs: positiveInt(process.env.ERP_SQL_DB_STAGE_TIMEOUT_MS, 10_000), status: "aborted" };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function startTrace(question: string, callbacks: TraceCallbacks): Promise<SqlTraceContext> {
  try {
    return await sqlTraceService.start(question, {
      sessionId: callbacks.sessionId,
      runId: callbacks.runId,
      ownerUserId: callbacks.ownerUserId,
      rolloutMode: currentRolloutMode(),
      accessScope: callbacks.accessScope,
    });
  } catch (error) {
    return {
      traceId: "trace-start-failed",
      question,
      startedAt: Date.now(),
      enabled: false,
      auditDegraded: true,
      sessionId: callbacks.sessionId,
      runId: callbacks.runId,
      ownerUserId: callbacks.ownerUserId,
      rolloutMode: currentRolloutMode(),
      accessScope: callbacks.accessScope,
      warnings: [
        `AUDIT_DEGRADED: SQL trace write failed: ${
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
  status: "success" | "failed" | "cancelled"
): Promise<void> {
  await recordTrace(trace, () => sqlTraceService.finish(trace, status));
}

const FINANCE_INTENT_PATTERN = /财务|毛利|利润|收入|成本|费用|金额|税|退款|回款|收款|付款|应收|应付/u;
const FINANCE_ESTIMATE_PATTERN = /估算|大概|大致|粗算|粗略|趋势|决策参考|参考一下|毛利大概/u;
const FINANCE_ESTIMATE_DISCLAIMER = "此数据不准确，仅供参考；不可用于财务报表、对账、审计或付款结算。";

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
  const outputMode = generation.warnings.some(isLowConfidenceMetricWarning) ? "estimate" : mode;
  if (!outputMode) return undefined;
  const allReferences = references.length ? references : generation.references ?? [];
  const fields = generation.guardResult.referencedFields;
  return {
    mode: outputMode,
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
    ...(outputMode === "estimate" ? { disclaimer: FINANCE_ESTIMATE_DISCLAIMER } : {}),
  };
}

function hasApprovedFinanceReference(references: SqlReferenceHint[]): boolean {
  return references.some((reference) => reference.sourceType === "metric" || reference.sourceType === "template");
}

function isStrictAnalysisBlocked(
  financeMode: FinanceSqlMode | undefined,
  analysisPlan: { mode?: string } | undefined,
): boolean {
  return financeMode === "strict" || analysisPlan?.mode === "strict";
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

function lowConfidenceMetricWarning(reason: string | undefined): string {
  return `low_confidence_metric_sql: 指标口径或拼接证据不足，此数据不准确，仅供参考${reason ? `；原因：${reason}` : ""}`;
}

function isLowConfidenceMetricWarning(warning: string): boolean {
  return warning.startsWith("low_confidence_metric_sql:");
}

function withRetrievalHints(question: string, analysisPlan: { retrievalHints?: string[] } | undefined): string {
  const hints = analysisPlan?.retrievalHints?.filter(Boolean) ?? [];
  return hints.length > 0 ? `${question}\n检索提示：${hints.join(" ")}` : question;
}

function requiresApprovedComposer(scenario: string | undefined): boolean {
  return scenario === "customer_product_yoy_trend";
}

function isCompositePlanUnsupported(
  analysisPlan: AnalysisPlan,
  composed: { generation?: SqlGenerationResult; error?: string; missingApprovedMetrics?: string[] },
): boolean {
  const requiredMetrics = [...new Set([...(analysisPlan.metrics ?? []), ...(analysisPlan.requiredMetrics ?? [])])];
  return !composed.generation
    && requiredMetrics.length > 1
    && composed.error !== "clarification_required"
    && Boolean(composed.error);
}

function buildResultScope(
  plan: AnalysisPlan | undefined,
  capability: string,
  templateFamilyId?: string,
): ErpSqlResultScope | undefined {
  if (!plan) return undefined;
  return {
    capability,
    metrics: [...plan.metrics],
    dimensions: [...plan.dimensions],
    filters: { ...plan.dimensionFilters },
    ...(plan.timeRange ? { timeRange: { ...plan.timeRange } } : {}),
    ...(plan.comparison ? { comparison: { ...plan.comparison } } : {}),
    templateCoverage: templateFamilyId ? [templateFamilyId] : [],
  };
}

function resolveExecutionPath(
  generation: SqlGenerationResult,
  financeMode: FinanceSqlMode | undefined,
): NonNullable<ErpSqlToolchainOutput["executionPath"]> {
  if (generation.source === "template") return "template";
  if (generation.scenario === "atomicMetricComposer" || generation.scenario === "approvedCompositeMetric") return "composer";
  if (financeMode === "estimate") return "estimate";
  return generation.source === "llm" ? "llm" : "rule";
}

const FILTER_FIELD_ALIASES: Record<string, string[]> = {
  customer: ["customer", "customername", "custid", "custnum", "客户", "客户名称", "客户编号"],
  order: ["order", "ordernum", "salesordernum", "订单", "订单号", "销售订单号"],
  supplier: ["supplier", "suppliername", "vendor", "vendorname", "vendornum", "供应商", "供应商名称"],
  product: ["product", "part", "partnum", "物料", "物料号", "产品", "产品编号"],
  warehouse: ["warehouse", "warehousecode", "whse", "whsecode", "仓库", "仓库编号"],
  job: ["job", "jobnum", "工单", "工单号"],
  product_category: ["productcategory", "prodcode", "产品类别", "产品分类"],
};

export function assertResultScope(scope: ErpSqlResultScope | undefined, fields: string[], rows: unknown[][]): string | undefined {
  if (!scope) return undefined;
  const normalizedFields = fields.map(normalizeFieldName);
  for (const [dimension, expected] of Object.entries(scope.filters)) {
    if (expected == null) continue;
    const aliases = FILTER_FIELD_ALIASES[dimension] ?? [dimension];
    const index = normalizedFields.findIndex((field) => aliases.map(normalizeFieldName).includes(field));
    if (index < 0) continue;
    if (rows.some((row) => row[index] != null && !scopeValueMatches(dimension, expected, row[index]))) {
      return `semantic_mismatch: result scope for ${dimension} does not match requested filter`;
    }
  }
  return undefined;
}

function normalizeFieldName(value: string): string {
  return value.replace(/^\[|\]$/gu, "").replace(/[^A-Za-z0-9\u4e00-\u9fff]+/gu, "").toLowerCase();
}

function scopeValueMatches(dimension: string, expected: string, actual: unknown): boolean {
  const expectedText = expected.trim();
  if (dimension === "order" && /^(?:0|[1-9]\d*)$/u.test(expectedText)) {
    if (typeof actual === "bigint") return actual >= 0n && actual.toString() === expectedText;
    if (typeof actual === "number" && Number.isSafeInteger(actual) && actual >= 0) return String(actual) === expectedText;
  }
  return typeof actual === "string" && actual.trim() === expectedText;
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
  semanticStatus?: ErpSqlToolchainOutput["semanticStatus"];
  clarificationQuestions?: string[];
  analysisPlan?: unknown;
  accessAudit?: ErpSqlToolchainOutput["accessAudit"];
  assumptions?: string[];
  outcome: ErpSqlToolchainOutput["outcome"];
  capabilityCode: string;
  executionPath?: ErpSqlToolchainOutput["executionPath"];
  reasonCode?: string;
  missingCoverage?: string[];
  scope?: ErpSqlResultScope;
  complexAnalysis?: ErpSqlToolchainOutput["complexAnalysis"];
}): ErpSqlToolchainOutput {
  const assumptions = merge(analysisPlanAssumptions(input.analysisPlan), input.assumptions ?? []);
  const analysis = input.analysis && assumptions.length > 0
    ? { ...input.analysis, caveats: merge(input.analysis.caveats, assumptions) }
    : input.analysis;
  const output = {
    success: input.success,
    traceId: input.trace.traceId,
    sql: input.sql,
    fields: input.fields ?? [],
    columns: buildResultColumns(input.fields ?? [], input.rows ?? [], input.sql, input.analysisPlan as any),
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
      input.outcome,
      input.reasonCode,
      input.clarificationQuestions,
    ),
    clarificationQuestions: input.clarificationQuestions,
    analysisPlan: input.analysisPlan,
    template: input.template,
    financeScope: input.financeScope,
    scope: input.scope,
    semanticStatus: input.semanticStatus,
    disclaimer: input.semanticStatus === "estimate" ? FINANCE_ESTIMATE_DISCLAIMER : undefined,
    accessAudit: input.accessAudit,
    outcome: input.outcome,
    capabilityCode: input.capabilityCode,
    executionPath: input.executionPath,
    reasonCode: input.reasonCode,
    missingCoverage: input.missingCoverage,
    complexAnalysis: input.complexAnalysis,
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
  outcome?: ErpSqlToolchainOutput["outcome"],
  reasonCode?: string,
  clarificationQuestions: string[] = [],
): string {
  if (outcome === "unsupported") return `当前 ERP SQL 能力尚未覆盖此请求（${reasonCode ?? "capability_not_published"}）。`;
  if (outcome === "clarify") {
    if (reasonCode === "missing_required_query_slot" && clarificationQuestions.length > 0) {
      return `可以。${clarificationQuestions[0]}`;
    }
    const detail = clarificationQuestions.length > 0 ? ` ${clarificationQuestions[0]}` : "需要补充口径后才能继续查询。";
    return `当前业务口径存在歧义，直接给结论可能不准；${detail}`;
  }
  const assumptionText = assumptions.length > 0 ? `\n默认口径：${assumptions.join("；")}` : "";
  if (error === "clarification_required") return "这个问题有几个可能口径，直接给结论可能不准。请先确认查询口径。";
  if (error?.startsWith("semantic_mismatch")) {
    return "当前候选 SQL 与问题所需业务口径不一致，结果可能不准，因此没有返回或执行。可以补充要查的业务口径后再试。";
  }
  if (error?.startsWith("blocked_missing_metric")) {
    return "当前精确指标口径还不完整，拼接结果置信度不足。此数据不准确，仅供参考；如需精确结果，需要补齐或审批对应指标口径。";
  }
  if (/timeout|deadline|slow|overloaded|queue is full|429/iu.test(error ?? "")) {
    return "当前 ERP SQL 服务繁忙或阶段超时，系统已停止继续排队或执行。请稍后重试，或缩小查询范围。";
  }
  if (/guard|schema|Referenced field|parse failed|invalid SQL|validation/iu.test(error ?? "")) {
    return "当前候选 SQL 没有通过结构或字段校验，直接执行可能不准，因此没有返回或执行。可以补充表字段口径后再试。";
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

function clarificationQuestionsForMissingCoverage(missingCoverage: string[]): string[] {
  if (missingCoverage.includes("slot:timeRange")) {
    return ["您想统计哪个时间范围？例如最近一个月、今年以来，或指定起止日期。"];
  }
  return [];
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

function readPreviousAnalysisContext(context: Record<string, unknown> | undefined): {
  analysisPlan?: AnalysisPlan;
  traceId?: string;
  conversation?: AnalysisConversationContext;
} {
  if (!context) return {};
  const value = context.analysisPlan;
  let analysisPlan = value && typeof value === "object" && !Array.isArray(value)
    && Array.isArray((value as Partial<AnalysisPlan>).metrics)
    && Array.isArray((value as Partial<AnalysisPlan>).dimensions)
    ? sanitizeAnalysisPlan(value as AnalysisPlan)
    : undefined;
  const conversation = context.conversationContext;
  const recentMessages = conversation && typeof conversation === "object" && !Array.isArray(conversation)
    ? (conversation as { recentMessages?: unknown }).recentMessages
    : undefined;
  const restoredRule = Array.isArray(recentMessages)
    ? recentMessages.slice().reverse().flatMap((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return [];
      const value = message as { role?: unknown; content?: unknown };
      const rule = value.role === "user" && typeof value.content === "string" ? parseUserDimensionRule(value.content) : undefined;
      return rule ? [rule] : [];
    })[0]
    : undefined;
  if (analysisPlan && restoredRule) analysisPlan = { ...analysisPlan, dimensionRules: [restoredRule] };
  return {
    ...(analysisPlan ? { analysisPlan } : {}),
    ...(typeof context.traceId === "string" ? { traceId: context.traceId } : {}),
    ...(Array.isArray(recentMessages) ? {
      conversation: {
        recentMessages: recentMessages.flatMap((message) => {
          if (!message || typeof message !== "object" || Array.isArray(message)) return [];
          const value = message as { id?: unknown; role?: unknown; content?: unknown };
          return (value.role === "user" || value.role === "assistant") && typeof value.content === "string"
            ? [{ ...(typeof value.id === "string" ? { id: value.id } : {}), role: value.role as "user" | "assistant", content: value.content.slice(0, 2000) }]
            : [];
        }).slice(-6),
        ...((conversation as { semanticSummary?: unknown }).semanticSummary && typeof (conversation as { semanticSummary?: unknown }).semanticSummary === "string"
          ? { semanticSummary: ((conversation as { semanticSummary: string }).semanticSummary).slice(0, 4000) }
          : {}),
      },
    } : {}),
  };
}

function sanitizeAnalysisPlan(plan: AnalysisPlan): AnalysisPlan {
  const dimensionRules = (plan.dimensionRules ?? []).flatMap((rule) => {
    if (!Array.isArray(rule.members) || rule.members.length < 2 || !rule.members.every((member) => typeof member === "string")) return [];
    const target = typeof rule.target === "string" ? rule.target : plan.dimensionFilters?.[rule.dimension];
    return typeof target === "string" ? [{ ...rule, target }] : [];
  });
  return { ...plan, ...(dimensionRules.length > 0 ? { dimensionRules } : { dimensionRules: undefined }) };
}
