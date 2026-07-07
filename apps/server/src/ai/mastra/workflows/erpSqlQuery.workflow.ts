import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  ErpSqlAskInputSchema,
  ErpSqlAskOutputSchema,
  type ErpSqlAskInput,
  type ErpSqlAskOutput,
  runErpSqlAskTool,
} from "../tools/erpSqlAsk.tool.js";

export const ErpSqlQueryOutputSchema = ErpSqlAskOutputSchema.extend({
  message: z.string(),
});

export type ErpSqlQueryOutput = z.infer<typeof ErpSqlQueryOutputSchema>;

const prepareSqlQuery = createStep({
  id: "prepareSqlQuery",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlAskInputSchema,
  execute: async ({ inputData }) => inputData,
});

const runErpSqlAgent = createStep({
  id: "runErpSqlAgent",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlAskOutputSchema,
  execute: async ({ inputData }) => runErpSqlAskTool(inputData),
});

const formatSqlResponse = createStep({
  id: "formatSqlResponse",
  inputSchema: ErpSqlAskOutputSchema,
  outputSchema: ErpSqlQueryOutputSchema,
  execute: async ({ inputData }) => ({
    ...inputData,
    message: messageContent(inputData),
  }),
});

export const erpSqlQueryWorkflow = createWorkflow({
  id: "erpSqlQueryWorkflow",
  inputSchema: ErpSqlAskInputSchema,
  outputSchema: ErpSqlQueryOutputSchema,
})
  .then(prepareSqlQuery)
  .then(runErpSqlAgent)
  .then(formatSqlResponse)
  .commit();

export async function runErpSqlQueryWorkflow(input: ErpSqlAskInput): Promise<ErpSqlQueryOutput> {
  const run = await erpSqlQueryWorkflow.createRun();
  const result = await run.start({ inputData: input });
  if (result.status === "success") return result.result;
  return {
    success: false,
    traceId: "mastra-erp-sql-workflow-failed",
    sql: "",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error: "error" in result && result.error instanceof Error ? result.error.message : `Workflow ended with status: ${result.status}`,
    message: "SQL 查询失败：Workflow ended before producing a result",
  };
}

function messageContent(result: ErpSqlAskOutput): string {
  if (!result.success) return `SQL 查询失败：${result.error ?? "未知错误"}`;
  if (result.rowCount === 0) return "SQL 已执行，未查询到数据。";
  return `已生成并执行 SQL，返回 ${result.rowCount} 行。`;
}
