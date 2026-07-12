import assert from "node:assert/strict";
import test from "node:test";
import { AgentRouteClassifier } from "../../src/ai/agentRuntime/AgentRouteClassifier.js";

const cases = [
  ["最近有哪些单要交货了", { agentType: "mastraErpSqlAgent", isErpDataQuestion: true, capabilityCode: "sales.open_shipping", confidence: 0.98, needsClarification: false, reasonCode: "erp_open_shipping" }],
  ["杭州天气", { agentType: "generalAgent", isErpDataQuestion: false, confidence: 0.99, needsClarification: false, reasonCode: "general_weather" }],
  ["生成报价", { agentType: "quoteAgent", isErpDataQuestion: false, confidence: 0.96, needsClarification: false, reasonCode: "quote_action" }],
  ["生成产品配置", { agentType: "productConfigAgent", isErpDataQuestion: false, confidence: 0.96, needsClarification: false, reasonCode: "product_config" }],
  ["帮我处理一下", { agentType: "generalAgent", isErpDataQuestion: false, confidence: 0.8, needsClarification: true, reasonCode: "ambiguous", clarificationMessage: "请补充目标" }],
] as const;

test("LLM route classifier validates all agent domains", async () => {
  for (const [message, expected] of cases) {
    const classifier = new AgentRouteClassifier(async () => JSON.stringify(expected));
    assert.deepEqual(await classifier.classify({ message }), expected);
  }
});

test("LLM route classifier uses context for an existing ERP follow-up", async () => {
  let captured: any;
  const classifier = new AgentRouteClassifier(async (input) => {
    captured = input.input;
    return JSON.stringify({ agentType: "mastraErpSqlAgent", isErpDataQuestion: true, capabilityCode: "sales.open_shipping", confidence: 0.9, needsClarification: false, reasonCode: "erp_context_followup" });
  });
  const result = await classifier.classify({ message: "那还剩多少？", context: { semanticSummary: "上一轮：待发货订单" } });
  assert.equal(result.agentType, "mastraErpSqlAgent");
  assert.deepEqual(captured.recentConversationOrSummary, { semanticSummary: "上一轮：待发货订单" });
});

test("LLM route classifier fails closed on unavailable or invalid output", async () => {
  for (const request of [async () => { throw new Error("offline"); }, async () => "{}"] as const) {
    const result = await new AgentRouteClassifier(request).classify({ message: "查数据" });
    assert.equal(result.needsClarification, true);
    assert.equal(result.reasonCode, "route_classifier_unavailable");
  }
});

test("route cache includes context hash", async () => {
  let calls = 0;
  const classifier = new AgentRouteClassifier(async () => {
    calls += 1;
    return JSON.stringify({ agentType: "generalAgent", isErpDataQuestion: false, confidence: 0.8, needsClarification: false, reasonCode: "general" });
  }, 60_000, 10);
  await classifier.classify({ message: "继续", context: { topic: "a" } });
  await classifier.classify({ message: "继续", context: { topic: "a" } });
  await classifier.classify({ message: "继续", context: { topic: "b" } });
  assert.equal(calls, 2);
});

test("explicit ERP UI is only a classifier preference and cannot force ERP execution", async () => {
  let preferred: unknown;
  const classifier = new AgentRouteClassifier(async (input) => {
    preferred = (input.input as any).preferredAgentType;
    return JSON.stringify({ agentType: "generalAgent", isErpDataQuestion: false, confidence: 0.99, needsClarification: false, reasonCode: "general_weather" });
  });
  const result = await classifier.classify({ message: "杭州天气", preferredAgentType: "mastraErpSqlAgent" });
  assert.equal(preferred, "mastraErpSqlAgent");
  assert.equal(result.agentType, "generalAgent");
  assert.equal(result.isErpDataQuestion, false);
});

test("server forces low-confidence output to clarification even when LLM says false", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({ agentType: "mastraErpSqlAgent", isErpDataQuestion: true, capabilityCode: "sales.open_shipping", confidence: 0.2, needsClarification: false, reasonCode: "erp_open_shipping" }));
  const result = await classifier.classify({ message: "最近有哪些单要交货了" });
  assert.equal(result.needsClarification, true);
  assert.equal(result.reasonCode, "route_confidence_below_threshold");
});
