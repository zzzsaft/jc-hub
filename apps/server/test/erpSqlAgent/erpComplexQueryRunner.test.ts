import assert from "node:assert/strict";
import test from "node:test";
import { complexStepStatus, runErpComplexQuery } from "../../src/ai/mastra/workflows/erpComplexQueryRunner.js";
import type { ComplexQueryStepResult } from "../../src/modules/erpSqlAgent/complexQuery/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

test("runs the supported scenario as three narrow analysis plans", async () => {
  const metricGroups: string[][] = [];
  const result = await runErpComplexQuery({
    question: "最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？",
    analysisPlan: plan(),
    executeStep: async ({ step, analysisPlan }) => {
      metricGroups.push(analysisPlan.metrics);
      if (step.id === "sales_growth") {
        assert.equal(analysisPlan.calculation, "sales_growth");
        assert.equal(analysisPlan.completeMonthCount, 3);
        assert.deepEqual(analysisPlan.dimensionFilters, { product: "A" });
        return sales();
      }
      assert.deepEqual(analysisPlan.joinKeyFilterTuples, [{ Company: "jctimes", product: "A" }, { Company: "other", product: "A" }]);
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
  assert.equal(result.composed.joinCoverage.coverageRate, 0.5);
});

test("estimate semantics make a completed step partial", () => {
  assert.equal(complexStepStatus({ valid: true, executed: true, truncated: false }, "estimate"), "partial");
  assert.equal(complexStepStatus({ valid: true, executed: true, truncated: false }, "exact"), "completed");
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

test("narrows finance steps and adds only shared exact upstream keys", async () => {
  const narrowed = new Map<string, AnalysisPlan>();
  const result = await runErpComplexQuery({
    question: "哪些客户订单金额大但回款慢，同时毛利也偏低？",
    analysisPlan: financePlan(),
    executeStep: async ({ step, analysisPlan }) => {
      narrowed.set(step.id, analysisPlan);
      if (step.id === "sales_anchor") {
        return completed(step.id, ["Company", "customer", "order", "display_name"], [
          ["EPIC03", "C001", 1001, "客户甲"],
          ["EPIC04", "C002", 1002, "客户乙"],
        ]);
      }
      return failed(step.id);
    },
  });

  assert.equal(result.ok, false); // generic composition is introduced by Task 4
  const margin = narrowed.get("margin");
  assert.deepEqual(margin?.metrics, ["gross_margin_rate"]);
  assert.deepEqual(margin?.dimensions, ["customer", "order"]);
  assert.deepEqual(margin?.filters, [{ metric: "gross_margin_rate", op: "lt", value: 0.2 }]);
  assert.deepEqual(margin?.timeRange, { kind: "current_year_first_half" });
  assert.deepEqual(margin?.joinKeyFilterTuples, [
    { Company: "EPIC03", customer: "C001", order: "1001" },
    { Company: "EPIC04", customer: "C002", order: "1002" },
  ]);
  assert.equal(margin?.dimensionFilterSets, undefined);
  assert.deepEqual(narrowed.get("collection")?.joinKeyFilterTuples, margin?.joinKeyFilterTuples);
});

test("skips every finance dependent step when its exact anchor fails", async () => {
  const result = await runErpComplexQuery({
    question: "finance",
    analysisPlan: financePlan(),
    executeStep: async ({ step }) => step.id === "sales_anchor" ? failed(step.id) : completed(step.id, [], []),
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "complex_query_failed",
    graph: {
      status: "failed",
      steps: [
        failed("sales_anchor"),
        { ...failed("margin"), status: "skipped", error: "dependency_failed:sales_anchor" },
        { ...failed("collection"), status: "skipped", error: "dependency_failed:sales_anchor" },
      ],
    },
  });
});

test("does not weaken a compound anchor when one shared key is missing", async () => {
  const calls: string[] = [];
  await runErpComplexQuery({
    question: "finance",
    analysisPlan: financePlan(),
    executeStep: async ({ step }) => {
      calls.push(step.id);
      return step.id === "sales_anchor"
        ? completed(step.id, ["Company", "customer"], [["EPIC03", "C001"]])
        : completed(step.id, [], []);
    },
  });

  assert.deepEqual(calls, ["sales_anchor"]);
});

function sales(): ComplexQueryStepResult {
  return completed("sales_growth", ["Company", "product", "sales_growth_rate"], [
    ["jctimes", "A", 0.5], ["other", "A", 0.4],
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
    dimensionFilters: { product: "A" },
  };
}

function financePlan(): AnalysisPlan {
  return {
    route: "complex_composed", mode: "decision_support", scenario: "diagnostic_finance_composite",
    grain: ["customer", "order"], dimensions: ["customer", "order"],
    metrics: ["order_amount", "gross_margin_rate", "collection_delay_days", "collection_overdue_amount"],
    requiredMetrics: ["order_amount", "gross_margin_rate", "collection_delay_days", "collection_overdue_amount"],
    filters: [
      { metric: "order_amount", op: "rank_high" },
      { metric: "gross_margin_rate", op: "lt", value: 0.2 },
      { metric: "collection_delay_days", op: "high" },
    ],
    orderBy: [{ metric: "order_amount", direction: "DESC" }],
    timeRange: { kind: "current_year_first_half" }, assumptions: ["诊断用途"], limit: 20,
  };
}
