import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  sqlExecutorService,
  type SqlExecutionResult,
} from "../../../../modules/erpSqlAgent/executor/index.js";
import {
  sqlGeneratorService,
  type SqlGenerationResult,
} from "../../../../modules/erpSqlAgent/generator/index.js";
import {
  deepSeekIntentExtractor,
  ErpSqlIntentSchema,
  type ErpSqlIntent,
} from "../../../../modules/erpSqlAgent/intent/index.js";
import {
  sqlPlannerService,
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
  type SqlGuardResult,
} from "../../../../modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateExecutionService } from "../../../../modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import {
  sqlTemplateRepository,
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
  score: z.number(),
  matchedReasons: z.array(z.string()),
});

export const FindSqlReferenceInputSchema = z.object({
  question: z.string().trim().min(1),
  intent: ErpSqlIntentSchema.optional(),
  plan: QueryPlanSchema.optional(),
});
export const FindSqlReferenceOutputSchema = z.object({
  references: z.array(SqlReferenceSchema),
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
});
export const GenerateSqlOutputSchema = z.object({
  generation: SqlGenerationResultSchema,
});

export const ValidateSqlInputSchema = z.object({
  sql: z.string().trim().min(1),
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
    const references = await sqlTemplateRepository.findReferenceCandidates({
      question: input.question,
      intent: input.intent?.intentType ?? input.plan?.intent,
      module: input.intent?.module ?? input.plan?.modules[0]?.module,
      limit: 3,
    });
    return { references: references.map(mapSqlReference) };
  } catch {
    return { references: [] };
  }
}

export const executeSqlTemplateTool = createTool({
  id: "executeSqlTemplate",
  description: "Execute an approved SQL template with validated parameters.",
  inputSchema: ExecuteSqlTemplateInputSchema,
  outputSchema: ExecuteSqlTemplateOutputSchema,
  execute: async (input) => runExecuteSqlTemplateTool(input),
});

export async function runExecuteSqlTemplateTool(
  input: z.infer<typeof ExecuteSqlTemplateInputSchema>
) {
  const generation = generationFromTemplate(input.candidate);
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
  execute: async (input) =>
    runGenerateSqlTool(input.plan as QueryPlan, input.references),
});

export async function runGenerateSqlTool(
  plan: QueryPlan,
  references: z.infer<typeof SqlReferenceSchema>[] = []
): Promise<{ generation: SqlGenerationResult }> {
  return {
    generation: await sqlGeneratorService.generate(
      references.length > 0 ? { ...plan, references } : plan
    ),
  };
}

export const validateSqlTool = createTool({
  id: "validateSql",
  description: "Validate generated SQL without executing it.",
  inputSchema: ValidateSqlInputSchema,
  outputSchema: ValidateSqlOutputSchema,
  execute: async (input) => runValidateSqlTool(input.sql),
});

export async function runValidateSqlTool(
  sql: string
): Promise<{ guardResult: SqlGuardResult }> {
  return { guardResult: await sqlGuardService.validate(sql) };
}

export const executeSqlTool = createTool({
  id: "executeSql",
  description:
    "Execute a valid SQL generation result through the ERP SQL executor.",
  inputSchema: ExecuteSqlInputSchema,
  outputSchema: ExecuteSqlOutputSchema,
  execute: async (input) => runExecuteSqlTool(input.generation, input.maxRows),
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
    score: reference.score,
    matchedReasons: reference.matchedSignals,
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
