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
  assert.equal(firstHalf.plan.diagnosticExplicitCoverage?.time, true);
  assert.equal(firstHalf.plan.diagnosticExplicitCoverage?.sorting, false);
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
  assert.deepEqual(result.plan.diagnosticExplicitCoverage, {
    time: true, filters: ["gross_margin_rate:lt"], sorting: false, limit: true,
  });
  assert.deepEqual(result.corrections.map((item) => item.field), ["timeRange", "filters.gross_margin_rate", "limit"]);

  const repeated = normalizer.normalize("6 月份毛利低于 20% 的订单，前 999 条", result.plan);
  assert.equal(repeated.corrections.length, 0);
  assert.deepEqual(repeated.warnings, []);
});

test("diagnostic explicit coverage excludes defaults and qualitative high or low filters", () => {
  const result = new DiagnosticPlanNormalizer().normalize("分析高收入低毛利客户", {
    ...basePlan,
    filters: [{ metric: "order_amount", op: "high" }, { metric: "gross_margin_rate", op: "low" }],
    orderBy: [{ metric: "order_amount", direction: "DESC" }],
    limit: 20,
  });

  assert.deepEqual(result.plan.diagnosticExplicitCoverage, {
    time: false, filters: [], sorting: false, limit: false,
  });
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

test("diagnostic time provenance covers every supported explicit time range", () => {
  const cases: Array<[string, AnalysisPlan["timeRange"]]> = [
    ["今年的订单", { kind: "current_year" }],
    ["本月的订单", { kind: "current_month" }],
    ["上月的订单", { kind: "previous_month" }],
    ["订单同比分析", { kind: "year_over_year" }],
    ["订单与去年比较", { kind: "year_over_year" }],
    ["最近 12 天的订单", { kind: "relative", days: 12 }],
  ];

  for (const [question, timeRange] of cases) {
    const result = new DiagnosticPlanNormalizer().normalize(question, { ...basePlan, timeRange });
    assert.equal(result.plan.diagnosticExplicitCoverage?.time, true, question);
    assert.deepEqual(result.plan.timeRange, timeRange, question);
  }
});

test("diagnostic relative-month provenance matches every explicit planner phrase", () => {
  const cases: Array<[string, number]> = [
    ["近 3 个月的订单", 90],
    ["最近一个季度的订单", 90],
    ["近一季度的订单", 90],
    ["最近一个月的订单", 30],
    ["近 1 个月的订单", 30],
    ["最近半年的订单", 180],
    ["近 6 个月的订单", 180],
  ];

  for (const [question, days] of cases) {
    const result = new DiagnosticPlanNormalizer().normalize(question, basePlan);
    assert.deepEqual(result.plan.timeRange, { kind: "relative", days }, question);
    assert.equal(result.plan.diagnosticExplicitCoverage?.time, true, question);
  }
});

test("diagnostic provenance excludes planner inference-only trend words", () => {
  for (const question of ["逐月分析", "持续下单", "销售趋势", "毛利下降"]) {
    const result = new DiagnosticPlanNormalizer().normalize(question, {
      ...basePlan,
      timeRange: { kind: "relative", days: 180 },
    });
    assert.equal(result.plan.diagnosticExplicitCoverage?.time, false, question);
  }
});
