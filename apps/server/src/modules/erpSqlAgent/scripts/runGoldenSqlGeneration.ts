import "../../../config/env.js";

import { prisma } from "../../../lib/prisma.js";
import { sqlExecutorService } from "../executor/index.js";
import { sqlGeneratorService } from "../generator/index.js";
import { deepSeekIntentExtractor } from "../intent/index.js";
import { sqlPlannerService } from "../planner/index.js";
import { sqlTemplateRepository } from "../templates/repository/SqlTemplateRepository.js";
import { loadSqlTemplateGoldenQuestions } from "../templates/service/SqlTemplateRetrievalEvalService.js";
import type { TemplateExecutionResult } from "../templates/types/SqlTemplateTypes.js";
import { sqlTraceService } from "../trace/index.js";
import { ErpSqlAgentService } from "../agent/index.js";

type GoldenSqlGenerationResult = {
  businessType?: string;
  question: string;
  generated: boolean;
  source?: string;
  sql?: string;
  error?: string;
  warnings: string[];
};

const ORIGINAL_EXECUTE = process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;

async function main(): Promise<void> {
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "false";
  const args = parseArgs(process.argv.slice(2));
  const cases = selectCases(loadSqlTemplateGoldenQuestions(), args);
  const service = new ErpSqlAgentService(
    sqlPlannerService,
    sqlGeneratorService,
    sqlExecutorService,
    process.env.ERP_SQL_AGENT_INTENT_ENABLED === "false" ? undefined : deepSeekIntentExtractor,
    sqlTraceService,
    sqlTemplateRepository,
    { execute: dryRunTemplate },
  );
  const results: GoldenSqlGenerationResult[] = [];

  for (const item of cases) {
    try {
      const result = await service.ask(item.question);
      results.push({
        businessType: item.businessType,
        question: item.question,
        generated: Boolean(result.sql.trim()),
        source: result.generation.source,
        sql: result.sql,
        error: result.error,
        warnings: result.warnings,
      });
    } catch (error) {
      results.push({
        businessType: item.businessType,
        question: item.question,
        generated: false,
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
      });
    }
    console.log(JSON.stringify(results.at(-1), null, 2));
  }

  console.log(JSON.stringify({
    total: results.length,
    generatedCount: results.filter((item) => item.generated).length,
    failedCount: results.filter((item) => !item.generated).length,
    failedQuestions: results.filter((item) => !item.generated).map((item) => item.question),
  }, null, 2));
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
  return limit > 0 ? selected.slice(0, limit) : selected;
}

async function dryRunTemplate(input: { templateId: bigint }): Promise<TemplateExecutionResult> {
  const template = await sqlTemplateRepository.findTemplate(input.templateId);
  return {
    executed: false,
    valid: true,
    sql: template?.sqlTemplate ?? "",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: ["SQL template was selected but not executed in golden generation dry-run."],
  };
}

function parseArgs(items: string[]): Record<string, string | boolean> {
  return Object.fromEntries(items.map((item) => {
    const normalized = item.replace(/^--/, "");
    const index = normalized.indexOf("=");
    return index === -1 ? [normalized, true] : [normalized.slice(0, index), normalized.slice(index + 1)];
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ORIGINAL_EXECUTE === undefined) delete process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
    else process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = ORIGINAL_EXECUTE;
    await prisma.$disconnect();
  });
