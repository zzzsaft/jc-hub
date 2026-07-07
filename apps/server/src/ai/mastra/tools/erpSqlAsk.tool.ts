import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { erpSqlAgentService } from "../../../modules/erpSqlAgent/agent/index.js";

export const ErpSqlAskInputSchema = z.object({
  question: z.string().trim().min(1),
  confirmed: z.boolean().optional(),
  ownerUserId: z.string().nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const ErpSqlAskOutputSchema = z.object({
  success: z.boolean(),
  traceId: z.string(),
  sql: z.string(),
  fields: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  template: z
    .object({
      id: z.string(),
      name: z.string(),
      intent: z.string(),
      module: z.string(),
      score: z.number(),
    })
    .optional(),
});

export type ErpSqlAskInput = z.infer<typeof ErpSqlAskInputSchema>;
export type ErpSqlAskOutput = z.infer<typeof ErpSqlAskOutputSchema>;

export const erpSqlAskTool = createTool({
  id: "erpSqlAgent.ask",
  description:
    "Run the existing guarded ERP SQL agent for a natural language question.",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlAskOutputSchema,
  execute: async (input) => runErpSqlAskTool(input),
});

export async function runErpSqlAskTool(
  input: ErpSqlAskInput
): Promise<ErpSqlAskOutput> {
  try {
    return mapErpSqlResult(await erpSqlAgentService.ask(input.question));
  } catch (error) {
    return {
      success: false,
      traceId: "mastra-erp-sql-tool-failed",
      sql: "",
      fields: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mapErpSqlResult(
  result: Awaited<ReturnType<typeof erpSqlAgentService.ask>>
): ErpSqlAskOutput {
  return {
    success: result.success,
    traceId: result.traceId,
    sql: result.sql,
    fields: result.execution?.fields ?? [],
    rows: result.execution?.rows ?? [],
    rowCount: result.execution?.rowCount ?? 0,
    truncated: result.execution?.truncated ?? false,
    warnings: result.warnings,
    error: result.error,
    template: result.template,
  };
}
