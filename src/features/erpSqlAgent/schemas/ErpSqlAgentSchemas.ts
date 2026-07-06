import { z } from "zod";
import { ErpSqlIntentSchema } from "../intent/index.js";

const QueryIntentSchema = z.enum(["lookup", "list", "aggregate", "trend", "unknown"]);
const QueryPlanScenarioSchema = z.enum(["purchaseSpendByType", "purchaseDelayVendor", "purchaseDetail", "openJob", "inventoryBalance", "recentInventoryTran", "salesBackorder", "generic"]);
const ErpModuleNameSchema = z.enum(["sales", "purchase", "production", "inventory", "finance", "custom"]);

const QueryPlanModuleSchema = z.object({
  module: ErpModuleNameSchema,
  label: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
  rule: z.unknown(),
});

const QueryPlanSchemaTableSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  label: z.string().nullable(),
  score: z.number(),
  source: z.enum(["retriever", "knowledge"]),
});

const QueryPlanSchemaFieldSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  fieldName: z.string(),
  label: z.string().nullable(),
  dataType: z.string().nullable(),
  source: z.literal("retriever"),
});

const QueryPlanFilterSchema = z.object({
  table: z.string().optional(),
  field: z.string().optional(),
  expression: z.string(),
});

const QueryPlanOrderBySchema = z.object({
  expression: z.string(),
  direction: z.enum(["ASC", "DESC"]).optional(),
});

const QueryPlanMetricSchema = z.object({
  expression: z.string(),
  alias: z.string(),
});

const SqlGuardResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  normalizedSql: z.string().optional(),
  referencedTables: z.array(z.string()),
  referencedFields: z.array(z.string()),
});

export const QueryPlanSchema = z
  .object({
    question: z.string(),
    intent: QueryIntentSchema,
    scenario: QueryPlanScenarioSchema,
    extractedIntent: ErpSqlIntentSchema.optional(),
    modules: z.array(QueryPlanModuleSchema),
    schema: z.object({
      result: z.unknown(),
      selectedTables: z.array(QueryPlanSchemaTableSchema),
      selectedFields: z.array(QueryPlanSchemaFieldSchema),
    }),
    knowledge: z.unknown(),
    constraints: z.object({
      schemaName: z.literal("Erp"),
      requireCompany: z.boolean(),
      defaultLimit: z.number().int().positive(),
      requiresDateSafetyRange: z.boolean(),
      recommendedStatusFilters: z.array(z.unknown()),
    }),
    warnings: z.array(z.string()),
    missingRequiredFields: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    keywordFilters: z.array(QueryPlanFilterSchema).optional(),
    groupBy: z.array(z.string()).optional(),
    orderBy: z.array(QueryPlanOrderBySchema).optional(),
    metrics: z.array(QueryPlanMetricSchema).optional(),
  })
  .passthrough();

export const SqlGenerationResultSchema = z.object({
  valid: z.boolean(),
  source: z.enum(["rule", "llm"]).optional(),
  scenario: z.string().optional(),
  sql: z.string(),
  intent: z.string(),
  tables: z.array(z.string()),
  joins: z.array(z.string()),
  filters: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  guardResult: SqlGuardResultSchema,
});

export const SqlExecutionResultSchema = z.object({
  valid: z.boolean(),
  executed: z.boolean(),
  sql: z.string(),
  fields: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  generation: SqlGenerationResultSchema,
});

export const ErpSqlAgentResultSchema = z.object({
  success: z.boolean(),
  traceId: z.string(),
  question: z.string(),
  intent: ErpSqlIntentSchema.optional(),
  sql: z.string(),
  plan: QueryPlanSchema,
  generation: SqlGenerationResultSchema,
  execution: SqlExecutionResultSchema.nullable(),
  warnings: z.array(z.string()),
  assumptions: z.array(z.string()),
  error: z.string().optional(),
});
