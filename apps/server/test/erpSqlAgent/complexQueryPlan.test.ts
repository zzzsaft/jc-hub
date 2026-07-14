import assert from "node:assert/strict";
import test from "node:test";
import { complexQueryPlanService } from "../../src/modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

test("builds the sales inventory backlog task graph", () => {
  const result = complexQueryPlanService.build(makeAnalysisPlan());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.entityGrain, ["Company", "product"]);
  assert.deepEqual(result.plan.steps.map((step) => step.id), ["sales_growth", "inventory", "backlog"]);
  assert.deepEqual(result.plan.steps[0]?.metrics, ["order_amount"]);
  assert.equal(result.plan.resultLimit, 20);
  assert.equal(result.plan.steps[0]?.capabilityCode, "complex.sales_growth");
  assert.equal(result.plan.steps[0]?.question, "按产品查询最近3个月销售额月度趋势");
  assert.equal(result.plan.steps[0]?.module, "sales");
  assert.deepEqual(result.plan.steps[0]?.joinKeys, ["Company", "product"]);
  assert.deepEqual(result.plan.steps[1]?.dependsOn, ["sales_growth"]);
  assert.deepEqual(result.plan.steps[2]?.dependsOn, ["sales_growth"]);
  assert.deepEqual(result.plan.joinPolicy.keys, ["Company", "product"]);
  assert.equal(result.plan.joinPolicy.allowNameBasedJoin, false);
  assert.deepEqual(result.plan.budget, { maxQueries: 8, maxRowsPerQuery: 500, timeoutMs: 30_000 });
  assert.equal(result.plan.diagnostic, false);
});

test("keeps time only on the sales growth step", () => {
  const result = complexQueryPlanService.build(makeAnalysisPlan());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps[0]?.timeRange, { kind: "relative", days: 90 });
  assert.equal(result.plan.steps[1]?.timeRange, undefined);
  assert.equal(result.plan.steps[2]?.timeRange, undefined);
});

test("rejects unsupported complex scenarios", () => {
  const result = complexQueryPlanService.build({ ...makeAnalysisPlan(), route: undefined, scenario: "other" });

  assert.deepEqual(result, { ok: false, reason: "unsupported_complex_scenario" });
});

test("rejects entity filters that cannot be projected safely", () => {
  const result = complexQueryPlanService.build({ ...makeAnalysisPlan(), dimensionFilters: { customer: "客户A" } });

  assert.deepEqual(result, { ok: false, reason: "unsupported_complex_filter" });
  assert.deepEqual(complexQueryPlanService.build({
    ...makeAnalysisPlan(), filters: [{ metric: "gross_margin_rate", op: "low" }],
  }), { ok: false, reason: "unsupported_complex_filter" });
  assert.equal(complexQueryPlanService.build({
    ...makeAnalysisPlan(), filters: [{ metric: "inventory_on_hand_qty", op: "low" }],
  }).ok, true);
});

test("builds finite finance recipes for Q1 sales margin and costs", () => {
  const result = complexQueryPlanService.build(financePlan({
    scenario: "sales_margin_cost_by_product_customer_order",
    dimensions: ["product_category", "customer"],
    metrics: ["order_amount", "gross_margin_rate", "material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount", "cost_component_amount"],
    filters: [
      { metric: "order_amount", op: "rank_high" },
      { metric: "gross_margin_rate", op: "low" },
      { metric: "material_cost_amount", op: "high" },
    ],
    timeRange: { kind: "month", month: 6 }, limit: 5,
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps.map(({ id, metrics }) => ({ id, metrics })), [
    { id: "sales_anchor", metrics: ["order_amount"] },
    { id: "margin", metrics: ["gross_margin_rate"] },
    { id: "costs", metrics: ["material_cost_amount", "labor_cost_amount", "burden_cost_amount", "subcontract_cost_amount", "cost_component_amount"] },
  ]);
  assert.deepEqual(result.plan.steps.map((step) => step.timeRange), Array(3).fill({ kind: "month", month: 6 }));
  assert.equal(result.plan.resultLimit, 5);
  assertValidFinancePlan(result.plan);
});

test("builds Q2 invoice anchor with first-half time and grouped costs", () => {
  const result = complexQueryPlanService.build(financePlan({
    scenario: "customer_revenue_margin_risk",
    dimensions: ["customer", "product", "order"],
    metrics: ["invoice_revenue", "gross_margin_rate", "cost_component_amount", "material_cost_amount"],
    filters: [{ metric: "gross_margin_rate", op: "low" }, { metric: "cost_component_amount", op: "high" }],
    timeRange: { kind: "current_year_first_half" },
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps[0]?.metrics, ["invoice_revenue"]);
  assert.equal(result.plan.steps[0]?.module, "finance");
  assert.deepEqual(result.plan.steps.at(-1)?.metrics, ["cost_component_amount", "material_cost_amount"]);
  assert(result.plan.steps.every((step) => step.timeRange?.kind === "current_year_first_half"));
  assertValidFinancePlan(result.plan);
});

test("builds Q4 with the exact normalized margin threshold", () => {
  const result = complexQueryPlanService.build(financePlan({
    scenario: "sales_margin_cost_by_product_customer_order",
    dimensions: ["order", "customer", "product"],
    metrics: ["order_amount", "gross_margin_rate", "material_cost_amount", "labor_cost_amount"],
    filters: [{ metric: "gross_margin_rate", op: "lt", value: 0.2 }],
    timeRange: { kind: "month", month: 6 },
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps.find((step) => step.id === "margin")?.filters, [
    { metric: "gross_margin_rate", op: "lt", value: 0.2 },
  ]);
  assert.deepEqual(result.plan.steps.find((step) => step.id === "sales_anchor")?.filters, []);
  assertValidFinancePlan(result.plan);
});

test("builds Q5 collection as one grouped dependent step", () => {
  const result = complexQueryPlanService.build(financePlan({
    dimensions: ["customer", "order"],
    metrics: ["order_amount", "gross_margin_rate", "collection_delay_days", "collection_overdue_amount"],
    filters: [
      { metric: "order_amount", op: "rank_high" },
      { metric: "gross_margin_rate", op: "low" },
      { metric: "collection_delay_days", op: "high" },
    ],
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const collection = result.plan.steps.find((step) => step.id === "collection");
  assert.deepEqual(collection?.metrics, ["collection_delay_days", "collection_overdue_amount"]);
  assert.deepEqual(collection?.joinKeys, ["Company", "customer", "order"]);
  assert.deepEqual(collection?.dependsOn, ["sales_anchor"]);
  assertValidFinancePlan(result.plan);
});

test("merges finance metrics with identical execution shape", () => {
  const result = complexQueryPlanService.build(financePlan({
    dimensions: ["customer", "order"],
    metrics: ["order_amount", "gross_margin_rate", "material_cost_amount", "labor_cost_amount"],
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.steps.length, 2);
  assert.deepEqual(result.plan.steps[1]?.metrics, ["gross_margin_rate", "material_cost_amount", "labor_cost_amount"]);
  assert.equal(result.plan.steps[1]?.capabilityCode, "finance.composite_decision");
});

test("does not lose cost ordering when finance steps otherwise merge", () => {
  const result = complexQueryPlanService.build(financePlan({
    dimensions: ["customer", "order"],
    metrics: ["order_amount", "gross_margin_rate", "material_cost_amount", "labor_cost_amount"],
    orderBy: [{ metric: "material_cost_amount", direction: "DESC" }],
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const costs = result.plan.steps.find((step) => step.metrics.includes("material_cost_amount"));
  assert.deepEqual(costs?.metrics, ["material_cost_amount", "labor_cost_amount"]);
  assert.deepEqual(costs?.orderBy, [{ metric: "material_cost_amount", direction: "DESC" }]);
});

function makeAnalysisPlan(): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    scenario: "product_sales_inventory_backlog_trend",
    grain: ["product"],
    metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    filters: [],
    dimensions: ["product"],
    orderBy: [{ metric: "order_amount", direction: "DESC" }],
    timeRange: { kind: "relative", days: 90 },
    analysisShape: "trend",
    limit: 20,
  };
}

function financePlan(overrides: Partial<AnalysisPlan>): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    grain: overrides.dimensions ?? ["customer"],
    dimensions: overrides.dimensions ?? ["customer"],
    metrics: overrides.metrics ?? ["order_amount", "gross_margin_rate"],
    requiredMetrics: overrides.metrics ?? ["order_amount", "gross_margin_rate"],
    filters: [], orderBy: [],
    ...overrides,
  };
}

function assertValidFinancePlan(plan: Extract<ReturnType<typeof complexQueryPlanService.build>, { ok: true }>["plan"]): void {
  assert.equal(plan.diagnostic, true);
  assert(plan.steps.length <= 8);
  assert(plan.steps.every((step) => step.limit <= 500));
  const ids = new Set(plan.steps.map((step) => step.id));
  assert.equal(ids.size, plan.steps.length);
  assert(plan.steps.every((step) => step.dependsOn.every((dependency) => ids.has(dependency))));
  assert.equal(plan.joinPolicy.allowNameBasedJoin, false);
}
