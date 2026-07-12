import assert from "node:assert/strict";
import test from "node:test";
import { buildGoldenCapabilityReport } from "../../src/modules/erpSqlAgent/scripts/buildGoldenCapabilityReport.js";
import { normalizeHttpAcceptanceConcurrency, runGoldenHttpAcceptance, substituteGoldenPlaceholders, validatePlaceholderCompleteness } from "../../src/modules/erpSqlAgent/scripts/runGoldenHttpAcceptance.js";
import { compactSqlTemplateRetrievalEvalReport, evaluateTemplates, loadSqlTemplateGoldenQuestions } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateRetrievalEvalService.js";

test("golden capability report rejects an executed table missing a required filter", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.question === "订单 10086 的待发货情况");
  assert(contract);

  const report = buildGoldenCapabilityReport([{ contract, result: {
    success: true,
    outcome: "execute",
    capabilityCode: contract.capability,
    traceId: "trace-missing-order",
    scope: {
      capability: contract.capability,
      metrics: contract.requiredMetrics,
      dimensions: contract.requiredDimensions,
      filters: {},
      templateCoverage: contract.allowedTemplateFamilies,
    },
  } }]);

  assert.equal(report.counts.semantic_fail, 1);
  assert.deepEqual(report.failures.map((item) => item.traceId), ["trace-missing-order"]);
});

test("golden capability report accepts a declared structured unsupported outcome", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.expectedOutcome === "unsupported" && item.requiredFilters.length === 0);
  assert(contract?.unsupportedReason);

  const report = buildGoldenCapabilityReport([{ contract, result: {
    success: false,
    outcome: "unsupported",
    capabilityCode: contract.capability,
    reasonCode: contract.unsupportedReason,
    traceId: "trace-unsupported",
  } }]);

  assert.equal(report.counts.unsupported_pass, 1);
  assert.deepEqual(report.unsupportedReasons, { [contract.unsupportedReason]: 1 });
});

test("golden capability report requires outcome, capability and trace for every pass", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.expectedOutcome === "clarify");
  assert(contract);
  const base = { success: false, outcome: "clarify" as const, capabilityCode: contract.capability, traceId: "trace-clarify" };
  assert.equal(buildGoldenCapabilityReport([{ contract, result: { ...base, outcome: undefined } }]).counts.routing_fail, 1);
  assert.equal(buildGoldenCapabilityReport([{ contract, result: { ...base, capabilityCode: undefined } }]).counts.routing_fail, 1);
  assert.equal(buildGoldenCapabilityReport([{ contract, result: { ...base, traceId: undefined } }]).counts.transport_fail, 1);
});

test("golden capability report prioritizes routing mismatch before guard failure", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.expectedOutcome === "execute");
  assert(contract);
  const report = buildGoldenCapabilityReport([{ contract, result: {
    success: false,
    outcome: "clarify",
    capabilityCode: contract.capability,
    traceId: "trace-wrong-route",
    guardErrors: ["blocked"],
  } }]);
  assert.equal(report.counts.routing_fail, 1);
});

test("golden capability report accepts composer execution without template coverage", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.question === "订单 10086 的待发货情况");
  assert(contract);
  const report = buildGoldenCapabilityReport([{ contract, result: {
    success: true,
    outcome: "execute",
    capabilityCode: contract.capability,
    traceId: "trace-composer",
    executionPath: "composer",
    scope: {
      capability: contract.capability,
      metrics: contract.requiredMetrics,
      dimensions: contract.requiredDimensions,
      filters: { order: "226867" },
      templateCoverage: [],
    },
  } }]);
  assert.equal(report.counts.execute_pass, 1);
});

test("golden capability report rejects template execution without its family evidence", () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.question === "查供应商某某还有哪些采购单没到货");
  assert(contract);
  const report = buildGoldenCapabilityReport([{ contract, result: {
    success: true,
    outcome: "execute",
    capabilityCode: contract.capability,
    traceId: "trace-template",
    executionPath: "template",
    scope: {
      capability: contract.capability,
      metrics: contract.requiredMetrics,
      dimensions: contract.requiredDimensions,
      filters: { supplier: "供应商甲" },
      templateCoverage: [],
    },
  } }]);
  assert.equal(report.counts.semantic_fail, 1);
});

test("HTTP golden acceptance caps pages and substitutes discovered entities", () => {
  assert.equal(normalizeHttpAcceptanceConcurrency(undefined), 2);
  assert.equal(normalizeHttpAcceptanceConcurrency(99), 4);
  assert.equal(substituteGoldenPlaceholders("订单 10086 和工单 J12345", { orderNum: "226867", jobNum: "J900" }), "订单 226867 和工单 J900");
});

test("HTTP golden acceptance rejects missing vendor discovery and residual dummy values", () => {
  const supplierContract = loadSqlTemplateGoldenQuestions().find((item) => item.question === "查供应商某某还有哪些采购单没到货");
  const jobContract = loadSqlTemplateGoldenQuestions().find((item) => item.question.includes("工单 88888"));
  assert(supplierContract && jobContract);
  assert(validatePlaceholderCompleteness([supplierContract], {}).includes("missing discovery: vendorName"));
  assert(validatePlaceholderCompleteness([jobContract], {}).some((error) => error.includes("88888")));
});

test("HTTP golden acceptance consumes the page SSE contract and polls health", async () => {
  const contract = loadSqlTemplateGoldenQuestions().find((item) => item.expectedOutcome === "unsupported" && item.requiredFilters.length === 0);
  assert(contract?.unsupportedReason);
  let healthCalls = 0;
  const fetchFn: typeof fetch = async (input) => {
    if (String(input).endsWith("/health")) {
      healthCalls += 1;
      return new Response('{"ok":true}', { status: 200 });
    }
    const result = {
      success: false,
      outcome: "unsupported",
      capabilityCode: contract.capability,
      reasonCode: contract.unsupportedReason,
      traceId: "trace-http",
      fields: [],
      rows: [],
    };
    return new Response(`event: complete\ndata: ${JSON.stringify({ artifacts: { erpSqlResult: result } })}\n\n`, { status: 200 });
  };

  const acceptance = await runGoldenHttpAcceptance({ baseUrl: "http://localhost:3000", cases: [contract], fetchFn });
  assert.equal(acceptance.transport, "http_sse");
  assert.equal(acceptance.report.counts.unsupported_pass, 1);
  assert(healthCalls >= 2);
});

test("template retrieval eval covers built-in cases without leaking SQL in compact output", () => {
  const report = evaluateTemplates(TEMPLATES);
  const compact = compactSqlTemplateRetrievalEvalReport(report);
  const financeCases = report.cases.filter((item) => item.businessType === "finance_cost_margin");
  const financeTop1Pass = financeCases.filter((item) => item.top1Pass).length;
  const financeTop1Min = Math.max(16, Math.ceil(financeCases.length * 0.8));

  assert(report.summary.caseCount >= 160);
  assert.equal(report.summary.templateCount, 19);
  assert.equal(report.summary.top3Pass, report.summary.caseCount);
  assert.equal(report.summary.top1Pass, report.summary.caseCount);
  assert(financeTop1Pass >= financeTop1Min);
  assert(financeCases.length >= 20);
  assert(!JSON.stringify(compact).includes("sql_template"));
  assert(!JSON.stringify(compact).includes("SELECT"));
});

test("template retrieval golden questions cover business types", () => {
  const cases = loadSqlTemplateGoldenQuestions();
  const counts = new Map<string, number>();
  for (const item of cases) {
    assert(item.businessType);
    assert(item.question);
    assert(item.expectedFamilyIds.length > 0);
    counts.set(item.businessType, (counts.get(item.businessType) ?? 0) + 1);
  }

  assert.deepEqual([...counts.keys()].sort(), [
    "business_decision_composite",
    "finance_cost_margin",
    "inventory_material",
    "job_material_bom",
    "operation_labor",
    "production_task_progress",
    "purchase_delivery",
    "quotation_config",
    "sales_order_shipping",
  ]);
  for (const count of counts.values()) assert(count >= 20);
});

const TEMPLATES = [
  template("family_050", "库存明细查询", "inventory_stock_detail", "inventory", "按物料、仓库、库位、产品群组查询库存明细", ["partNum", "warehouseCode", "partDescription"]),
  template("family_027", "库存查询", "inventory_stock_lookup", "inventory", "按物料、仓库、库位、产品群组查询库存", ["partNum", "warehouseCode", "partDescription"]),
  template("family_089", "库存安全库存查询", "inventory_safety_stock_lookup", "inventory", "查询库存、库位库存和低于安全库存的物料", ["partNum", "warehouseCode", "onlyBelowSafety"]),
  template("family_062", "采购到货跟踪查询", "purchase_receipt_delay_tracking", "purchase", "查询采购未到货、延期到货、供应商和采购员到货跟踪", ["poNum", "vendorName", "dueBeforeDate"]),
  template("family_076", "工单物料需求查询", "job_material_requirement_shortage", "production_inventory", "查询工单物料需求、未发料和缺料明细", ["jobNum", "materialPartNum"]),
  template("family_086", "研发工单物料需求查询", "rd_job_material_requirement_lookup", "production_rnd", "查询研发工单、装配和物料需求", ["jobNum", "materialPartNum"]),
  template("family_092", "报工资源群组查询", "labor_resource_group_lookup", "production_master_data", "查询报工明细使用的资源群组辅助字典", ["resourceGroupId"]),
  template("family_031", "工单工序进度查询", "job_operation_progress", "production", "查询工单工序进度、完工进度和当前工序", ["jobNum"]),
  template("family_016", "销售订单明细查询", "sales_order_detail", "sales", "查询销售订单、客户订单、产品订单和未关闭订单", ["orderNum", "customerName"]),
  template("family_037", "发货通知明细查询", "sales_shipping_notice_detail", "sales_inventory", "查询发货通知、待发货订单、客户收货信息和库存", ["orderNum", "customerName"]),
  template("family_038", "工序字典查询", "operation_master_lookup", "production_master_data", "查询 OpMaster 工序字典", ["opCode"]),
  template("family_014", "部门班组资源群组查询", "department_resource_group_lookup", "production_master_data", "查询部门、班组、资源群组辅助字典", ["departmentName", "resourceGroupId"]),
  template("family_006", "BOM / ECO物料明细查询", "bom_eco_material_detail", "engineering", "查询 BOM、ECO、子件和物料清单明细", ["partNum"]),
  template("family_008", "产品报价明细查询", "quotation_product_detail", "quotation", "查询产品报价、产品购销合同和合同号", ["ContractNo"]),
  template("family_080", "产品配置合同号查询", "quotation_config_lookup", "quotation", "查询产品配置、购销合同和合同号", ["ContractNo"]),
  template("family_049", "财务采购金额查询", "purchase_finance_metric", "purchase", "查询财务采购管理、采购中心管理看板和采购金额", ["vendorName"]),
  template("family_053", "费用统计和供应商余额查询", "finance_expense_vendor_balance", "finance", "查询费用统计、财务费用和供应商余额", ["vendorName"]),
  template("family_059", "成本数据查询", "finance_cost_metric", "finance", "查询成本数据、料费、加工费和成本明细", ["jobNum", "orderNum"]),
  template("family_100", "客户订单毛利查询", "finance_order_margin_metric", "finance", "查询客户订单低毛利、销售金额、成本和毛利", ["orderNum", "customerName"]),
];

function template(familyId: string, name: string, intent: string, module: string, questionPattern: string, optionalParams: string[]) {
  return {
    id: 1n,
    familyId,
    name,
    intent,
    module,
    questionPattern,
    normalizedQuestion: name,
    optionalParams: Object.fromEntries(optionalParams.map((param) => [param, { required: false }])),
  };
}
