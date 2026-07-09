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
  assert.equal((guard.calls[0]?.options as any).references[0].sourceType, "metric");
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
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /OrderRel\.OurReqQty/);
  assert.match(sql, /OrderRel\.OpenRelease = 1/);
  assert.match(sql, /OrderDtl\.DocExtPriceDtl \* OrderRel\.OurReqQty \/ NULLIF\(OrderDtl\.OrderQty, 0\)/);
  assert.equal((sql.match(/OrderRel\.ReqDate < CAST\(GETDATE\(\) AS date\)/g) ?? []).length, 2);
  assert.match(sql, /ORDER BY \[open_shipping_amount\] DESC/);
});

test("metric composer builds shipped amount SQL from shipment quantity", async () => {
  guard.calls = [];
  const result = await new MetricComposerService(guard).compose({
    question: "本月发货金额最高的客户，对应毛利和回款情况如何？",
    analysisPlan: {
      mode: "strict",
      grain: ["customer"],
      metrics: ["shipped_amount", "gross_margin_rate", "collection_delay_days", "collection_overdue_amount"],
      filters: [{ metric: "shipped_amount", op: "rank_high" }],
      dimensions: ["customer"],
      orderBy: [{ metric: "shipped_amount", direction: "DESC" }],
      timeRange: { kind: "month", month: 7 },
    },
    metrics: [
      shippedMetric(),
      metric("gross_margin_rate", "SUM(OrderHed.DocOrderAmt * 0.2) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)", {
        dimensions: ["customer"],
        dimensionExpressions: { customer: "OrderHed.CustNum" },
      }),
      collectionMetric("collection_delay_days"),
      collectionMetric("collection_overdue_amount", "InvcHead.DocInvoiceBal", "SUM"),
    ],
    financeMode: "strict",
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
    metrics: [metric("order_amount"), inventoryMetric(), openShippingMetric("open_shipping_qty", "OrderRel.OurReqQty"), openShippingMetric("open_shipping_amount")],
    financeMode: "estimate",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.doesNotMatch(sql, /\[order\]/);
  assert.match(sql, /order_amount\.\[product\] = inventory_on_hand_qty\.\[product\]/);
  assert.match(sql, /order_amount\.\[product\] = open_shipping_qty\.\[product\]/);
  assert.doesNotMatch(sql, /PartWhse\.OnHandQty > 0\n  AND OrderHed\.OrderDate/);
});

test("metric composer supports purchase amount by supplier", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "采购金额按供应商统计",
    analysisPlan: {
      mode: "strict",
      grain: ["supplier"],
      metrics: ["purchase_amount"],
      filters: [],
      dimensions: ["supplier"],
      orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
    },
    metrics: [purchaseMetric()],
    financeMode: "strict",
  });

  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /POHeader\.VendorNum AS \[supplier\]/);
  assert.match(sql, /GROUP BY POHeader\.Company, POHeader\.VendorNum/);
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
      statusFilters: ["OrderHed.OpenOrder = 1"],
      requiredTables: ["Erp.OrderHed"],
      joinKeys: ["Company"],
      ...extra,
    },
    score: 1,
    matchedSignals: [`metric:${metricCode}`],
  };
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
    dimensionExpressions: { product: "PODetail.PartNum", order: "POHeader.PONum", supplier: "POHeader.VendorNum" },
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
