import assert from "node:assert/strict";
import test from "node:test";
import type { ErpSqlAccessScope } from "../../src/modules/erpSqlAgent/access/index.js";
import {
  DiagnosticPlanNormalizer,
  isAllBusinessGatesDiagnosticEnabled,
  qualifiesForAllBusinessGatesDiagnostic,
} from "../../src/modules/erpSqlAgent/diagnostic/index.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

const basePlan: AnalysisPlan = {
  mode: "strict",
  grain: [],
  metrics: ["order_amount", "gross_margin_rate"],
  filters: [],
  dimensions: [],
  orderBy: [],
};

const financeScope: ErpSqlAccessScope = {
  source: "server",
  actorUserId: "diagnostic-test",
  companies: ["EPIC06"],
  modules: ["finance"],
  departments: "*",
  businessUnits: "*",
  customerNumbers: "*",
  sensitive: { finance: "full", customer: "masked", employee: "masked" },
  auditReasons: [],
};

test("diagnostic switch accepts only exact lowercase true", () => {
  const before = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
  try {
    for (const value of [undefined, "false", "1", "TRUE"] as const) {
      if (value === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
      else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = value;
      assert.equal(isAllBusinessGatesDiagnosticEnabled(), false, String(value));
    }
    process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = "true";
    assert.equal(isAllBusinessGatesDiagnosticEnabled(), true);
  } finally {
    if (before === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = before;
  }
});

test("diagnostic qualification requires finance and full finance sensitivity", () => {
  const before = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = "true";
  try {
    assert.equal(qualifiesForAllBusinessGatesDiagnostic(basePlan, financeScope), true);
    assert.equal(qualifiesForAllBusinessGatesDiagnostic(basePlan, { ...financeScope, modules: ["sales"] }), false);
    assert.equal(qualifiesForAllBusinessGatesDiagnostic(basePlan, {
      ...financeScope,
      devFullAccess: true,
      sensitive: { ...financeScope.sensitive, finance: "masked" },
    }), false);
    assert.equal(qualifiesForAllBusinessGatesDiagnostic({ ...basePlan, metrics: ["order_amount"] }, financeScope), false);
    assert.equal(qualifiesForAllBusinessGatesDiagnostic({ ...basePlan, metrics: ["order_amount"], route: "complex_composed" }, financeScope), true);
  } finally {
    if (before === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = before;
  }
});

test("diagnostic plan normalizer restores explicit time ranges", () => {
  const normalizer = new DiagnosticPlanNormalizer();
  const firstHalf = normalizer.normalize("今年上半年高收入低毛利客户", basePlan);
  const recent = normalizer.normalize("最近 3 个月增长最快产品", { ...basePlan, completeMonthCount: 3 });
  const month = normalizer.normalize("看 6 月份的订单", basePlan);

  assert.deepEqual(firstHalf.plan.timeRange, { kind: "current_year_first_half" });
  assert.deepEqual(recent.plan.timeRange, { kind: "relative", days: 90 });
  assert.equal(recent.plan.completeMonthCount, 3);
  assert.deepEqual(month.plan.timeRange, { kind: "month", month: 6 });
  assert(firstHalf.warnings.includes("diagnostic_plan_normalized"));
});

test("diagnostic plan normalizer restores margin threshold and bounded top N idempotently", () => {
  const normalizer = new DiagnosticPlanNormalizer();
  const result = normalizer.normalize("6 月份毛利低于 20% 的订单，前 999 条", {
    ...basePlan,
    filters: [{ metric: "gross_margin_rate", op: "low" }],
  });

  assert.deepEqual(result.plan.timeRange, { kind: "month", month: 6 });
  assert.deepEqual(result.plan.filters, [{ metric: "gross_margin_rate", op: "lt", value: 0.2 }]);
  assert.equal(result.plan.limit, 500);
  assert.deepEqual(result.corrections.map((item) => item.field), ["timeRange", "filters.gross_margin_rate", "limit"]);

  const repeated = normalizer.normalize("6 月份毛利低于 20% 的订单，前 999 条", result.plan);
  assert.equal(repeated.corrections.length, 0);
  assert.deepEqual(repeated.warnings, []);
});

test("diagnostic plan normalizer parses all Top-N digits before clamping", () => {
  const result = new DiagnosticPlanNormalizer().normalize("前 1000 条低毛利订单", basePlan);

  assert.equal(result.plan.limit, 500);
  assert.deepEqual(result.corrections.find((item) => item.field === "limit"), {
    field: "limit",
    before: undefined,
    after: 500,
    sourceText: "前 1000 条",
  });
});
