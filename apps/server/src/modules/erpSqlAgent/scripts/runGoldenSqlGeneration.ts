import "../../../config/env.js";

import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runErpSqlToolchainWorkflow } from "../../../ai/mastra/workflows/erpSqlToolchain.workflow.js";
import { prisma } from "../../../lib/prisma.js";
import { loadSqlTemplateGoldenQuestions } from "../templates/service/SqlTemplateRetrievalEvalService.js";

type GoldenSqlGenerationResult = {
  businessType?: string;
  question: string;
  generated: boolean;
  source?: string;
  scenario?: string;
  sql?: string;
  error?: string;
  guardErrors: string[];
  category: "ok" | "missing_field" | "missing_table" | "no_sql" | "invalid_sql" | "runtime_error";
  metricCodes: string[];
  templateId?: string;
  expectedFamily?: string;
  warnings: string[];
  attempts: number;
};

const ORIGINAL_EXECUTE = process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
const ORIGINAL_DRY_RUN_TEMPLATES = process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES;

async function main(): Promise<void> {
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "false";
  process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES = "true";
  const args = parseArgs(process.argv.slice(2));
  const retries = Math.max(0, Number(args.retries ?? 0));
  const concurrency = Math.max(1, Number(args.concurrency ?? 1));
  const outFile = typeof args.out === "string" ? args.out : undefined;
  if (outFile) await mkdir(dirname(outFile), { recursive: true });
  const completedQuestions = outFile && args["skip-out-existing"]
    ? await readCompletedQuestions(outFile, args["skip-success-existing"] === true)
    : new Set<string>();
  const cases = selectCases(loadSqlTemplateGoldenQuestions(), args)
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
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = cases[index];
      if (!item) return;
      await writeResult(await runCase(item, retries));
    }
  }));
  await writeChain;

  console.log(JSON.stringify({
    total: results.length,
    generatedCount: results.filter((item) => item.generated).length,
    failedCount: results.filter((item) => !item.generated).length,
    categories: results.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
    failedQuestions: results.filter((item) => !item.generated).map((item) => item.question),
  }, null, 2));
}

async function runCase(
  item: ReturnType<typeof loadSqlTemplateGoldenQuestions>[number],
  retries: number,
): Promise<GoldenSqlGenerationResult> {
  let last: GoldenSqlGenerationResult | undefined;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const audit: RuntimeAudit = { metricCodes: [], guardErrors: [] };
    try {
      const result = await runErpSqlToolchainWorkflow({ question: item.question }, {
        onToolFinish: async (event) => collectRuntimeAudit(audit, event.result),
      });
      const sql = result.sql.trim();
      last = {
        businessType: item.businessType,
        question: item.question,
        generated: Boolean(sql) && result.success,
        source: audit.source,
        scenario: audit.scenario,
        sql: result.sql,
        error: result.error,
        guardErrors: audit.guardErrors,
        category: classifyResult(result.success, sql, result.error, audit.guardErrors),
        metricCodes: [...new Set(audit.metricCodes)],
        templateId: result.template?.id,
        expectedFamily: item.businessType,
        warnings: result.warnings,
        attempts: attempt,
      };
    } catch (error) {
      last = {
        businessType: item.businessType,
        question: item.question,
        generated: false,
        guardErrors: [],
        category: "runtime_error",
        metricCodes: [],
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
        attempts: attempt,
      };
    }
    if (last.generated) return last;
  }
  return last!;
}

type RuntimeAudit = {
  source?: string;
  scenario?: string;
  metricCodes: string[];
  guardErrors: string[];
};

function collectRuntimeAudit(audit: RuntimeAudit, result: unknown): void {
  const value = readRecord(result);
  const generation = readRecord(value.generation);
  if (typeof generation.source === "string") audit.source = generation.source;
  if (typeof generation.scenario === "string") audit.scenario = generation.scenario;
  const guard = readRecord(generation.guardResult ?? value.guardResult);
  audit.guardErrors.push(...readStringArray(guard.errors));
  for (const reference of readArray(generation.references ?? value.references)) {
    const record = readRecord(reference);
    if (typeof record.metricCode === "string") audit.metricCodes.push(record.metricCode);
  }
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

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
    await prisma.$disconnect();
  });
