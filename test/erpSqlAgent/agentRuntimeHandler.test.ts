import assert from "node:assert/strict";
import test from "node:test";
import { agentRuntimeService } from "../../src/agentRuntime/defaultRuntime.js";
import { routeAgentRuntimeMessage } from "../../src/agentRuntime/router.js";
import { agentRuntimeErpSqlHandler } from "../../src/features/erpSqlAgent/agent/runtimeHandler.js";
import { erpSqlAgentService } from "../../src/features/erpSqlAgent/agent/index.js";

test("ERP data questions route to erpSqlAgent", () => {
  const decision = routeAgentRuntimeMessage("统计最近一年销售欠交订单");

  assert.equal(decision.agentType, "erpSqlAgent");
  assert.equal(decision.needsClarification, false);
});

test("default runtime registers erpSqlAgent handler", () => {
  assert.equal((agentRuntimeService as any).handlers.has("erpSqlAgent"), true);
});

test("ERP SQL runtime handler returns structured query result without summary LLM", async () => {
  const originalAsk = erpSqlAgentService.ask;
  let askedQuestion = "";
  (erpSqlAgentService as any).ask = async (question: string) => {
    askedQuestion = question;
    return {
      success: true,
      traceId: "trace-1",
      question,
      sql: "SELECT TOP 100 Company FROM Erp.POHeader",
      plan: { intent: "list" },
      generation: {},
      execution: {
        fields: ["Company"],
        rows: [["jctimes"]],
        rowCount: 1,
        truncated: false,
      },
      warnings: ["warn"],
      assumptions: [],
    };
  };

  try {
    const toolTrace: string[] = [];
    const result = await agentRuntimeErpSqlHandler.executePlan({
      runId: "1",
      sessionId: "2",
      ownerUserId: null,
      options: { message: "查询采购订单" },
      plan: await agentRuntimeErpSqlHandler.createPlan({ message: "查询采购订单" }),
      async onToolStart({ step }) {
        toolTrace.push(`start:${step.tool}`);
      },
      async onToolFinish({ step }) {
        toolTrace.push(`finish:${step.tool}`);
      },
    });

    assert.equal(askedQuestion, "查询采购订单");
    assert.equal(result.assistantMessage?.content, "已生成并执行 SQL，返回 1 行。");
    assert.deepEqual(result.assistantMessage?.contentJsonb, {
      success: true,
      traceId: "trace-1",
      sql: "SELECT TOP 100 Company FROM Erp.POHeader",
      fields: ["Company"],
      rows: [["jctimes"]],
      rowCount: 1,
      truncated: false,
      warnings: ["warn"],
      error: undefined,
    });
    assert.deepEqual(toolTrace, ["start:erpSqlAgent.ask", "finish:erpSqlAgent.ask"]);
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
  }
});
