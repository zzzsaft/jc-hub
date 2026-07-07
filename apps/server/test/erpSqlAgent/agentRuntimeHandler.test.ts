import assert from "node:assert/strict";
import test from "node:test";
import { agentRuntimeService } from "../../src/ai/agentRuntime/defaultRuntime.js";
import { routeAgentRuntimeMessage } from "../../src/ai/agentRuntime/router.js";
import { agentRuntimeErpSqlHandler } from "../../src/modules/erpSqlAgent/agent/runtimeHandler.js";
import { erpSqlAgentService } from "../../src/modules/erpSqlAgent/agent/index.js";
import { resultNarratorService } from "../../src/modules/erpSqlAgent/agent/service/ResultNarratorService.js";

test("ERP data questions route to erpSqlAgent", () => {
  const decision = routeAgentRuntimeMessage("统计最近一年销售欠交订单");

  assert.equal(decision.agentType, "erpSqlAgent");
  assert.equal(decision.needsClarification, false);
});

test("default runtime registers erpSqlAgent handler", () => {
  assert.equal((agentRuntimeService as any).handlers.has("erpSqlAgent"), true);
});

test("ERP SQL runtime handler returns structured query result with narration", async () => {
  const originalAsk = erpSqlAgentService.ask;
  const originalNarrate = resultNarratorService.narrate;
  let askedQuestion = "";
  let narratedRows = 0;
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
  (resultNarratorService as any).narrate = async (input: { rows: unknown[][] }) => {
    narratedRows = input.rows.length;
    return {
      summary: "查询到 1 行采购订单数据。",
      highlights: ["公司为 jctimes"],
      caveats: ["仅基于返回样本说明"],
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
    assert.equal(narratedRows, 1);
    assert.equal(result.assistantMessage?.content, "查询到 1 行采购订单数据。\n- 公司为 jctimes\n- 仅基于返回样本说明");
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
      analysis: {
        summary: "查询到 1 行采购订单数据。",
        highlights: ["公司为 jctimes"],
        caveats: ["仅基于返回样本说明"],
      },
    });
    assert.deepEqual(toolTrace, ["start:erpSqlAgent.ask", "finish:erpSqlAgent.ask"]);
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
    (resultNarratorService as any).narrate = originalNarrate;
  }
});

test("ERP SQL runtime handler falls back when narration fails", async () => {
  const originalAsk = erpSqlAgentService.ask;
  const originalNarrate = resultNarratorService.narrate;
  (erpSqlAgentService as any).ask = async (question: string) => ({
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
    warnings: [],
    assumptions: [],
  });
  (resultNarratorService as any).narrate = async () => {
    throw new Error("llm down");
  };

  try {
    const result = await agentRuntimeErpSqlHandler.executePlan({
      runId: "1",
      sessionId: "2",
      ownerUserId: null,
      options: { message: "查询采购订单" },
      plan: await agentRuntimeErpSqlHandler.createPlan({ message: "查询采购订单" }),
      async onToolStart() {},
      async onToolFinish() {},
    });

    assert.equal(result.assistantMessage?.content, "已生成并执行 SQL，返回 1 行。");
    assert.equal((result.assistantMessage?.contentJsonb as any).analysis, null);
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
    (resultNarratorService as any).narrate = originalNarrate;
  }
});

test("ERP SQL runtime handler skips narration for empty results", async () => {
  const originalAsk = erpSqlAgentService.ask;
  const originalNarrate = resultNarratorService.narrate;
  let narrateCalls = 0;
  (erpSqlAgentService as any).ask = async (question: string) => ({
    success: true,
    traceId: "trace-1",
    question,
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    plan: { intent: "list" },
    generation: {},
    execution: {
      fields: ["Company"],
      rows: [],
      rowCount: 0,
      truncated: false,
    },
    warnings: [],
    assumptions: [],
  });
  (resultNarratorService as any).narrate = async () => {
    narrateCalls += 1;
    return { summary: "x", highlights: [], caveats: [] };
  };

  try {
    const result = await agentRuntimeErpSqlHandler.executePlan({
      runId: "1",
      sessionId: "2",
      ownerUserId: null,
      options: { message: "查询采购订单" },
      plan: await agentRuntimeErpSqlHandler.createPlan({ message: "查询采购订单" }),
      async onToolStart() {},
      async onToolFinish() {},
    });

    assert.equal(narrateCalls, 0);
    assert.equal(result.assistantMessage?.content, "SQL 已执行，未查询到数据。");
    assert.equal((result.assistantMessage?.contentJsonb as any).analysis, null);
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
    (resultNarratorService as any).narrate = originalNarrate;
  }
});
