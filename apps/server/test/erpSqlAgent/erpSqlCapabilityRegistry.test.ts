import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mapRequiredSlotToFilter, parseGoldenCapabilityCase } from "../../src/modules/erpSqlAgent/capabilities/goldenContract.js";
import { capabilityDecisionService } from "../../src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.js";
import { getErpSqlCapabilities, resolveCapability } from "../../src/modules/erpSqlAgent/capabilities/registry.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";

const GOLDEN_FILE = fileURLToPath(new URL("../../src/modules/erpSqlAgent/templates/golden/sqlTemplateGoldenQuestions.json", import.meta.url));

function loadGoldenCases() {
  const value = JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as { cases?: unknown[] };
  assert.ok(Array.isArray(value.cases));
  return value.cases.map(parseGoldenCapabilityCase);
}

test("every golden case declares one capability and expected outcome", () => {
  const cases = loadGoldenCases();
  assert.equal(cases.length, 187);
  for (const item of cases) {
    assert.ok(item.capability);
    assert.match(item.expectedOutcome, /^(execute|clarify|unsupported)$/);
    assert.ok(resolveCapability(item.capability), item.capability);
    assert.ok(Array.isArray(item.requiredMetrics));
    assert.ok(Array.isArray(item.requiredDimensions));
    assert.ok(Array.isArray(item.requiredFilters));
    assert.ok(Array.isArray(item.requiredTimeSemantics));
    assert.ok(Array.isArray(item.allowedTemplateFamilies));
    assert.equal(item.expectedOutcome === "unsupported", item.unsupportedReason !== null);
  }
});

test("quotation capabilities are unsupported until a data source is published", () => {
  const result = resolveCapability("quotation.contract_config");
  assert.equal(result.status, "unsupported");
  assert.equal(result.reasonCode, "missing_approved_data_source");
});

test("composite capability diagnostic bypass is default-off and fail-closed", () => {
  const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  const capability = resolveCapability("finance.composite_decision");
  const plan: AnalysisPlan = {
    mode: "decision_support",
    grain: ["customer"],
    metrics: ["order_amount", "gross_margin_rate"],
    requiredMetrics: ["order_amount", "gross_margin_rate"],
    filters: [],
    dimensions: ["customer"],
    orderBy: [],
  };

  try {
    for (const value of [undefined, "false", "1", "TRUE"]) {
      if (value === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
      else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = value;
      const decision = capabilityDecisionService.decide(plan, capability);
      assert.equal(decision.outcome, "unsupported");
      assert.equal(decision.diagnosticBypass, undefined);
    }

    process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
    const bypassed = capabilityDecisionService.decide(plan, capability);
    assert.equal(bypassed.outcome, "execute");
    assert.equal(bypassed.diagnosticBypass, true);
    assert(bypassed.missingCoverage.includes("metric:order_amount"));
    assert(bypassed.missingCoverage.includes("dimension:customer"));
  } finally {
    if (original === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = original;
  }
});

test("product-category sales YoY publishes only composer-backed coverage", () => {
  const capability = resolveCapability("sales.product_category_yoy");
  assert.equal(capability.status, "executable");
  assert.deepEqual(capability.modules, ["sales"]);
  assert.deepEqual(capability.metrics, ["order_amount"]);
  assert.deepEqual(capability.dimensions, ["product_category"]);
  assert.deepEqual(capability.timeSemantics, ["previous_month", "previous_year_comparison", "current_year"]);
  assert.deepEqual(capability.comparisonKinds, ["year_over_year"]);
  assert.deepEqual(capability.templateFamilies, []);
});

test("legacy required slots are preserved and mapped into required filters", () => {
  const cases = loadGoldenCases();
  for (const item of cases) {
    for (const slot of item.requiredSlots ?? []) {
      const filter = mapRequiredSlotToFilter(slot, item.capability);
      assert(item.requiredFilters.includes(filter), `${item.question}: ${slot} -> ${filter}`);
    }
  }
});

test("ambiguous inventory and BOM questions clarify instead of executing", () => {
  const byQuestion = new Map(loadGoldenCases().map((item) => [item.question, item]));
  assert.equal(byQuestion.get("查某个物料在哪些库位有库存")?.expectedOutcome, "clarify");
  assert.equal(byQuestion.get("查某个物料的子件清单")?.expectedOutcome, "clarify");
  const stockAssessment = byQuestion.get("液压站物料当前库存够不够");
  assert.equal(stockAssessment?.expectedOutcome, "clarify");
  assert(stockAssessment?.requiredMetrics.includes("comparison_baseline"));
});

test("executable golden requirements stay within published capability coverage", () => {
  for (const item of loadGoldenCases().filter((entry) => entry.expectedOutcome === "execute")) {
    const capability = getErpSqlCapabilities({ operationLaborReporting: true, operationMasterData: true })
      .find((entry) => entry.code === item.capability)!;
    assert.equal(capability.status, "executable", item.capability);
    for (const metric of item.requiredMetrics) assert(capability.metrics.includes(metric), `${item.capability} metric ${metric}`);
    for (const dimension of item.requiredDimensions) assert(capability.dimensions.includes(dimension), `${item.capability} dimension ${dimension}`);
    for (const filter of item.requiredFilters) assert(capability.filterSlots.includes(filter), `${item.capability} filter ${filter}`);
    for (const time of item.requiredTimeSemantics) assert(capability.timeSemantics.includes(time), `${item.capability} time ${time}`);
    for (const family of item.allowedTemplateFamilies) assert(capability.templateFamilies.includes(family), `${item.capability} family ${family}`);
  }
});

test("safety stock, operation labor, and finance use narrower capabilities", () => {
  const cases = loadGoldenCases();
  assert(cases.some((item) => item.capability === "inventory.safety_stock"));
  assert(cases.some((item) => item.capability === "operation.labor_reporting"));
  assert(cases.some((item) => item.capability.startsWith("finance.")));
  assert(cases.every((item) => item.capability !== item.businessType));
});

test("verified operation assets require explicit switches while resource master and safety stock stay unsupported", () => {
  assert.equal(resolveCapability("inventory.safety_stock").status, "unsupported");
  assert.equal(resolveCapability("inventory.safety_stock").reasonCode, "missing_approved_data_source");
  assert.equal(resolveCapability("operation.resource_group").reasonCode, "missing_verified_master_data");
  assert.equal(resolveCapability("operation.labor_reporting").reasonCode, "capability_disabled");
  assert.equal(resolveCapability("operation.master_data").reasonCode, "capability_disabled");
  assert.equal(getErpSqlCapabilities({ operationLaborReporting: true }).find((item) => item.code === "operation.labor_reporting")?.status, "executable");
  assert.equal(getErpSqlCapabilities({ operationMasterData: true }).find((item) => item.code === "operation.master_data")?.status, "executable");
});

test("operation publication switches are fail closed unless exactly true", () => {
  const originalLabor = process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED;
  const originalMaster = process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
  try {
    for (const value of [undefined, "false", "1", "TRUE"]) {
      if (value === undefined) delete process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED;
      else process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED = value;
      assert.equal(resolveCapability("operation.labor_reporting").reasonCode, "capability_disabled");
    }
    process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED = "true";
    process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED = "true";
    assert.equal(resolveCapability("operation.labor_reporting").status, "executable");
    assert.equal(resolveCapability("operation.master_data").status, "executable");
  } finally {
    if (originalLabor === undefined) delete process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED;
    else process.env.ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED = originalLabor;
    if (originalMaster === undefined) delete process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED;
    else process.env.ERP_SQL_OPERATION_MASTER_DATA_ENABLED = originalMaster;
  }
});

test("labor execution boundary excludes unbound time, named team, and resource master questions", () => {
  const byQuestion = new Map(loadGoldenCases().map((item) => [item.question, item]));
  assert.equal(byQuestion.get("查工单 J12345 的报工明细")?.expectedOutcome, "execute");
  assert.deepEqual(byQuestion.get("查工单 J12345 的报工明细")?.requiredFilters, ["jobNum"]);
  assert.equal(byQuestion.get("资源组 RG01 的报工信息")?.expectedOutcome, "execute");
  assert.deepEqual(byQuestion.get("资源组 RG01 的报工信息")?.requiredFilters, ["resourceGroupId"]);
  assert.equal(byQuestion.get("查某个资源组今天报工明细")?.expectedOutcome, "unsupported");
  assert.equal(byQuestion.get("查维修组报工明细")?.expectedOutcome, "unsupported");
  assert.equal(byQuestion.get("查有哪些班组和资源群组")?.unsupportedReason, "missing_verified_master_data");
});

test("each business type uses only its allowed capabilities", () => {
  const allowed: Record<string, Set<string>> = {
    purchase_delivery: new Set(["purchase.delivery_tracking"]),
    sales_order_shipping: new Set(["sales.order_detail", "sales.product_category_yoy", "sales.open_shipping"]),
    inventory_material: new Set(["inventory.stock_lookup", "inventory.safety_stock"]),
    production_task_progress: new Set(["production.task_progress"]),
    job_material_bom: new Set(["job.material_requirement", "job.bom_master"]),
    operation_labor: new Set(["operation.labor_reporting", "operation.master_data", "operation.resource_group"]),
    quotation_config: new Set(["quotation.contract_config"]),
    finance_cost_margin: new Set(["finance.cost_margin", "purchase.supplier_amount_summary"]),
    business_decision_composite: new Set(["finance.composite_decision"]),
  };
  for (const item of loadGoldenCases()) {
    assert(allowed[item.businessType]?.has(item.capability), `${item.businessType} cannot use ${item.capability}`);
  }
  assert.equal(Object.keys(allowed).length, 9);
});
