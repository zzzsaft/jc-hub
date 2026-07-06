import assert from "node:assert/strict";
import test from "node:test";
import { compactSqlTemplateRetrievalEvalReport, evaluateTemplates } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateRetrievalEvalService.js";

test("template retrieval eval covers built-in cases without leaking SQL in compact output", () => {
  const report = evaluateTemplates(TEMPLATES);
  const compact = compactSqlTemplateRetrievalEvalReport(report);

  assert.equal(report.summary.caseCount, 19);
  assert.equal(report.summary.templateCount, 11);
  assert.equal(report.summary.top3Pass, 19);
  assert(report.summary.top1Pass >= 17);
  assert(!JSON.stringify(compact).includes("sql_template"));
  assert(!JSON.stringify(compact).includes("SELECT"));
});

const TEMPLATES = [
  template("family_050", "库存明细查询", "inventory_stock_detail", "inventory", "按物料、仓库、库位、产品群组查询库存明细", ["partNum", "warehouseCode", "partDescription"]),
  template("family_027", "库存查询", "inventory_stock_lookup", "inventory", "按物料、仓库、库位、产品群组查询库存", ["partNum", "warehouseCode", "partDescription"]),
  template("family_089", "库存安全库存查询", "inventory_safety_stock_lookup", "inventory", "查询库存、库位库存和低于安全库存的物料", ["partNum", "warehouseCode", "onlyBelowSafety"]),
  template("family_062", "采购到货跟踪查询", "purchase_receipt_delay_tracking", "purchase", "查询采购未到货、延期到货、供应商和采购员到货跟踪", ["poNum", "vendorName", "dueBeforeDate"]),
  template("family_076", "工单物料需求查询", "job_material_requirement_shortage", "production_inventory", "查询工单物料需求、未发料和缺料明细", ["jobNum", "materialPartNum"]),
  template("family_086", "研发工单物料需求查询", "rd_job_material_requirement_lookup", "production_rnd", "查询研发工单、装配和物料需求", ["jobNum", "materialPartNum"]),
  template("family_092", "报工资源群组查询", "labor_resource_group_lookup", "production_master_data", "查询报工明细使用的资源群组辅助字典", ["resourceGroupId"]),
  template("family_016", "销售订单明细查询", "sales_order_detail", "sales", "查询销售订单、客户订单、产品订单和未关闭订单", ["orderNum", "customerName"]),
  template("family_037", "发货通知明细查询", "sales_shipping_notice_detail", "sales_inventory", "查询发货通知、待发货订单、客户收货信息和库存", ["orderNum", "customerName"]),
  template("family_038", "工序字典查询", "operation_master_lookup", "production_master_data", "查询 OpMaster 工序字典", ["opCode"]),
  template("family_014", "部门班组资源群组查询", "department_resource_group_lookup", "production_master_data", "查询部门、班组、资源群组辅助字典", ["departmentName", "resourceGroupId"]),
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
