import "../../../config/env.js";

import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentRuntimePlanStep, AgentRuntimeToolTraceFinish } from "../../../ai/agentRuntime/types.js";
import { configureLlmConcurrencyLimit } from "../../../ai/llm/llmConcurrency.js";
import { runErpSqlToolchainWorkflow } from "../../../ai/mastra/workflows/erpSqlToolchain.workflow.js";
import { configurePrismaConcurrencyLimit, prisma } from "../../../lib/prisma.js";
import { configureSqlGuardConcurrencyLimit } from "../sqlGuard/service/sqlGuardConcurrency.js";
import { metricMatchesExpectedFamily, semanticMismatchError } from "../runtimeGuard/index.js";
import { loadSqlTemplateGoldenQuestions } from "../templates/service/SqlTemplateRetrievalEvalService.js";

export { metricMatchesExpectedFamily, semanticMismatchError } from "../runtimeGuard/index.js";

type GoldenSqlGenerationResult = {
  businessType?: string;
  question: string;
  generated: boolean;
  source?: string;
  scenario?: string;
  sql?: string;
  error?: string;
  guardErrors: string[];
  category: "ok" | "missing_field" | "missing_table" | "no_sql" | "invalid_sql" | "runtime_error" | "semantic_mismatch";
  failureKind: "success" | "schema_guard" | "semantic_mismatch" | "clarification_required" | "llm_empty_or_parse" | "infra";
  metricCodes: string[];
  actualFamilyIds: string[];
  referenceFamilies: Array<{ familyId: string; sourceType?: string; metricCode?: string; score?: number }>;
  templateId?: string;
  expectedFamilyIds: string[];
  expectedFamily?: string;
  warnings: string[];
  fastPathDiagnosis?: string;
  toolTimings?: ToolTiming[];
  attempts: number;
  attempt: number;
  timingMs: number;
};

type ToolTiming = {
  id: string;
  tool: string;
  durationMs?: number;
  status: "started" | "success" | "error";
  summary?: string;
};

const ORIGINAL_EXECUTE = process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
const ORIGINAL_DRY_RUN_TEMPLATES = process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES;
const ORIGINAL_TRACE_ENABLED = process.env.ERP_SQL_AGENT_TRACE_ENABLED;
const ORIGINAL_LLM_CALL_LOG_DISABLED = process.env.LLM_CALL_LOG_DISABLED;
const ORIGINAL_LLM_PROGRESS_STDERR = process.env.ERP_SQL_LLM_PROGRESS_STDERR;

async function main(): Promise<void> {
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "false";
  process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES = "true";
  process.env.ERP_SQL_AGENT_TRACE_ENABLED = "false";
  const args = parseArgs(process.argv.slice(2));
  process.env.LLM_CALL_LOG_DISABLED = args["llm-call-log"] === true ? "false" : "true";
  if (args["llm-progress"] === true) process.env.ERP_SQL_LLM_PROGRESS_STDERR = "true";
  const retries = Math.max(0, Number(args.retries ?? 0));
  const llmConcurrency = normalizeConcurrency(args["llm-concurrency"] ?? args.concurrency, 64);
  const dbConcurrency = normalizeConcurrency(args["db-concurrency"], 2);
  const guardConcurrency = normalizeConcurrency(args["guard-concurrency"], 4);
  const caseTimeoutMs = normalizeConcurrency(args["case-timeout-ms"], 120000);
  const retryInfraOnly = args["retry-infra-only"] === true;
  configurePrismaConcurrencyLimit(dbConcurrency);
  configureLlmConcurrencyLimit(llmConcurrency);
  configureSqlGuardConcurrencyLimit(guardConcurrency);
  const outFile = typeof args.out === "string" ? args.out : undefined;
  if (outFile) await mkdir(dirname(outFile), { recursive: true });
  const completedQuestions = outFile && args["skip-out-existing"]
    ? await readCompletedQuestions(outFile, args["skip-success-existing"] === true)
    : new Set<string>();
  const existingInfraQuestions = outFile && args["only-existing-infra"]
    ? await readLatestInfraQuestions(outFile)
    : undefined;
  const cases = selectCases(loadSqlTemplateGoldenQuestions(), args)
    .filter((item) => !existingInfraQuestions || existingInfraQuestions.has(item.question))
    .filter((item) => !completedQuestions.has(item.question));
  const results: GoldenSqlGenerationResult[] = [];
  let nextIndex = 0;
  let writeChain = Promise.resolve();
  const writeResult = async (result: GoldenSqlGenerationResult) => {
    results.push(result);
    if (outFile) {
      writeChain = writeChain.then(() => appendFile(outFile, `${JSON.stringify(result)}\n`, "utf8"));
      await writeChain;
    }
    console.log(JSON.stringify(result, null, 2));
  };
  await Promise.all(Array.from({ length: Math.min(llmConcurrency, cases.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = cases[index];
      if (!item) return;
      await runCase(item, retries, retryInfraOnly, caseTimeoutMs, writeResult);
    }
  }));
  await writeChain;

  const finalResults = latestResultByQuestion(results);

  console.log(JSON.stringify({
    total: finalResults.length,
    attempts: results.length,
    generatedCount: finalResults.filter((item) => item.generated).length,
    failedCount: finalResults.filter((item) => !item.generated).length,
    businessFailedCount: finalResults.filter((item) => !item.generated && item.failureKind !== "infra").length,
    infraFailedCount: finalResults.filter((item) => item.failureKind === "infra").length,
    categories: finalResults.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
    failureKinds: finalResults.reduce<Record<string, number>>((counts, item) => {
      counts[item.failureKind] = (counts[item.failureKind] ?? 0) + 1;
      return counts;
    }, {}),
    concurrency: {
      db: dbConcurrency,
      llm: llmConcurrency,
      guard: guardConcurrency,
      caseTimeoutMs,
    },
    failedQuestions: finalResults.filter((item) => !item.generated).map((item) => item.question),
  }, null, 2));
}

async function runCase(
  item: ReturnType<typeof loadSqlTemplateGoldenQuestions>[number],
  retries: number,
  retryInfraOnly: boolean,
  caseTimeoutMs: number,
  writeResult: (result: GoldenSqlGenerationResult) => Promise<void>,
): Promise<GoldenSqlGenerationResult> {
  let last: GoldenSqlGenerationResult | undefined;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const startedAt = Date.now();
    const audit: RuntimeAudit = { metricCodes: [], guardErrors: [], references: [], toolTimings: [] };
    const controller = new AbortController();
    try {
      const result = await withTimeout(runErpSqlToolchainWorkflow({ question: item.question }, {
        signal: controller.signal,
        onToolStart: async (event) => collectRuntimeToolStart(audit, event.step),
        onToolFinish: async (event) => collectRuntimeAudit(audit, event),
      }), caseTimeoutMs, controller);
      const sql = result.sql.trim();
      const expectedFamilyIds = item.expectedFamilyIds ?? [];
      const actualFamilyIds = uniqueStrings(audit.references.map((reference) => reference.familyId));
      const guardGenerated = Boolean(sql) && result.success;
      const semanticError = guardGenerated ? semanticMismatchError(item.businessType, expectedFamilyIds, audit.references) : undefined;
      const generated = guardGenerated && !semanticError;
      last = {
        businessType: item.businessType,
        question: item.question,
        generated,
        source: audit.source,
        scenario: audit.scenario,
        sql: result.sql,
        error: semanticError ?? result.error,
        guardErrors: audit.guardErrors,
        category: semanticError ? "semantic_mismatch" : classifyResult(result.success, sql, result.error, audit.guardErrors),
        failureKind: semanticError ? "semantic_mismatch" : classifyFailureKind(result.success, sql, result.error, audit.guardErrors),
        metricCodes: [...new Set(audit.metricCodes)],
        actualFamilyIds,
        referenceFamilies: audit.references,
        templateId: result.template?.id,
        expectedFamilyIds,
        expectedFamily: item.businessType,
        warnings: result.warnings,
        fastPathDiagnosis: diagnoseFastPath(audit),
        toolTimings: audit.toolTimings,
        attempts: attempt,
        attempt,
        timingMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      last = {
        businessType: item.businessType,
        question: item.question,
        generated: false,
        guardErrors: [],
        category: "runtime_error",
        failureKind: classifyRuntimeFailure(message),
        metricCodes: [],
        actualFamilyIds: [],
        referenceFamilies: [],
        expectedFamilyIds: item.expectedFamilyIds ?? [],
        error: message,
        warnings: [],
        fastPathDiagnosis: diagnoseFastPath(audit),
        toolTimings: audit.toolTimings,
        attempts: attempt,
        attempt,
        timingMs: Date.now() - startedAt,
      };
    }
    await writeResult(last);
    if (last.generated) return last;
    if (retryInfraOnly && last.failureKind !== "infra") return last;
  }
  return last!;
}

type RuntimeAudit = {
  source?: string;
  scenario?: string;
  metricCodes: string[];
  references: Array<{ familyId: string; sourceType?: string; metricCode?: string; score?: number }>;
  guardErrors: string[];
  toolTimings: ToolTiming[];
};

function collectRuntimeToolStart(audit: RuntimeAudit, step: AgentRuntimePlanStep): void {
  audit.toolTimings.push({ id: step.id, tool: step.tool, status: "started" });
}

function collectRuntimeAudit(audit: RuntimeAudit, event: AgentRuntimeToolTraceFinish): void {
  const result = event.result;
  const value = readRecord(result);
  const generation = readRecord(value.generation);
  if (typeof generation.source === "string") audit.source = generation.source;
  if (typeof generation.scenario === "string") audit.scenario = generation.scenario;
  const guard = readRecord(generation.guardResult ?? value.guardResult);
  audit.guardErrors.push(...readStringArray(guard.errors));
  for (const reference of readArray(generation.references ?? value.references)) {
    const record = readRecord(reference);
    if (typeof record.metricCode === "string") audit.metricCodes.push(record.metricCode);
    if (typeof record.familyId === "string") {
      audit.references.push({
        familyId: record.familyId,
        ...(typeof record.sourceType === "string" ? { sourceType: record.sourceType } : {}),
        ...(typeof record.metricCode === "string" ? { metricCode: record.metricCode } : {}),
        ...(typeof record.score === "number" ? { score: record.score } : {}),
      });
    }
  }
  const current = [...audit.toolTimings].reverse().find((item) => item.id === event.step.id && item.status === "started");
  if (current) {
    current.status = event.error ? "error" : "success";
    current.durationMs = event.durationMs;
    current.summary = summarizeToolResult(current.id, value, generation);
  }
}

function summarizeToolResult(id: string, value: Record<string, unknown>, generation: Record<string, unknown>): string | undefined {
  if (id === "find_sql_template") {
    const candidates = readArray(value.candidates);
    const candidate = readRecord(value.candidate);
    const timings = readArray(value.timings).map(readRecord);
    const timingSummary = timings
      .filter((item) => typeof item.stage === "string" && typeof item.durationMs === "number")
      .map((item) => `${item.stage}:${item.durationMs}ms${typeof item.detail === "string" ? `(${item.detail})` : ""}`)
      .join(",");
    return `candidates=${candidates.length}; selected=${typeof candidate.id === "string" ? candidate.id : "none"}${timingSummary ? `; timings=${timingSummary}` : ""}`;
  }
  if (id === "compose_approved_composite_metric" || id === "compose_atomic_metrics") {
    const timings = readArray(generation.composerTimings)
      .map((item) => readRecord(item))
      .map((item) => `${String(item.stage ?? "unknown")}=${String(item.durationMs ?? "?")}ms`)
      .join("; ");
    return `generated=${Boolean(value.generation)}; error=${String(value.error ?? "none")}${timings ? `; ${timings}` : ""}`;
  }
  if (id === "find_sql_reference") {
    const timings = readArray(value.timings).map(readRecord);
    const timingSummary = timings
      .filter((item) => typeof item.stage === "string" && typeof item.durationMs === "number")
      .map((item) => `${item.stage}:${item.durationMs}ms${typeof item.detail === "string" ? `(${item.detail})` : ""}`)
      .join(",");
    return `references=${readArray(value.references).length}${timingSummary ? `; timings=${timingSummary}` : ""}`;
  }
  if (id === "generate_sql") return `source=${String(generation.source ?? "none")}; scenario=${String(generation.scenario ?? "none")}`;
  if (id === "validate_sql") return `valid=${String(readRecord(value.guardResult).valid ?? "unknown")}`;
  return undefined;
}

function diagnoseFastPath(audit: RuntimeAudit): string {
  const running = audit.toolTimings.find((item) => item.status === "started");
  if (running) return `in_progress: ${running.id}`;
  const template = audit.toolTimings.find((item) => item.id === "find_sql_template")?.summary ?? "";
  const metric = audit.toolTimings.filter((item) => item.id === "compose_approved_composite_metric" || item.id === "compose_atomic_metrics");
  const generated = audit.toolTimings.find((item) => item.id === "generate_sql")?.summary ?? "";
  if (audit.toolTimings.some((item) => item.id === "execute_sql_template")) return "template_fast_path_selected";
  if (audit.scenario === "atomicMetricComposer" || audit.scenario === "approvedCompositeMetric") return "metric_fast_path_selected";
  if (/source=llm; scenario=llmFallback/u.test(generated) || audit.scenario === "llmFallback") {
    const metricFailed = metric.map((item) => item.summary).filter(Boolean).join(" | ");
    if (/selected=none/u.test(template) && metricFailed) return `no_fast_path_then_llm_fallback: template ${template}; metric ${metricFailed}`;
    if (/selected=none/u.test(template)) return `no_template_fast_path_then_llm_fallback: template ${template}`;
    return "llm_fallback_selected";
  }
  return "undetermined";
}

function classifyResult(
  success: boolean,
  sql: string,
  error: string | undefined,
  guardErrors: string[],
): GoldenSqlGenerationResult["category"] {
  const errors = [...guardErrors, error ?? ""].join("\n");
  if (success && sql) return "ok";
  if (/Referenced field does not exist in schema metadata/iu.test(errors)) return "missing_field";
  if (/Referenced table does not exist in schema metadata/iu.test(errors)) return "missing_table";
  if (!sql) return "no_sql";
  return "invalid_sql";
}

function classifyFailureKind(
  success: boolean,
  sql: string,
  error: string | undefined,
  guardErrors: string[],
): GoldenSqlGenerationResult["failureKind"] {
  if (success && sql) return "success";
  const errors = [...guardErrors, error ?? ""].join("\n");
  if (isInfraError(errors)) return "infra";
  if (/clarification_required|澄清|请补充|需要确认/iu.test(errors)) return "clarification_required";
  if (/schema_evidence_missing|blocked_missing_metric|Referenced (field|table) does not exist in schema metadata|SQL parse failed|Only SELECT|banned|not allowed/iu.test(errors)) return "schema_guard";
  if (!sql || /empty content|parse|json|LLM SQL fallback failed/iu.test(errors)) return "llm_empty_or_parse";
  return "schema_guard";
}

function classifyRuntimeFailure(message: string): GoldenSqlGenerationResult["failureKind"] {
  return isInfraError(message) ? "infra" : "llm_empty_or_parse";
}

function isInfraError(message: string): boolean {
  return /case_timeout|Prisma|connection pool|Timed out fetching a new connection|Can't reach database server|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network/iu.test(message);
}

function selectCases(cases: ReturnType<typeof loadSqlTemplateGoldenQuestions>, args: Record<string, string | boolean>) {
  let selected = args["business-type"]
    ? cases.filter((item) => item.businessType === args["business-type"])
    : cases;
  if (args.tag) selected = selected.filter((item) => item.tags?.includes(String(args.tag)));
  if (args.contains) selected = selected.filter((item) => item.question.includes(String(args.contains)));
  if (args["per-type"]) {
    const seen = new Set<string>();
    selected = selected.filter((item) => {
      const key = item.businessType ?? "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const limit = Number(args.limit ?? 0);
  const offset = Math.max(0, Number(args.offset ?? 0));
  const sliced = offset > 0 ? selected.slice(offset) : selected;
  return limit > 0 ? sliced.slice(0, limit) : sliced;
}

function parseArgs(items: string[]): Record<string, string | boolean> {
  return Object.fromEntries(items.map((item) => {
    const normalized = item.replace(/^--/, "");
    const index = normalized.indexOf("=");
    return index === -1 ? [normalized, true] : [normalized.slice(0, index), normalized.slice(index + 1)];
  }));
}

function normalizeConcurrency(value: string | boolean | undefined, fallback: number): number {
  const numeric = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function latestResultByQuestion(results: GoldenSqlGenerationResult[]): GoldenSqlGenerationResult[] {
  return [...results.reduce<Map<string, GoldenSqlGenerationResult>>((latest, result) => {
    latest.set(result.question, result);
    return latest;
  }, new Map()).values()];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller?: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller?.abort();
      reject(new Error(`case_timeout: exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function readCompletedQuestions(filePath: string, successOnly: boolean): Promise<Set<string>> {
  try {
    const content = await readFile(filePath, "utf8");
    return new Set(content
      .split(/\n/gu)
      .filter(Boolean)
      .map((line) => readRecord(JSON.parse(line)))
      .filter((row) => !successOnly || row.generated === true)
      .map((row) => row.question)
      .filter((question): question is string => typeof question === "string"));
  } catch {
    return new Set();
  }
}

async function readLatestInfraQuestions(filePath: string): Promise<Set<string>> {
  try {
    const latest = new Map<string, Record<string, unknown>>();
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\n/gu).filter(Boolean)) {
      const row = readRecord(JSON.parse(line));
      if (typeof row.question === "string") latest.set(row.question, row);
    }
    return new Set([...latest.values()]
      .filter((row) => row.generated !== true && (row.failureKind === "infra" || isInfraError(String(row.error ?? ""))))
      .map((row) => row.question)
      .filter((question): question is string => typeof question === "string"));
  } catch {
    return new Set();
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      if (ORIGINAL_EXECUTE === undefined) delete process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
      else process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = ORIGINAL_EXECUTE;
      if (ORIGINAL_DRY_RUN_TEMPLATES === undefined) delete process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES;
      else process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES = ORIGINAL_DRY_RUN_TEMPLATES;
      if (ORIGINAL_TRACE_ENABLED === undefined) delete process.env.ERP_SQL_AGENT_TRACE_ENABLED;
      else process.env.ERP_SQL_AGENT_TRACE_ENABLED = ORIGINAL_TRACE_ENABLED;
      if (ORIGINAL_LLM_CALL_LOG_DISABLED === undefined) delete process.env.LLM_CALL_LOG_DISABLED;
      else process.env.LLM_CALL_LOG_DISABLED = ORIGINAL_LLM_CALL_LOG_DISABLED;
      if (ORIGINAL_LLM_PROGRESS_STDERR === undefined) delete process.env.ERP_SQL_LLM_PROGRESS_STDERR;
      else process.env.ERP_SQL_LLM_PROGRESS_STDERR = ORIGINAL_LLM_PROGRESS_STDERR;
      await prisma.$disconnect().catch(() => undefined);
    });
}
