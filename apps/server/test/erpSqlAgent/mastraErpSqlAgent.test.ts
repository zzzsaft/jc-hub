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
  runAnalyzeSqlQuestionTool,
  runExtractSqlIntentTool,
  runPlanSqlQueryTool,
} from "../../src/ai/mastra/tools/erpSql/toolchain.tools.js";
import { runErpSqlToolchainWorkflow } from "../../src/ai/mastra/workflows/erpSqlToolchain.workflow.js";

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
    assert.equal(result.sql, "SELECT TOP 100 Company FROM Erp.POHeader");
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

test("ERP SQL toolchain workflow keeps approved template before analysis composer", async () => {
  let generatorCalls = 0;
  let validateCalls = 0;
  const restore = stubToolchain({
    template: true,
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: [
      makeAtomicMetric("order_amount"),
      makeAtomicMetric("gross_margin_rate"),
      ...COST_COMPONENT_METRICS.map(makeAtomicMetric),
    ],
    onGenerate() {
      generatorCalls += 1;
    },
    onValidate() {
      validateCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？",
    });

    assert.equal(result.success, true);
    assert.equal(result.template?.id, "9");
    assert.equal(generatorCalls, 0);
    assert.equal(validateCalls, 0);
    assert.doesNotMatch(result.sql, /WITH order_amount AS/);
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

test("ERP SQL toolchain workflow blocks strict finance SQL without approved metric or template", async () => {
  let executorCalls = 0;
  const restore = stubToolchain({
    intent: makeFinanceIntent("查询产品毛利"),
    plan: makeFinancePlan("查询产品毛利"),
    references: [makeDatasetReference()],
    financeGuard: true,
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询产品毛利" });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /approved business metric/);
    assert.equal(executorCalls, 0);
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
    assert.match(result.message, /估算\/决策参考口径/);
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
    assert(result.clarificationQuestions?.some((question) => question.includes("数量")));
    assert(result.clarificationQuestions?.some((question) => question.includes("单价")));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow blocks missing collection atomic metrics before generator", async () => {
  let generatorCalls = 0;
  let executorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [makeAtomicMetric("order_amount"), makeAtomicMetric("gross_margin_rate")],
    onGenerate() {
      generatorCalls += 1;
    },
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "哪些客户订单金额大但回款慢，同时毛利率偏低？",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /blocked_missing_metric/);
    assert.match(result.message, /直接计算可能不准/);
    assert.equal(generatorCalls, 0);
    assert.equal(executorCalls, 0);
    assert.deepEqual((result.analysisPlan as any).missingApprovedMetrics, ["collection_delay_days", "collection_overdue_amount"]);
    assert(result.warnings.some((warning) => warning.includes("finance_review_needed: approve atomic metric definitions")));
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved shipped amount before generator", async () => {
  let generatorCalls = 0;
  let validateOptions: any;
  const restore = stubToolchain({
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
      question: "本月发货金额最高的客户，对应产品毛利和回款情况如何？",
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.match(result.sql, /FROM Erp\.ShipDtl ShipDtl/);
    assert.match(result.sql, /ShipHead\.ShipDate/);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow composes approved open job risk before generator", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
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
      question: "当前未完工工单里，哪些关联高价值客户订单，预计毛利和成本风险是多少？",
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
  const restore = stubToolchain({
    atomicMetrics: [
      makeAtomicMetric("purchase_amount"),
      makeAtomicMetric("gross_margin_rate"),
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
      question: "最近一个季度采购成本上涨最多的物料，影响了哪些产品和客户订单毛利？",
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

test("ERP SQL toolchain workflow composes approved collection metrics without LLM generator", async () => {
  let generatorCalls = 0;
  let validateOptions: any;
  const restore = stubToolchain({
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
      question: "哪些客户逾期回款最多？",
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
  const restore = stubToolchain({
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
      question: "6月份销售额最高的5类产品，毛利率是多少，成本主要高在哪？",
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

test("ERP SQL toolchain workflow uses approved composite metric before atomic composer", async () => {
  let generatorCalls = 0;
  let validateOptions: any;
  const restore = stubToolchain({
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
      question: "6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？",
    });

    assert.equal(result.success, true);
    assert.equal(generatorCalls, 0);
    assert.equal(validateOptions.financeMode, "strict");
    assert.equal(validateOptions.references[0].sourceType, "metric");
    assert.equal(validateOptions.references[0].metricCode, "product_margin_cost_ratio_top5");
    assert.match(validateOptions.references[0].exampleSql, /TOP 5/u);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not LLM fallback for customer trend when approved composer is missing", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    atomicMetrics: [],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "三环科技今年销售额和去年销售额相比增长还是下降？对应毛利率变化如何？",
    });

    assert.equal(result.success, false);
    assert.equal(generatorCalls, 0);
    assert.match(result.error ?? "", /blocked_missing_metric/);
    assert.match(result.message, /近似口径做参考分析/);
    assert.equal((result.analysisPlan as any).scenario, "customer_product_yoy_trend");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow short-circuits strict finance when required metrics are missing", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    financeGuard: true,
    compositeMetrics: [makeCompositeMetric()],
    atomicMetrics: [],
    references: [makeDatasetReference()],
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({
      question: "今年以来各事业部的销售额、毛利、成本占比、未交付金额分别是多少？",
    });

    assert.equal(result.success, false);
    assert.equal(generatorCalls, 0);
    assert.match(result.error ?? "", /blocked_missing_metric/);
    assert.match(result.message, /直接计算可能不准/);
    assert.deepEqual((result.analysisPlan as any).missingApprovedMetrics, [
      "order_amount",
      "gross_margin_amount",
      ...COST_COMPONENT_METRICS,
      "open_shipping_amount",
    ]);
    assert(result.warnings.some((warning) => warning === "Reference evidence found: 1"));
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
  invalidGuard?: boolean;
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
  onValidate?: (sql: string, options: unknown) => void;
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

  (deepSeekIntentExtractor as any).extract = async () => options.intent ?? makeIntent();
  (sqlPlannerService as any).plan = async () => options.plan ?? makePlan();
  (sqlTemplateRepository as any).findExecutableCandidates = async () => options.template ? [makeTemplateCandidate()] : [];
  (sqlTemplateRepository as any).findApprovedMetricCandidates = async () => options.compositeMetrics ?? [];
  (sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = async () => options.atomicMetrics ?? [];
  (sqlTemplateRepository as any).findDatasetReferenceCandidates = async () => options.references ?? [];
  (sqlTemplateRepository as any).findReferenceCandidates = async () => [];
  (sqlTemplateExecutionService as any).execute = async () => ({
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
    return makeGeneration();
  };
  (sqlGuardService as any).validate = async (sql: string, guardOptions: any) => {
    options.onValidate?.(sql, guardOptions);
    const hasApprovedFinanceReference = (guardOptions?.references ?? []).some((reference: any) =>
      reference.sourceType === "metric" || reference.sourceType === "template"
    );
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
    ? { customer: "InvcHead.CustNum", order: "InvcHead.OrderNum" }
    : isPurchase
      ? { product: "PODetail.PartNum", order: "POHeader.PONum", supplier: "POHeader.VendorNum" }
    : isShipped
      ? { customer: "OrderHed.CustNum", order: "ShipDtl.OrderNum", product: "ShipDtl.PartNum" }
      : isOpenJob
        ? { customer: "OrderHed.CustNum", order: "JobProd.OrderNum", product: "OrderDtl.PartNum" }
        : { customer: "OrderHed.CustNum", order: "OrderHed.OrderNum", product: "OrderDtl.PartNum" };
  const joinSql = isShipped
    ? [
        "JOIN Erp.ShipHead ShipHead ON ShipHead.Company = ShipDtl.Company AND ShipHead.PackNum = ShipDtl.PackNum",
        "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = ShipDtl.Company AND OrderDtl.OrderNum = ShipDtl.OrderNum AND OrderDtl.OrderLine = ShipDtl.OrderLine",
        "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      ]
    : isOpenJob
      ? [
          "JOIN Erp.JobProd JobProd ON JobProd.Company = JobHead.Company AND JobProd.JobNum = JobHead.JobNum",
          "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
          "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
        ]
      : undefined;
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
