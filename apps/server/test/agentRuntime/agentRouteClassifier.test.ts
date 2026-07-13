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
    const result = await classifier.classify({ message });
    assert.deepEqual(
      Object.fromEntries(Object.keys(expected).map((key) => [key, (result as any)[key]])),
      expected,
    );
    assert.equal(result.agentConfidence, expected.confidence);
    assert.equal(result.capabilityConfidence, expected.agentType === "mastraErpSqlAgent" ? expected.confidence : undefined);
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

test("real-like classifier selects product-category YoY capability and exposes registry coverage", async () => {
  let captured: any;
  const classifier = new AgentRouteClassifier(async (input) => {
    captured = input.input;
    return JSON.stringify({
      agentType: "mastraErpSqlAgent",
      isErpDataQuestion: true,
      capabilityCode: "sales.product_category_yoy",
      confidence: 0.95,
      needsClarification: false,
      reasonCode: "matched_capability",
      clarificationMessage: null,
    });
  });

  const result = await classifier.classify({ message: "按产品类别，上个月销售额最高，和去年同比" });
  assert.equal(result.capabilityCode, "sales.product_category_yoy");
  assert.deepEqual(
    captured.erpCapabilities.find((item: any) => item.code === "sales.product_category_yoy"),
    {
      code: "sales.product_category_yoy",
      status: "executable",
      modules: ["sales"],
      metrics: ["order_amount"],
      dimensions: ["product_category"],
      timeSemantics: ["previous_month", "previous_year_comparison", "current_year"],
      comparisonKinds: ["year_over_year"],
    },
  );
});

test("classifier can inherit product-category YoY capability for a merge-rule follow-up", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({
    agentType: "mastraErpSqlAgent",
    isErpDataQuestion: true,
    capabilityCode: "sales.product_category_yoy",
    confidence: 0.94,
    needsClarification: false,
    reasonCode: "erp_context_followup",
  }));
  const result = await classifier.classify({
    message: "今年的平模头总销售额应该是平模头+高端平模头",
    context: { capabilityCode: "sales.product_category_yoy", semanticSummary: "上一轮按产品类别比较销售额同比" },
  });
  assert.equal(result.capabilityCode, "sales.product_category_yoy");
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

test("classifier accepts real LLM nullable optional fields and normalizes them", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({ agentType: "mastraErpSqlAgent", isErpDataQuestion: true, capabilityCode: "sales.open_shipping", confidence: 0.9, needsClarification: false, reasonCode: "matched_capability", clarificationMessage: null }));
  const result = await classifier.classify({ message: "最近有哪些单要交货了" });
  assert.equal(result.agentType, "mastraErpSqlAgent");
  assert.equal(result.clarificationMessage, undefined);
});

test("classifier accepts null capability for non-ERP shape", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({ agentType: "generalAgent", isErpDataQuestion: false, capabilityCode: null, confidence: 0.9, needsClarification: false, reasonCode: "general", clarificationMessage: null }));
  const result = await classifier.classify({ message: "杭州天气" });
  assert.equal(result.capabilityCode, undefined);
  assert.equal(result.clarificationMessage, undefined);
});

test("clear ERP agent with uncertain capability gets capability-specific clarification", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({
    agentType: "mastraErpSqlAgent",
    isErpDataQuestion: true,
    capabilityCode: "purchase.delivery_tracking",
    agentConfidence: 0.98,
    capabilityConfidence: 0.7,
    needsClarification: false,
    reasonCode: "erp_purchase_aggregate_uncertain",
  }));

  const result = await classifier.classify({ message: "采购金额按供应商统计" });

  assert.equal(result.agentConfidence, 0.98);
  assert.equal(result.capabilityConfidence, 0.7);
  assert.equal(result.confidence, 0.98);
  assert.equal(result.needsClarification, true);
  assert.equal(result.reasonCode, "capability_confidence_below_threshold");
  assert.match(result.clarificationMessage ?? "", /ERP Agent/u);
  assert.doesNotMatch(result.clarificationMessage ?? "", /哪个 Agent/u);
});

test("low agent confidence still gets agent-specific clarification", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({
    agentType: "mastraErpSqlAgent",
    isErpDataQuestion: true,
    capabilityCode: "sales.open_shipping",
    agentConfidence: 0.6,
    capabilityConfidence: 0.95,
    needsClarification: false,
    reasonCode: "agent_uncertain",
  }));

  const result = await classifier.classify({ message: "帮我看一下" });

  assert.equal(result.reasonCode, "route_confidence_below_threshold");
  assert.match(result.clarificationMessage ?? "", /哪个 Agent/u);
});

test("legacy confidence populates both confidence dimensions", async () => {
  const classifier = new AgentRouteClassifier(async () => JSON.stringify({
    agentType: "mastraErpSqlAgent",
    isErpDataQuestion: true,
    capabilityCode: "sales.open_shipping",
    confidence: 0.91,
    needsClarification: false,
    reasonCode: "legacy_shape",
  }));

  const result = await classifier.classify({ message: "最近有哪些单要交货了" });

  assert.equal(result.agentConfidence, 0.91);
  assert.equal(result.capabilityConfidence, 0.91);
  assert.equal(result.confidence, 0.91);
  assert.equal(result.needsClarification, false);
});
