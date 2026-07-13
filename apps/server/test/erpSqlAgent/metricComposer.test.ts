import assert from "node:assert/strict";
import test from "node:test";
import { MetricComposerService } from "../../src/modules/erpSqlAgent/planner/index.js";

const guard = {
  calls: [] as Array<{ sql: string; options: unknown }>,
  async validate(sql: string, options: unknown) {
    this.calls.push({ sql, options });
    return {
      valid: true,
      errors: [],
      warnings: [],
      normalizedSql: sql,
      referencedTables: ["Erp.OrderHed"],
      referencedFields: ["OrderHed.Company", "OrderHed.OrderDate", "OrderHed.DocOrderAmt", "OrderHed.OpenOrder"],
    };
  },
};

test("metric composer builds SQL from approved atomic metrics and calls guard", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "6月份销售额最高的5类产品，毛利率是多少，成本主要高在哪？",
    analysisPlan: {
      mode: "strict",
      grain: ["product"],
      metrics: ["order_amount", "gross_margin_rate"],
      filters: [{ metric: "order_amount", op: "rank_high" }],
      dimensions: ["product"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      timeRange: { kind: "month", month: 6 },
      limit: 5,
    },
    metrics: [metric("order_amount"), metric("gross_margin_rate", "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)")],
    financeMode: "strict",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.generation.sql : "", /WITH order_amount AS/);
  assert.match(result.ok ? result.generation.sql : "", /SELECT TOP 5/);
  assert.match(result.ok ? result.generation.sql : "", /order_amount\.\[product\] = gross_margin_rate\.\[product\]/);
  assert.match(result.ok ? result.generation.sql : "", /MONTH\(OrderHed.OrderDate\) = 6/);
  assert.equal(guard.calls.length, 1);
  assert.equal((guard.calls[0]?.options as any).module, "finance");
  assert.equal((guard.calls[0]?.options as any).references[0].sourceType, "metric");
});

test("metric composer treats current year as year to date for同比", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "今年销售额和去年同比",
    analysisPlan: {
      mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
      timeRange: { kind: "current_year" }, comparison: { kind: "year_over_year" }, timeGrain: "year",
    },
    metrics: [metric("order_amount")],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /DATEADD\(day, 1, CAST\(GETDATE\(\) AS date\)\)/);
  assert.match(sql, /DATEADD\(year, -1, DATEADD\(day, 1, CAST\(GETDATE\(\) AS date\)\)\)/);
});

test("metric composer blocks missing collection metrics as missing approved metrics", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "哪些客户订单金额大但回款慢？",
    analysisPlan: {
      mode: "strict",
      grain: ["customer", "order"],
      metrics: ["order_amount", "collection_delay_days", "collection_overdue_amount"],
      filters: [],
      dimensions: ["customer", "order"],
      orderBy: [],
    },
    metrics: [metric("order_amount")],
    financeMode: "strict",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /缺少 approved atomic metric: collection_delay_days, collection_overdue_amount/);
  assert.deepEqual(result.ok ? [] : result.missingApprovedMetrics, ["collection_delay_days", "collection_overdue_amount"]);
});

test("metric composer combines collection overdue days and amount", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "哪些客户逾期回款最多？",
    analysisPlan: {
      mode: "strict",
      grain: ["customer"],
      metrics: ["collection_delay_days", "collection_overdue_amount"],
      filters: [{ metric: "collection_overdue_amount", op: "rank_high" }],
      dimensions: ["customer"],
      orderBy: [{ metric: "collection_overdue_amount", direction: "DESC" }],
    },
    metrics: [collectionMetric("collection_delay_days"), collectionMetric("collection_overdue_amount", "InvcHead.DocInvoiceBal", "SUM")],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /MAX\(DATEDIFF\(day, InvcHead\.DueDate, CAST\(GETDATE\(\) AS date\)\)\)/);
  assert.match(sql, /SUM\(InvcHead\.DocInvoiceBal\)/);
  assert((sql.match(/InvcHead\.DueDate < CAST\(GETDATE\(\) AS date\)/g) ?? []).length >= 2);
  assert.match(sql, /InvcHead\.Posted = 1/);
  assert.match(sql, /InvcHead\.OpenInvoice = 1/);
  assert.match(sql, /InvcHead\.DocInvoiceBal > 0/);
  assert.match(sql, /ORDER BY \[collection_overdue_amount\] DESC/);
});

test("metric composer blocks incompatible grains without join keys", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "销售额和库存一起看",
    analysisPlan: {
      mode: "strict",
      grain: ["product"],
      metrics: ["order_amount", "inventory_on_hand_qty"],
      filters: [],
      dimensions: ["product"],
      orderBy: [],
    },
    metrics: [metric("order_amount"), metric("inventory_on_hand_qty", "PartWhse.OnHandQty", { grain: "warehouse", joinKeys: [] })],
    financeMode: "strict",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /不兼容/);
});

test("strict finance composer rejects detail amount joins without approved document pre-aggregation keys", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "按产品看毛利率",
    analysisPlan: { mode: "strict", grain: ["product"], metrics: ["gross_margin_rate"], filters: [], dimensions: ["product"], orderBy: [] },
    metrics: [metric("gross_margin_rate", "SUM(OrderDtl.DocExtPriceDtl) / NULLIF(SUM(PartTran.MtlUnitCost), 0)", {
      statusField: "PartTran.TranType",
      statusFilters: ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')"],
      requiredTables: ["Erp.PartTran"],
      joinSql: ["JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = PartTran.Company"],
    })],
    financeMode: "strict",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /document pre-aggregation keys/u);
});

test("metric composer combines approved inventory on-hand quantity by product", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "按产品看销售额和当前库存现存量",
    analysisPlan: {
      mode: "strict",
      grain: ["product"],
      metrics: ["order_amount", "inventory_on_hand_qty"],
      filters: [],
      dimensions: ["product"],
      orderBy: [{ metric: "inventory_on_hand_qty", direction: "ASC" }],
    },
    metrics: [metric("order_amount"), inventoryMetric()],
    financeMode: "strict",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.generation.sql : "", /SUM\(PartWhse\.OnHandQty\)/);
  assert.match(result.ok ? result.generation.sql : "", /PartWhse\.OnHandQty > 0/);
  assert.match(result.ok ? result.generation.sql : "", /order_amount\.\[product\] = inventory_on_hand_qty\.\[product\]/);
  assert.equal(guard.calls.length, 1);
});

test("metric composer blocks dimensions missing from approved definitions", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "按客户看销售额和毛利率",
    analysisPlan: {
      mode: "strict",
      grain: ["customer"],
      metrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [],
    },
    metrics: [metric("order_amount"), metric("gross_margin_rate")],
    financeMode: "strict",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /维度表达式: customer/);
});

test("metric composer combines approved cost component metrics", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "材料成本高还是加工成本高，外协和制造费用分别是多少？",
    analysisPlan: {
      mode: "strict",
      grain: ["product"],
      metrics: ["material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount"],
      filters: [],
      dimensions: ["product"],
      orderBy: [{ metric: "material_cost_amount", direction: "DESC" }],
    },
    metrics: [
      partTranMetric("material_cost_amount", "PartTran.MtlUnitCost * ABS(PartTran.TranQty)"),
      partTranMetric("labor_cost_amount", "PartTran.LbrUnitCost * ABS(PartTran.TranQty)"),
      partTranMetric("burden_cost_amount", "PartTran.BurUnitCost * ABS(PartTran.TranQty)"),
      partTranMetric("subcontract_cost_amount", "PartTran.SubUnitCost * ABS(PartTran.TranQty)"),
    ],
    financeMode: "strict",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.generation.sql : "", /PartTran\.MtlUnitCost \* ABS\(PartTran\.TranQty\)/);
  assert.match(result.ok ? result.generation.sql : "", /JOIN Erp\.JobProd JobProd/);
  assert.match(result.ok ? result.generation.sql : "", /material_cost_amount\.\[product\] = labor_cost_amount\.\[product\]/);
  assert.equal(guard.calls.length, 1);
});

test("metric composer builds open shipping SQL with overdue filter", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "哪些产品订单延期交付？",
    analysisPlan: {
      mode: "strict",
      grain: ["product", "order"],
      metrics: ["open_shipping_amount", "open_shipping_qty"],
      filters: [{ metric: "open_shipping_amount", op: "overdue" }],
      dimensions: ["product", "order"],
      orderBy: [{ metric: "open_shipping_amount", direction: "DESC" }],
    },
    metrics: [openShippingMetric("open_shipping_amount"), openShippingMetric("open_shipping_qty", "OrderRel.OurReqQty")],
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /OrderRel\.OurReqQty/);
  assert.match(sql, /OrderRel\.OpenRelease = 1/);
  assert.match(sql, /MIN\(OrderRel\.ReqDate\) AS \[__timeField\]/);
  assert.match(sql, /OrderDtl\.DocExtPriceDtl \* OrderRel\.OurReqQty \/ NULLIF\(OrderDtl\.OrderQty, 0\)/);
  assert.equal((sql.match(/OrderRel\.ReqDate < CAST\(GETDATE\(\) AS date\)/g) ?? []).length, 2);
  assert.match(sql, /ORDER BY \[open_shipping_amount\] DESC/);
  assert.equal((guard.calls[0]?.options as any).module, undefined);
});

test("metric composer builds operational shipped amount SQL from shipment quantity", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "本月发货金额最高的客户",
    analysisPlan: {
      mode: "strict",
      grain: ["customer"],
      metrics: ["shipped_amount"],
      filters: [{ metric: "shipped_amount", op: "rank_high" }],
      dimensions: ["customer"],
      orderBy: [{ metric: "shipped_amount", direction: "DESC" }],
      timeRange: { kind: "month", month: 7 },
    },
    metrics: [shippedMetric()],
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /FROM Erp\.ShipDtl ShipDtl/);
  assert.match(sql, /JOIN Erp\.ShipHead ShipHead/);
  assert.match(sql, /COALESCE\(ShipDtl\.OurInventoryShipQty, 0\) \+ COALESCE\(ShipDtl\.OurJobShipQty, 0\)/);
  assert.match(sql, /MONTH\(ShipHead\.ShipDate\) = 7/);
  assert.match(sql, /ORDER BY \[shipped_amount\] DESC/);
});

test("metric composer builds open job risk count SQL", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "当前未完工工单里，哪些关联高价值客户订单，预计毛利和成本风险是多少？",
    analysisPlan: {
      mode: "strict",
      grain: ["customer", "order"],
      metrics: ["open_job_margin_cost_risk", "order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer", "order"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
    },
    metrics: [
      openJobRiskMetric(),
      metric("order_amount", "OrderHed.DocOrderAmt", {
        grain: "order",
        dimensions: ["customer", "order"],
        dimensionExpressions: { customer: "OrderHed.CustNum", order: "OrderHed.OrderNum" },
      }),
      metric("gross_margin_rate", "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)", {
        grain: "order",
        dimensions: ["customer", "order"],
        dimensionExpressions: { customer: "OrderHed.CustNum", order: "OrderHed.OrderNum" },
      }),
    ],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /COUNT\(DISTINCT JobHead\.JobNum\)/);
  assert.match(sql, /JobHead\.JobClosed = 0/);
  assert.match(sql, /JobHead\.JobComplete = 0/);
  assert.match(sql, /JOIN Erp\.JobProd JobProd/);
  assert.match(sql, /open_job_margin_cost_risk\.\[order\] = order_amount\.\[order\]/);
});

test("metric composer combines open shipping demand and inventory by product and warehouse", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "按仓库和产品看当前库存现存量和未交付数量",
    analysisPlan: {
      mode: "strict",
      grain: ["product", "warehouse"],
      metrics: ["inventory_on_hand_qty", "open_shipping_qty"],
      filters: [],
      dimensions: ["product", "warehouse"],
      orderBy: [{ metric: "open_shipping_qty", direction: "DESC" }],
    },
    metrics: [inventoryMetric(), openShippingMetric("open_shipping_qty", "OrderRel.OurReqQty")],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /inventory_on_hand_qty\.\[warehouse\] = open_shipping_qty\.\[warehouse\]/);
  assert.match(sql, /PartWhse\.WarehouseCode/);
  assert.match(sql, /OrderRel\.WarehouseCode/);
});

test("metric composer groups monthly trend by period and customer", async () => {
  const customerMetric = (code: string, expression?: string) => metric(code, expression, {
    grain: "customer",
    dimensions: ["customer"],
    dimensionExpressions: { customer: "OrderHed.CustNum" },
  });
  const result = await new MetricComposerService(guard).compose({
    question: "最近半年哪些客户持续下单，但毛利率逐月下降？",
    analysisPlan: {
      mode: "decision_support",
      grain: ["customer"],
      metrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 180 },
      timeGrain: "month",
    },
    metrics: [customerMetric("order_amount"), customerMetric("gross_margin_rate", "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)")],
    financeMode: "estimate",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /CONVERT\(char\(7\), OrderHed\.OrderDate, 120\) AS \[period\]/);
  assert.match(sql, /GROUP BY OrderHed\.Company, CONVERT\(char\(7\), OrderHed\.OrderDate, 120\), OrderHed\.CustNum/);
  assert.match(sql, /order_amount\.\[period\] = gross_margin_rate\.\[period\]/);
});

test("metric composer compiles product-category previous-month year-over-year comparison", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "按产品类别，上个月销售额最高，和去年同比",
    analysisPlan: {
      mode: "strict",
      grain: ["product_category"],
      metrics: ["order_amount"],
      filters: [{ metric: "order_amount", op: "rank_high" }],
      dimensions: ["product_category"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      requiredMetrics: ["order_amount"],
      timeRange: { kind: "previous_month" },
      comparison: { kind: "year_over_year" },
      timeGrain: "month",
      businessScope: [{ metric: "order_amount", source: "approved_metric" }],
    },
    metrics: [metric("order_amount", "OrderDtl.DocExtPriceDtl", {
      grain: "order_line",
      dimensions: ["product_category"],
      dimensionExpressions: {
        product_category: "COALESCE(NULLIF(ProdGrup.Description, N''), NULLIF(OrderDtl.ProdCode, N''), N'未分类')",
      },
      keyExpressions: { Company: "OrderDtl.Company" },
      timeField: "OrderHed.OrderDate",
      requiredTables: ["Erp.OrderDtl"],
      joinSql: ["JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum"],
      dimensionJoinSql: {
        product_category: ["LEFT JOIN Erp.ProdGrup ProdGrup ON ProdGrup.Company = OrderDtl.Company AND ProdGrup.ProdCode = OrderDtl.ProdCode"],
      },
      statusFilters: ["OrderHed.VoidOrder = 0", "OrderDtl.VoidLine = 0"],
    })],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /LEFT JOIN Erp\.ProdGrup ProdGrup/);
  assert.match(sql, /AS \[product_category\]/);
  assert.match(sql, /CONVERT\(char\(7\), OrderHed\.OrderDate, 120\) AS \[period\]/);
  assert.match(sql, /DATEADD\(year, -1, DATEADD\(month, DATEDIFF\(month, 0, GETDATE\(\)\) - 1, 0\)\)/);
  assert.match(sql, /AS \[order_amount_comparison\]/);
  assert.match(sql, /AS \[order_amount_change_rate\]/);
  assert.match(sql, /ORDER BY \[order_amount\] DESC/);
});

test("metric composer validates and applies an auditable user category merge rule", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "今年的平模头总销售额应该是平模头+高端平模头",
    analysisPlan: {
      mode: "strict",
      grain: ["product_category"],
      metrics: ["order_amount"],
      filters: [],
      dimensions: ["product_category"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      requiredMetrics: ["order_amount"],
      timeRange: { kind: "current_year" },
      comparison: { kind: "year_over_year" },
      timeGrain: "year",
      dimensionRules: [{
        dimension: "product_category",
        target: "平模头总类",
        members: ["平模头", "高端平模头"],
        source: "user_statement",
        trust: "user_asserted",
        validation: "master_data_required",
      }],
      assumptions: ["用户声明分类合并规则：平模头总类 = 平模头 + 高端平模头。"],
    },
    metrics: [metric("order_amount", "OrderDtl.DocExtPriceDtl", {
      grain: "order_line",
      dimensions: ["product_category"],
      dimensionExpressions: { product_category: "ProdGrup.Description" },
      keyExpressions: { Company: "OrderDtl.Company" },
      timeField: "OrderHed.OrderDate",
      requiredTables: ["Erp.OrderDtl"],
      joinSql: ["JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum"],
      dimensionJoinSql: {
        product_category: ["LEFT JOIN Erp.ProdGrup ProdGrup ON ProdGrup.Company = OrderDtl.Company AND ProdGrup.ProdCode = OrderDtl.ProdCode"],
      },
    })],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /category_rule_validation AS/);
  assert.match(sql, /ProdGrup\.Description IN \(N'平模头', N'高端平模头'\)/);
  assert.match(sql, /HAVING COUNT\(DISTINCT ProdGrup\.Description\) = 2/);
  assert.match(sql, /JOIN category_rule_validation ON category_rule_validation\.Company = OrderDtl\.Company/);
  assert.match(sql, /CASE WHEN ProdGrup\.Description IN .* THEN N'平模头总类'/);
  assert.match(sql, /AS \[分类合并规则\]/);
  assert.match(sql, /AS \[分类规则验证\]/);
  assert(result.ok && result.generation.assumptions.some((item) => item.includes("平模头总类")));
});

test("metric composer builds customer product year-over-year trend without invented fields", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "客户帝龙永孚今年购买的产品类型销售额分布和去年相比有什么趋势变化？",
    analysisPlan: {
      route: "complex_composed",
      mode: "decision_support",
      grain: ["customer", "product"],
      metrics: ["order_amount"],
      filters: [],
      dimensions: ["customer", "product"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      scenario: "customer_product_yoy_trend",
      requiredMetrics: ["order_amount"],
      timeRange: { kind: "year_over_year" },
      timeGrain: "year",
      analysisShape: "trend",
      customerName: "帝龙永孚",
      dimensionFilters: { customer: "帝龙永孚" },
    },
    metrics: [metric("order_amount", "OrderHed.DocOrderAmt", {
      dimensions: ["customer", "product"],
      dimensionExpressions: { customer: "Customer.Name", product: "OrderDtl.PartNum" },
      joinSql: [
        "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderHed.Company AND OrderDtl.OrderNum = OrderHed.OrderNum",
        "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
      ],
    })],
    financeMode: "estimate",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /CONVERT\(char\(4\), OrderHed\.OrderDate, 120\) AS \[period\]/);
  assert.match(sql, /DATEFROMPARTS\(YEAR\(GETDATE\(\)\) - 1, 1, 1\)/);
  assert.match(sql, /Customer\.Name LIKE N'%帝龙永孚%'/);
  assert.match(sql, /OrderDtl\.PartNum AS \[product\]/);
  assert.doesNotMatch(sql, /OrderHed\.CustomerName|OrderHed\.ReqDate|OrderHed\.OrderTotal|OrderDtl\.ExtCost|OrderDtl\.VoidDtl|PartTran\.Void/);
});

test("order-scoped open shipping SQL contains the requested order filter", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "订单 226867 还有多少没发货？",
    analysisPlan: {
      mode: "strict",
      grain: ["order"],
      metrics: ["open_shipping_amount"],
      filters: [],
      dimensions: ["order"],
      dimensionFilters: { order: "226867" },
      orderBy: [],
    },
    metrics: [metric("open_shipping_amount", "OrderHed.DocOrderAmt", {
      dimensions: ["order"],
      dimensionExpressions: { order: "OrderHed.OrderNum" },
    })],
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.generation.sql : "", /OrderHed\.OrderNum\s*=\s*226867/u);
});

test("metric composer compiles approved entity filters with Unicode-safe literals", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "筛选供应商、产品、仓库和工单",
    analysisPlan: {
      mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
      dimensionFilters: { supplier: "供应商'O", product: "产品甲", warehouse: "主仓", job: "工单一" },
    },
    metrics: [metric("order_amount", "OrderHed.DocOrderAmt", {
      dimensionExpressions: {
        supplier: "OrderHed.SupplierID", product: "OrderHed.PartNum",
        warehouse: "OrderHed.WarehouseCode", job: "OrderHed.JobNum",
      },
    })],
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /OrderHed\.SupplierID = N'供应商''O'/u);
  assert.match(sql, /OrderHed\.PartNum = N'产品甲'/u);
  assert.match(sql, /OrderHed\.WarehouseCode = N'主仓'/u);
  assert.match(sql, /OrderHed\.JobNum = N'工单一'/u);
});

test("metric composer fails closed for invalid order filters and missing approved expressions", async () => {
  const compose = (dimensionFilters: NonNullable<Parameters<MetricComposerService["compose"]>[0]["analysisPlan"]["dimensionFilters"]>) =>
    new MetricComposerService(guard).compose({
      question: "过滤实体",
      analysisPlan: { mode: "strict", grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [], dimensionFilters },
      metrics: [metric("order_amount", "OrderHed.DocOrderAmt", { dimensionExpressions: { order: "OrderHed.OrderNum" } })],
    });

  const invalidOrder = await compose({ order: "226867 OR 1=1" });
  assert.equal(invalidOrder.ok, false);
  assert.match(invalidOrder.ok ? "" : invalidOrder.error, /纯数字/u);

  const missingExpression = await compose({ warehouse: "主仓" });
  assert.equal(missingExpression.ok, false);
  assert.match(missingExpression.ok ? "" : missingExpression.error, /缺少过滤维度表达式: warehouse/u);
});

test("metric composer blocks customer name filters on numeric customer dimensions", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "客户帝龙永孚今年销售额和去年比较",
    analysisPlan: {
      mode: "decision_support",
      grain: ["customer"],
      metrics: ["order_amount"],
      filters: [],
      dimensions: ["customer"],
      orderBy: [],
      timeRange: { kind: "year_over_year" },
      timeGrain: "year",
      customerName: "帝龙永孚",
    },
    metrics: [metric("order_amount", "OrderHed.DocOrderAmt", {
      dimensions: ["customer"],
      dimensionExpressions: { customer: "OrderHed.CustNum" },
    })],
    financeMode: "estimate",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /客户维度不能按客户名过滤/);
});

test("metric composer blocks declared dimensions missing from approved metric support", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "按产品类型看销售额",
    analysisPlan: {
      mode: "decision_support",
      grain: ["product"],
      metrics: ["order_amount"],
      filters: [],
      dimensions: ["product"],
      orderBy: [],
    },
    metrics: [metric("order_amount", "OrderHed.DocOrderAmt", {
      dimensions: ["customer"],
      dimensionExpressions: { product: "OrderDtl.PartNum", customer: "Customer.Name" },
    })],
    financeMode: "estimate",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /维度表达式: product/);
});

test("metric composer groups monthly trend by period and division", async () => {
  const divisionMetric = (code: string, expression?: string) => metric(code, expression, {
    grain: "division",
    dimensions: ["division"],
    dimensionExpressions: { division: "OrderHed.EntryPerson" },
  });
  const result = await new MetricComposerService(guard).compose({
    question: "哪些事业部销售额增长了，但毛利率下降了？",
    analysisPlan: {
      mode: "decision_support",
      grain: ["division"],
      metrics: ["order_amount", "gross_margin_rate"],
      filters: [],
      dimensions: ["division"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 180 },
      timeGrain: "month",
    },
    metrics: [divisionMetric("order_amount"), divisionMetric("gross_margin_rate", "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)")],
    financeMode: "estimate",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /OrderHed\.EntryPerson AS \[division\]/);
  assert.match(sql, /order_amount\.\[period\] = gross_margin_rate\.\[period\]/);
  assert.match(sql, /order_amount\.\[division\] = gross_margin_rate\.\[division\]/);
});

test("metric composer combines sales inventory and backlog by product only", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？",
    analysisPlan: {
      mode: "decision_support",
      grain: ["product"],
      metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
      filters: [],
      dimensions: ["product"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 90 },
    },
    metrics: [orderAmountMetric(), inventoryMetric(), openShippingMetric("open_shipping_qty", "OrderRel.OurReqQty"), openShippingMetric("open_shipping_amount")],
    financeMode: "estimate",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.doesNotMatch(sql, /\[order\]/);
  assert.match(sql, /OrderDtl\.PartNum AS \[product\]/);
  assert.doesNotMatch(sql, /ShortChar01/);
  assert.match(sql, /order_amount\.\[product\] = inventory_on_hand_qty\.\[product\]/);
  assert.match(sql, /order_amount\.\[product\] = open_shipping_qty\.\[product\]/);
  assert.doesNotMatch(sql, /PartWhse\.OnHandQty > 0\n  AND OrderHed\.OrderDate/);
});

test("metric composer filters dependent queries by an approved product set", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "查询选定产品的库存",
    analysisPlan: {
      mode: "decision_support",
      grain: ["product"],
      metrics: ["inventory_on_hand_qty"],
      requiredMetrics: ["inventory_on_hand_qty"],
      filters: [],
      dimensions: ["product"],
      orderBy: [],
      dimensionFilterSets: { product: ["A100", "B'200"] },
    },
    metrics: [inventoryMetric()],
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /PartWhse\.PartNum IN \(N'A100', N'B''200'\)/u);
});

test("metric composer groups purchase suppliers by identity and displays supplier name", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "最近一个月采购金额按供应商名称统计",
    analysisPlan: {
      mode: "strict",
      grain: ["supplier"],
      metrics: ["purchase_amount"],
      filters: [],
      dimensions: ["supplier"],
      orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 30 },
    },
    metrics: [purchaseMetric()],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /JOIN Erp\.Vendor Vendor/);
  assert.match(sql, /COALESCE\(NULLIF\(LTRIM\(RTRIM\(Vendor\.Name\)\), N''\), N'未命名供应商'\) AS \[supplier\]/);
  assert.match(sql, /POHeader\.VendorNum AS \[__supplierKey\]/);
  assert.match(sql, /MIN\(POHeader\.OrderDate\) AS \[__timeField\]/);
  const groupBy = sql.slice(sql.indexOf("GROUP BY"), sql.indexOf("\n)"));
  assert.match(groupBy, /POHeader\.VendorNum/u);
  assert.match(groupBy, /Vendor\.Name/u);
  assert.doesNotMatch(sql.slice(sql.lastIndexOf("SELECT TOP")), /\[__supplierKey\]/u);
});

test("metric composer adds product customer concentration columns", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "哪些产品销售额进入Top10，但客户集中度过高？",
    analysisPlan: {
      mode: "strict",
      grain: ["product", "customer"],
      metrics: ["order_amount"],
      filters: [],
      dimensions: ["product", "customer"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      analysisShape: "concentration",
      limit: 10,
    },
    metrics: [metric("order_amount", "OrderHed.DocOrderAmt", {
      dimensions: ["product", "customer"],
      dimensionExpressions: { product: "OrderDtl.PartNum", customer: "OrderHed.CustNum" },
    })],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /AS \[customer_share_rate\]/);
  assert.match(sql, /COUNT\(order_amount\.\[customer\]\) OVER \(PARTITION BY order_amount\.\[product\]\) AS \[customer_count\]/);
});

function metric(metricCode: string, amountExpression = "OrderHed.DocOrderAmt", extra: Record<string, unknown> = {}) {
  return {
    familyId: `family_${metricCode}`,
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
      grain: "product",
      dimensions: ["product"],
      dimensionExpressions: { product: "OrderDtl.PartNum" },
      keyExpressions: { Company: "OrderHed.Company" },
      timeField: "OrderHed.OrderDate",
      amountExpression,
      statusField: "OrderHed.OpenOrder",
      statusFilters: ["OrderHed.OpenOrder = 1"],
      requiredTables: ["Erp.OrderHed"],
      joinKeys: ["Company"],
      ...extra,
    },
    score: 1,
    matchedSignals: [`metric:${metricCode}`],
  };
}

function orderAmountMetric() {
  return metric("order_amount", "OrderDtl.DocExtPriceDtl", {
    grain: "order_line",
    dimensions: ["customer", "order", "product"],
    dimensionExpressions: {
      customer: "COALESCE(Customer.Name, Customer.CustID)",
      order: "OrderDtl.OrderNum",
      product: "OrderDtl.PartNum",
    },
    keyExpressions: { Company: "OrderDtl.Company" },
    timeField: "OrderHed.OrderDate",
    statusFilters: [],
    requiredTables: ["Erp.OrderDtl"],
    joinSql: [
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
    ],
    joinKeys: ["Company"],
  });
}

function partTranMetric(metricCode: string, amountExpression: string) {
  return metric(metricCode, amountExpression, {
    grain: "production_cost_transaction",
    dimensions: ["product"],
    dimensionExpressions: { product: "PartTran.PartNum" },
    keyExpressions: { Company: "PartTran.Company" },
    timeField: "PartTran.TranDate",
    statusFilters: ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')", "PartTran.TranQty <> 0"],
    requiredTables: ["Erp.PartTran"],
    joinSql: ["JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum"],
  });
}

function openShippingMetric(metricCode: string, amountExpression = "OrderDtl.DocExtPriceDtl * OrderRel.OurReqQty / NULLIF(OrderDtl.OrderQty, 0)") {
  return metric(metricCode, amountExpression, {
    grain: "sales_order_release",
    dimensions: ["customer", "order", "product", "warehouse", "division"],
    dimensionExpressions: {
      customer: "OrderHed.CustNum",
      order: "OrderRel.OrderNum",
      product: "OrderDtl.PartNum",
      warehouse: "OrderRel.WarehouseCode",
      division: "OrderHed.EntryPerson",
    },
    keyExpressions: { Company: "OrderRel.Company" },
    timeField: "OrderRel.ReqDate",
    statusFilters: ["OrderRel.OpenRelease = 1", "OrderRel.OurReqQty > 0"],
    overdueFilters: ["OrderRel.ReqDate < CAST(GETDATE() AS date)"],
    requiredTables: ["Erp.OrderRel"],
    joinSql: [
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderRel.Company AND OrderDtl.OrderNum = OrderRel.OrderNum AND OrderDtl.OrderLine = OrderRel.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderRel.Company AND OrderHed.OrderNum = OrderRel.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
    ],
  });
}

function shippedMetric() {
  return metric("shipped_amount", "OrderDtl.DocExtPriceDtl * (COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) / NULLIF(OrderDtl.OrderQty, 0)", {
    grain: "shipment",
    dimensions: ["customer", "order", "product", "division"],
    dimensionExpressions: {
      customer: "OrderHed.CustNum",
      order: "ShipDtl.OrderNum",
      product: "ShipDtl.PartNum",
      division: "OrderHed.EntryPerson",
    },
    keyExpressions: { Company: "ShipDtl.Company" },
    timeField: "ShipHead.ShipDate",
    statusFilters: ["ShipDtl.OrderNum <> 0", "(COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) <> 0"],
    requiredTables: ["Erp.ShipDtl"],
    joinSql: [
      "JOIN Erp.ShipHead ShipHead ON ShipHead.Company = ShipDtl.Company AND ShipHead.PackNum = ShipDtl.PackNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = ShipDtl.Company AND OrderDtl.OrderNum = ShipDtl.OrderNum AND OrderDtl.OrderLine = ShipDtl.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
    ],
  });
}

function openJobRiskMetric() {
  return metric("open_job_margin_cost_risk", "DISTINCT JobHead.JobNum", {
    grain: "open_job",
    dimensions: ["customer", "order", "product", "division"],
    dimensionExpressions: {
      customer: "OrderHed.CustNum",
      order: "JobProd.OrderNum",
      product: "OrderDtl.PartNum",
      division: "OrderHed.EntryPerson",
    },
    keyExpressions: { Company: "JobHead.Company" },
    timeField: "JobHead.CreateDate",
    aggregation: "COUNT",
    statusFilters: ["JobHead.JobClosed = 0", "JobHead.JobComplete = 0", "JobProd.OrderNum <> 0"],
    requiredTables: ["Erp.JobHead"],
    joinSql: [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = JobHead.Company AND JobProd.JobNum = JobHead.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum",
    ],
  });
}

function inventoryMetric() {
  return metric("inventory_on_hand_qty", "PartWhse.OnHandQty", {
    grain: "warehouse_inventory",
    dimensions: ["product", "warehouse"],
    dimensionExpressions: { product: "PartWhse.PartNum", warehouse: "PartWhse.WarehouseCode" },
    keyExpressions: { Company: "PartWhse.Company" },
    timeField: undefined,
    statusFilters: ["PartWhse.OnHandQty > 0"],
    requiredTables: ["Erp.PartWhse"],
    joinKeys: ["Company"],
  });
}

function purchaseMetric() {
  return metric("purchase_amount", "PODetail.DocExtCost", {
    grain: "purchase_order",
    dimensions: ["product", "order", "supplier"],
    dimensionExpressions: {
      product: "PODetail.PartNum",
      order: "POHeader.PONum",
      supplier: "COALESCE(NULLIF(LTRIM(RTRIM(Vendor.Name)), N''), N'未命名供应商')",
    },
    dimensionKeyExpressions: { supplier: "POHeader.VendorNum" },
    dimensionJoinSql: {
      supplier: ["JOIN Erp.Vendor Vendor ON Vendor.Company = POHeader.Company AND Vendor.VendorNum = POHeader.VendorNum"],
    },
    keyExpressions: { Company: "POHeader.Company" },
    timeField: "POHeader.OrderDate",
    statusFilters: ["POHeader.OpenOrder = 1"],
    requiredTables: ["Erp.POHeader"],
    joinSql: ["JOIN Erp.PODetail PODetail ON PODetail.Company = POHeader.Company AND PODetail.PONUM = POHeader.PONum"],
    joinKeys: ["Company"],
  });
}

function collectionMetric(
  metricCode: "collection_delay_days" | "collection_overdue_amount",
  amountExpression = "DATEDIFF(day, InvcHead.DueDate, CAST(GETDATE() AS date))",
  aggregation = "MAX",
) {
  return metric(metricCode, amountExpression, {
    grain: "invoice",
    dimensions: ["customer", "order"],
    dimensionExpressions: { customer: "InvcHead.CustNum", order: "InvcHead.OrderNum" },
    keyExpressions: { Company: "InvcHead.Company" },
    timeField: "InvcHead.DueDate",
    aggregation,
    statusFilters: [
      "InvcHead.Posted = 1",
      "InvcHead.OpenInvoice = 1",
      "InvcHead.DocInvoiceBal > 0",
      "InvcHead.DueDate < CAST(GETDATE() AS date)",
    ],
    requiredTables: ["Erp.InvcHead"],
    joinKeys: ["Company"],
    taxRefundPolicy: "发票未收余额运营口径，不含 CashDtl 实收明细、退款、冲销或坏账核销拆分。",
  });
}
