import assert from "node:assert/strict";
import test from "node:test";
import {
  ComplexQueryResultComposer,
  complexQueryPlanService,
  type ComplexQueryPlan,
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
  assert.deepEqual(result.joinCoverage, [
    { stepId: "inventory", keys: ["Company", "product"], anchorRows: 2, matchedRows: 1, unmatchedRows: 1, coverageRate: 0.5 },
    { stepId: "backlog", keys: ["Company", "product"], anchorRows: 2, matchedRows: 2, unmatchedRows: 0, coverageRate: 1 },
  ]);
  assert.ok(result.warnings.includes("complex_join_unmatched:inventory:1"));
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

test("preserves Q3 numeric growth values when the anchor already supplies growth", () => {
  const result = new ComplexQueryResultComposer().compose(plan(), [
    step("sales_growth", ["Company", "product", "sales_growth_rate"], [["jctimes", "A", "0.5"]]),
    inventory(),
    backlog(),
  ]);
  assert.equal(result.rows[0][2], 0.5);
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
  assert.deepEqual(result.joinCoverage, [
    { stepId: "inventory", keys: ["Company", "product"], anchorRows: 0, matchedRows: 0, unmatchedRows: 0, coverageRate: 0 },
    { stepId: "backlog", keys: ["Company", "product"], anchorRows: 0, matchedRows: 0, unmatchedRows: 0, coverageRate: 0 },
  ]);
});

test("joins customer order and product steps only on shared exact policy keys", () => {
  const result = new ComplexQueryResultComposer().compose(genericPlan(), [
    step("anchor", ["Company", "customer", "order", "product", "amount", "status"], [
      ["EPIC03", "C1", "O1", "P1", 100, "open"],
      ["EPIC03", "C1", "O2", "P2", 200, "closed"],
    ]),
    step("margin", ["Company", "customer", "order", "product", "amount", "margin"], [["EPIC03", "C1", "O1", "P1", 80, 0.2]]),
    step("inventory", ["Company", "product", "status", "qty"], [["EPIC03", "P1", "available", 4]]),
  ]);

  assert.deepEqual(result.fields, ["Company", "customer", "order", "product", "amount", "status", "margin.amount", "margin", "inventory.status", "qty"]);
  assert.deepEqual(result.rows, [
    ["EPIC03", "C1", "O1", "P1", 100, "open", 80, 0.2, "available", 4],
    ["EPIC03", "C1", "O2", "P2", 200, "closed", null, null, null, null],
  ]);
  assert.deepEqual(result.joinCoverage.map(({ stepId, keys, matchedRows }) => ({ stepId, keys, matchedRows })), [
    { stepId: "margin", keys: ["Company", "customer", "order", "product"], matchedRows: 1 },
    { stepId: "inventory", keys: ["Company", "product"], matchedRows: 1 },
  ]);
});

test("preserves anchor rows and nulls when a dependent step is partial or failed", () => {
  const partial = { ...step("margin", ["Company", "customer", "order", "product", "margin"], [["EPIC03", "C1", "O1", "P1", null]]), status: "partial" as const };
  const failed = { ...step("inventory", [], []), status: "failed" as const, error: "query_failed" };
  const result = new ComplexQueryResultComposer().compose(genericPlan(), [
    step("anchor", ["Company", "customer", "order", "product", "amount"], [["EPIC03", "C1", "O1", "P1", 100]]),
    partial,
    failed,
  ]);
  assert.deepEqual(result.rows, [["EPIC03", "C1", "O1", "P1", 100, null]]);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.joinCoverage[1], { stepId: "inventory", keys: [], anchorRows: 1, matchedRows: 0, unmatchedRows: 1, coverageRate: 0 });
});

test("rejects duplicate compound keys in generic dependent results", () => {
  assert.throws(() => new ComplexQueryResultComposer().compose(genericPlan(), [
    step("anchor", ["Company", "customer", "order", "product", "amount"], [["EPIC03", "C1", "O1", "P1", 100]]),
    step("margin", ["Company", "customer", "order", "product", "margin"], [
      ["EPIC03", "C1", "O1", "P1", 0.2], ["EPIC03", "C1", "O1", "P1", 0.3],
    ]),
  ]), /duplicate_join_key:margin/u);
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

function genericPlan(): ComplexQueryPlan {
  return {
    scenario: "diagnostic_finance_composite",
    objective: "test",
    resultLimit: 20,
    entityGrain: ["Company", "customer", "order", "product"],
    steps: [
      { id: "anchor", question: "anchor", capabilityCode: "test", module: "sales", metrics: ["amount"], dimensions: ["customer", "order", "product"], joinKeys: ["Company", "customer", "order", "product"], dependsOn: [], filters: [], orderBy: [], limit: 20 },
      { id: "margin", question: "margin", capabilityCode: "test", module: "finance", metrics: ["margin"], dimensions: ["customer", "order", "product"], joinKeys: ["Company", "customer", "order", "product"], dependsOn: ["anchor"], filters: [], orderBy: [], limit: 20 },
      { id: "inventory", question: "inventory", capabilityCode: "test", module: "inventory", metrics: ["qty"], dimensions: ["product"], joinKeys: ["Company", "product"], dependsOn: ["anchor"], filters: [], orderBy: [], limit: 20 },
    ],
    joinPolicy: { keys: ["Company", "customer", "order", "product"], allowNameBasedJoin: false },
    budget: { maxQueries: 8, maxRowsPerQuery: 500, timeoutMs: 30_000 },
    diagnostic: true,
  };
}

function analysisPlan(): AnalysisPlan {
  return {
    route: "complex_composed", mode: "decision_support", scenario: "product_sales_inventory_backlog_trend",
    grain: ["product"], dimensions: ["product"], filters: [], orderBy: [], timeRange: { kind: "relative", days: 90 },
    metrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
    requiredMetrics: ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"],
  };
}
