import { z } from "zod";
import { requestDeepSeekJson, type DeepSeekExtraBody, type LlmChatMessage } from "../../../../ai/llm/deepseekClient.js";
import { sqlGuardService } from "../../sqlGuard/index.js";
import type { SqlGenerationResult, SqlGeneratorGuard, SqlGeneratorPlan, SqlReferenceHint } from "../types/SqlGeneratorTypes.js";

export type LlmSqlGeneratorRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  signal?: AbortSignal;
  extraBody?: DeepSeekExtraBody;
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

  async generate(plan: SqlGeneratorPlan, signal?: AbortSignal): Promise<SqlGenerationResult> {
    if (isStrictFinanceWithoutMetric(plan)) return noApprovedFinanceMetricResult(plan);
    if (shouldSkipUnsafeExternalQuotation(plan)) return noSchemaEvidenceResult(plan, "external_quotation_schema_evidence_missing: executable quotation/config schema is not approved.");
    if (hasNoSchemaEvidence(plan)) return noSchemaEvidenceResult(plan);
    const input = compactPlan(plan);
    const output = await this.requestSql(input, signal);
    const finance = isFinancePlan(plan);
    const strictFinance = finance && plan.financeMode !== "estimate";
    const module = finance ? "finance" : nonFinanceModule(plan);
    let guardResult = await this.guard.validate(output.sql, {
      module,
      financeMode: plan.financeMode,
      references: strictFinance ? plan.references?.filter((reference) => reference.sourceType === "metric") : plan.references,
    });
    let finalOutput = output;

    let repairedMissingSchema = false;
    if (!guardResult.valid && hasMissingSchemaError(guardResult.errors)) {
      if (signal?.aborted) throw new Error("aborted");
      finalOutput = await this.requestSql({
        ...input,
        previousSql: output.sql,
        guardErrors: guardResult.errors,
        repairInstruction: "Regenerate the SQL once using only fields/tables present in selectedFields or references. Remove optional filters/dimensions that caused missing schema errors. Do not mention or reuse missing fields.",
      }, signal);
      guardResult = await this.guard.validate(finalOutput.sql, {
        module,
        financeMode: plan.financeMode,
        references: strictFinance ? plan.references?.filter((reference) => reference.sourceType === "metric") : plan.references,
      });
      repairedMissingSchema = true;
    }
    const sql = repairedMissingSchema && !guardResult.valid ? "" : finalOutput.sql;

    return {
      valid: guardResult.valid,
      source: "llm",
      scenario: "llmFallback",
      sql,
      intent: plan.intent,
      tables: guardResult.referencedTables,
      joins: [],
      filters: [],
      assumptions: finalOutput.assumptions,
      warnings: [...plan.warnings, ...finalOutput.warnings, ...guardResult.warnings],
      guardResult,
      references: compactReferences(plan.references, strictFinance),
    };
  }

  private async requestSql(input: unknown, signal?: AbortSignal): Promise<z.infer<typeof LlmSqlOutputSchema>> {
    const content = await this.requestJson({
      purpose: "erp_sql_generate",
      input,
      maxTokens: 2500,
      signal,
      extraBody: { thinking: { type: "enabled" } },
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
    return LlmSqlOutputSchema.parse(JSON.parse(content));
  }
}

function hasNoSchemaEvidence(plan: SqlGeneratorPlan): boolean {
  return plan.schema.selectedFields.length === 0
    && plan.schema.selectedTables.length === 0
    && !plan.references?.some((reference) => reference.exampleSql || reference.sqlPreview || reference.definitionJson);
}

function isStrictFinanceWithoutMetric(plan: SqlGeneratorPlan): boolean {
  return isFinancePlan(plan)
    && plan.financeMode !== "estimate"
    && !plan.references?.some((reference) => reference.sourceType === "metric");
}

function noApprovedFinanceMetricResult(plan: SqlGeneratorPlan): SqlGenerationResult {
  return {
    valid: false,
    source: "llm",
    scenario: "llmFallback",
    sql: "",
    intent: plan.intent,
    tables: [],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [...plan.warnings, "blocked_missing_metric: strict finance SQL requires an approved business metric."],
    guardResult: {
      valid: false,
      errors: ["blocked_missing_metric: strict finance SQL requires an approved business metric."],
      warnings: [],
      referencedTables: [],
      referencedFields: [],
    },
    references: compactReferences(plan.references, true),
  };
}

function noSchemaEvidenceResult(plan: SqlGeneratorPlan, reason = "schema_evidence_missing: no selected schema fields or SQL references for safe SQL generation."): SqlGenerationResult {
  return {
    valid: false,
    source: "llm",
    scenario: "llmFallback",
    sql: "",
    intent: plan.intent,
    tables: [],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [...plan.warnings, `${reason} SQL generation skipped to avoid inventing ERP fields.`],
    guardResult: {
      valid: false,
      errors: [reason],
      warnings: [],
      referencedTables: [],
      referencedFields: [],
    },
    references: compactReferences(plan.references),
  };
}

function shouldSkipUnsafeExternalQuotation(plan: SqlGeneratorPlan): boolean {
  return /产品配置|产品报价|购销合同|合同号|报价配置|报价单.*配置|合同.*配置内容/u.test(plan.question);
}

function hasMissingSchemaError(errors: string[]): boolean {
  return errors.some((error) => /Referenced (?:field|table) does not exist in schema metadata/iu.test(error));
}

function compactPlan(plan: SqlGeneratorPlan) {
  const isFinance = isFinancePlan(plan);
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

function isFinancePlan(plan: SqlGeneratorPlan): boolean {
  if (plan.financeMode) return true;
  return !Object.prototype.hasOwnProperty.call(plan, "financeMode")
    && (plan.extractedIntent?.module === "finance" || plan.modules[0]?.module === "finance");
}

function nonFinanceModule(plan: SqlGeneratorPlan): string | null | undefined {
  const module = plan.extractedIntent?.module ?? plan.modules[0]?.module;
  return module === "finance" ? undefined : module;
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
