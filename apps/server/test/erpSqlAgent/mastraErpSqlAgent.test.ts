import assert from "node:assert/strict";
import test from "node:test";
import { agentRuntimeService } from "../../src/ai/agentRuntime/defaultRuntime.js";
import { agentRuntimeMastraErpSqlHandler } from "../../src/modules/erpSqlAgent/agent/mastraRuntimeHandler.js";
import { erpSqlAgentService } from "../../src/modules/erpSqlAgent/agent/index.js";
import { resultNarratorService } from "../../src/modules/erpSqlAgent/agent/service/ResultNarratorService.js";
import { sqlExecutorService } from "../../src/modules/erpSqlAgent/executor/index.js";
import { sqlGeneratorService } from "../../src/modules/erpSqlAgent/generator/index.js";
import { deepSeekIntentExtractor } from "../../src/modules/erpSqlAgent/intent/index.js";
import { AnalysisPlannerService, analysisPlannerService, sqlPlannerService } from "../../src/modules/erpSqlAgent/planner/index.js";
import { sqlGuardService } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateRepository, withTemplateCoverage } from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import { sqlTemplateExecutionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import { runErpSqlAskTool } from "../../src/ai/mastra/tools/erpSqlAsk.tool.js";
import {
  runFindSqlTemplateTool,
  runAnalyzeSqlQuestionTool,
  runExtractSqlIntentTool,
  runPlanSqlQueryTool,
  runValidateSqlRuntimeTool,
  slotsFromIntent,
  governedEntityFilterSlots,
} from "../../src/ai/mastra/tools/erpSql/toolchain.tools.js";
import { runErpSqlToolchainWorkflow as runErpSqlToolchainWorkflowWithAccess } from "../../src/ai/mastra/workflows/erpSqlToolchain.workflow.js";
import { CapabilityDecisionService } from "../../src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.js";
import { capabilityDecisionService } from "../../src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.js";
import { resolveCapability } from "../../src/modules/erpSqlAgent/capabilities/registry.js";
import type { ErpSqlAccessScope } from "../../src/modules/erpSqlAgent/access/index.js";
import { buildGoldenCapabilityReport } from "../../src/modules/erpSqlAgent/scripts/buildGoldenCapabilityReport.js";
import { loadSqlTemplateGoldenQuestions } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateRetrievalEvalService.js";

const TEST_SCOPE: ErpSqlAccessScope = {
  source: "server",
  actorUserId: "tester",
  companies: ["EPIC03"],
  modules: ["sales", "purchase", "production", "inventory", "finance", "custom"],
  departments: "*",
  businessUnits: "*",
  customerNumbers: "*",
  sensitive: { finance: "full", customer: "full", employee: "full" },
  auditReasons: [],
};

const runErpSqlToolchainWorkflow = (
  input: Parameters<typeof runErpSqlToolchainWorkflowWithAccess>[0],
  callbacks: Parameters<typeof runErpSqlToolchainWorkflowWithAccess>[1] = {},
) => runErpSqlToolchainWorkflowWithAccess(input, { ...callbacks, accessScope: TEST_SCOPE });

test("capability decision reports every missing plan coverage kind", () => {
  const decision = new CapabilityDecisionService().decide({
    mode: "strict", grain: ["customer"], metrics: ["amount"], requiredMetrics: [],
    filters: [], dimensions: ["customer"], orderBy: [],
    timeRange: { kind: "current_month" }, comparison: { kind: "year_over_year" },
  }, {
    code: "test.capability", status: "executable", modules: ["sales"], metrics: [], dimensions: [],
    filterSlots: [], timeSemantics: [], comparisonKinds: [], templateFamilies: [],
  }, { filters: ["customerName"] });

  assert.equal(decision.outcome, "unsupported");
  assert.deepEqual(decision.missingCoverage, [
    "metric:amount", "dimension:customer", "filter:customerName", "time:current_month", "comparison:year_over_year",
  ]);
});

test("capability resolution fails closed when requirement scores tie", () => {
  const decision = new CapabilityDecisionService().resolveAndDecide(undefined, [
    makeCapability("sales.one", ["sales"]),
    makeCapability("sales.two", ["sales"]),
  ], ["sales"]);

  assert.equal(decision.outcome, "unsupported");
  assert.equal(decision.capability, "ambiguous");
  assert.equal(decision.reasonCode, "capability_resolution_ambiguous");
});

test("capability resolution keeps missing coverage on the best requirement match", () => {
  const plan = { mode: "strict", grain: ["customer"], metrics: ["amount"], filters: [], dimensions: ["customer"], orderBy: [] } as const;
  const matched = { ...makeCapability("sales.amount", ["sales"]), metrics: ["amount"] };
  const decision = new CapabilityDecisionService().resolveAndDecide(plan, [matched, makeCapability("sales.other", ["sales"])], ["sales"]);

  assert.equal(decision.capability, "sales.amount");
  assert.equal(decision.outcome, "unsupported");
  assert.deepEqual(decision.missingCoverage, ["dimension:customer"]);
});

test("capability decision clarifies only explicit ambiguity candidates", () => {
  const capability = makeCapability("sales.one", ["sales"]);
  const plan = { mode: "strict", grain: [], metrics: [], filters: [], dimensions: [], orderBy: [], clarificationCandidates: ["口径 A", "口径 B"] } as const;
  const decision = new CapabilityDecisionService().resolveAndDecide(plan, [capability], ["sales"]);

  assert.equal(decision.outcome, "clarify");
  assert.equal(decision.reasonCode, "ambiguous_requirements");
});

test("capability decision asks only for a required missing time slot", () => {
  const capability = {
    ...makeCapability("purchase.supplier_amount_summary", ["purchase"]),
    metrics: ["purchase_amount"],
    dimensions: ["supplier"],
    requiredPlanSlots: ["timeRange"],
  };
  const decision = new CapabilityDecisionService().decide({
    mode: "strict", grain: ["supplier"], metrics: ["purchase_amount"], requiredMetrics: ["purchase_amount"],
    filters: [], dimensions: ["supplier"], orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
  }, capability);
  assert.equal(decision.outcome, "clarify");
  assert.equal(decision.reasonCode, "missing_required_query_slot");
  assert.deepEqual(decision.missingCoverage, ["slot:timeRange"]);
});

test("purchase amount by supplier returns visible time clarification and executes after time is supplied", async () => {
  const basePlan = {
    mode: "strict", grain: ["supplier"], metrics: ["purchase_amount"], requiredMetrics: ["purchase_amount"],
    filters: [], dimensions: ["supplier"], orderBy: [{ metric: "purchase_amount", direction: "DESC" as const }],
    scenario: "purchase_supplier_product_summary",
  };
  const purchaseIntent = { ...makeIntent(), originalQuestion: "采购金额按供应商统计", normalizedQuestion: "采购金额按供应商统计", entities: {} };
  const firstRestore = stubToolchain({ intent: purchaseIntent, analysisPlan: basePlan, realCapabilityDecision: true });
  try {
    const first = await runErpSqlToolchainWorkflow({ question: "采购金额按供应商统计", routeCapabilityCode: "purchase.supplier_amount_summary" });
    assert.equal(first.success, false);
    assert.equal(first.outcome, "clarify");
    assert.equal(first.reasonCode, "missing_required_query_slot");
    assert.deepEqual(first.missingCoverage, ["slot:timeRange"]);
    assert.match(first.message, /哪个时间范围/u);
    assert.match(first.clarificationQuestions?.[0] ?? "", /最近一个月/u);
  } finally { firstRestore(); }

  let templateCalls = 0;
  const secondRestore = stubToolchain({
    intent: purchaseIntent,
    plan: { ...makePlan(), question: "最近一个月", modules: [] },
    analysisPlan: { ...basePlan, timeRange: { kind: "relative", days: 30 } },
    atomicMetrics: [makeAtomicMetric("purchase_amount")], realCapabilityDecision: true,
    onFindTemplate() { templateCalls += 1; },
  });
  try {
    const second = await runErpSqlToolchainWorkflow({ question: "最近一个月", routeCapabilityCode: "purchase.supplier_amount_summary" });
    assert.equal(second.success, true);
    assert.equal(second.outcome, "execute");
    assert.equal(second.capabilityCode, "purchase.supplier_amount_summary");
    assert.equal(second.executionPath, "composer");
    assert.equal(templateCalls, 0);
  } finally { secondRestore(); }
});

test("three observed safety-stock requests fail closed instead of entering SQL execution", () => {
  const capability = resolveCapability("inventory.safety_stock");
  for (const question of ["所有低于安全库存的物料", "哪些物料库存不足", "查安全库存不足清单"]) {
    const decision = new CapabilityDecisionService().decide({
      mode: "strict", grain: [], metrics: ["inventory_on_hand_qty", "safety_stock_qty"], filters: [], dimensions: [], orderBy: [],
    }, capability);
    assert.equal(decision.outcome, "unsupported", question);
    assert.equal(decision.reasonCode, "missing_approved_data_source", question);
  }
});

const COST_COMPONENT_METRICS = ["material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount"];

test("legacy Mastra ERP SQL tool maps existing agent output", async () => {
  const originalAsk = erpSqlAgentService.ask;
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
    warnings: ["warn"],
    assumptions: [],
    template: {
      id: "7",
      name: "采购订单",
      intent: "detail",
      module: "purchase",
      score: 0.9,
    },
  });

  try {
    const result = await runErpSqlAskTool({ question: "查询采购订单" });

    assert.equal(result.success, true);
    assert.equal(result.traceId, "trace-1");
    assert.equal(result.rowCount, 1);
    assert.equal(result.template?.id, "7");
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
  }
});

test("extractSqlIntentTool degrades to warnings", async () => {
  const originalExtract = deepSeekIntentExtractor.extract;
  (deepSeekIntentExtractor as any).extract = async () => {
    throw new Error("llm down");
  };

  try {
    const result = await runExtractSqlIntentTool("查询采购订单");

    assert.equal(result.intent, undefined);
    assert.match(result.warnings[0], /llm down/);
  } finally {
    (deepSeekIntentExtractor as any).extract = originalExtract;
  }
});

test("planSqlQueryTool passes extracted intent to planner", async () => {
  const originalPlan = sqlPlannerService.plan;
  let receivedIntent: unknown;
  (sqlPlannerService as any).plan = async (_question: string, intent: unknown) => {
    receivedIntent = intent;
    return makePlan();
  };

  try {
    const intent = makeIntent();
    const result = await runPlanSqlQueryTool("查询采购订单", intent);

    assert.equal(receivedIntent, intent);
    assert.equal(result.plan.question, "查询采购订单");
  } finally {
    (sqlPlannerService as any).plan = originalPlan;
  }
});

test("analysis planner leaves simple ERP questions on single SQL path", async () => {
  const result = await runAnalyzeSqlQuestionTool("查询采购订单");

  assert.equal(result.analysisPlan, undefined);
  assert.deepEqual(result.clarificationQuestions, []);
});

test("sales rule slots recover order, customer, and shipping filters", () => {
  const slots = slotsFromIntent({
    ...makeSalesIntent("客户 B 的发货通知有哪些"),
    entities: {},
  });

  assert.equal(slots.customerName, "B");
  assert.equal(slots.onlyOpenRelease, true);
  assert.equal(slots.onlyShippingNotice, true);
  assert.equal(slotsFromIntent({ ...makeSalesIntent("发货通知里订单 40003 的明细"), entities: {} }).orderNum, 40003);
});

test("capability filter coverage separates entity slots from temporal and internal controls", () => {
  assert.deepEqual(
    governedEntityFilterSlots({
      customerName: "客户 A",
      orderNum: 40003,
      fromDate: "2026-01-01",
      dueBeforeDate: "2026-12-31",
      relativeDays: 30,
      onlyOpenRelease: true,
    }),
    ["customerName", "orderNum"],
  );

  const decision = new CapabilityDecisionService().decide({
    mode: "strict",
    grain: ["product_category"],
    metrics: ["order_amount"],
    filters: [],
    dimensions: ["product_category"],
    orderBy: [],
    timeRange: { kind: "current_year" },
    comparison: { kind: "year_over_year" },
  }, resolveCapability("sales.product_category_yoy"), {
    filters: governedEntityFilterSlots({
      customerName: "客户 A",
      fromDate: "2026-01-01",
    }),
  });
  assert.equal(decision.outcome, "unsupported");
  assert.deepEqual(decision.missingCoverage, ["filter:customerName"]);
});

test("rule slots enable safety stock template filtering", () => {
  const slots = slotsFromIntent({ ...makeSalesIntent("查安全库存不足清单"), entities: {} });

  assert.equal(slots.onlyBelowSafety, true);
});

test("rule slots recover ERP family fast-path filters", () => {
  const slots = slotsFromIntent({
    ...makeSalesIntent("合同号 HT20260006 的产品配置；物料在 CPC001 仓库；工单缺料；资源组 RG01；库龄超过 180 天"),
    entities: {},
  });

  assert.equal(slots.contractNo, "HT20260006");
  assert.equal(slots.warehouseCode, "CPC001");
  assert.equal(slots.resourceGroupId, "RG01");
  assert.equal(slots.onlyShortage, true);
  assert.equal(slots.minAgeDays, 180);
  assert.equal(slots.onlyOnHand, true);
  assert.equal(slotsFromIntent({ ...makeIntent(), originalQuestion: "查工单 J12345 的报工明细", normalizedQuestion: "查工单 J12345 的报工明细", entities: { jobNum: "J12345" } } as any).jobNum, "J12345");
  assert.equal(slotsFromIntent({ ...makeIntent(), originalQuestion: "资源组 RG01 的报工信息", normalizedQuestion: "资源组 RG01 的报工信息", entities: {} } as any).resourceGroupId, "RG01");
});

test("operation master kill switch blocks workflow before SQL paths", async () => {
  const original = process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
  delete process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
  let templateCalls = 0;
  let generatorCalls = 0;
  const question = "工序 820 是什么";
  const restore = stubToolchain({
    realCapabilityDecision: true,
    intent: { ...makeIntent(), originalQuestion: question, normalizedQuestion: question, module: "production", entities: { opCode: "820" } } as any,
    plan: { ...makePlan(), question, modules: [{ module: "production", label: "生产", score: 100, reasons: ["test"], rule: {} }] } as any,
    onFindTemplate: () => { templateCalls += 1; },
    onGenerate: () => { generatorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.deepEqual([templateCalls, generatorCalls], [0, 0]);
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
    else process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED = original;
  }
});

test("ERP SQL toolchain clarifies before SQL when planner conflicts with locked route capability", async () => {
  let templateCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "查询销售订单的财务费用";
  const restore = stubToolchain({
    analysisPlan: { mode: "strict", grain: [], metrics: ["finance_expense_amount"], requiredMetrics: ["finance_expense_amount"], filters: [], dimensions: [], orderBy: [] },
    onFindTemplate: () => { templateCalls += 1; },
    onGenerate: () => { generatorCalls += 1; },
    onExecute: () => { executorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "sales.open_shipping" });
    assert.equal(result.outcome, "clarify");
    assert.equal(result.capabilityCode, "sales.open_shipping");
    assert.equal(result.reasonCode, "capability_route_mismatch");
    assert.deepEqual([templateCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally { restore(); }
});

test("ERP SQL toolchain keeps strict single-metric route mismatch with diagnostic composite bypass", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
  let templateCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "查询销售订单的财务费用";
  const restore = stubToolchain({
    analysisPlan: { mode: "strict", grain: [], metrics: ["finance_expense_amount"], requiredMetrics: ["finance_expense_amount"], filters: [], dimensions: [], orderBy: [] },
    onFindTemplate: () => { templateCalls += 1; },
    onGenerate: () => { generatorCalls += 1; },
    onExecute: () => { executorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "sales.open_shipping" });
    assert.equal(result.outcome, "clarify");
    assert.equal(result.capabilityCode, "sales.open_shipping");
    assert.equal(result.reasonCode, "capability_route_mismatch");
    assert.deepEqual([templateCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("ERP SQL toolchain marks a diagnostic composite capability bypass", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
  const question = "今年上半年哪些客户贡献收入最高，但毛利偏低？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    analysisPlan: {
      mode: "decision_support",
      grain: ["customer"],
      metrics: ["order_amount", "gross_margin_rate"],
      requiredMetrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [],
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
      routeCapabilityCode: "finance.composite_decision",
    });
    assert.notEqual(result.reasonCode, "capability_route_mismatch");
    assert(result.warnings.includes("diagnostic_composite_capability_bypass"));

    const overridden = await runErpSqlToolchainWorkflow({
      question,
      routeCapabilityCode: "sales.order_detail",
    });
    assert.notEqual(overridden.reasonCode, "capability_route_mismatch");
    assert.equal(overridden.capabilityCode, "finance.composite_decision");
    assert(overridden.warnings.includes("diagnostic_composite_capability_bypass"));
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("ERP SQL toolchain warns when an unlocked generic finance composite bypasses publication", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
  const question = "分析客户收入与毛利表现";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    analysisPlan: {
      mode: "decision_support",
      grain: ["customer"],
      metrics: ["order_amount", "gross_margin_rate"],
      requiredMetrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [],
    },
    atomicMetrics: [makeAtomicMetric("order_amount"), makeAtomicMetric("gross_margin_rate")],
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.success, true, result.error);
    assert.equal(result.capabilityCode, "finance.composite_decision");
    assert(result.warnings.includes("diagnostic_composite_capability_bypass"));
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("ERP SQL toolchain denies a diagnostic finance composite when scope only allows sales", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
  let executorCalls = 0;
  const question = "分析客户经营表现";
  const restore = stubToolchain({
    intent: makeSalesIntent(question),
    plan: makeSalesPlan(question),
    analysisPlan: {
      mode: "decision_support",
      grain: ["customer"],
      metrics: ["order_amount", "gross_margin_rate"],
      requiredMetrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [],
    },
    atomicMetrics: [makeAtomicMetric("order_amount"), makeAtomicMetric("gross_margin_rate")],
    onExecute() { executorCalls += 1; },
  });

  try {
    const denied = await runErpSqlToolchainWorkflowWithAccess(
      { question, routeCapabilityCode: "sales.order_detail" },
      { accessScope: { ...TEST_SCOPE, modules: ["sales"] } },
    );
    assert.equal(denied.success, false);
    assert.match(denied.error ?? "", /ERP_SQL_ACCESS_DENIED: module scope denied \(finance\)/u);
    assert.equal(executorCalls, 0);

    const allowed = await runErpSqlToolchainWorkflowWithAccess(
      { question, routeCapabilityCode: "sales.order_detail" },
      { accessScope: { ...TEST_SCOPE, modules: ["sales", "finance"] } },
    );
    assert.equal(allowed.success, true, allowed.error);
    assert.equal(executorCalls, 1);
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("operation master kill switch enables the governed workflow candidate", async () => {
  const original = process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
  process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED = "true";
  let templateCalls = 0;
  const question = "工序 820 是什么";
  const restore = stubToolchain({
    realCapabilityDecision: true,
    intent: { ...makeIntent(), originalQuestion: question, normalizedQuestion: question, module: "production", entities: { opCode: "820" } } as any,
    plan: { ...makePlan(), question, modules: [{ module: "production", label: "生产", score: 100, reasons: ["test"], rule: {} }] } as any,
    onFindTemplate: () => { templateCalls += 1; },
  });
  try {
    await runErpSqlToolchainWorkflow({ question });
    assert.equal(templateCalls, 1);
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
    else process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED = original;
  }
});

test("sales templates are selected for order detail and shipping notice questions", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  (sqlTemplateRepository as any).findExecutableCandidates = async ({ question, slots }: any) => {
    const shipping = /发货通知|待发货|未发货|没发货|欠发|未发完|通知发货/u.test(question);
    return [
      makeSalesTemplateCandidate("family_016", "sales_order_detail", "sales", shipping ? 0.45 : 0.8),
      makeSalesTemplateCandidate("family_037", "sales_shipping_notice_detail", "sales_inventory", shipping ? 0.9 : 0.35),
    ].filter((candidate) => bindable(candidate, slots)).sort((left, right) => right.score - left.score);
  };

  try {
    const detail = await runFindSqlTemplateTool({
      question: "客户 A 有哪些销售订单明细",
      intent: makeSalesIntent("客户 A 有哪些销售订单明细"),
      slots: slotsFromIntent({ ...makeSalesIntent("客户 A 有哪些销售订单明细"), entities: {} }),
    });
    const shipping = await runFindSqlTemplateTool({
      question: "哪些订单已经通知发货但还没发完",
      intent: makeSalesIntent("哪些订单已经通知发货但还没发完"),
      slots: slotsFromIntent({ ...makeSalesIntent("哪些订单已经通知发货但还没发完"), entities: {} }),
    });

    assert.equal(detail.candidate?.familyId, "family_016");
    assert.equal(detail.params?.customerName, "A");
    assert.equal(shipping.candidate?.familyId, "family_037");
    assert.equal(shipping.params?.onlyOpenRelease, true);
    assert.equal(shipping.params?.onlyShippingNotice, true);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("findSqlTemplate exposes lookup timings", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  (sqlTemplateRepository as any).findExecutableCandidates = async (input: any) => {
    input.diagnostics?.push({ stage: "db_query", durationMs: 7, detail: "rows=1" });
    return [];
  };

  try {
    const result = await runFindSqlTemplateTool({
      question: "查采购订单",
      intent: makeSalesIntent("查采购订单"),
      slots: {},
    });

    assert.equal(result.timings?.[0]?.stage, "db_query");
    assert.equal(result.timings?.[0]?.durationMs, 7);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("customer sales ranking skips the order margin-cost detail template", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  (sqlTemplateRepository as any).findExecutableCandidates = async () => [
    makeSalesTemplateCandidate("family_100", "order_margin_cost_detail", "finance", 0.8),
  ];

  try {
    const analysisPlan = (await runAnalyzeSqlQuestionTool("最近一个月销售额最高的客户有哪些")).analysisPlan;
    const result = await runFindSqlTemplateTool({
      question: "最近一个月销售额最高的客户有哪些",
      intent: { ...makeSalesIntent("最近一个月销售额最高的客户有哪些"), module: "finance" },
      requiredMetrics: analysisPlan?.requiredMetrics,
      analysisPlan,
      slots: {},
    });

    assert.equal(result.candidate, undefined);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("findSqlTemplate does not preempt a multi-metric analysis plan", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  (sqlTemplateRepository as any).findExecutableCandidates = async () => [
    makeSalesTemplateCandidate("family_100", "order_margin_cost_detail", "finance", 0.9),
  ];

  try {
    const result = await runFindSqlTemplateTool({
      question: "哪些订单成本异常偏高",
      intent: { ...makeSalesIntent("哪些订单成本异常偏高"), module: "finance" },
      requiredMetrics: ["order_amount", "material_cost_amount"],
      slots: {},
    });

    assert.equal(result.candidate, undefined);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("real sales template scoring keeps shipping notice detail on family_037", async () => {
  const result = await runFindSqlTemplateTool({
    question: "发货通知里订单 40003 的明细",
    intent: makeSalesIntent("发货通知里订单 40003 的明细"),
    slots: slotsFromIntent({ ...makeSalesIntent("发货通知里订单 40003 的明细"), entities: {} }),
  });

  assert.equal(result.candidate?.familyId, "family_037");
  assert.equal(result.params?.orderNum, 40003);
  assert.equal(result.params?.onlyOpenRelease, true);
});

test("analysis planner splits composite business question into atomic metrics", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些客户订单金额大但回款慢，同时毛利也偏低？");

  assert.deepEqual(result.analysisPlan?.metrics, ["order_amount", "collection_delay_days", "collection_overdue_amount", "gross_margin_rate"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["customer", "order"]);
  assert.deepEqual(result.clarificationQuestions, []);
});

test("analysis planner maps overdue collection question to amount and days", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些客户逾期回款最多？");

  assert(result.analysisPlan?.metrics.includes("collection_overdue_amount"));
  assert(result.analysisPlan?.metrics.includes("collection_delay_days"));
  assert.deepEqual(result.analysisPlan?.dimensions, ["customer"]);
  assert.deepEqual(result.analysisPlan?.orderBy, [{ metric: "collection_overdue_amount", direction: "DESC" }]);
});

test("analysis planner captures top product limit without using month number", async () => {
  const result = await runAnalyzeSqlQuestionTool("6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？");

  assert.equal(result.analysisPlan?.scenario, "sales_margin_cost_by_product_customer_order");
  assert.deepEqual(result.analysisPlan?.requiredMetrics, ["order_amount", "gross_margin_rate", ...COST_COMPONENT_METRICS]);
  assert.equal(result.analysisPlan?.timeRange?.kind, "month");
  assert.equal((result.analysisPlan?.timeRange as any).month, 6);
  assert.equal(result.analysisPlan?.limit, 5);
});

test("analysis planner structures product-category previous-month year-over-year ranking", async () => {
  const result = await runAnalyzeSqlQuestionTool("按产品类别，上个月销售额最高，和去年同比");

  assert.deepEqual(result.analysisPlan?.metrics, ["order_amount"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["product_category"]);
  assert.equal(result.analysisPlan?.timeRange?.kind, "previous_month");
  assert.equal(result.analysisPlan?.comparison?.kind, "year_over_year");
  assert.equal(result.analysisPlan?.timeGrain, "month");
  assert.deepEqual(result.analysisPlan?.orderBy, [{ metric: "order_amount", direction: "DESC" }]);
  assert.deepEqual(result.analysisPlan?.businessScope, [{ metric: "order_amount", source: "approved_metric" }]);
});

test("analysis planner inherits prior sales scope and records a user category merge rule", async () => {
  const first = await runAnalyzeSqlQuestionTool("按产品类别区分，上个月销售额最高的是哪些，和去年同比数据怎么样");
  const second = await runAnalyzeSqlQuestionTool(
    "今年的平模头总销售额应该是平模头+高端平模头",
    undefined,
    first.analysisPlan as any,
    "trace-first",
  );

  assert.deepEqual(second.analysisPlan?.metrics, ["order_amount"]);
  assert.deepEqual(second.analysisPlan?.dimensions, ["product_category"]);
  assert.equal(second.analysisPlan?.timeRange?.kind, "current_year");
  assert.equal(second.analysisPlan?.comparison?.kind, "year_over_year");
  assert.equal(second.analysisPlan?.timeGrain, "year");
  assert.deepEqual(second.analysisPlan?.dimensionRules?.[0], {
    dimension: "product_category",
    target: "平模头总类",
    members: ["平模头", "高端平模头"],
    source: "user_statement",
    trust: "user_asserted",
    validation: "master_data_required",
  });
  assert.equal(second.analysisPlan?.contextInheritance?.sourceTraceId, "trace-first");
  assert(second.analysisPlan?.assumptions?.some((item) => item.includes("沿用上一轮")));

  const repeated = await runAnalyzeSqlQuestionTool(
    "今年的平模头总销售额应该是平模头+高端平模头",
    undefined,
    second.analysisPlan as any,
    "trace-second",
  );
  assert.equal(repeated.analysisPlan?.dimensionRules?.length, 1);
  assert.equal(
    repeated.analysisPlan?.assumptions?.length,
    new Set(repeated.analysisPlan?.assumptions).size,
  );
});

test("analysis planner inherits a prior plan when a follow-up supplies only a structured time slot", async () => {
  const previous = {
    mode: "strict" as const,
    grain: ["supplier"],
    metrics: ["purchase_amount"],
    requiredMetrics: ["purchase_amount"],
    filters: [],
    dimensions: ["supplier"],
    orderBy: [{ metric: "purchase_amount", direction: "DESC" as const }],
    businessScope: [{ metric: "purchase_amount", source: "approved_metric" as const }],
  };

  const result = await runAnalyzeSqlQuestionTool("最近一个月", undefined, previous, "trace-purchase");

  assert.deepEqual(result.analysisPlan?.metrics, ["purchase_amount"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["supplier"]);
  assert.deepEqual(result.analysisPlan?.timeRange, { kind: "relative", days: 30 });
  assert.equal(result.analysisPlan?.contextInheritance?.sourceTraceId, "trace-purchase");
});

test("analysis planner gives the LLM six rounds and the validated previous plan for a supplier display correction", async () => {
  let capturedInput: any;
  let capturedMessages: Array<{ role: string; content: string }> = [];
  const previous = {
    mode: "strict" as const,
    grain: ["supplier"],
    metrics: ["purchase_amount"],
    requiredMetrics: ["purchase_amount"],
    filters: [],
    dimensions: ["supplier"],
    orderBy: [{ metric: "purchase_amount", direction: "DESC" as const }],
    timeRange: { kind: "relative" as const, days: 30 },
    businessScope: [{ metric: "purchase_amount", source: "approved_metric" as const }],
  };
  const recentMessages = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `历史消息${index + 1}`,
  }));
  const planner = new AnalysisPlannerService(async (request) => {
    capturedInput = request.input;
    capturedMessages = request.messages;
    return JSON.stringify({
      mode: "strict",
      grain: ["supplier"],
      metrics: ["purchase_amount"],
      filters: [],
      dimensions: ["supplier"],
      orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
    });
  });

  const result = await planner.plan(
    "请不要用supplier编号，需要查询具体供应商名称",
    undefined,
    previous,
    "trace-purchase",
    { recentMessages, semanticSummary: "指标:purchase_amount；维度:supplier；时间:最近30天" },
    "purchase.supplier_amount_summary",
  );

  assert.deepEqual(capturedInput.previousPlan.timeRange, { kind: "relative", days: 30 });
  assert.equal(capturedInput.conversation.recentMessages.length, 12);
  assert.equal(capturedMessages.filter((message) => /^历史消息/u.test(message.content)).length, 12);
  assert.deepEqual(result.analysisPlan?.timeRange, { kind: "relative", days: 30 });
  assert.deepEqual(result.analysisPlan?.metrics, ["purchase_amount"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["supplier"]);
  assert.equal(result.analysisPlan?.contextInheritance?.sourceTraceId, "trace-purchase");
  assert(result.analysisPlan?.contextInheritance?.inheritedFields.includes("timeRange"));
});

test("analysis planner gives old protected sessions the validated plan with semantic summary fallback", async () => {
  let capturedInput: any;
  const previous = {
    mode: "strict" as const,
    grain: ["supplier"], metrics: ["purchase_amount"], requiredMetrics: ["purchase_amount"],
    filters: [], dimensions: ["supplier"], orderBy: [],
    timeRange: { kind: "relative" as const, days: 30 },
  };
  const planner = new AnalysisPlannerService(async (request) => {
    capturedInput = request.input;
    return JSON.stringify({
      mode: "strict", grain: ["supplier"], metrics: ["purchase_amount"],
      filters: [], dimensions: ["supplier"], orderBy: [],
    });
  });

  const result = await planner.plan(
    "改成供应商名称",
    undefined,
    previous,
    "trace-old-session",
    { recentMessages: [], semanticSummary: "指标:purchase_amount；维度:supplier；时间:最近30天" },
    "purchase.supplier_amount_summary",
  );

  assert.deepEqual(capturedInput.previousPlan.timeRange, { kind: "relative", days: 30 });
  assert.deepEqual(result.analysisPlan?.timeRange, { kind: "relative", days: 30 });
});

test("structured follow-up rejects template 66 without declared coverage", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  (sqlTemplateRepository as any).findExecutableCandidates = async () => [{
    ...makeTemplateCandidate(),
    id: 66n,
    requiredParams: {},
    score: 0.99,
    matchedSignals: ["template:66"],
  }];
  try {
    const first = await runAnalyzeSqlQuestionTool("按产品类别区分，上个月销售额最高的是哪些，和去年同比数据怎么样");
    const second = await runAnalyzeSqlQuestionTool("今年的平模头总销售额应该是平模头+高端平模头", undefined, first.analysisPlan as any);
    const result = await runFindSqlTemplateTool({
      question: "今年的平模头总销售额应该是平模头+高端平模头",
      slots: {},
      requiredMetrics: second.analysisPlan?.requiredMetrics,
      analysisPlan: second.analysisPlan,
    });

    assert.equal(result.candidate, undefined);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("analysis planner expands cost component wording to four approved cost metrics", async () => {
  const result = await runAnalyzeSqlQuestionTool("6月份毛利率低的订单，材料成本高还是加工成本高，外协和制造费用分别是多少？");

  for (const metricCode of COST_COMPONENT_METRICS) {
    assert(result.analysisPlan?.metrics.includes(metricCode), metricCode);
  }
});

test("analysis planner maps open shipping wording to amount and quantity metrics", async () => {
  const result = await runAnalyzeSqlQuestionTool("本月价值最高的产品订单里有哪些还没发货？");

  assert(result.analysisPlan?.metrics.includes("open_shipping_amount"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_qty"));
  assert.deepEqual(result.analysisPlan?.orderBy, [{ metric: "open_shipping_amount", direction: "DESC" }]);
});

test("analysis planner maps delivery-order wording to open shipping metrics", async () => {
  const result = await runAnalyzeSqlQuestionTool("最近有哪些单要交货了");
  assert(result.analysisPlan);
  assert(result.analysisPlan.metrics.includes("open_shipping_qty"));
  assert(result.analysisPlan.metrics.includes("open_shipping_amount"));
});

test("analysis planner captures an explicit order number as a typed dimension filter", async () => {
  const result = await runAnalyzeSqlQuestionTool("订单 226867 还有多少没发货？");

  assert.equal(result.analysisPlan?.dimensionFilters?.order, "226867");
});

test("analysis planner deterministically extracts all six entity filters without treating product category as a part", async () => {
  const result = await runAnalyzeSqlQuestionTool(
    "客户帝龙永孚的订单226867，供应商为华东轴承，物料A123，仓库CPC001，工单J10086，销售额和库存是多少？",
  );

  assert.deepEqual(result.analysisPlan?.dimensionFilters, {
    customer: "帝龙永孚",
    order: "226867",
    supplier: "华东轴承",
    product: "A123",
    warehouse: "CPC001",
    job: "J10086",
  });
  const category = await runAnalyzeSqlQuestionTool("按产品类别看本月销售额最高的产品");
  assert.equal(category.analysisPlan?.dimensionFilters?.product, undefined);
});

test("analysis planner merges deterministic filters into LLM filters one key at a time", async () => {
  let prompt = "";
  const planner = new AnalysisPlannerService(async ({ messages }) => {
    prompt = messages.at(-1)?.content ?? "";
    return JSON.stringify({
      mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
      dimensionFilters: { supplier: "LLM供应商", warehouse: "LLM仓库" },
    });
  });

  const result = await planner.plan("客户帝龙永孚和订单226867同时分析");

  assert.deepEqual(result.analysisPlan?.dimensionFilters, {
    supplier: "LLM供应商",
    warehouse: "LLM仓库",
    customer: "帝龙永孚",
    order: "226867",
  });
  assert.match(prompt, /dimensionFilters/u);
  assert.match(prompt, /supplier/u);
});

test("analysis planner does not turn customer or supplier analysis topics into entity filters", async () => {
  const planner = new AnalysisPlannerService(async () => JSON.stringify({
    mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
  }));

  for (const question of ["客户流失趋势", "客户满意度分析", "供应商绩效分析", "供应商交期趋势", "客户价值分析"]) {
    const result = await planner.plan(question);
    assert.deepEqual(result.analysisPlan?.dimensionFilters, undefined, question);
    assert.equal(result.analysisPlan?.customerName, undefined, question);
  }
});

test("analysis planner keeps auditable customer and supplier identity syntax", async () => {
  const planner = new AnalysisPlannerService(async () => JSON.stringify({
    mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
  }));
  const cases: Array<[string, string, string]> = [
    ["客户为jctimes，分析销售额和毛利率", "customer", "jctimes"],
    ["客户“华新”销售额和毛利率分析", "customer", "华新"],
    ["客户jctimes公司销售额和毛利率分析", "customer", "jctimes公司"],
    ["客户BYD，销售额和毛利率分析", "customer", "BYD"],
    ["供应商等于华东轴承，分析采购额和成本构成", "supplier", "华东轴承"],
  ];

  for (const [question, key, value] of cases) {
    const result = await planner.plan(question);
    assert.equal(result.analysisPlan?.dimensionFilters?.[key as "customer" | "supplier"], value, question);
  }
});

test("template without orderNum coverage cannot answer an order-scoped question", async () => {
  const original = sqlTemplateRepository.findExecutableCandidates;
  const plan = {
    mode: "strict" as const,
    grain: ["order"],
    metrics: ["open_shipping_amount"],
    requiredMetrics: ["open_shipping_amount"],
    filters: [],
    dimensions: ["order"],
    dimensionFilters: { order: "226867" },
    orderBy: [],
  };
  try {
    (sqlTemplateRepository as any).findExecutableCandidates = async () => [withTemplateCoverage({
      ...makeSalesTemplateCandidate("family_037", "detail", "sales", 0.99),
      queryPlanJson: {},
    })];
    const uncovered = await runFindSqlTemplateTool({
      question: "订单 226867 还有多少没发货？",
      slots: { orderNum: 226867 },
      requiredMetrics: ["open_shipping_amount"],
      analysisPlan: plan,
    });
    assert.equal(uncovered.candidate, undefined);

    (sqlTemplateRepository as any).findExecutableCandidates = async () => [withTemplateCoverage({
      ...makeSalesTemplateCandidate("family_037", "detail", "sales", 0.99),
      queryPlanJson: { coveredFilterSlots: ["orderNum"] },
    })];
    const covered = await runFindSqlTemplateTool({
      question: "订单 226867 还有多少没发货？",
      slots: { orderNum: 226867 },
      requiredMetrics: ["open_shipping_amount"],
      analysisPlan: plan,
    });
    assert.equal(covered.candidate?.id, "37");
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = original;
  }
});

test("analysis planner keeps overdue shipping semantics", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些产品订单延期交付？");

  assert(result.analysisPlan?.metrics.includes("open_shipping_amount"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_qty"));
  assert(result.analysisPlan?.filters.some((filter) => filter.metric === "open_shipping_amount" && filter.op === "overdue"));
});

test("analysis planner does not treat supplier delivery overdue wording as sales shipping", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些供应商交期已经超了");

  assert.equal(result.analysisPlan, undefined);
});

test("analysis planner captures inventory on-hand quantity by warehouse and product", async () => {
  const result = await runAnalyzeSqlQuestionTool("按仓库和产品看当前库存现存量和未交付金额");

  assert(result.analysisPlan?.metrics.includes("inventory_on_hand_qty"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_amount"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_qty"));
  assert.deepEqual(result.analysisPlan?.dimensions, ["product", "warehouse"]);
});

test("analysis planner maps product sales inventory backlog recipe by product only", async () => {
  const result = await runAnalyzeSqlQuestionTool("最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？");

  assert.equal(result.analysisPlan?.scenario, "product_sales_inventory_backlog_trend");
  assert.deepEqual(result.analysisPlan?.dimensions, ["product"]);
  assert(result.analysisPlan?.metrics.includes("order_amount"));
  assert(result.analysisPlan?.metrics.includes("inventory_on_hand_qty"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_amount"));
  assert(result.analysisPlan?.metrics.includes("open_shipping_qty"));
  assert.equal(result.analysisPlan?.timeRange?.kind, "relative");
  assert.equal((result.analysisPlan?.timeRange as any).days, 90);
});

test("analysis planner maps division sales margin monthly trend by division", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些事业部销售额增长了，但毛利率下降了？主要是哪些产品和客户导致的？");

  assert.equal(result.analysisPlan?.scenario, "division_sales_margin_monthly_trend");
  assert.equal(result.analysisPlan?.timeGrain, "month");
  assert.deepEqual(result.analysisPlan?.dimensions, ["division"]);
  assert.deepEqual(result.analysisPlan?.requiredMetrics, ["order_amount", "gross_margin_rate"]);
});

test("analysis planner captures customer margin monthly trend recipe", async () => {
  const result = await runAnalyzeSqlQuestionTool("最近半年哪些客户持续下单，但毛利率逐月下降？");

  assert.equal(result.analysisPlan?.scenario, "customer_margin_monthly_trend");
  assert.equal(result.analysisPlan?.timeGrain, "month");
  assert.equal(result.analysisPlan?.mode, "decision_support");
  assert.deepEqual(result.analysisPlan?.requiredMetrics, ["order_amount", "gross_margin_rate"]);
  assert(result.analysisPlan?.metrics.includes("order_amount"));
  assert(result.analysisPlan?.metrics.includes("gross_margin_rate"));
});

test("analysis planner forces named customer year-over-year trend to approved composer path", async () => {
  const result = await runAnalyzeSqlQuestionTool("客户帝龙永孚今年购买的产品类型销售额分布和去年相比有什么趋势变化？");

  assert.equal(result.analysisPlan?.scenario, "customer_product_yoy_trend");
  assert.equal(result.analysisPlan?.timeGrain, "year");
  assert.equal(result.analysisPlan?.timeRange?.kind, "year_over_year");
  assert.equal(result.analysisPlan?.customerName, "帝龙永孚");
  assert.deepEqual(result.analysisPlan?.requiredMetrics, ["order_amount"]);
  assert.deepEqual(result.clarificationQuestions, []);
});

test("analysis planner captures product customer concentration recipe", async () => {
  const result = await runAnalyzeSqlQuestionTool("哪些产品销售额进入Top10，但客户集中度过高？");

  assert.equal(result.analysisPlan?.scenario, "product_customer_concentration");
  assert.equal(result.analysisPlan?.analysisShape, "concentration");
  assert.deepEqual(result.analysisPlan?.dimensions, ["product", "customer"]);
  assert.equal(result.analysisPlan?.limit, 10);
  assert.deepEqual(result.analysisPlan?.orderBy, [{ metric: "order_amount", direction: "DESC" }]);
});

test("analysis planner captures customer product year-over-year trend recipe", async () => {
  const result = await runAnalyzeSqlQuestionTool("客户帝龙永孚今年购买的产品类型销售额分布和去年相比有什么趋势变化？");

  assert.equal(result.analysisPlan?.route, "complex_composed");
  assert.equal(result.analysisPlan?.scenario, "customer_product_yoy_trend");
  assert.deepEqual(result.analysisPlan?.requiredMetrics, ["order_amount"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["customer", "product"]);
  assert(result.analysisPlan?.metrics.includes("order_amount"));
  assert(result.analysisPlan?.retrievalHints?.some((hint) => hint.includes("销售额")));
  assert(result.analysisPlan?.assumptions?.some((item) => item.includes("产品类型")));
  assert(result.analysisPlan?.assumptions?.some((item) => item.includes("同比")));
});

test("analysis planner treats low gross margin wording as gross margin rate", async () => {
  const result = await runAnalyzeSqlQuestionTool("6月份毛利低于20%的订单有哪些，客户是谁，产品是什么，是材料成本高还是加工成本高？");
  const highValueResult = await runAnalyzeSqlQuestionTool("高价值产品中，哪些是因为材料成本高导致毛利低，哪些是人工或外协成本高？");

  assert.deepEqual(result.clarificationQuestions, []);
  assert(result.analysisPlan?.metrics.includes("gross_margin_rate"));
  assert(!result.analysisPlan?.metrics.includes("total_cost"));
  assert(result.analysisPlan?.filters.some((filter) => filter.metric === "gross_margin_rate" && filter.op === "low"));
  assert(highValueResult.analysisPlan?.metrics.includes("gross_margin_rate"));
  assert(!highValueResult.analysisPlan?.metrics.includes("total_cost"));
});

test("analysis planner captures approved shipped amount and open job risk recipes", async () => {
  const shipped = await runAnalyzeSqlQuestionTool("本月发货金额最高的客户，对应产品毛利和回款情况如何？");
  const openJob = await runAnalyzeSqlQuestionTool("当前未完工工单里，哪些关联高价值客户订单，预计毛利和成本风险是多少？");

  assert.equal(shipped.analysisPlan?.scenario, "shipped_customer_margin_collection_summary");
  assert(shipped.analysisPlan?.requiredMetrics?.includes("shipped_amount"));
  assert.deepEqual(shipped.analysisPlan?.dimensions, ["customer"]);
  assert.equal(openJob.analysisPlan?.scenario, "open_job_customer_margin_cost_risk");
  assert(openJob.analysisPlan?.requiredMetrics?.includes("open_job_margin_cost_risk"));
});

test("analysis planner keeps purchase impact out of strict atomic joins", async () => {
  const impact = await runAnalyzeSqlQuestionTool("最近一个季度采购成本上涨最多的物料，影响了哪些产品和客户订单毛利？");
  const supplier = await runAnalyzeSqlQuestionTool("本月采购金额最高的供应商，其物料影响了哪些高价值产品订单？");

  assert.equal(impact.analysisPlan?.scenario, "purchase_cost_margin_impact");
  assert.equal(impact.analysisPlan?.mode, "decision_support");
  assert.equal(supplier.analysisPlan?.scenario, "purchase_supplier_product_summary");
  assert.deepEqual(supplier.analysisPlan?.requiredMetrics, ["purchase_amount"]);
  assert.deepEqual(supplier.analysisPlan?.dimensions, ["supplier", "product"]);
  for (const metricCode of COST_COMPONENT_METRICS) {
    assert(!supplier.analysisPlan?.metrics.includes(metricCode), metricCode);
  }
});

test("ERP SQL toolchain workflow runs generate, validate, execute, and narrate path", async () => {
  const restore = stubToolchain({ narrate: true });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询采购订单", confirmed: true });

    assert.equal(result.success, true);
    assert.match(result.sql, /FROM \(SELECT \* FROM Erp\.POHeader WHERE Company IN \(N'EPIC03'\)\)/u);
    assert.equal(result.rowCount, 1);
    assert.equal(result.message, "查询到 1 行。\n- 公司为 jctimes\n- 仅基于返回样本说明");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow uses template path without generator", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    template: true,
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询物料 A123" });

    assert.equal(result.success, true);
    assert.equal(result.template?.id, "9");
    assert.equal(result.executionPath, "template");
    assert.equal(result.rowCount, 1);
    assert.equal(generatorCalls, 0);
  } finally {
    restore();
  }
});

test("unsupported capability never reaches template or generator", async () => {
  let templateCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "查合同号 HT20260001 的产品报价";
  const restore = stubToolchain({
    realCapabilityDecision: true,
    intent: { ...makeIntent(), originalQuestion: question, normalizedQuestion: question, module: "quotation" } as any,
    plan: {
      ...makePlan(),
      question,
      modules: [{ module: "quotation", label: "报价", score: 100, reasons: ["test"], rule: {} }],
    } as any,
    onFindTemplate() {
      templateCalls += 1;
    },
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.capabilityCode, "quotation.contract_config");
    assert.equal(result.sql, "");
    assert.equal(templateCalls, 0);
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ambiguous capability resolution fails closed before SQL paths", async () => {
  let templateCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "查询生产情况";
  const restore = stubToolchain({
    realCapabilityDecision: true,
    intent: { ...makeIntent(), originalQuestion: question, normalizedQuestion: question, module: "production", entities: {} } as any,
    plan: { ...makePlan(), question, modules: [{ module: "production", label: "生产", score: 100, reasons: ["test"], rule: {} }] },
    onFindTemplate: () => { templateCalls += 1; },
    onGenerate: () => { generatorCalls += 1; },
    onExecute: () => { executorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.capabilityCode, "ambiguous");
    assert.equal(result.reasonCode, "capability_resolution_ambiguous");
    assert.match(result.message, /ERP SQL 能力尚未覆盖/);
    assert.deepEqual([templateCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally {
    restore();
  }
});

test("unresolved empty-module plan fails closed before SQL paths", async () => {
  let templateCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "查询未知业务数据";
  const restore = stubToolchain({
    realCapabilityDecision: true,
    intent: { ...makeIntent(), originalQuestion: question, normalizedQuestion: question, module: "unknown", entities: {} } as any,
    plan: { ...makePlan(), question, modules: [] },
    onFindTemplate: () => { templateCalls += 1; },
    onGenerate: () => { generatorCalls += 1; },
    onExecute: () => { executorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.capabilityCode, "unresolved");
    assert.equal(result.reasonCode, "capability_unresolved");
    assert.equal(result.sql, "");
    assert.deepEqual([templateCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow falls back when a template is rejected by semantic runtime guard", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    template: true,
    invalidTemplateSemantic: true,
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "查询采购订单",
    });

    assert.equal(result.success, true);
    assert.equal(result.template, undefined);
    assert.equal(generatorCalls, 1);
    assert.match(result.sql, /SELECT/u);
    assert.match(result.warnings.join("\n"), /continuing with internal fallback/u);
  } finally {
    restore();
  }
});

test("dev full access downgrades semantic mismatch to executable estimate", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const generation = {
    valid: true,
    source: "llm",
    scenario: "llmFallback",
    sql: "SELECT TOP 100 Company FROM Erp.OrderHed",
    intent: "list",
    tables: ["Erp.OrderHed"],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: { valid: true, errors: [], warnings: [], normalizedSql: "", referencedTables: ["Erp.OrderHed"], referencedFields: ["Company"] },
  } as any;

  try {
    const blocked = await runValidateSqlRuntimeTool({
      question: "查询物料 A123 的库存",
      generation,
      queryPlan: makePlan(),
      module: "sales",
    });
    assert.equal(blocked.generation.valid, false);
    assert.equal(blocked.generation.semanticResult?.status, "semantic_mismatch");

    const relaxed = await runValidateSqlRuntimeTool({
      question: "查询物料 A123 的库存",
      generation,
      queryPlan: makePlan(),
      module: "sales",
      devFullAccess: true,
    });
    assert.equal(relaxed.generation.valid, true);
    assert.equal(relaxed.generation.semanticResult?.status, "estimate");
    assert.match(relaxed.generation.warnings.join("\n"), /DEV_SEMANTIC_MISMATCH_EXECUTED/);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("ERP SQL toolchain workflow composes named customer trend with customer bridge", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [makeAtomicMetric("order_amount")],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "客户帝龙永孚今年购买的产品类型销售额分布和去年相比有什么趋势变化？",
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.match(result.sql, /LEFT JOIN \(SELECT \* FROM Erp\.Customer WHERE Company IN \(N'EPIC03'\)\) AS Customer/);
    assert.match(result.sql, /COALESCE\(Customer\.Name, Customer\.CustID\) LIKE N'%帝龙永孚%'/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not execute invalid generated SQL", async () => {
  let executorCalls = 0;
  const restore = stubToolchain({
    invalidGuard: true,
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "危险 SQL" });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /blocked/);
    assert.equal(result.sql, "");
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow returns estimate data without approved metric or template", async () => {
  let executorCalls = 0;
  let validateOptions: any;
  const restore = stubToolchain({
    intent: makeFinanceIntent("查询产品毛利"),
    plan: makeFinancePlan("查询产品毛利"),
    references: [makeDatasetReference()],
    financeGuard: true,
    onValidate(_sql, options) {
      validateOptions = options;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询产品毛利" });

    assert.equal(result.success, true);
    assert.equal(validateOptions.financeMode, "estimate");
    assert.equal(result.financeScope?.mode, "estimate");
    assert.equal(result.semanticStatus, "estimate");
    assert.match(result.message, /仅供参考/);
    assert.equal(executorCalls, 1);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow uses estimate mode for explicit rough finance questions", async () => {
  let validateOptions: any;
  const restore = stubToolchain({
    intent: makeFinanceIntent("产品毛利大概多少"),
    plan: makeFinancePlan("产品毛利大概多少"),
    references: [makeDatasetReference()],
    onValidate(_sql, options) {
      validateOptions = options;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "产品毛利大概多少" });

    assert.equal(result.success, true);
    assert.equal(validateOptions.financeMode, "estimate");
    assert.equal(result.financeScope?.mode, "estimate");
    assert.equal(result.financeScope?.references[0]?.sourceType, "dataset");
    assert.match(result.financeScope?.disclaimer ?? "", /不可用于财务报表/);
    assert.match(result.message, /仅供参考/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow asks clarification for vague business assessment", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const restore = stubToolchain({
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "车间认为今年做的数量变多了，但是单价下降了，请你帮忙评估。",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "clarification_required");
    assert.equal(result.outcome, "clarify");
    assert.equal(result.capabilityCode, "test.published");
    assert.equal(result.reasonCode, "clarification_required");
    assert.deepEqual(result.missingCoverage, []);
    assert.match(result.message, /直接给结论可能不准/);
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(result.clarificationQuestions?.length, 1);
    assert(result.clarificationQuestions?.some((question) => question.includes("数量")));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow asks clarification for ambiguous product quantity basis", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const restore = stubToolchain({
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "今年计量泵做了多少了，给一份各型号的数量和占比",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "clarification_required");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(result.clarificationQuestions?.length, 1);
    assert(result.clarificationQuestions?.some((question) => question.includes("生产完工数量")));
  } finally {
    restore();
  }
});

test("analysis planner does not clarify explicit production completion quantity", async () => {
  const result = await runAnalyzeSqlQuestionTool("今年计量泵生产完工数量按型号的数量和占比");

  assert.deepEqual(result.clarificationQuestions, []);
});

test("ERP SQL toolchain workflow returns unsupported for uncovered composite SQL before fallback", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "哪些客户订单金额大但回款慢，同时毛利率偏低？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [makeAtomicMetric("order_amount"), makeAtomicMetric("gross_margin_rate")],
    references: [makeDatasetReference()],
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow keeps shipped amount unsupported without verified shipment status", async () => {
  let generatorCalls = 0;
  let validateOptions: any;
  const question = "本月发货金额最高的客户，对应产品毛利和回款情况如何？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("shipped_amount"),
      makeAtomicMetric("gross_margin_rate"),
      makeAtomicMetric("collection_delay_days"),
      makeAtomicMetric("collection_overdue_amount"),
    ],
    references: [makeDatasetReference()],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate(_sql, options) {
      validateOptions = options;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions, undefined);
    assert(result.missingCoverage?.includes("shipped_amount"));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not apply finance mode to open shipping analysis", async () => {
  let validateOptions: any;
  const question = "哪些销售订单还没发货";
  const restore = stubToolchain({
    intent: makeSalesIntent(question),
    plan: makeSalesPlan(question),
    atomicMetrics: [makeAtomicMetric("open_shipping_amount"), makeAtomicMetric("open_shipping_qty")],
    onValidate(_sql, options) {
      validateOptions = options;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });

    assert.equal(result.success, true);
    assert.equal(validateOptions.module, undefined);
    assert.equal(validateOptions.financeMode, undefined);
    assert.equal(result.financeScope, undefined);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain exposes validated order scope to the response and narrator", async () => {
  const question = "订单 10086 的待发货情况";
  let narratorScope: unknown;
  const restore = stubToolchain({
    intent: makeSalesIntent(question),
    plan: makeSalesPlan(question),
    atomicMetrics: [makeAtomicMetric("open_shipping_amount"), makeAtomicMetric("open_shipping_qty")],
    execution: {
      fields: ["order", "open_shipping_amount"],
      rows: [[10086, 100]],
    },
    onNarrate(input) {
      narratorScope = input.scope;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "sales.open_shipping" });

    assert.equal(result.outcome, "execute", JSON.stringify(result));
    assert.equal(result.scope?.filters.order, "10086");
    assert.equal(result.outcome, "execute");
    assert.equal(result.capabilityCode, result.scope?.capability);
    assert.equal(result.executionPath, "composer");
    assert(result.traceId.length > 0);
    assert.deepEqual(narratorScope, result.scope);
    const contract = loadSqlTemplateGoldenQuestions().find((item) => item.question === question);
    assert(contract);
    assert.equal(buildGoldenCapabilityReport([{ contract: { ...contract, capability: result.capabilityCode }, result }]).counts.execute_pass, 1);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain suppresses executed rows outside the validated order scope", async () => {
  const question = "订单 226867 还有多少没发货？";
  let narratorCalls = 0;
  const restore = stubToolchain({
    intent: makeSalesIntent(question),
    plan: makeSalesPlan(question),
    atomicMetrics: [makeAtomicMetric("open_shipping_amount"), makeAtomicMetric("open_shipping_qty")],
    execution: {
      fields: ["order", "open_shipping_amount"],
      rows: [[226868, 100]],
    },
    onNarrate() {
      narratorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });

    assert.equal(result.success, false);
    assert.equal(result.semanticStatus, "semantic_mismatch");
    assert.match(result.error ?? "", /result scope/i);
    assert.deepEqual(result.rows, []);
    assert.equal(result.rowCount, 0);
    assert.equal(narratorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL result scope preserves executor failures before checking partial rows", async () => {
  const question = "订单 226867 还有多少没发货？";
  const restore = stubToolchain({
    intent: makeSalesIntent(question),
    plan: makeSalesPlan(question),
    atomicMetrics: [makeAtomicMetric("open_shipping_amount"), makeAtomicMetric("open_shipping_qty")],
    execution: {
      valid: false,
      executed: true,
      error: "ERP query failed",
      fields: ["order"],
      rows: [[226868]],
    },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.success, false);
    assert.equal(result.error, "ERP query failed");
    assert.notEqual(result.semanticStatus, "semantic_mismatch");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow keeps operational metrics out of finance guard when intent is misclassified", async () => {
  let validateOptions: any;
  const question = "订单 10086 的待发货情况";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [makeAtomicMetric("open_shipping_amount"), makeAtomicMetric("open_shipping_qty")],
    onValidate(_sql, options) {
      validateOptions = options;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });

    assert.equal(result.success, true);
    assert.equal(validateOptions.module, undefined);
    assert.equal(validateOptions.financeMode, undefined);
    assert.equal(result.financeScope, undefined);
    assert.deepEqual((result.analysisPlan as any).metrics, ["open_shipping_amount", "open_shipping_qty"]);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain executes sales inventory backlog as three guarded queries", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  let executorCalls = 0;
  let returnUnmatchedRows = false;
  const metricGroups: string[][] = [];
  const question = "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeComplexAtomicMetric("order_amount"),
      makeComplexAtomicMetric("inventory_on_hand_qty"),
      makeComplexAtomicMetric("open_shipping_qty"),
      makeComplexAtomicMetric("open_shipping_amount"),
    ],
    onExecute(generation) {
      executorCalls += 1;
      metricGroups.push((generation.references ?? []).map((reference: any) => reference.metricCode).filter(Boolean));
    },
    executionFactory(generation) {
      const metrics = (generation.references ?? []).map((reference: any) => reference.metricCode);
      if (metrics.includes("order_amount")) return {
        fields: ["Company", "product", "sales_growth_rate"],
        rows: [["EPIC03", "A", 0.5]],
      };
      if (metrics.includes("inventory_on_hand_qty")) return {
        fields: ["Company", "product", "inventory_on_hand_qty"], rows: [["EPIC03", returnUnmatchedRows ? "B" : "A", 20]],
      };
      return {
        fields: ["Company", "product", "open_shipping_qty", "open_shipping_amount"], rows: [["EPIC03", returnUnmatchedRows ? "B" : "A", 30, 300]],
      };
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflowWithAccess(
      { question, routeCapabilityCode: "finance.composite_decision" },
      { accessScope: { ...TEST_SCOPE, modules: ["sales", "inventory"] } },
    );

    assert.equal(result.success, true, JSON.stringify({ error: result.error, reasonCode: result.reasonCode, missingCoverage: result.missingCoverage, complexAnalysis: result.complexAnalysis }));
    assert.equal(executorCalls, 3);
    assert.deepEqual(metricGroups, [["order_amount"], ["inventory_on_hand_qty"], ["open_shipping_qty", "open_shipping_amount"]]);
    assert.equal(result.sql, "");
    assert.equal((result as any).complexAnalysis?.scenario, "product_sales_inventory_backlog_trend");
    assert.equal((result as any).complexAnalysis?.steps.length, 3);
    assert.deepEqual(result.fields.slice(0, 3), ["Company", "product", "sales_growth_rate"]);
    assert.equal((result.analysisPlan as any).scenario, "product_sales_inventory_backlog_trend");

    process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
    const overridden = await runErpSqlToolchainWorkflowWithAccess(
      { question, routeCapabilityCode: "sales.order_detail" },
      { accessScope: { ...TEST_SCOPE, modules: ["sales", "inventory"] } },
    );
    assert.equal(overridden.success, true);
    assert.equal(overridden.capabilityCode, "complex.product_sales_inventory_backlog");
    assert(overridden.warnings.includes("diagnostic_composite_capability_bypass"));
    assert.equal(executorCalls, 6);

    returnUnmatchedRows = true;
    const partial = await runErpSqlToolchainWorkflowWithAccess(
      { question, routeCapabilityCode: "finance.composite_decision" },
      { accessScope: { ...TEST_SCOPE, modules: ["sales", "inventory"] } },
    );
    assert.equal(partial.success, true);
    assert((partial.complexAnalysis?.steps ?? []).every((step) => step.status === "completed"));
    assert.equal(partial.complexAnalysis?.status, "partial");
    assert.equal(partial.semanticStatus, "estimate");
    assert(partial.analysis?.caveats.includes("部分来源未匹配或子查询未完整完成，空值表示该来源未返回匹配数据。"));
    assert.equal(executorCalls, 9);
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("ERP SQL toolchain only warns when a complex plan actually overrides a router lock", async () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
  const question = "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    analysisPlan: {
      route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
      grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
      metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
      requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    },
  });

  try {
    const unlocked = await runErpSqlToolchainWorkflow({ question });
    const correctlyLocked = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "complex.product_sales_inventory_backlog" });
    const overridden = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "sales.order_detail" });
    assert(!unlocked.warnings.includes("diagnostic_composite_capability_bypass"));
    assert(!correctlyLocked.warnings.includes("diagnostic_composite_capability_bypass"));
    assert(overridden.warnings.includes("diagnostic_composite_capability_bypass"));
  } finally {
    restore();
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("ERP SQL toolchain fails closed when a recognized complex plan has unsupported filters", async () => {
  let executorCalls = 0;
  const question = "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    analysisPlan: {
      route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
      grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
      metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
      requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
      dimensionFilters: { customer: "客户A" },
    },
    onExecute() { executorCalls += 1; },
  });
  try {
    const result = await runErpSqlToolchainWorkflow({ question, routeCapabilityCode: "finance.composite_decision" });
    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.reasonCode, "unsupported_complex_filter");
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved open job risk before generator", async () => {
  let generatorCalls = 0;
  const question = "当前未完工工单里，哪些关联高价值客户订单，预计毛利和成本风险是多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("open_job_margin_cost_risk"),
      makeAtomicMetric("order_amount"),
      makeAtomicMetric("gross_margin_rate"),
      ...COST_COMPONENT_METRICS.map(makeAtomicMetric),
    ],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.match(result.sql, /COUNT\(DISTINCT JobHead\.JobNum\)/);
    assert.match(result.sql, /JobHead\.JobClosed = 0/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow uses reference-assisted estimate for purchase margin impact", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  let validateOptions: any;
  const question = "最近一个季度采购成本上涨最多的物料，影响了哪些产品和客户订单毛利？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("purchase_amount"),
      makeAtomicMetric("gross_margin_rate"),
    ],
    references: [makeDatasetReference(), { ...makeDatasetReference(), familyId: "family_049" }],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate(_sql, options) {
      validateOptions = options;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions, undefined);
    assert.equal((result.analysisPlan as any).scenario, "purchase_cost_margin_impact");
    assert.equal(result.financeScope, undefined);
    assert.equal(executorCalls, 0);
    assert.match(result.error ?? "", /缺少维度表达式|不兼容/u);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not run expensive schema repair after guard missing schema", async () => {
  let generatorCalls = 0;
  let referenceCalls = 0;
  let executorCalls = 0;
  const question = "最近一个季度采购成本上涨最多的物料，影响了哪些产品和客户订单毛利？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("purchase_amount"),
      makeAtomicMetric("gross_margin_rate"),
    ],
    references: [makeDatasetReference()],
    missingSchemaGuard: true,
    onFindReference() {
      referenceCalls += 1;
    },
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.sql, "");
    assert.equal(result.outcome, "unsupported");
    assert.match(result.error ?? "", /缺少维度表达式|不兼容/u);
    assert.equal(referenceCalls, 0);
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain blocks collection high filter without threshold or matching rank contract", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  let validateOptions: any;
  const question = "哪些客户逾期回款最多？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("collection_delay_days"),
      makeAtomicMetric("collection_overdue_amount"),
    ],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate(_sql, options) {
      validateOptions = options;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.semanticStatus, "semantic_mismatch");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.match(result.error ?? "", /required filter collection_delay_days:high/i);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain blocks qualitative metric filters without threshold or matching rank contract", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  let validateOptions: any;
  const question = "6月份销售额最高的5类产品，毛利率是多少，成本主要高在哪？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("order_amount"),
      makeAtomicMetric("gross_margin_rate"),
      ...COST_COMPONENT_METRICS.map(makeAtomicMetric),
    ],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate(_sql, options) {
      validateOptions = options;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(validateOptions, undefined);
    assert.equal(((result.analysisPlan as any).metrics as string[]).includes("gross_margin_rate"), true);
    assert(result.missingCoverage?.includes("cost_component_amount"));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain carries a product-category comparison plan into a follow-up merge rule", async () => {
  let generatorCalls = 0;
  let templateCalls = 0;
  const firstQuestion = "按产品类别区分，上个月销售额最高的是哪些，和去年同比数据怎么样";
  const restore = stubToolchain({
    intent: {
      ...makeFinanceIntent(firstQuestion),
      dateRange: { from: "2026-01-01", to: "2026-12-31" },
    },
    plan: makeSalesPlan(firstQuestion),
    atomicMetrics: [makeProductCategoryOrderAmountMetric()],
    realCapabilityDecision: true,
    onGenerate() {
      generatorCalls += 1;
    },
    onFindTemplate() {
      templateCalls += 1;
    },
  });

  try {
    const first = await runErpSqlToolchainWorkflow({ question: firstQuestion, routeCapabilityCode: "sales.product_category_yoy" });
    const second = await runErpSqlToolchainWorkflow({
      question: "今年的平模头总销售额应该是平模头+高端平模头",
      context: first as unknown as Record<string, unknown>,
      routeCapabilityCode: "sales.product_category_yoy",
    });

    assert.equal(first.success, true, JSON.stringify({ outcome: first.outcome, error: first.error, missingCoverage: first.missingCoverage }));
    assert.equal(second.success, true, JSON.stringify({ outcome: second.outcome, error: second.error, missingCoverage: second.missingCoverage }));
    assert.equal(first.capabilityCode, "sales.product_category_yoy");
    assert.equal(second.capabilityCode, "sales.product_category_yoy");
    assert.equal(first.executionPath, "composer");
    assert.equal(second.executionPath, "composer");
    assert.equal(generatorCalls, 0);
    assert.equal(templateCalls, 0);
    assert.equal((second.analysisPlan as any).contextInheritance.sourceTraceId, first.traceId);
    assert.match(second.sql, /category_rule_validation AS/);
    assert.match(second.sql, /平模头总类/);
    assert.match(second.sql, /DATEADD\(year, -1/);
    assert.match(second.sql, /AS \[分类合并规则\]/);
    assert.equal(second.template, undefined);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain carries dialogue context into a third-turn month refinement", async () => {
  const firstQuestion = "按产品类别区分，上个月销售额最高的是哪些，和去年同比数据怎么样";
  const restore = stubToolchain({
    intent: makeFinanceIntent(firstQuestion),
    plan: makeFinancePlan(firstQuestion),
    atomicMetrics: [makeProductCategoryOrderAmountMetric()],
  });

  try {
    const first = await runErpSqlToolchainWorkflow({ question: firstQuestion });
    const second = await runErpSqlToolchainWorkflow({
      question: "今年的平模头总销售额应该是平模头+高端平模头",
      context: first as unknown as Record<string, unknown>,
    });
    const protectedPlan = structuredClone(second.analysisPlan as any);
    protectedPlan.dimensionRules[0].target = { redacted: true, hash: "hash", length: 5 };
    const third = await runErpSqlToolchainWorkflow({
      question: "只算6月份的平模头总销售额，和去年同比",
      context: {
        ...second,
        analysisPlan: protectedPlan,
        conversationContext: {
          recentMessages: [
            { role: "user", content: firstQuestion },
            { role: "user", content: "今年的平模头总销售额应该是平模头+高端平模头" },
          ],
        },
      },
    });

    assert.equal(third.success, true);
    assert.deepEqual((third.analysisPlan as any).timeRange, { kind: "month", month: 6 });
    assert.equal((third.analysisPlan as any).dimensionRules[0].target, "平模头总类");
    assert.match(third.sql, /DATEFROMPARTS\(YEAR\(GETDATE\(\)\), 6, 1\)/);
    assert.match(third.sql, /DATEADD\(year, -1/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow rejects composite membership names without approved atomic definitions", async () => {
  let generatorCalls = 0;
  let validateOptions: any;
  const question = "6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: [],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate(_sql, options) {
      validateOptions = options;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions, undefined);
    assert.equal(result.sql, "");
    assert.equal(result.outcome, "unsupported");
    assert.match(result.error ?? "", /缺少 approved atomic metric|成员未批准或已禁用/u);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain rejects an approved composite when a declared atomic member is disabled", async () => {
  let referenceCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？";
  const memberCodes = ["order_amount", "gross_margin_rate", ...COST_COMPONENT_METRICS, "cost_component_amount"];
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: memberCodes.map((code) => code === "gross_margin_rate"
      ? { ...makeAtomicMetric(code), definitionJson: { ...(makeAtomicMetric(code).definitionJson as object), enabled: false } }
      : makeAtomicMetric(code)),
    onFindReference() { referenceCalls += 1; },
    onGenerate() { generatorCalls += 1; },
    onExecute() { executorCalls += 1; },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert(result.missingCoverage?.includes("gross_margin_rate"));
    assert.deepEqual([referenceCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain rejects cycles between declared composite atomic members", async () => {
  let referenceCalls = 0;
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？";
  const memberCodes = ["order_amount", "gross_margin_rate", ...COST_COMPONENT_METRICS, "cost_component_amount"];
  const metrics = memberCodes.map((code) => {
    const member = makeAtomicMetric(code);
    if (code === "order_amount") return { ...member, definitionJson: { ...(member.definitionJson as object), atomicMetrics: ["gross_margin_rate"] } };
    if (code === "gross_margin_rate") return { ...member, definitionJson: { ...(member.definitionJson as object), atomicMetrics: ["order_amount"] } };
    return member;
  });
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: metrics,
    onFindReference() { referenceCalls += 1; },
    onGenerate() { generatorCalls += 1; },
    onExecute() { executorCalls += 1; },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert(result.missingCoverage?.some((code) => code === "order_amount" || code === "gross_margin_rate"));
    assert.deepEqual([referenceCalls, generatorCalls, executorCalls], [0, 0, 0]);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not retrieve references for unsupported composite analysis", async () => {
  const referenceQuestions: string[] = [];
  let executorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [],
    references: [makeDatasetReference()],
    onFindReference(question) {
      referenceQuestions.push(question);
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "最近半年哪些客户持续下单，但毛利率逐月下降？",
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(executorCalls, 0);
    assert.deepEqual(referenceQuestions, []);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow rejects customer trend when approved composer is missing", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [],
    references: [makeDatasetReference()],
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "三环科技今年销售额和去年销售额相比增长还是下降？对应毛利率变化如何？",
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(result.financeScope, undefined);
    assert.equal((result.analysisPlan as any).scenario, "customer_product_yoy_trend");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow returns unsupported when required composite metrics are missing", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const question = "今年以来各事业部的销售额、毛利、成本占比、未交付金额分别是多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    financeGuard: true,
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: [],
    references: [
      makeDatasetReference(),
      { ...makeDatasetReference(), familyId: "family_059" },
      { ...makeDatasetReference(), familyId: "family_037" },
    ],
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, false);
    assert.equal(result.outcome, "unsupported");
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(result.financeScope, undefined);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow returns unsupported without template or generic fallback when a composite metric is missing", async () => {
  let generatorCalls = 0;
  let referenceCalls = 0;
  const question = "今年以来各事业部的销售额、毛利、成本占比、未交付金额分别是多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    compositeMetrics: [],
    atomicMetrics: [makeAtomicMetric("order_amount")],
    onGenerate() { generatorCalls += 1; },
    onFindReference() { referenceCalls += 1; },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert.equal(generatorCalls, 0);
    assert.equal(referenceCalls, 0);
    assert.deepEqual(result.missingCoverage?.sort(), ["burden_cost_amount", "cost_component_amount", "gross_margin_amount", "labor_cost_amount", "material_cost_amount", "open_shipping_amount", "open_shipping_qty", "subcontract_cost_amount"].sort());
  } finally {
    restore();
  }
});

test("ERP SQL toolchain fails before every SQL lookup when an optional composite metric is uncovered", async () => {
  let templateCalls = 0;
  let referenceCalls = 0;
  let generatorCalls = 0;
  const question = "按客户看订单金额和毛利率";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    analysisPlan: {
      mode: "strict", grain: ["customer"], metrics: ["order_amount", "gross_margin_rate"],
      requiredMetrics: ["order_amount"], filters: [], dimensions: ["customer"], orderBy: [],
    },
    atomicMetrics: [makeAtomicMetric("order_amount")],
    onFindTemplate() { templateCalls += 1; },
    onFindReference() { referenceCalls += 1; },
    onGenerate() { generatorCalls += 1; },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question });
    assert.equal(result.outcome, "unsupported");
    assert.equal(result.sql, "");
    assert.deepEqual(result.missingCoverage, ["gross_margin_rate"]);
    assert.deepEqual([templateCalls, referenceCalls, generatorCalls], [0, 0, 0]);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow keeps success when narrator fails", async () => {
  const restore = stubToolchain({ narratorThrows: true });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询采购订单" });

    assert.equal(result.success, true);
    assert.equal(result.analysis, null);
    assert.equal(result.message, "已生成并执行 SQL，返回 1 行。");
  } finally {
    restore();
  }
});

test("default runtime registers parallel Mastra ERP SQL handler", () => {
  assert.equal((agentRuntimeService as any).handlers.has("mastraErpSqlAgent"), true);
});

test("Mastra ERP SQL runtime handler returns fine-grained tool trace", async () => {
  const restore = stubToolchain({ narratorThrows: true });

  try {
    const toolTrace: string[] = [];
    const result = await agentRuntimeMastraErpSqlHandler.executePlan({
      runId: "1",
      sessionId: "2",
      ownerUserId: "tester",
      authorizationContext: TEST_SCOPE,
      options: { message: "查询采购订单", confirmed: true },
      plan: await agentRuntimeMastraErpSqlHandler.createPlan({ message: "查询采购订单" }),
      async onToolStart({ step }) {
        toolTrace.push(`start:${step.tool}`);
      },
      async onToolFinish({ step }) {
        toolTrace.push(`finish:${step.tool}`);
      },
    });

    assert.equal(result.assistantMessage?.content, "已生成并执行 SQL，返回 1 行。");
    assert.equal((result.assistantMessage?.contentJsonb as any).rowCount, 1);
    assert.deepEqual(result.assistantMessage?.displayJsonb, {
      fields: ["Company"],
      columns: [{
        key: "company",
        label: "公司",
        dataType: "text",
        format: {},
        role: "dimension",
        inlineVisible: true,
      }],
      rows: [["jctimes"]],
      rowCount: 1,
      truncated: false,
    });
    assert.deepEqual(toolTrace, [
      "start:extractSqlIntent",
      "finish:extractSqlIntent",
      "start:planSqlQuery",
      "finish:planSqlQuery",
      "start:analyzeSqlQuestion",
      "finish:analyzeSqlQuestion",
      "start:findSqlTemplate",
      "finish:findSqlTemplate",
      "start:findSqlReference",
      "finish:findSqlReference",
      "start:generateSql",
      "finish:generateSql",
      "start:validateSql",
      "finish:validateSql",
      "start:validateSqlRuntime",
      "finish:validateSqlRuntime",
      "start:executeSql",
      "finish:executeSql",
      "start:narrateSqlResult",
      "finish:narrateSqlResult",
    ]);
  } finally {
    restore();
  }
});

function stubToolchain(options: {
  template?: boolean;
  invalidTemplateSemantic?: boolean;
  invalidGuard?: boolean;
  missingSchemaGuard?: boolean;
  financeGuard?: boolean;
  narrate?: boolean;
  narratorThrows?: boolean;
  intent?: ReturnType<typeof makeIntent>;
  plan?: ReturnType<typeof makePlan>;
  references?: any[];
  compositeMetrics?: any[];
  atomicMetrics?: any[];
  analysisPlan?: any;
  onGenerate?: () => void;
  onExecute?: (generation: any) => void;
  onFindTemplate?: () => void;
  onValidate?: (sql: string, options: unknown) => void;
  onFindReference?: (question: string) => void;
  execution?: Partial<ReturnType<typeof makeExecution>> & { fields: string[]; rows: unknown[][] };
  executionFactory?: (generation: any) => { fields: string[]; rows: unknown[][] };
  onNarrate?: (input: any) => void;
  realCapabilityDecision?: boolean;
} = {}) {
  const originals = {
    executeGeneratedSql: process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL,
    extract: deepSeekIntentExtractor.extract,
    plan: sqlPlannerService.plan,
    analysisPlan: analysisPlannerService.plan,
    findExecutableCandidates: sqlTemplateRepository.findExecutableCandidates,
    findApprovedMetricCandidates: sqlTemplateRepository.findApprovedMetricCandidates,
    findApprovedAtomicMetricCandidates: sqlTemplateRepository.findApprovedAtomicMetricCandidates,
    findDatasetReferenceCandidates: sqlTemplateRepository.findDatasetReferenceCandidates,
    findReferenceCandidates: sqlTemplateRepository.findReferenceCandidates,
    templateExecute: sqlTemplateExecutionService.execute,
    generate: sqlGeneratorService.generate,
    validate: sqlGuardService.validate,
    execute: sqlExecutorService.execute,
    narrate: resultNarratorService.narrate,
    resolveCapability: capabilityDecisionService.resolveAndDecide,
  };
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "true";
  let currentPlan = options.plan;

  if (!options.realCapabilityDecision) {
    (capabilityDecisionService as any).resolveAndDecide = () => ({
      outcome: "execute", capability: "test.published", missingCoverage: [],
    });
  }

  (deepSeekIntentExtractor as any).extract = async () => options.intent ?? makeIntent();
  (sqlPlannerService as any).plan = async (question: string) => {
    currentPlan = options.plan ?? { ...makePlan(), question };
    return currentPlan;
  };
  if (options.analysisPlan) {
    (analysisPlannerService as any).plan = async () => ({ analysisPlan: options.analysisPlan, clarificationQuestions: [], warnings: [] });
  }
  (sqlTemplateRepository as any).findExecutableCandidates = async () => {
    options.onFindTemplate?.();
    return options.template ? [makeTemplateCandidate()] : [];
  };
  (sqlTemplateRepository as any).findApprovedMetricCandidates = async () => options.compositeMetrics ?? [];
  (sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = async () => options.atomicMetrics ?? [];
  (sqlTemplateRepository as any).findDatasetReferenceCandidates = async (input: { question: string }) => {
    options.onFindReference?.(input.question);
    return options.references ?? [];
  };
  (sqlTemplateRepository as any).findReferenceCandidates = async () => [];
  (sqlTemplateExecutionService as any).execute = async () => options.invalidTemplateSemantic ? ({
    executed: false,
    valid: false,
    sql: "",
    candidateSql: "SELECT TOP 100 Company FROM Erp.Part",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error: "semantic_mismatch: expected family_100/family_059 got family_027",
    guardResult: {
      valid: false,
      errors: ["semantic_mismatch: expected family_100/family_059 got family_027"],
      warnings: [],
      referencedTables: ["Erp.Part"],
      referencedFields: ["Company"],
    },
    semanticResult: {
      valid: false,
      status: "semantic_mismatch",
      errors: ["semantic_mismatch: expected family_100/family_059 got family_027"],
      expectedFamilyGroups: [["family_100"], ["family_059"]],
      expectedFamilyIds: ["family_100", "family_059"],
      actualFamilyIds: ["family_027"],
      expectedMetricCodes: ["order_amount", "gross_margin_rate", "cost_component_amount"],
      actualMetricCodes: [],
    },
  }) : ({
    executed: true,
    valid: true,
    sql: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
    fields: ["Company", "PartNum"],
    rows: [["jctimes", "A123"]],
    rowCount: 1,
    truncated: false,
    warnings: [],
  });
  (sqlGeneratorService as any).generate = async () => {
    options.onGenerate?.();
    return makeGenerationForPlan(currentPlan);
  };
  (sqlGuardService as any).validate = async (sql: string, guardOptions: any) => {
    options.onValidate?.(sql, guardOptions);
    const hasApprovedFinanceReference = (guardOptions?.references ?? []).some((reference: any) =>
      reference.sourceType === "metric" || reference.sourceType === "template"
    );
    if (options.missingSchemaGuard) {
      return {
        valid: false,
        errors: ["Referenced field does not exist in schema metadata: MissingField on Erp.OrderHed."],
        warnings: [],
        normalizedSql: "SELECT TOP 100 Company, MissingField FROM Erp.OrderHed",
        referencedTables: ["Erp.OrderHed"],
        referencedFields: ["Company", "MissingField"],
      };
    }
    if (options.invalidGuard || (options.financeGuard && guardOptions?.module === "finance" && guardOptions.financeMode !== "estimate" && !hasApprovedFinanceReference)) {
      return {
        valid: false,
        errors: [options.invalidGuard ? "blocked" : "Finance SQL must use an approved business metric or approved SQL template."],
        warnings: [],
        normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
        referencedTables: ["Erp.POHeader"],
        referencedFields: ["Company"],
      };
    }
    return makeGuardResult();
  };
  (sqlExecutorService as any).execute = async (generation: any) => {
    options.onExecute?.(generation);
    const execution = makeExecution(generation);
    const dynamicExecution = options.executionFactory?.(generation);
    if (dynamicExecution) return { ...execution, ...dynamicExecution, rowCount: dynamicExecution.rows.length };
    return options.execution
      ? { ...execution, ...options.execution, rowCount: options.execution.rows.length }
      : execution;
  };
  (resultNarratorService as any).narrate = async (input: any) => {
    options.onNarrate?.(input);
    if (options.narratorThrows) throw new Error("narrator down");
    if (!options.narrate) return { summary: "", highlights: [], caveats: [] };
    return {
      summary: "查询到 1 行。",
      highlights: ["公司为 jctimes"],
      caveats: ["仅基于返回样本说明"],
    };
  };

  return () => {
    if (originals.executeGeneratedSql === undefined) {
      delete process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
    } else {
      process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = originals.executeGeneratedSql;
    }
    (deepSeekIntentExtractor as any).extract = originals.extract;
    (sqlPlannerService as any).plan = originals.plan;
    (analysisPlannerService as any).plan = originals.analysisPlan;
    (sqlTemplateRepository as any).findExecutableCandidates = originals.findExecutableCandidates;
    (sqlTemplateRepository as any).findApprovedMetricCandidates = originals.findApprovedMetricCandidates;
    (sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = originals.findApprovedAtomicMetricCandidates;
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = originals.findDatasetReferenceCandidates;
    (sqlTemplateRepository as any).findReferenceCandidates = originals.findReferenceCandidates;
    (sqlTemplateExecutionService as any).execute = originals.templateExecute;
    (sqlGeneratorService as any).generate = originals.generate;
    (sqlGuardService as any).validate = originals.validate;
    (sqlExecutorService as any).execute = originals.execute;
    (resultNarratorService as any).narrate = originals.narrate;
    (capabilityDecisionService as any).resolveAndDecide = originals.resolveCapability;
  };
}

function makeIntent() {
  return {
    originalQuestion: "查询采购订单",
    normalizedQuestion: "查询采购订单",
    module: "purchase",
    intentType: "detail",
    entities: { partNum: "A123" },
    confidence: 0.9,
    warnings: [],
  };
}

function makeCapability(code: string, modules: string[]) {
  return {
    code,
    status: "executable" as const,
    modules,
    metrics: [],
    dimensions: [],
    filterSlots: [],
    timeSemantics: [],
    comparisonKinds: [],
    templateFamilies: [],
  };
}

function makeFinanceIntent(question: string) {
  return {
    ...makeIntent(),
    originalQuestion: question,
    normalizedQuestion: question,
    module: "finance",
    intentType: "summary",
    entities: {},
  };
}

function makeSalesIntent(question: string) {
  return {
    ...makeIntent(),
    originalQuestion: question,
    normalizedQuestion: question,
    module: "sales",
    intentType: "summary",
    entities: {},
  };
}

function makePlan() {
  return {
    question: "查询采购订单",
    intent: "list",
    scenario: "purchaseDetail",
    modules: [{ module: "purchase", label: "采购", score: 100, reasons: ["test capability context"], rule: {} }],
    schema: {
      result: { query: "查询采购订单", keywords: [], tables: [], fields: [], score: 0 },
      selectedTables: [],
      selectedFields: [],
    },
    knowledge: {
      modules: [],
      joins: [],
      dateRules: { globalSafetyRange: { from: "20000101", to: "future_one_year" }, moduleDateFields: [] },
      statusRules: [],
      qualityRules: { rules: [] },
      companyRules: { mustOutputCompany: true },
      promptRules: { defaultLimit: 100 },
    },
    constraints: {
      schemaName: "Erp",
      requireCompany: true,
      defaultLimit: 100,
      requiresDateSafetyRange: false,
      recommendedStatusFilters: [],
    },
    warnings: [],
    missingRequiredFields: [],
    confidence: 0.8,
  } as any;
}

function makeFinancePlan(question: string) {
  return {
    ...makePlan(),
    question,
    intent: "aggregate",
    modules: [{ module: "finance", label: "财务", score: 100, reasons: ["test capability context"], rule: {} }],
  } as any;
}

function makeSalesPlan(question: string) {
  return {
    ...makePlan(),
    question,
    intent: "aggregate",
    modules: [{ module: "sales", label: "销售", score: 100, reasons: ["test capability context"], rule: {} }],
  } as any;
}

function makeGuardResult() {
  return {
    valid: true,
    errors: [],
    warnings: [],
    normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
    referencedTables: ["Erp.POHeader"],
    referencedFields: ["Company"],
  };
}

function makeGeneration() {
  return {
    valid: true,
    source: "llm",
    scenario: "llmFallback",
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    intent: "list",
    tables: ["Erp.POHeader"],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: makeGuardResult(),
  };
}

function makeGenerationForPlan(plan: ReturnType<typeof makePlan> | undefined) {
  const generation = makeGeneration();
  const moduleName = plan?.modules?.[0]?.module;
  if (/采购.*毛利|毛利.*采购/u.test(plan?.question ?? "")) {
    generation.sql = "SELECT TOP 100 poh.Company FROM Erp.POHeader poh JOIN Erp.OrderHed oh ON oh.Company = poh.Company";
    generation.tables = ["Erp.POHeader", "Erp.OrderHed"];
    generation.guardResult = {
      ...generation.guardResult,
      normalizedSql: generation.sql,
      referencedTables: ["Erp.POHeader", "Erp.OrderHed"],
      referencedFields: ["poh.Company", "oh.Company"],
    };
    return generation;
  }
  if (/未交付金额|成本占比/u.test(plan?.question ?? "")) {
    generation.sql = "SELECT TOP 100 oh.Company FROM Erp.OrderHed oh JOIN Erp.OrderRel rel ON rel.Company = oh.Company JOIN Erp.PartTran pt ON pt.Company = oh.Company";
    generation.tables = ["Erp.OrderHed", "Erp.OrderRel", "Erp.PartTran"];
    generation.guardResult = {
      ...generation.guardResult,
      normalizedSql: generation.sql,
      referencedTables: ["Erp.OrderHed", "Erp.OrderRel", "Erp.PartTran"],
      referencedFields: ["oh.Company", "rel.Company", "pt.Company"],
    };
    return generation;
  }
  if (moduleName === "finance" || moduleName === "sales" || /毛利|销售额|收入/u.test(plan?.question ?? "")) {
    generation.sql = "SELECT TOP 100 Company FROM Erp.OrderHed";
    generation.tables = ["Erp.OrderHed"];
    generation.guardResult = {
      ...generation.guardResult,
      normalizedSql: generation.sql,
      referencedTables: ["Erp.OrderHed"],
      referencedFields: ["Company"],
    };
  }
  if (moduleName === "inventory") {
    generation.sql = "SELECT TOP 100 Company FROM Erp.PartWhse";
    generation.tables = ["Erp.PartWhse"];
    generation.guardResult = {
      ...generation.guardResult,
      normalizedSql: generation.sql,
      referencedTables: ["Erp.PartWhse"],
      referencedFields: ["Company"],
    };
  }
  return generation;
}

function makeDatasetReference() {
  return {
    familyId: "family_100",
    businessDescription: "客户订单毛利参考",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    exampleSql: "SELECT TOP 100 Company FROM Erp.InvcHead",
    datasetId: "100",
    reportName: "毛利参考报表",
    datasetName: "ds1",
    fields: ["Company", "DocInvoiceAmt"],
    metrics: ["毛利"],
    questionText: "产品毛利大概多少",
    timeScope: "InvoiceDate",
    businessScenario: "毛利估算",
    isFinance: true,
    verified: true,
    sqlPreview: "SELECT TOP 100 Company FROM Erp.InvcHead",
    sourceType: "dataset",
    score: 0.8,
    matchedReasons: ["毛利"],
    matchedSignals: ["毛利"],
  };
}

function makeAtomicMetric(metricCode: string) {
  const expressionByCode: Record<string, string> = {
    order_amount: "OrderHed.DocOrderAmt",
    gross_margin_rate: "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)",
    cost_component_amount: "OrderHed.DocOrderAmt * 0.8",
    material_cost_amount: "OrderHed.DocOrderAmt * 0.5",
    labor_cost_amount: "OrderHed.DocOrderAmt * 0.1",
    burden_cost_amount: "OrderHed.DocOrderAmt * 0.1",
    subcontract_cost_amount: "OrderHed.DocOrderAmt * 0.1",
    collection_delay_days: "DATEDIFF(day, InvcHead.DueDate, CAST(GETDATE() AS date))",
    collection_overdue_amount: "InvcHead.DocInvoiceBal",
    shipped_amount: "OrderDtl.DocExtPriceDtl * (COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) / NULLIF(OrderDtl.OrderQty, 0)",
    open_job_margin_cost_risk: "DISTINCT JobHead.JobNum",
    purchase_amount: "PODetail.DocExtCost",
  };
  const isCollection = metricCode.startsWith("collection_");
  const isShipped = metricCode === "shipped_amount";
  const isOpenJob = metricCode === "open_job_margin_cost_risk";
  const isPurchase = metricCode === "purchase_amount";
  const tableAlias = isCollection ? "InvcHead" : isShipped ? "ShipDtl" : isOpenJob ? "JobHead" : isPurchase ? "POHeader" : "OrderHed";
  const dimensions = isCollection
    ? ["customer", "order"]
    : isPurchase
      ? ["product", "order", "supplier"]
    : isShipped || isOpenJob
      ? ["customer", "order", "product"]
      : ["customer", "order", "product"];
  const dimensionExpressions = isCollection
    ? { customer: "COALESCE(Customer.Name, Customer.CustID)", order: "InvcHead.OrderNum" }
    : isPurchase
      ? { product: "PODetail.PartNum", order: "POHeader.PONum", supplier: "POHeader.VendorNum" }
    : isShipped
      ? { customer: "COALESCE(Customer.Name, Customer.CustID)", order: "ShipDtl.OrderNum", product: "ShipDtl.PartNum" }
      : isOpenJob
        ? { customer: "COALESCE(Customer.Name, Customer.CustID)", order: "JobProd.OrderNum", product: "OrderDtl.PartNum" }
        : { customer: "COALESCE(Customer.Name, Customer.CustID)", order: "OrderHed.OrderNum", product: "OrderDtl.PartNum" };
  const joinSql = isShipped
    ? [
        "JOIN Erp.ShipHead ShipHead ON ShipHead.Company = ShipDtl.Company AND ShipHead.PackNum = ShipDtl.PackNum",
        "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = ShipDtl.Company AND OrderDtl.OrderNum = ShipDtl.OrderNum AND OrderDtl.OrderLine = ShipDtl.OrderLine",
        "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
        "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
      ]
    : isOpenJob
      ? [
          "JOIN Erp.JobProd JobProd ON JobProd.Company = JobHead.Company AND JobProd.JobNum = JobHead.JobNum",
          "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
          "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
          "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
        ]
      : isCollection
        ? ["LEFT JOIN Erp.Customer Customer ON Customer.Company = InvcHead.Company AND Customer.CustNum = InvcHead.CustNum"]
        : isPurchase
          ? undefined
          : ["LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"];
  const purchaseJoinSql = isPurchase
    ? ["JOIN Erp.PODetail PODetail ON PODetail.Company = POHeader.Company AND PODetail.PONUM = POHeader.PONum"]
    : undefined;
  const statusFilters = isCollection
    ? ["InvcHead.Posted = 1", "InvcHead.OpenInvoice = 1", "InvcHead.DocInvoiceBal > 0", "InvcHead.DueDate < CAST(GETDATE() AS date)"]
    : isShipped
      ? ["ShipDtl.OrderNum <> 0", "(COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) <> 0"]
      : isOpenJob
        ? ["JobHead.JobClosed = 0", "JobHead.JobComplete = 0", "JobProd.OrderNum <> 0"]
        : isPurchase
          ? ["POHeader.OpenOrder = 1"]
        : ["OrderHed.OpenOrder = 1"];
  return {
    familyId: `atomic_${metricCode}`,
    metricCode,
    metricName: metricCode,
    businessDescription: metricCode,
    calculationSummary: metricCode,
    coreTables: ["Erp.OrderHed"],
    joins: [],
    params: [],
    definitionJson: {
      kind: "atomic_metric",
      metricCode,
      grain: isCollection ? "invoice" : isShipped ? "shipment" : isOpenJob ? "open_job" : isPurchase ? "purchase_order" : "product",
      dimensions,
      dimensionExpressions,
      keyExpressions: { Company: `${tableAlias}.Company` },
      timeField: isCollection ? "InvcHead.DueDate" : isShipped ? "ShipHead.ShipDate" : isOpenJob ? "JobHead.CreateDate" : "OrderHed.OrderDate",
      amountExpression: expressionByCode[metricCode] ?? "OrderHed.DocOrderAmt",
      ...(isShipped ? { enabled: false } : {
        statusField: isCollection ? "InvcHead.Posted" : isOpenJob ? "JobHead.JobClosed" : isPurchase ? "POHeader.OpenOrder" : "OrderHed.OpenOrder",
      }),
      aggregation: metricCode === "gross_margin_rate" ? "AVG" : metricCode === "collection_delay_days" ? "MAX" : isOpenJob ? "COUNT" : "SUM",
      statusFilters,
      requiredTables: [isCollection ? "Erp.InvcHead" : isShipped ? "Erp.ShipDtl" : isOpenJob ? "Erp.JobHead" : isPurchase ? "Erp.POHeader" : "Erp.OrderHed"],
      ...(joinSql || purchaseJoinSql ? { joinSql: joinSql ?? purchaseJoinSql } : {}),
      joinKeys: ["Company"],
      taxRefundPolicy: "测试口径",
    },
    score: 1,
    matchedSignals: [`metric:${metricCode}`],
  };
}

function makeComplexAtomicMetric(metricCode: "order_amount" | "inventory_on_hand_qty" | "open_shipping_qty" | "open_shipping_amount") {
  const base = makeAtomicMetric(metricCode);
  if (metricCode === "order_amount") return {
    ...base,
    familyId: "family_100",
    coreTables: ["Erp.OrderHed", "Erp.OrderDtl"],
    definitionJson: {
      kind: "atomic_metric", metricCode, grain: "product", dimensions: ["product"],
      dimensionExpressions: { product: "OrderDtl.PartNum" }, keyExpressions: { Company: "OrderHed.Company" },
      timeField: "OrderHed.OrderDate", amountExpression: "OrderDtl.DocExtPriceDtl", aggregation: "SUM",
      statusFilters: ["OrderHed.OpenOrder = 1"], requiredTables: ["Erp.OrderHed"],
      joinSql: ["JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderHed.Company AND OrderDtl.OrderNum = OrderHed.OrderNum"],
      joinKeys: ["Company"], taxRefundPolicy: "测试口径",
    },
  };
  if (metricCode === "inventory_on_hand_qty") return {
    ...base,
    familyId: "family_027",
    coreTables: ["Erp.PartWhse"],
    definitionJson: {
      kind: "atomic_metric", metricCode, grain: "product", dimensions: ["product"],
      dimensionExpressions: { product: "PartWhse.PartNum" }, keyExpressions: { Company: "PartWhse.Company" },
      amountExpression: "PartWhse.OnHandQty", aggregation: "SUM", statusFilters: [],
      requiredTables: ["Erp.PartWhse"], joinKeys: ["Company"], taxRefundPolicy: "测试口径",
    },
  };
  return {
    ...base,
    familyId: "family_037",
    coreTables: ["Erp.OrderRel", "Erp.OrderDtl"],
    definitionJson: {
      kind: "atomic_metric", metricCode, grain: "product", dimensions: ["product"],
      dimensionExpressions: { product: "OrderDtl.PartNum" }, keyExpressions: { Company: "OrderRel.Company" },
      timeField: "OrderRel.ReqDate",
      amountExpression: metricCode === "open_shipping_qty" ? "OrderRel.OurReqQty" : "OrderRel.OurReqQty * OrderDtl.UnitPrice",
      aggregation: "SUM", statusFilters: ["OrderRel.OpenRelease = 1"], requiredTables: ["Erp.OrderRel"],
      joinSql: ["JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderRel.Company AND OrderDtl.OrderNum = OrderRel.OrderNum AND OrderDtl.OrderLine = OrderRel.OrderLine"],
      joinKeys: ["Company"], taxRefundPolicy: "测试口径",
    },
  };
}

function makeProductCategoryOrderAmountMetric() {
  const metric = makeAtomicMetric("order_amount");
  return {
    ...metric,
    coreTables: ["Erp.OrderDtl", "Erp.OrderHed", "Erp.ProdGrup"],
    definitionJson: {
      ...(metric.definitionJson as Record<string, unknown>),
      grain: "order_line",
      dimensions: ["product_category"],
      dimensionExpressions: { product_category: "ProdGrup.Description" },
      keyExpressions: { Company: "OrderDtl.Company" },
      timeField: "OrderHed.OrderDate",
      amountExpression: "OrderDtl.DocExtPriceDtl",
      requiredTables: ["Erp.OrderDtl"],
      joinSql: ["JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum"],
      dimensionJoinSql: {
        product_category: ["LEFT JOIN Erp.ProdGrup ProdGrup ON ProdGrup.Company = OrderDtl.Company AND ProdGrup.ProdCode = OrderDtl.ProdCode"],
      },
    },
  };
}

function makeCompositeMetric() {
  return {
    familyId: "product_margin_cost_ratio",
    metricCode: "product_margin_cost_ratio_top5",
    metricName: "产品Top5毛利和成本占比",
    businessDescription: "按当前年份6月入库产品统计未税销售额Top5，返回毛利率、最大成本项和客户。",
    calculationSummary: "Top5 by PartNum sales amount, with margin and cost component.",
    coreTables: ["Erp.PartTran", "Erp.OrderDtl", "Erp.Customer"],
    joins: ["PartTran -> OrderDtl -> Customer"],
    params: ["month=6", "year=current"],
    definitionJson: {
      timeField: "Erp.PartTran.TranDate",
      statusFilters: ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')"],
      atomicMetrics: ["order_amount", "gross_margin_rate", "material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount", "cost_component_amount"],
    },
    exampleSql: [
      "SELECT TOP 5",
      "  PartTran.Company,",
      "  PartTran.PartNum AS [产品编号],",
      "  Customer.Name AS [客户],",
      "  0.35 AS [毛利率],",
      "  N'物料费' AS [成本占比最大项],",
      "  N'PartTran.TranDate，默认当前年份6月' AS [时间字段],",
      "  N'未税销售额' AS [金额字段],",
      "  N'MFG-STK/MFG-CUS' AS [状态过滤],",
      "  N'未税口径' AS [税退款口径]",
      "FROM Erp.PartTran",
      "JOIN Erp.OrderDtl ON 1 = 1",
      "JOIN Erp.Customer ON 1 = 1",
      "ORDER BY [产品编号]",
    ].join("\n"),
    score: 1,
    matchedSignals: ["metric:product_margin_cost_ratio_top5"],
  };
}

function makeExecution(generation: unknown) {
  return {
    valid: true,
    executed: true,
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    fields: ["Company"],
    rows: [["jctimes"]],
    rowCount: 1,
    truncated: false,
    warnings: [],
    generation,
  };
}

function makeSalesTemplateCandidate(familyId: string, intent: string, module: string, score: number) {
  return {
    ...makeTemplateCandidate(),
    id: familyId === "family_016" ? 16n : 37n,
    name: familyId === "family_016" ? "销售订单明细查询" : "发货通知明细查询",
    intent,
    module,
    sourceFamilyId: familyId,
    sqlTemplate: `SELECT TOP 100 Company FROM ${familyId === "family_016" ? "Erp.OrderHed" : "Erp.OrderRel"}`,
    requiredParams: {},
    optionalParams: {
      orderNum: { type: "number" },
      customerName: { type: "string" },
      onlyOpenRelease: { type: "boolean" },
      onlyShippingNotice: { type: "boolean" },
    },
    tables: [familyId === "family_016" ? "Erp.OrderHed" : "Erp.OrderRel"],
    fields: ["Company"],
    score,
    matchedSignals: [familyId],
  };
}

function bindable(candidate: ReturnType<typeof makeSalesTemplateCandidate>, slots: Record<string, unknown>) {
  return Object.keys(candidate.requiredParams).every((name) => slots[name] !== undefined && slots[name] !== null && slots[name] !== "");
}

function makeTemplateCandidate() {
  return {
    id: BigInt(9),
    name: "物料查询",
    intent: "detail",
    module: "inventory",
    questionPattern: null,
    normalizedQuestion: null,
    queryPlanJson: {},
    sqlTemplate: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
    requiredParams: { partNum: { type: "string" } },
    optionalParams: {},
    tables: ["Erp.Part"],
    fields: ["Company", "PartNum"],
    joins: [],
    sourceType: "test",
    sourceDatasetId: null,
    sourceReportName: null,
    sourceSqlHash: null,
    guardPassed: true,
    guardJson: {},
    approved: true,
    approvalStatus: "approved",
    approvedBy: null,
    approvedAt: null,
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    score: 0.9,
    matchedSignals: ["partNum"],
  };
}
