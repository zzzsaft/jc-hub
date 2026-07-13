import assert from "node:assert/strict";
import test from "node:test";
import { runErpComplexQuery } from "../../src/ai/mastra/workflows/erpComplexQueryRunner.js";
import type { ComplexQueryStepResult } from "../../src/modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

test("runs the supported scenario as three narrow analysis plans", async () => {
  const metricGroups: string[][] = [];
  const result = await runErpComplexQuery({
    question: "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？",
    analysisPlan: plan(),
    executeStep: async ({ step, analysisPlan }) => {
      metricGroups.push(analysisPlan.metrics);
      if (step.id === "sales_growth") return sales();
      assert.deepEqual(analysisPlan.dimensionFilterSets?.product, ["A", "B"]);
      return step.id === "inventory" ? inventory() : backlog();
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(metricGroups, [
    ["order_amount"],
    ["inventory_on_hand_qty"],
    ["open_shipping_qty", "open_shipping_amount"],
  ]);
  assert.equal(result.graph.steps.length, 3);
  assert.equal(result.composed.rowCount, 2);
  assert.equal(result.composed.joinCoverage.coverageRate, 1);
});

test("does not claim a composed result when the anchor step fails", async () => {
  const result = await runErpComplexQuery({
    question: "complex",
    analysisPlan: plan(),
    executeStep: async ({ step }) => step.id === "sales_growth" ? failed(step.id) : inventory(),
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "complex_query_failed",
    graph: {
      status: "failed",
      steps: [
        failed("sales_growth"),
        { ...failed("inventory"), status: "skipped", error: "dependency_failed:sales_growth" },
        { ...failed("backlog"), status: "skipped", error: "dependency_failed:sales_growth" },
      ],
    },
  });
});

function sales(): ComplexQueryStepResult {
  return completed("sales_growth", ["Company", "product", "period", "order_amount"], [
    ["jctimes", "A", "2026-05", 100], ["jctimes", "A", "2026-06", 150],
    ["jctimes", "B", "2026-05", 100], ["jctimes", "B", "2026-06", 120],
  ]);
}

function inventory(): ComplexQueryStepResult {
  return completed("inventory", ["Company", "product", "inventory_on_hand_qty"], [["jctimes", "A", 20], ["jctimes", "B", 10]]);
}

function backlog(): ComplexQueryStepResult {
  return completed("backlog", ["Company", "product", "open_shipping_qty", "open_shipping_amount"], [["jctimes", "A", 30, 300], ["jctimes", "B", 10, 100]]);
}

function completed(id: ComplexQueryStepResult["id"], fields: string[], rows: unknown[][]): ComplexQueryStepResult {
  return { id, status: "completed", fields, rows, rowCount: rows.length, truncated: false, warnings: [] };
}

function failed(id: ComplexQueryStepResult["id"]): ComplexQueryStepResult {
  return { id, status: "failed", fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error: "query_failed" };
}

function plan(): AnalysisPlan {
  return {
    route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
    grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
    metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
  };
}
