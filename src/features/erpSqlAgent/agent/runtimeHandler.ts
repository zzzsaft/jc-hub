import type { AgentRuntimeAgentHandler } from "../../../agentRuntime/types.js";
import { erpSqlAgentService } from "./index.js";

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
      return {
        context,
        artifacts: { erpSqlResult: context },
        assistantMessage: {
          content: result.success
            ? `已生成并执行 SQL，返回 ${context.rowCount} 行。`
            : `SQL 查询失败：${result.error ?? "未知错误"}`,
          contentJsonb: context,
        },
        contextSummary: context,
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
