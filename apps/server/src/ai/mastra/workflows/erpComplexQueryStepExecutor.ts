import { assertModuleAllowed, requireTemplateModuleAccessMapping, type ErpSqlAccessScope } from "../../../modules/erpSqlAgent/access/index.js";
import type { ComplexQueryStep, ComplexQueryStepResult } from "../../../modules/erpSqlAgent/complexQuery/index.js";
import {
  DIAGNOSTIC_LLM_SQL_FALLBACK_WARNING,
  qualifiesForAllBusinessGatesDiagnostic,
} from "../../../modules/erpSqlAgent/diagnostic/index.js";
import { resolveCapability } from "../../../modules/erpSqlAgent/capabilities/registry.js";
import type { SqlGenerationResult } from "../../../modules/erpSqlAgent/generator/index.js";
import type { SqlExecutionResult } from "../../../modules/erpSqlAgent/executor/index.js";
import type { AnalysisPlan, QueryPlan } from "../../../modules/erpSqlAgent/planner/index.js";
import { isAbortError } from "../../../lib/abort.js";
import {
  runDecideSqlCapabilityTool,
  runComposeAtomicMetricsTool,
  runExecuteSqlTemplateTool,
  runExecuteSqlTool,
  runFindSqlReferenceTool,
  runFindSqlTemplateTool,
  runGenerateSqlTool,
  runValidateSqlRuntimeTool,
  runValidateSqlTool,
} from "../tools/erpSql/toolchain.tools.js";

export type DiagnosticComplexStepInput = {
  question: string;
  step: ComplexQueryStep;
  analysisPlan: AnalysisPlan;
  queryPlan: QueryPlan;
  accessScope: ErpSqlAccessScope;
  signal: AbortSignal;
  audit?: {
    recordGeneration(generation: SqlGenerationResult): Promise<void>;
    recordExecution(execution: SqlExecutionResult, elapsedMs: number): Promise<void>;
  };
};

export async function executeDiagnosticComplexQueryStep(
  input: DiagnosticComplexStepInput,
): Promise<ComplexQueryStepResult> {
  assertModuleAllowed(input.accessScope, [input.step.module]);
  if (input.step.module === "finance" && input.accessScope.sensitive.finance !== "full") {
    throw new Error("ERP_SQL_ACCESS_DENIED: full finance scope is required for diagnostic finance steps");
  }

  const diagnosticBusinessGateBypass = qualifiesForAllBusinessGatesDiagnostic(input.analysisPlan, input.accessScope);
  const coverage = diagnosticRequiredCoverage(input.analysisPlan);
  let usedLlmFallback = false;
  try {
    if (!diagnosticBusinessGateBypass) return executeLegacyComplexQueryStep(input, coverage);
    const template = await runFindSqlTemplateTool({
      question: input.question,
      requiredMetrics: input.step.metrics,
      analysisPlan: input.analysisPlan,
      slots: templateSlots(input.analysisPlan),
    }, input.signal);
    if (template.candidate && template.params && templateMatchesStepModule(template.candidate.module, input.step.module)) {
      const executionStart = Date.now();
      const selected = await runExecuteSqlTemplateTool({
        candidate: template.candidate,
        params: template.params,
        maxRows: input.step.limit,
      }, input.accessScope, input.signal, {
        question: input.question,
        queryPlan: input.queryPlan,
        analysisPlan: input.analysisPlan,
        financeMode: "estimate",
        diagnosticBusinessGateBypass,
        diagnosticRequiredCoverage: coverage,
      });
      await input.audit?.recordGeneration(selected.generation);
      await input.audit?.recordExecution(selected.execution, Date.now() - executionStart);
      if (selected.execution.valid && selected.execution.executed) {
        return completed(input.step.id, "template", selected.generation, selected.execution);
      }
    }

    const composed = await runComposeAtomicMetricsTool(
      input.question,
      input.analysisPlan,
      "estimate",
      input.accessScope,
      input.signal,
      input.step.module,
      { allowDiagnosticUnapprovedMetrics: true },
    );
    if (composed.generation) {
      const validated = await validateGeneration(input, composed.generation, coverage, diagnosticBusinessGateBypass, "estimate");
      if (validated.valid) return executeValidated(input, validated, "composer", diagnosticBusinessGateBypass);
      await input.audit?.recordGeneration(validated);
    }

    usedLlmFallback = true;
    const references = await runFindSqlReferenceTool({
      question: input.question,
      plan: input.queryPlan,
    }, input.signal);
    const generated = await runGenerateSqlTool(
      { ...input.queryPlan, question: input.question, diagnosticAnalysisPlan: input.analysisPlan },
      references.references,
      "estimate",
      input.signal,
      input.accessScope,
      { diagnosticBypassBusinessGates: diagnosticBusinessGateBypass },
    );
    const schema = await runValidateSqlTool(generated.generation.sql || generated.generation.candidateSql || "", {
      module: input.step.module,
      financeMode: "estimate",
      references: references.references,
      signal: input.signal,
    });
    const generation: SqlGenerationResult = {
      ...generated.generation,
      valid: schema.guardResult.valid,
      sql: schema.guardResult.valid ? generated.generation.sql : "",
      guardResult: schema.guardResult,
      references: generated.generation.references ?? references.references,
      warnings: unique([...generated.generation.warnings, ...schema.guardResult.warnings, DIAGNOSTIC_LLM_SQL_FALLBACK_WARNING]),
    };
    return validateAndExecute(input, generation, "llm", coverage, diagnosticBusinessGateBypass, "estimate");
  } catch (error) {
    if (isAbortError(error) || input.signal.aborted) throw error;
    return failed(
      input.step.id,
      error instanceof Error ? error.message : String(error),
      usedLlmFallback ? "llm" : undefined,
      undefined,
      usedLlmFallback ? [DIAGNOSTIC_LLM_SQL_FALLBACK_WARNING] : [],
    );
  }
}

async function validateAndExecute(
  input: DiagnosticComplexStepInput,
  generation: SqlGenerationResult,
  source: "composer" | "llm",
  coverage: ReturnType<typeof diagnosticRequiredCoverage>,
  diagnosticBusinessGateBypass = qualifiesForAllBusinessGatesDiagnostic(input.analysisPlan, input.accessScope),
  financeMode?: "estimate",
): Promise<ComplexQueryStepResult> {
  const validated = await validateGeneration(input, generation, coverage, diagnosticBusinessGateBypass, financeMode);
  if (!validated.valid) {
    await input.audit?.recordGeneration(validated);
    return failed(
      input.step.id,
      validated.guardResult.errors.join("; ") || "SQL generation is invalid.",
      source,
      validated,
    );
  }
  return executeValidated(input, validated, source, diagnosticBusinessGateBypass);
}

async function validateGeneration(
  input: DiagnosticComplexStepInput,
  generation: SqlGenerationResult,
  coverage: ReturnType<typeof diagnosticRequiredCoverage>,
  diagnosticBusinessGateBypass: boolean,
  financeMode?: "estimate",
): Promise<SqlGenerationResult> {
  if (!generation.valid) return generation;
  const { generation: validated } = await runValidateSqlRuntimeTool({
    question: input.question,
    generation,
    queryPlan: input.queryPlan,
    analysisPlan: input.analysisPlan,
    financeMode,
    module: input.step.module,
    devFullAccess: input.accessScope.devFullAccess,
    signal: input.signal,
    diagnosticBusinessGateBypass,
    diagnosticRequiredCoverage: coverage,
  });
  return validated;
}

async function executeValidated(
  input: DiagnosticComplexStepInput,
  generation: SqlGenerationResult,
  source: "composer" | "llm",
  diagnosticBusinessGateBypass: boolean,
): Promise<ComplexQueryStepResult> {
  await input.audit?.recordGeneration(generation);
  const executionStart = Date.now();
  const { execution } = await runExecuteSqlTool(
    generation,
    input.step.limit,
    input.accessScope,
    input.step.module,
    input.signal,
    diagnosticBusinessGateBypass,
  );
  await input.audit?.recordExecution(execution, Date.now() - executionStart);
  return completed(input.step.id, source, generation, execution);
}

async function executeLegacyComplexQueryStep(
  input: DiagnosticComplexStepInput,
  coverage: ReturnType<typeof diagnosticRequiredCoverage>,
): Promise<ComplexQueryStepResult> {
  const decision = runDecideSqlCapabilityTool(input.analysisPlan, resolveCapability(input.step.capabilityCode), input.analysisPlan.dimensionFilters?.product ? ["partNum"] : []);
  if (decision.outcome !== "execute") {
    return unsupported(input.step.id, decision.reasonCode ?? "missing_step_capability_coverage");
  }
  const composed = await runComposeAtomicMetricsTool(
    input.question,
    input.analysisPlan,
    undefined,
    input.accessScope,
    input.signal,
    input.step.module,
  );
  if (!composed.generation) {
    return unsupported(input.step.id, composed.error ?? "missing_approved_metric_coverage", composed.error === "clarification_required");
  }
  return validateAndExecute(input, composed.generation, "composer", coverage, false, undefined);
}

function completed(
  id: string,
  source: "template" | "composer" | "llm",
  generation: SqlGenerationResult,
  execution: { valid: boolean; executed: boolean; fields: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; warnings: string[]; error?: string },
): ComplexQueryStepResult {
  const semanticStatus = generation.semanticResult?.status;
  return {
    id,
    status: !execution.valid || !execution.executed || semanticStatus === "semantic_mismatch"
      ? "failed"
      : execution.truncated || semanticStatus === "estimate" ? "partial" : "completed",
    source,
    sqlCount: 1,
    fields: execution.fields,
    rows: execution.rows,
    rowCount: execution.rowCount,
    truncated: execution.truncated,
    warnings: unique([...generation.warnings, ...execution.warnings]),
    semanticStatus,
    ...(execution.error ? { error: execution.error } : {}),
  };
}

function failed(
  id: string,
  error: string,
  source?: "composer" | "llm",
  generation?: SqlGenerationResult,
  warnings: string[] = [],
): ComplexQueryStepResult {
  return {
    id,
    status: "failed",
    ...(source ? { source, sqlCount: generation?.sql || generation?.candidateSql ? 1 as const : 0 as const } : { sqlCount: 0 as const }),
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: unique([...(generation?.warnings ?? []), ...warnings]),
    semanticStatus: generation?.semanticResult?.status,
    error,
  };
}

function unsupported(id: string, error: string, clarification = false): ComplexQueryStepResult {
  return {
    id,
    status: clarification ? "clarification_required" : "unsupported",
    sqlCount: 0,
    fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error,
  };
}

function diagnosticRequiredCoverage(plan: AnalysisPlan) {
  const explicit = plan.diagnosticExplicitCoverage;
  return {
    time: explicit?.time ?? false,
    filters: [
      ...Object.entries(plan.dimensionFilters ?? {}).map(([dimension, value]) => `${dimension}=${value}`),
      ...(explicit?.filters ?? []),
    ],
    sorting: explicit?.sorting ?? false,
    limit: explicit?.limit ?? false,
  };
}

function templateSlots(plan: AnalysisPlan): Record<string, string | number | boolean | null> {
  const names: Record<string, string> = {
    customer: "customerName",
    order: "orderNum",
    supplier: "vendorName",
    product: "partNum",
    warehouse: "warehouseCode",
    job: "jobNum",
  };
  return Object.fromEntries(
    Object.entries(plan.dimensionFilters ?? {}).map(([dimension, value]) => [names[dimension] ?? dimension, value]),
  );
}

function templateMatchesStepModule(candidateModule: string, stepModule: ComplexQueryStep["module"]): boolean {
  try {
    return requireTemplateModuleAccessMapping(candidateModule) === stepModule;
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
