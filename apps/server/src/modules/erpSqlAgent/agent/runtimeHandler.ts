import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { erpSqlAgentService } from "./index.js";
import { resultNarratorService, type ResultNarration } from "./service/ResultNarratorService.js";

export const agentRuntimeErpSqlHandler: AgentRuntimeAgentHandler = {
  agentType: "erpSqlAgent",
  async createPlan(options) {
    return {
      intent: "erp_sql_query",
      steps: [{ id: "erp_sql_ask", tool: "erpSqlAgent.ask", args: { question: options.message } }],
      question: options.message,
    };
  },
  async executePlan(input) {
    const step = input.plan.steps?.[0] ?? { id: "erp_sql_ask", tool: "erpSqlAgent.ask", args: { question: input.options.message } };
    const startedAt = Date.now();
    await input.onToolStart({ step });
    try {
      const result = await erpSqlAgentService.ask(input.options.message);
      await input.onToolFinish({ step, result, durationMs: Date.now() - startedAt });
      const context = toRuntimeContext(result);
      const analysis = await narrateResult(input.options.message, result, context);
      const finalContext = { ...context, analysis };
      return {
        context: finalContext,
        artifacts: { erpSqlResult: finalContext },
        assistantMessage: {
          content: messageContent(result.success, context.rowCount, result.error, analysis),
          contentJsonb: finalContext,
        },
        contextSummary: finalContext,
      };
    } catch (error) {
      await input.onToolFinish({ step, error, durationMs: Date.now() - startedAt });
      throw error;
    }
  },
};

function toRuntimeContext(result: Awaited<ReturnType<typeof erpSqlAgentService.ask>>) {
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
  };
}

async function narrateResult(
  question: string,
  result: Awaited<ReturnType<typeof erpSqlAgentService.ask>>,
  context: ReturnType<typeof toRuntimeContext>,
): Promise<ResultNarration | null> {
  if (!result.success || context.rowCount === 0) return null;
  try {
    return await resultNarratorService.narrate({
      question,
      sql: context.sql,
      fields: context.fields,
      rows: context.rows.slice(0, 50),
      rowCount: context.rowCount,
      truncated: context.truncated,
      warnings: context.warnings,
      source: result.generation.source,
    });
  } catch {
    return null;
  }
}

function messageContent(success: boolean, rowCount: number, error: string | undefined, analysis: ResultNarration | null): string {
  if (!success) return `SQL 查询失败：${error ?? "未知错误"}`;
  if (analysis) {
    const highlights = analysis.highlights.map((item) => `- ${item}`).join("\n");
    const caveats = analysis.caveats.map((item) => `- ${item}`).join("\n");
    return [analysis.summary, highlights, caveats].filter(Boolean).join("\n");
  }
  if (rowCount === 0) return "SQL 已执行，未查询到数据。";
  return `已生成并执行 SQL，返回 ${rowCount} 行。`;
}
