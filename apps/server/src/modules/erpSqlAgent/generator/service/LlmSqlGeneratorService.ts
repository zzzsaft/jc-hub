import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { sqlGuardService } from "../../sqlGuard/index.js";
import type { SqlGenerationResult, SqlGeneratorGuard, SqlGeneratorPlan, SqlReferenceHint } from "../types/SqlGeneratorTypes.js";

export type LlmSqlGeneratorRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
}) => Promise<string>;

const LlmSqlOutputSchema = z.object({
  sql: z.string().trim().min(1),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

const SYSTEM_PROMPT = [
  "You generate one safe SQL Server T-SQL SELECT statement as JSON only.",
  "Never generate INSERT, UPDATE, DELETE, MERGE, DROP, ALTER, CREATE, EXEC, temp tables, variables, or multiple statements.",
  "Use only the provided tables, fields, joins, filters, and constraints. Do not invent schema objects.",
  "Every query must output Company or GROUP BY Company.",
  "Non-aggregate detail queries must include TOP using the provided defaultLimit.",
  "Prefer clear aliases and include only the final SQL in the sql field.",
].join("\n");

export class LlmSqlGeneratorService {
  constructor(
    private readonly requestJson: LlmSqlGeneratorRequester = requestDeepSeekJson,
    private readonly guard: SqlGeneratorGuard = sqlGuardService,
  ) {}

  async generate(plan: SqlGeneratorPlan): Promise<SqlGenerationResult> {
    const input = compactPlan(plan);
    const content = await this.requestJson({
      purpose: "erp_sql_generate",
      input,
      maxTokens: 2500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            input,
            outputShape: {
              sql: "single SQL Server SELECT statement string",
              assumptions: "string[]",
              warnings: "string[]",
            },
          }),
        },
      ],
    });

    const output = LlmSqlOutputSchema.parse(JSON.parse(content));
    const finance = plan.extractedIntent?.module === "finance" || plan.modules[0]?.module === "finance";
    const strictFinance = finance && plan.financeMode !== "estimate";
    const guardResult = await this.guard.validate(output.sql, {
      module: plan.extractedIntent?.module ?? plan.modules[0]?.module,
      financeMode: plan.financeMode,
      references: strictFinance ? plan.references?.filter((reference) => reference.sourceType === "metric") : plan.references,
    });

    return {
      valid: guardResult.valid,
      source: "llm",
      scenario: "llmFallback",
      sql: output.sql,
      intent: plan.intent,
      tables: guardResult.referencedTables,
      joins: [],
      filters: [],
      assumptions: output.assumptions,
      warnings: [...plan.warnings, ...output.warnings, ...guardResult.warnings],
      guardResult,
      references: compactReferences(plan.references, strictFinance),
    };
  }
}

function compactPlan(plan: SqlGeneratorPlan) {
  const isFinance = plan.extractedIntent?.module === "finance" || plan.modules[0]?.module === "finance";
  const strictFinance = isFinance && plan.financeMode !== "estimate";
  return {
    question: plan.question,
    intent: plan.intent,
    scenario: plan.scenario,
    extractedIntent: plan.extractedIntent,
    selectedTables: plan.schema.selectedTables,
    selectedFields: plan.schema.selectedFields,
    joins: plan.knowledge.joins,
    keywordFilters: plan.keywordFilters,
    references: compactReferences(plan.references, strictFinance),
    constraints: plan.constraints,
    warnings: plan.warnings,
    safetyRules: [
      "single SELECT statement only",
      "must output or group by Company",
      "non-aggregate detail queries must include TOP defaultLimit",
      "use SQL Server T-SQL syntax",
      ...(isFinance
        ? plan.financeMode === "estimate" ? [
          "estimated finance SQL is for rough decision support only, not accounting, audit, settlement, or official finance reporting",
          "estimated finance SQL must include amount/status/date fields, avoid duplicate amount joins, and return aliases 时间字段/金额字段/状态过滤/税退款口径",
        ] : [
          "finance SQL must follow the approved business metric definition exactly; do not change tax, refund, time, status, cost, or exclusion scope",
          "finance SQL must include amount/status/date fields, pre-aggregate detail amount tables before joins, and return aliases 时间字段/金额字段/状态过滤/税退款口径",
        ]
        : []),
    ],
  };
}

function compactReferences(references: SqlReferenceHint[] | undefined, financeOnlyMetrics = false): SqlReferenceHint[] | undefined {
  if (!references) return undefined;
  const filtered = financeOnlyMetrics ? references.filter((reference) => reference.sourceType === "metric") : references;
  return filtered.map((reference, index) => index < 3 ? reference : {
    ...reference,
    exampleSql: undefined,
    sqlPreview: undefined,
  });
}

export const llmSqlGeneratorService = new LlmSqlGeneratorService();
