import { z } from "zod";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { sqlGuardService } from "../../sqlGuard/index.js";
import type { SqlGenerationResult, SqlGeneratorGuard, SqlGeneratorPlan } from "../types/SqlGeneratorTypes.js";

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
    const guardResult = await this.guard.validate(output.sql);

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
    };
  }
}

function compactPlan(plan: SqlGeneratorPlan) {
  return {
    question: plan.question,
    intent: plan.intent,
    scenario: plan.scenario,
    extractedIntent: plan.extractedIntent,
    selectedTables: plan.schema.selectedTables,
    selectedFields: plan.schema.selectedFields,
    joins: plan.knowledge.joins,
    keywordFilters: plan.keywordFilters,
    references: plan.references,
    constraints: plan.constraints,
    warnings: plan.warnings,
    safetyRules: [
      "single SELECT statement only",
      "must output or group by Company",
      "non-aggregate detail queries must include TOP defaultLimit",
      "use SQL Server T-SQL syntax",
    ],
  };
}

export const llmSqlGeneratorService = new LlmSqlGeneratorService();
