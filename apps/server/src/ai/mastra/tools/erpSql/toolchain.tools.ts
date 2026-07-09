import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  sqlExecutorService,
  type SqlExecutionResult,
} from "../../../../modules/erpSqlAgent/executor/index.js";
import {
  sqlGeneratorService,
  type SqlGenerationResult,
  type SqlReferenceHint,
} from "../../../../modules/erpSqlAgent/generator/index.js";
import {
  deepSeekIntentExtractor,
  ErpSqlIntentSchema,
  type ErpSqlIntent,
} from "../../../../modules/erpSqlAgent/intent/index.js";
import {
  analysisPlannerService,
  metricComposerService,
  sqlPlannerService,
  type AnalysisPlan,
  type QueryPlan,
} from "../../../../modules/erpSqlAgent/planner/index.js";
import type { ErpSqlQueryValue } from "../../../../modules/erpSqlAgent/query/index.js";
import {
  QueryPlanSchema,
  SqlExecutionResultSchema,
  SqlGenerationResultSchema,
} from "../../../../modules/erpSqlAgent/schemas/index.js";
import {
  sqlGuardService,
  type FinanceSqlMode,
  type SqlGuardOptions,
  type SqlGuardResult,
} from "../../../../modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateExecutionService } from "../../../../modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import {
  sqlTemplateRepository,
  type ApprovedMetricCandidate,
  type DatasetReferenceCandidate,
  type ExecutableTemplateCandidate,
  type ReferenceFamilyCandidate,
} from "../../../../modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import {
  resultNarratorService,
  type ResultNarration,
} from "../../../../modules/erpSqlAgent/agent/service/ResultNarratorService.js";

export const ExtractSqlIntentInputSchema = z.object({
  question: z.string().trim().min(1),
});
export const ExtractSqlIntentOutputSchema = z.object({
  intent: ErpSqlIntentSchema.optional(),
  warnings: z.array(z.string()),
});

export const PlanSqlQueryInputSchema = z.object({
  question: z.string().trim().min(1),
  intent: ErpSqlIntentSchema.optional(),
});
export const PlanSqlQueryOutputSchema = z.object({ plan: QueryPlanSchema });

const AnalysisPlanSchema = z.object({
  mode: z.enum(["strict", "decision_support"]),
  grain: z.array(z.string()),
  metrics: z.array(z.string()),
  filters: z.array(z.object({
    metric: z.string(),
    op: z.enum(["rank_high", "rank_low", "high", "low", "overdue"]),
  })),
  dimensions: z.array(z.string()),
  orderBy: z.array(z.object({
    metric: z.string(),
    direction: z.enum(["ASC", "DESC"]),
  })),
  scenario: z.string().optional(),
  timeRange: z.object({
    kind: z.enum(["current_year", "year_over_year", "month", "relative"]),
    month: z.number().optional(),
    days: z.number().optional(),
  }).optional(),
  timeGrain: z.enum(["month", "year"]).optional(),
  analysisShape: z.enum(["trend", "concentration"]).optional(),
  limit: z.number().int().positive().optional(),
  requiredMetrics: z.array(z.string()).optional(),
  missingApprovedMetrics: z.array(z.string()).optional(),
  customerName: z.string().optional(),
});

export const AnalyzeSqlQuestionInputSchema = z.object({
  question: z.string().trim().min(1),
  plan: QueryPlanSchema.optional(),
});
export const AnalyzeSqlQuestionOutputSchema = z.object({
  analysisPlan: AnalysisPlanSchema.optional(),
  clarificationQuestions: z.array(z.string()),
  warnings: z.array(z.string()),
});

const TemplateCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  intent: z.string(),
  module: z.string(),
  score: z.number(),
  matchedReasons: z.array(z.string()),
  sqlTemplate: z.string(),
  requiredParams: z.record(z.string(), z.unknown()),
  optionalParams: z.record(z.string(), z.unknown()),
  tables: z.array(z.string()),
  fields: z.array(z.string()),
  joins: z.array(z.string()),
});

export const FindSqlTemplateInputSchema = z.object({
  question: z.string().trim().min(1),
  intent: ErpSqlIntentSchema.optional(),
  slots: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .default({}),
});
export const FindSqlTemplateOutputSchema = z.object({
  candidate: TemplateCandidateSchema.optional(),
  candidates: z.array(TemplateCandidateSchema),
  params: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .optional(),
});

const SqlReferenceSchema = z.object({
  familyId: z.string(),
  businessDescription: z.string(),
  coreTables: z.array(z.string()),
  joins: z.array(z.string()),
  exampleSql: z.string().optional(),
  datasetId: z.string().optional(),
  reportName: z.string().optional(),
  datasetName: z.string().optional(),
  fields: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  questionText: z.string().optional(),
  timeScope: z.string().optional(),
  businessScenario: z.string().optional(),
  isFinance: z.boolean().optional(),
  verified: z.boolean().optional(),
  sqlPreview: z.string().optional(),
  metricCode: z.string().optional(),
  metricName: z.string().optional(),
  calculationSummary: z.string().optional(),
  definitionJson: z.unknown().optional(),
  sourceType: z.enum(["dataset", "family", "metric", "template"]).optional(),
  score: z.number(),
  matchedReasons: z.array(z.string()),
  matchedSignals: z.array(z.string()).optional(),
});

export const FindSqlReferenceInputSchema = z.object({
  question: z.string().trim().min(1),
  intent: ErpSqlIntentSchema.optional(),
  plan: QueryPlanSchema.optional(),
});
export const FindSqlReferenceOutputSchema = z.object({
  references: z.array(SqlReferenceSchema),
});

export const ComposeAtomicMetricsInputSchema = z.object({
  question: z.string().trim().min(1),
  analysisPlan: AnalysisPlanSchema,
  financeMode: z.enum(["strict", "estimate"]),
});
export const ComposeAtomicMetricsOutputSchema = z.object({
  generation: SqlGenerationResultSchema.optional(),
  references: z.array(SqlReferenceSchema).optional(),
  error: z.string().optional(),
  clarificationQuestions: z.array(z.string()).optional(),
  missingApprovedMetrics: z.array(z.string()).optional(),
});

export const ExecuteSqlTemplateInputSchema = z.object({
  candidate: TemplateCandidateSchema,
  params: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  ),
  maxRows: z.number().int().positive().optional(),
});
export const ExecuteSqlTemplateOutputSchema = z.object({
  generation: SqlGenerationResultSchema,
  execution: SqlExecutionResultSchema,
  template: z.object({
    id: z.string(),
    name: z.string(),
    intent: z.string(),
    module: z.string(),
    score: z.number(),
  }),
});

export const GenerateSqlInputSchema = z.object({
  plan: QueryPlanSchema,
  references: z.array(SqlReferenceSchema).optional(),
  financeMode: z.enum(["strict", "estimate"]).optional(),
});
export const GenerateSqlOutputSchema = z.object({
  generation: SqlGenerationResultSchema,
});

export const ValidateSqlInputSchema = z.object({
  sql: z.string().trim().min(1),
  module: z.string().nullable().optional(),
  references: z.array(SqlReferenceSchema).optional(),
  financeMode: z.enum(["strict", "estimate"]).optional(),
});
export const ValidateSqlOutputSchema = z.object({
  guardResult: z.object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    normalizedSql: z.string().optional(),
    referencedTables: z.array(z.string()),
    referencedFields: z.array(z.string()),
  }),
});

export const ExecuteSqlInputSchema = z.object({
  generation: SqlGenerationResultSchema,
  maxRows: z.number().int().positive().optional(),
});
export const ExecuteSqlOutputSchema = z.object({
  execution: SqlExecutionResultSchema,
});

export const NarrateSqlResultInputSchema = z.object({
  question: z.string(),
  sql: z.string(),
  fields: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
  source: z.string().optional(),
});
export const NarrateSqlResultOutputSchema = z.object({
  analysis: z
    .object({
      summary: z.string(),
      highlights: z.array(z.string()),
      caveats: z.array(z.string()),
    })
    .nullable(),
});

export type TemplateCandidate = z.infer<typeof TemplateCandidateSchema>;
export type FindSqlTemplateOutput = z.infer<typeof FindSqlTemplateOutputSchema>;

export const extractSqlIntentTool = createTool({
  id: "extractSqlIntent",
  description:
    "Extract ERP SQL intent from a natural language question without generating SQL.",
  inputSchema: ExtractSqlIntentInputSchema,
  outputSchema: ExtractSqlIntentOutputSchema,
  execute: async (input) => runExtractSqlIntentTool(input.question),
});

export async function runExtractSqlIntentTool(
  question: string
): Promise<z.infer<typeof ExtractSqlIntentOutputSchema>> {
  try {
    return {
      intent: await deepSeekIntentExtractor.extract(question),
      warnings: [],
    };
  } catch (error) {
    return {
      warnings: [
        `Intent extraction failed; falling back to rule planner: ${errorMessage(
          error
        )}`,
      ],
    };
  }
}

export const planSqlQueryTool = createTool({
  id: "planSqlQuery",
  description:
    "Plan an ERP SQL query from a question and optional extracted intent.",
  inputSchema: PlanSqlQueryInputSchema,
  outputSchema: PlanSqlQueryOutputSchema,
  execute: async (input) => runPlanSqlQueryTool(input.question, input.intent),
});

export async function runPlanSqlQueryTool(
  question: string,
  intent?: ErpSqlIntent
): Promise<{ plan: QueryPlan }> {
  return { plan: await sqlPlannerService.plan(question, intent) };
}

export const analyzeSqlQuestionTool = createTool({
  id: "analyzeSqlQuestion",
  description: "Build an approved atomic-metric analysis plan before SQL generation.",
  inputSchema: AnalyzeSqlQuestionInputSchema,
  outputSchema: AnalyzeSqlQuestionOutputSchema,
  execute: async (input) => runAnalyzeSqlQuestionTool(input.question),
});

export async function runAnalyzeSqlQuestionTool(
  question: string
): Promise<z.infer<typeof AnalyzeSqlQuestionOutputSchema>> {
  return analysisPlannerService.plan(question);
}

export const findSqlTemplateTool = createTool({
  id: "findSqlTemplate",
  description:
    "Find the best approved SQL template candidate for a planned ERP query.",
  inputSchema: FindSqlTemplateInputSchema,
  outputSchema: FindSqlTemplateOutputSchema,
  execute: async (input) => runFindSqlTemplateTool(input),
});

export async function runFindSqlTemplateTool(
  input: z.infer<typeof FindSqlTemplateInputSchema>
): Promise<FindSqlTemplateOutput> {
  const candidates = await sqlTemplateRepository.findExecutableCandidates({
    question: input.question,
    intent: input.intent?.intentType,
    module: input.intent?.module,
    slots: input.slots,
    limit: 3,
  });
  const mapped = candidates.map(mapTemplateCandidate);
  for (const candidate of candidates) {
    if (candidate.score < 0.4) continue;
    const params = bindTemplateParams(candidate, input.slots);
    if (params)
      return {
        candidate: mapTemplateCandidate(candidate),
        candidates: mapped,
        params,
      };
  }
  return { candidates: mapped };
}

export const findSqlReferenceTool = createTool({
  id: "findSqlReference",
  description:
    "Find historical SQL reference families for generated SQL fallback. References are not executable templates.",
  inputSchema: FindSqlReferenceInputSchema,
  outputSchema: FindSqlReferenceOutputSchema,
  execute: async (input) => runFindSqlReferenceTool(input),
});

export async function runFindSqlReferenceTool(
  input: z.infer<typeof FindSqlReferenceInputSchema>
): Promise<z.infer<typeof FindSqlReferenceOutputSchema>> {
  try {
    const common = {
      question: input.question,
      intent: input.intent?.intentType ?? input.plan?.intent,
      module: inferReferenceModule(input.question, input.intent?.module ?? input.plan?.modules[0]?.module),
    };
    const metrics = common.module === "finance"
      ? await sqlTemplateRepository.findApprovedMetricCandidates({
        ...common,
        limit: 3,
      })
      : [];
    const datasetReferences =
      await sqlTemplateRepository.findDatasetReferenceCandidates({
        ...common,
        limit: 10,
      });
    const references = await sqlTemplateRepository.findReferenceCandidates({
      ...common,
      limit: 3,
    });
    return {
      references: [
        ...metrics.filter((metric) => metricUsableForQuestion(metric, input.question)).map(mapMetricReference),
        ...datasetReferences.map(mapDatasetSqlReference),
        ...references.map(mapSqlReference),
      ].slice(0, 13),
    };
  } catch {
    return { references: [] };
  }
}

export const composeAtomicMetricsTool = createTool({
  id: "composeAtomicMetrics",
  description: "Compose SQL only from approved atomic metric definitions.",
  inputSchema: ComposeAtomicMetricsInputSchema,
  outputSchema: ComposeAtomicMetricsOutputSchema,
  execute: async (input): Promise<any> =>
    runComposeAtomicMetricsTool(input.question, input.analysisPlan as AnalysisPlan, input.financeMode),
});

export async function runComposeAtomicMetricsTool(
  question: string,
  analysisPlan: AnalysisPlan,
  financeMode: FinanceSqlMode,
): Promise<z.infer<typeof ComposeAtomicMetricsOutputSchema>> {
  const metricCodes = [...new Set([...analysisPlan.metrics, ...(analysisPlan.requiredMetrics ?? [])])];
  const metrics = await sqlTemplateRepository.findApprovedAtomicMetricCandidates({
    question,
    module: "finance",
    metricCodes,
    limit: metricCodes.length,
  });
  const result = await metricComposerService.compose({ question, analysisPlan, metrics, financeMode });
  if (!result.ok) {
    return {
      error: result.error,
      clarificationQuestions: result.clarificationQuestions,
      missingApprovedMetrics: result.missingApprovedMetrics,
    };
  }
  return {
    generation: result.generation as z.infer<typeof SqlGenerationResultSchema>,
    references: result.references.map(mapSqlReferenceHint),
  };
}

export async function runComposeApprovedCompositeMetricTool(
  question: string,
  financeMode: FinanceSqlMode,
): Promise<z.infer<typeof ComposeAtomicMetricsOutputSchema>> {
  const [metric] = await sqlTemplateRepository.findApprovedMetricCandidates({
    question,
    module: "finance",
    limit: 1,
  });
  if (metric?.metricCode !== "product_margin_cost_ratio_top5" || !metric.exampleSql || !isProductMarginCostTop5Question(question)) return {};
  const reference = mapMetricReference(metric);
  const guardResult = await sqlGuardService.validate(metric.exampleSql, {
    module: "finance",
    financeMode,
    references: [reference],
  });
  const definition = readRecord(metric.definitionJson);
  const generation: SqlGenerationResult = {
    valid: guardResult.valid,
    source: "rule",
    scenario: "approvedCompositeMetric",
    sql: metric.exampleSql,
    intent: "aggregate",
    tables: metric.coreTables,
    joins: metric.joins,
    filters: readStringArray(definition.statusFilters),
    assumptions: [`SQL from approved business metric ${metric.metricCode}.`],
    warnings: guardResult.warnings,
    guardResult,
    references: [reference as SqlReferenceHint],
  };
  return { generation: generation as z.infer<typeof SqlGenerationResultSchema>, references: [reference] };
}

function isProductMarginCostTop5Question(question: string): boolean {
  return /(6\s*月份?|本月)/u.test(question)
    && /(销售额|价值).*(最高|高|top\s*\d+|前\s*\d+)|(?:最高|高|top\s*\d+|前\s*\d+).*(销售额|价值)/iu.test(question)
    && /产品/u.test(question)
    && /客户/u.test(question)
    && /毛利/u.test(question)
    && /成本/u.test(question);
}

function metricUsableForQuestion(metric: ApprovedMetricCandidate, question: string): boolean {
  if (metric.metricCode === "product_margin_cost_ratio_top5") return isProductMarginCostTop5Question(question);
  return true;
}

export const executeSqlTemplateTool = createTool({
  id: "executeSqlTemplate",
  description: "Execute an approved SQL template with validated parameters.",
  inputSchema: ExecuteSqlTemplateInputSchema,
  outputSchema: ExecuteSqlTemplateOutputSchema,
  execute: async (input): Promise<any> => runExecuteSqlTemplateTool(input),
});

export async function runExecuteSqlTemplateTool(
  input: z.infer<typeof ExecuteSqlTemplateInputSchema>
) {
  const generation = generationFromTemplate(input.candidate);
  if (process.env.ERP_SQL_AGENT_DRY_RUN_TEMPLATES === "true") {
    return {
      generation,
      execution: {
        valid: true,
        executed: false,
        sql: generation.sql,
        fields: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        warnings: ["SQL template was selected but not executed in golden generation dry-run."],
        generation,
      },
      template: {
        id: input.candidate.id,
        name: input.candidate.name,
        intent: input.candidate.intent,
        module: input.candidate.module,
        score: input.candidate.score,
      },
    };
  }
  const templateExecution = await sqlTemplateExecutionService.execute({
    templateId: BigInt(input.candidate.id),
    params: input.params,
    maxRows: input.maxRows,
  });
  const execution: SqlExecutionResult = { ...templateExecution, generation };
  return {
    generation,
    execution,
    template: {
      id: input.candidate.id,
      name: input.candidate.name,
      intent: input.candidate.intent,
      module: input.candidate.module,
      score: input.candidate.score,
    },
  };
}

export const generateSqlTool = createTool({
  id: "generateSql",
  description:
    "Generate guarded SQL from a query plan using the existing fallback generator.",
  inputSchema: GenerateSqlInputSchema,
  outputSchema: GenerateSqlOutputSchema,
  execute: async (input): Promise<any> =>
    runGenerateSqlTool(input.plan as QueryPlan, input.references, input.financeMode),
});

export async function runGenerateSqlTool(
  plan: QueryPlan,
  references: z.infer<typeof SqlReferenceSchema>[] = [],
  financeMode?: FinanceSqlMode,
): Promise<{ generation: SqlGenerationResult }> {
  return {
    generation: await sqlGeneratorService.generate(
      references.length > 0 || financeMode ? { ...plan, references, financeMode } : plan
    ),
  };
}

export const validateSqlTool = createTool({
  id: "validateSql",
  description: "Validate generated SQL without executing it.",
  inputSchema: ValidateSqlInputSchema,
  outputSchema: ValidateSqlOutputSchema,
  execute: async (input) => runValidateSqlTool(input.sql, input),
});

export async function runValidateSqlTool(
  sql: string,
  options: SqlGuardOptions = {},
): Promise<{ guardResult: SqlGuardResult }> {
  return { guardResult: await sqlGuardService.validate(sql, options) };
}

export const executeSqlTool = createTool({
  id: "executeSql",
  description:
    "Execute a valid SQL generation result through the ERP SQL executor.",
  inputSchema: ExecuteSqlInputSchema,
  outputSchema: ExecuteSqlOutputSchema,
  execute: async (input): Promise<any> => runExecuteSqlTool(input.generation, input.maxRows),
});

export async function runExecuteSqlTool(
  generation: SqlGenerationResult,
  maxRows?: number
): Promise<{ execution: SqlExecutionResult }> {
  return {
    execution: await sqlExecutorService.execute(generation, { maxRows }),
  };
}

export const narrateSqlResultTool = createTool({
  id: "narrateSqlResult",
  description:
    "Summarize ERP SQL query results for the user without inventing facts.",
  inputSchema: NarrateSqlResultInputSchema,
  outputSchema: NarrateSqlResultOutputSchema,
  execute: async (input) => runNarrateSqlResultTool(input),
});

export async function runNarrateSqlResultTool(
  input: z.infer<typeof NarrateSqlResultInputSchema>
): Promise<{ analysis: ResultNarration | null }> {
  if (input.rowCount === 0) return { analysis: null };
  try {
    return {
      analysis: await resultNarratorService.narrate({
        question: input.question,
        sql: input.sql,
        fields: input.fields,
        rows: input.rows.slice(0, 50),
        rowCount: input.rowCount,
        truncated: input.truncated,
        warnings: input.warnings,
        source: input.source,
      }),
    };
  } catch {
    return { analysis: null };
  }
}

export function slotsFromIntent(
  intent: ErpSqlIntent | undefined
): Record<string, ErpSqlQueryValue> {
  if (!intent) return {};
  const slots: Record<string, ErpSqlQueryValue> = {};
  for (const [key, value] of Object.entries(intent.entities)) {
    if (key === "customerName" && typeof value === "string" && isBadCustomerToken(value)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      slots[key] = value;
  }
  if (intent.dateRange?.to) slots.dueBeforeDate = intent.dateRange.to;
  if (intent.dateRange?.from) slots.fromDate = intent.dateRange.from;
  if (intent.dateRange?.relativeDays)
    slots.relativeDays = intent.dateRange.relativeDays;
  return slots;
}

function isBadCustomerToken(value: string): boolean {
  return /^(的|哪些|哪个|订单|客户|今年|去年|过去三年|近三年|本月|最近|产品|销售额|毛利|趋势)$/u.test(value.trim());
}

function bindTemplateParams(
  template: ExecutableTemplateCandidate,
  slots: Record<string, ErpSqlQueryValue | null>
): Record<string, ErpSqlQueryValue> | undefined {
  const required = readParamNames(template.requiredParams);
  if (
    required.some(
      (name) =>
        slots[name] === undefined || slots[name] === null || slots[name] === ""
    )
  )
    return undefined;
  const names = new Set([
    ...required,
    ...readParamNames(template.optionalParams),
  ]);
  return Object.fromEntries(
    [...names]
      .filter((name) => slots[name] !== undefined && slots[name] !== null)
      .map((name) => [name, slots[name] as ErpSqlQueryValue])
  );
}

function readParamNames(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

function inferReferenceModule(question: string, module: string | null | undefined): string | undefined {
  if (/财务|毛利|利润|收入|成本|费用|金额|税|退款|回款|收款|付款|应收|应付/u.test(question)) return "finance";
  return module ?? undefined;
}

function mapTemplateCandidate(
  candidate: ExecutableTemplateCandidate
): TemplateCandidate {
  return {
    id: candidate.id.toString(),
    name: candidate.name,
    intent: candidate.intent,
    module: candidate.module,
    score: candidate.score,
    matchedReasons: candidate.matchedSignals,
    sqlTemplate: candidate.sqlTemplate,
    requiredParams: readRecord(candidate.requiredParams),
    optionalParams: readRecord(candidate.optionalParams),
    tables: readStringArray(candidate.tables),
    fields: readStringArray(candidate.fields),
    joins: readStringArray(candidate.joins),
  };
}

function mapSqlReference(
  reference: ReferenceFamilyCandidate
): z.infer<typeof SqlReferenceSchema> {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    sourceType: "family",
    score: reference.score,
    matchedReasons: reference.matchedSignals,
    matchedSignals: reference.matchedSignals,
  };
}

function mapMetricReference(
  reference: ApprovedMetricCandidate
): z.infer<typeof SqlReferenceSchema> {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    metricCode: reference.metricCode,
    metricName: reference.metricName,
    calculationSummary: reference.calculationSummary,
    definitionJson: reference.definitionJson,
    sourceType: "metric",
    score: reference.score,
    matchedReasons: reference.matchedSignals,
    matchedSignals: reference.matchedSignals,
  };
}

function mapDatasetSqlReference(
  reference: DatasetReferenceCandidate
): z.infer<typeof SqlReferenceSchema> {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    datasetId: reference.datasetId,
    reportName: reference.reportName,
    datasetName: reference.datasetName,
    fields: reference.fields,
    metrics: reference.metrics,
    questionText: reference.questionText,
    timeScope: reference.timeScope,
    businessScenario: reference.businessScenario,
    isFinance: reference.isFinance,
    verified: reference.verified,
    sqlPreview: reference.exampleSql,
    sourceType: "dataset",
    score: reference.score,
    matchedReasons: reference.matchedSignals,
    matchedSignals: reference.matchedSignals,
  };
}

function mapSqlReferenceHint(
  reference: SqlReferenceHint
): z.infer<typeof SqlReferenceSchema> {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    datasetId: reference.datasetId,
    reportName: reference.reportName,
    datasetName: reference.datasetName,
    fields: reference.fields,
    metrics: reference.metrics,
    questionText: reference.questionText,
    timeScope: reference.timeScope,
    businessScenario: reference.businessScenario,
    isFinance: reference.isFinance,
    verified: reference.verified,
    sqlPreview: reference.sqlPreview,
    metricCode: reference.metricCode,
    metricName: reference.metricName,
    calculationSummary: reference.calculationSummary,
    definitionJson: reference.definitionJson,
    sourceType: reference.sourceType,
    score: reference.score ?? 1,
    matchedReasons: reference.matchedSignals ?? [],
    matchedSignals: reference.matchedSignals,
  };
}

function generationFromTemplate(
  template: TemplateCandidate
): SqlGenerationResult {
  return {
    valid: true,
    source: "template",
    scenario: "template",
    sql: template.sqlTemplate,
    intent: template.intent,
    tables: template.tables,
    joins: template.joins,
    filters: [],
    assumptions: [`Executed approved SQL template ${template.id}.`],
    warnings: [],
    guardResult: {
      valid: true,
      errors: [],
      warnings: [],
      normalizedSql: template.sqlTemplate,
      referencedTables: template.tables,
      referencedFields: template.fields,
    },
    references: [{
      familyId: template.id,
      businessDescription: template.name,
      coreTables: template.tables,
      joins: template.joins,
      exampleSql: template.sqlTemplate,
      sourceType: "template",
      score: template.score,
      matchedSignals: template.matchedReasons,
    }],
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
