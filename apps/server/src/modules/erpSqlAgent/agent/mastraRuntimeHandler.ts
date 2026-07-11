import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { runErpSqlToolchainWorkflow } from "../../../ai/mastra/workflows/erpSqlToolchain.workflow.js";
import { ERP_SQL_AGENT_SCOPE_ERROR, isErpSqlAgentQuestion } from "./domain.js";
import { erpSqlAccessPolicyService, requireErpSqlAccessScope } from "../access/index.js";

export const agentRuntimeMastraErpSqlHandler: AgentRuntimeAgentHandler = {
  agentType: "mastraErpSqlAgent",
  authorize: (ownerUserId) => erpSqlAccessPolicyService.resolve(ownerUserId),
  async createPlan(options) {
    return {
      intent: "mastra_erp_sql_query",
      steps: [{ id: "erp_sql_toolchain_workflow", tool: "mastra.erpSqlToolchainWorkflow", args: { question: options.message } }],
      question: options.message,
    };
  },
  async executePlan(input) {
    const accessScope = requireErpSqlAccessScope(input.authorizationContext, input.ownerUserId);
    if (!isErpSqlAgentQuestion(input.options.message)) return outOfScopeResponse(input.options.message);
    const step = input.plan.steps?.[0] ?? {
      id: "erp_sql_toolchain_workflow",
      tool: "mastra.erpSqlToolchainWorkflow",
      args: { question: input.options.message },
    };
    try {
      const result = await runErpSqlToolchainWorkflow({
        question: input.options.message,
        confirmed: input.options.confirmed,
        ownerUserId: input.ownerUserId ?? null,
        context: input.options.context,
      }, {
        onToolStart: input.onToolStart,
        onToolFinish: input.onToolFinish,
        sessionId: input.sessionId,
        runId: input.runId,
        ownerUserId: input.ownerUserId,
        accessScope,
        signal: input.options.signal,
      });
      return {
        context: result,
        artifacts: { erpSqlResult: result },
        assistantMessage: {
          content: result.message,
          contentJsonb: result,
          displayJsonb: resultDisplay(result),
        },
        contextSummary: result,
      };
    } catch (error) {
      const startedAt = Date.now();
      await input.onToolStart({ step });
      await input.onToolFinish({ step, error, durationMs: Date.now() - startedAt });
      throw error;
    }
  },
};

function outOfScopeResponse(question: string) {
  const result = {
    success: false,
    traceId: "out-of-scope",
    sql: "",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error: ERP_SQL_AGENT_SCOPE_ERROR,
    analysis: null,
    message: ERP_SQL_AGENT_SCOPE_ERROR,
  };
  return {
    context: result,
    artifacts: { erpSqlResult: result },
    assistantMessage: { content: ERP_SQL_AGENT_SCOPE_ERROR, contentJsonb: { ...result, question } },
    contextSummary: result,
  };
}

function resultDisplay(result: { fields?: unknown; rows?: unknown; rowCount?: unknown; truncated?: unknown }) {
  return {
    fields: Array.isArray(result.fields) ? result.fields : [],
    columns: Array.isArray((result as { columns?: unknown }).columns) ? (result as { columns: unknown[] }).columns : [],
    rows: Array.isArray(result.rows) ? result.rows : [],
    rowCount: typeof result.rowCount === "number" ? result.rowCount : 0,
    truncated: result.truncated === true,
  };
}
