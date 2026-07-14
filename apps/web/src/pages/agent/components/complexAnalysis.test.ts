import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComplexAnalysis } from "./complexAnalysis";

test("normalizes a historical Q3 complex analysis payload for the result drawer", () => {
  const normalized = normalizeComplexAnalysis({
    scenario: "product_sales_inventory_backlog_trend",
    status: "partial",
    steps: [
      { id: "sales_growth", status: "completed", rowCount: 3 },
      { id: "inventory", status: "completed", rowCount: 2 },
      { id: "custom_step", status: "skipped", rowCount: 0 },
    ],
    joinCoverage: { anchorRows: 3, matchedRows: 2, unmatchedRows: 1, coverageRate: 2 / 3 },
  });

  assert.deepEqual(normalized.steps.map(({ label, sqlCount }) => ({ label, sqlCount })), [
    { label: "销售趋势", sqlCount: 0 },
    { label: "库存", sqlCount: 0 },
    { label: "custom_step", sqlCount: 0 },
  ]);
  assert.deepEqual(normalized.joinCoverage, [{
    stepId: "legacy_join",
    keys: ["Company", "product"],
    anchorRows: 3,
    matchedRows: 2,
    unmatchedRows: 1,
    coverageRate: 2 / 3,
  }]);
  assert.deepEqual(normalized.corrections, []);
});

test("preserves the current complex analysis payload", () => {
  const current = {
    scenario: "customer_revenue_margin_risk",
    status: "completed" as const,
    steps: [{ id: "sales_anchor", label: "查询收入", status: "completed" as const, source: "composer" as const, sqlCount: 1, rowCount: 1 }],
    joinCoverage: [],
    corrections: [],
    review: { status: "approved" as const, issues: [] },
  };

  assert.deepEqual(normalizeComplexAnalysis(current), current);
});
