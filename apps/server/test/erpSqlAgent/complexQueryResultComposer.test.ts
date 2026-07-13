import assert from "node:assert/strict";
import test from "node:test";
import {
  ComplexQueryResultComposer,
  complexQueryPlanService,
  type ComplexQueryStepResult,
} from "../../src/modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

test("joins exact Company and product keys without treating missing values as zero", () => {
  const result = new ComplexQueryResultComposer().compose(plan(), [sales(), inventory(), backlog()]);

  assert.deepEqual(result.fields, [
    "Company", "product", "sales_growth_rate", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount",
  ]);
  assert.deepEqual(result.rows[0], ["jctimes", "A", 0.5, 20, 30, 300]);
  assert.deepEqual(result.rows[1], ["jctimes", "B", null, null, 10, 100]);
  assert.deepEqual(result.joinCoverage, { anchorRows: 2, matchedRows: 1, unmatchedRows: 1, coverageRate: 0.5 });
  assert.equal(result.status, "partial");
});

test("sorts products with calculable highest growth first", () => {
  const result = new ComplexQueryResultComposer().compose(plan(), [
    sales([
      ["jctimes", "A", "2026-05", 100], ["jctimes", "A", "2026-06", 110],
      ["jctimes", "B", "2026-05", 100], ["jctimes", "B", "2026-06", 180],
    ]),
    inventory([["jctimes", "A", 20], ["jctimes", "B", 10]]),
    backlog([["jctimes", "A", 30, 300], ["jctimes", "B", 10, 100]]),
  ]);

  assert.deepEqual(result.rows.map((row) => row[1]), ["B", "A"]);
  assert.equal(result.status, "completed");
});

test("rejects duplicate metric rows at the declared grain", () => {
  const duplicateInventory = inventory([["jctimes", "A", 20], ["jctimes", "A", 30]]);

  assert.throws(
    () => new ComplexQueryResultComposer().compose(plan(), [sales(), duplicateInventory, backlog()]),
    /duplicate_join_key:inventory/u,
  );
});

test("rejects name-only or missing Company keys", () => {
  const invalid = inventory([[null, "A", 20]]);

  assert.throws(
    () => new ComplexQueryResultComposer().compose(plan(), [sales(), invalid, backlog()]),
    /missing_join_key:inventory/u,
  );
});

test("reports zero coverage for an empty anchor set", () => {
  const result = new ComplexQueryResultComposer().compose(plan(), [
    step("sales_growth", ["Company", "product", "sales_growth_rate"], []),
    step("inventory", ["Company", "product", "inventory_on_hand_qty"], []),
    step("backlog", ["Company", "product", "open_shipping_qty", "open_shipping_amount"], []),
  ]);
  assert.deepEqual(result.joinCoverage, { anchorRows: 0, matchedRows: 0, unmatchedRows: 0, coverageRate: 0 });
});

function sales(rows: unknown[][] = [
  ["jctimes", "A", "2026-05", 100], ["jctimes", "A", "2026-06", 150],
  ["jctimes", "B", "2026-06", 50],
]): ComplexQueryStepResult {
  return step("sales_growth", ["Company", "product", "period", "order_amount"], rows);
}

function inventory(rows: unknown[][] = [["jctimes", "A", 20]]): ComplexQueryStepResult {
  return step("inventory", ["Company", "product", "inventory_on_hand_qty"], rows);
}

function backlog(rows: unknown[][] = [["jctimes", "A", 30, 300], ["jctimes", "B", 10, 100]]): ComplexQueryStepResult {
  return step("backlog", ["Company", "product", "open_shipping_qty", "open_shipping_amount"], rows);
}

function step(id: ComplexQueryStepResult["id"], fields: string[], rows: unknown[][]): ComplexQueryStepResult {
  return { id, status: "completed", fields, rows, rowCount: rows.length, truncated: false, warnings: [] };
}

function plan() {
  const built = complexQueryPlanService.build(analysisPlan());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error(built.reason);
  return built.plan;
}

function analysisPlan(): AnalysisPlan {
  return {
    route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
    grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
    metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
  };
}
