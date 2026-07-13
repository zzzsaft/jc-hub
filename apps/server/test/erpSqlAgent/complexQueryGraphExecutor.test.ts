import assert from "node:assert/strict";
import test from "node:test";
import { ComplexQueryGraphExecutor, complexQueryPlanService } from "../../src/modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

test("runs sales first and dependent steps in the next layer", async () => {
  const calls: string[] = [];
  const result = await new ComplexQueryGraphExecutor().execute(plan(), async (step) => {
    calls.push(step.id);
    return completed(step.id);
  });

  assert.equal(calls[0], "sales_growth");
  assert.deepEqual(new Set(calls.slice(1)), new Set(["inventory", "backlog"]));
  assert.equal(result.status, "completed");
  assert.deepEqual(result.steps.map((step) => step.status), ["completed", "completed", "completed"]);
});

test("passes completed upstream results to dependent steps", async () => {
  const upstreamSizes: Array<[string, number]> = [];
  await new ComplexQueryGraphExecutor().execute(plan(), async (step, upstream) => {
    upstreamSizes.push([step.id, upstream.size]);
    return completed(step.id);
  });

  assert.deepEqual(upstreamSizes, [["sales_growth", 0], ["inventory", 1], ["backlog", 1]]);
});

test("skips dependent steps when sales fails", async () => {
  const result = await new ComplexQueryGraphExecutor().execute(plan(), async (step) =>
    step.id === "sales_growth" ? failed(step.id, "query_failed") : completed(step.id));

  assert.equal(result.status, "failed");
  assert.deepEqual(result.steps.map((step) => step.status), ["failed", "skipped", "skipped"]);
  assert.match(result.steps[1]?.error ?? "", /dependency_failed/u);
});

test("turns thrown step errors into failed results", async () => {
  const result = await new ComplexQueryGraphExecutor().execute(plan(), async (step) => {
    if (step.id === "inventory") throw new Error("inventory unavailable");
    return completed(step.id);
  });

  assert.equal(result.status, "partial");
  assert.equal(result.steps.find((step) => step.id === "inventory")?.status, "failed");
  assert.equal(result.steps.find((step) => step.id === "backlog")?.status, "completed");
});

function plan() {
  const built = complexQueryPlanService.build(analysisPlan());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error(built.reason);
  return built.plan;
}

function completed(id: "sales_growth" | "inventory" | "backlog") {
  return { id, status: "completed" as const, fields: ["Company", "product"], rows: [], rowCount: 0, truncated: false, warnings: [] };
}

function failed(id: "sales_growth" | "inventory" | "backlog", error: string) {
  return { id, status: "failed" as const, fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error };
}

function analysisPlan(): AnalysisPlan {
  return {
    route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
    grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
    metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
  };
}
