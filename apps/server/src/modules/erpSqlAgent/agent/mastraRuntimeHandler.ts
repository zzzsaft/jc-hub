import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { runErpSqlToolchainWorkflow } from "../../../ai/mastra/workflows/erpSqlToolchain.workflow.js";

export const agentRuntimeMastraErpSqlHandler: AgentRuntimeAgentHandler = {
  agentType: "mastraErpSqlAgent",
  async createPlan(options) {
    return {
      intent: "mastra_erp_sql_query",
      steps: [{ id: "erp_sql_toolchain_workflow", tool: "mastra.erpSqlToolchainWorkflow", args: { question: options.message } }],
      question: options.message,
    };
  },
  async executePlan(input) {
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
      });
      return {
        context: result,
        artifacts: { erpSqlResult: result },
        assistantMessage: { content: result.message, contentJsonb: result },
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
