import assert from "node:assert/strict";
import test from "node:test";
import { agentRuntimeService } from "../../src/ai/agentRuntime/defaultRuntime.js";
import { agentRuntimeMastraErpSqlHandler } from "../../src/modules/erpSqlAgent/agent/mastraRuntimeHandler.js";
import { erpSqlAgentService } from "../../src/modules/erpSqlAgent/agent/index.js";
import { resultNarratorService } from "../../src/modules/erpSqlAgent/agent/service/ResultNarratorService.js";
import { sqlExecutorService } from "../../src/modules/erpSqlAgent/executor/index.js";
import { sqlGeneratorService } from "../../src/modules/erpSqlAgent/generator/index.js";
import { deepSeekIntentExtractor } from "../../src/modules/erpSqlAgent/intent/index.js";
import { sqlPlannerService } from "../../src/modules/erpSqlAgent/planner/index.js";
import { sqlGuardService } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateRepository } from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import { sqlTemplateExecutionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import { runErpSqlAskTool } from "../../src/ai/mastra/tools/erpSqlAsk.tool.js";
import {
  runFindSqlTemplateTool,
  runAnalyzeSqlQuestionTool,
  runExtractSqlIntentTool,
  runPlanSqlQueryTool,
  runValidateSqlRuntimeTool,
  slotsFromIntent,
} from "../../src/ai/mastra/tools/erpSql/toolchain.tools.js";
import { runErpSqlToolchainWorkflow as runErpSqlToolchainWorkflowWithAccess } from "../../src/ai/mastra/workflows/erpSqlToolchain.workflow.js";
import type { ErpSqlAccessScope } from "../../src/modules/erpSqlAgent/access/index.js";

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
    assert.equal((result as any).outcome, "unsupported");
    assert.equal((result as any).capabilityCode, "quotation.contract_config");
    assert.equal(result.sql, "");
    assert.equal(templateCalls, 0);
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
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

test("ERP SQL toolchain workflow returns estimate for missing collection atomic metrics", async () => {
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

    assert.equal(result.success, true);
    assert.equal(result.financeScope?.mode, "estimate");
    assert.match(result.message, /仅供参考/);
    assert.equal(generatorCalls, 1);
    assert.equal(executorCalls, 1);
    assert(result.warnings.some((warning) => warning.startsWith("low_confidence_metric_sql:")));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved shipped amount before generator", async () => {
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

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.match(result.sql, /FROM \(SELECT \* FROM Erp\.ShipDtl WHERE Company IN \(N'EPIC03'\)\) AS ShipDtl/);
    assert.match(result.sql, /ShipHead\.ShipDate/);
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

test("ERP SQL toolchain workflow keeps sales inventory backlog golden out of finance guard", async () => {
  let validateOptions: any;
  const question = "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？";
  const restore = stubToolchain({
    intent: makeFinanceIntent(question),
    plan: makeFinancePlan(question),
    atomicMetrics: [
      makeAtomicMetric("order_amount"),
      makeAtomicMetric("inventory_on_hand_qty"),
      makeAtomicMetric("open_shipping_qty"),
      makeAtomicMetric("open_shipping_amount"),
    ],
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
    assert.equal((result.analysisPlan as any).scenario, "product_sales_inventory_backlog_trend");
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
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 1);
    assert.equal(validateOptions.financeMode, "estimate");
    assert.equal((result.analysisPlan as any).scenario, "purchase_cost_margin_impact");
    assert.equal(result.financeScope?.mode, "estimate");
    assert.equal(result.financeScope?.references[0]?.sourceType, "dataset");
    assert(result.warnings.some((warning) => warning.includes("finance_review_needed: approve PO-to-sales-order bridge")));
    assert.match(result.message, /估算\/决策参考口径|不可用于财务报表/);
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
    assert.match(result.error ?? "", /Referenced field does not exist in schema metadata/);
    assert.equal(referenceCalls, 1);
    assert.equal(generatorCalls, 1);
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved collection metrics without LLM generator", async () => {
  let generatorCalls = 0;
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
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.match(result.sql, /InvcHead\.DueDate < CAST\(GETDATE\(\) AS date\)/);
    assert.match(result.sql, /SUM\(InvcHead\.DocInvoiceBal\)/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved atomic metrics without LLM generator", async () => {
  let generatorCalls = 0;
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
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.equal(((result.analysisPlan as any).metrics as string[]).includes("gross_margin_rate"), true);
    assert.match(result.sql, /WITH order_amount AS/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain carries a product-category comparison plan into a follow-up merge rule", async () => {
  let generatorCalls = 0;
  const firstQuestion = "按产品类别区分，上个月销售额最高的是哪些，和去年同比数据怎么样";
  const restore = stubToolchain({
    intent: makeFinanceIntent(firstQuestion),
    plan: makeFinancePlan(firstQuestion),
    atomicMetrics: [makeProductCategoryOrderAmountMetric()],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const first = await runErpSqlToolchainWorkflow({ question: firstQuestion });
    const second = await runErpSqlToolchainWorkflow({
      question: "今年的平模头总销售额应该是平模头+高端平模头",
      context: first as unknown as Record<string, unknown>,
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(generatorCalls, 0);
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

test("ERP SQL toolchain workflow uses approved composite metric before atomic composer", async () => {
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
    assert.match(result.error ?? "", /data source scope policy is missing|scope/i);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow uses analysis retrieval hints", async () => {
  const referenceQuestions: string[] = [];
  const restore = stubToolchain({
    atomicMetrics: [],
    references: [makeDatasetReference()],
    onFindReference(question) {
      referenceQuestions.push(question);
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "最近半年哪些客户持续下单，但毛利率逐月下降？",
    });

    assert.equal(result.success, true);
    assert(referenceQuestions.some((question) => question.includes("检索提示")));
    assert(referenceQuestions.some((question) => question.includes("客户")));
    assert.match(result.message, /默认口径|产品类型 v1|下降默认按环比趋势判断/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow estimates customer trend when approved composer is missing", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [],
    references: [makeDatasetReference()],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "三环科技今年销售额和去年销售额相比增长还是下降？对应毛利率变化如何？",
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 1);
    assert.equal(result.financeScope?.mode, "estimate");
    assert.match(result.message, /仅供参考/);
    assert.equal((result.analysisPlan as any).scenario, "customer_product_yoy_trend");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow returns estimate when required metrics are missing", async () => {
  let generatorCalls = 0;
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
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question,
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 1);
    assert.equal(result.financeScope?.mode, "estimate");
    assert.match(result.message, /仅供参考/);
    assert(result.warnings.some((warning) => warning.startsWith("low_confidence_metric_sql:")));
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
  onGenerate?: () => void;
  onExecute?: () => void;
  onFindTemplate?: () => void;
  onValidate?: (sql: string, options: unknown) => void;
  onFindReference?: (question: string) => void;
} = {}) {
  const originals = {
    executeGeneratedSql: process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL,
    extract: deepSeekIntentExtractor.extract,
    plan: sqlPlannerService.plan,
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
  };
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "true";
  let currentPlan = options.plan;

  (deepSeekIntentExtractor as any).extract = async () => options.intent ?? makeIntent();
  (sqlPlannerService as any).plan = async (question: string) => {
    currentPlan = options.plan ?? { ...makePlan(), question };
    return currentPlan;
  };
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
  (sqlExecutorService as any).execute = async (generation: unknown) => {
    options.onExecute?.();
    return makeExecution(generation);
  };
  (resultNarratorService as any).narrate = async () => {
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
    modules: [],
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
    modules: [{ module: "finance", label: "财务", score: 100, reasons: ["test"], rule: {} }],
  } as any;
}

function makeSalesPlan(question: string) {
  return {
    ...makePlan(),
    question,
    intent: "aggregate",
    modules: [{ module: "sales", label: "销售", score: 100, reasons: ["test"], rule: {} }],
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
