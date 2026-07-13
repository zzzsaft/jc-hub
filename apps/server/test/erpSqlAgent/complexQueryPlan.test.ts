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
  assert.deepEqual(result.plan.steps[1]?.dependsOn, ["sales_growth"]);
  assert.deepEqual(result.plan.steps[2]?.dependsOn, ["sales_growth"]);
  assert.deepEqual(result.plan.joinPolicy.keys, ["Company", "product"]);
  assert.equal(result.plan.joinPolicy.allowNameBasedJoin, false);
  assert.deepEqual(result.plan.budget, { maxQueries: 5, maxRowsPerQuery: 500, timeoutMs: 30_000 });
});

test("keeps time only on the sales growth step", () => {
  const result = complexQueryPlanService.build(makeAnalysisPlan());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps[0]?.timeRange, { kind: "relative", days: 90 });
  assert.equal(result.plan.steps[0]?.timeGrain, "month");
  assert.equal(result.plan.steps[1]?.timeRange, undefined);
  assert.equal(result.plan.steps[2]?.timeRange, undefined);
});

test("rejects unsupported complex scenarios", () => {
  const result = complexQueryPlanService.build({ ...makeAnalysisPlan(), scenario: "other" });

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
