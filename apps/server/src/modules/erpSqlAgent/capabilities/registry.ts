import type { ErpSqlCapabilityDefinition } from "./types.js";

const executable = (
  code: string,
  modules: string[],
  templateFamilies: string[],
  metrics: string[],
  dimensions: string[],
  filterSlots: string[],
): ErpSqlCapabilityDefinition => ({
  code,
  status: "executable",
  modules,
  metrics,
  dimensions,
  filterSlots,
  timeSemantics: ["current", "today", "current_week", "current_month", "previous_month", "current_year", "date_range", "relative_window", "calendar_month", "previous_year_comparison"],
  comparisonKinds: ["year_over_year", "month_over_month"],
  templateFamilies,
});

const unsupported = (
  code: string,
  modules: string[],
  templateFamilies: string[],
  reasonCode: string,
): ErpSqlCapabilityDefinition => ({
  code,
  status: "unsupported",
  modules,
  metrics: [],
  dimensions: [],
  filterSlots: [],
  timeSemantics: [],
  comparisonKinds: [],
  templateFamilies,
  reasonCode,
});

export const ERP_SQL_CAPABILITIES: readonly ErpSqlCapabilityDefinition[] = [
  executable("purchase.delivery_tracking", ["purchase"], ["family_062"], ["ordered_qty", "received_qty", "open_receipt_qty"], ["purchase_order", "purchase_order_line", "supplier", "material"], ["poNum", "vendorName", "dueDate", "dueBeforeDate"]),
  {
    code: "purchase.supplier_amount_summary",
    status: "executable",
    modules: ["purchase"],
    metrics: ["purchase_amount"],
    dimensions: ["supplier", "product", "order"],
    filterSlots: ["vendorName"],
    timeSemantics: ["current_month", "previous_month", "current_year", "date_range", "relative_window", "calendar_month", "previous_year_comparison"],
    comparisonKinds: ["year_over_year", "month_over_month"],
    templateFamilies: [],
    requiredPlanSlots: ["timeRange"],
  },
  executable("sales.order_detail", ["sales"], ["family_016"], ["order_qty", "order_amount"], ["order", "customer", "material", "product"], ["orderNum", "customerName"]),
  {
    code: "sales.product_category_yoy",
    status: "executable",
    modules: ["sales"],
    metrics: ["order_amount"],
    dimensions: ["product_category"],
    filterSlots: [],
    timeSemantics: ["previous_month", "previous_year_comparison", "current_year"],
    comparisonKinds: ["year_over_year"],
    templateFamilies: [],
  },
  executable("sales.open_shipping", ["sales", "inventory"], ["family_037"], ["open_shipping_qty", "open_shipping_amount"], ["order", "customer", "material"], ["orderNum", "customerName"]),
  executable("inventory.stock_lookup", ["inventory"], ["family_027", "family_050"], ["inventory_on_hand_qty"], ["material", "warehouse", "bin", "product_group"], ["partNum", "warehouseCode", "partDescription"]),
  executable("complex.product_sales_inventory_backlog", ["sales", "inventory"], ["family_100", "family_027", "family_050", "family_037"], ["order_amount", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"], ["product"], ["partNum"]),
  executable("complex.sales_growth", ["sales"], ["family_100"], ["order_amount"], ["product"], ["partNum"]),
  executable("complex.inventory_by_product", ["inventory"], ["family_027", "family_050"], ["inventory_on_hand_qty"], ["product"], ["partNum"]),
  executable("complex.backlog_by_product", ["sales"], ["family_037"], ["open_shipping_qty", "open_shipping_amount"], ["product"], ["partNum"]),
  unsupported("inventory.safety_stock", ["inventory"], ["family_089"], "missing_approved_data_source"),
  executable("production.task_progress", ["production"], ["family_031"], ["operation_progress"], ["job", "operation"], ["jobNum", "date"]),
  executable("job.material_requirement", ["production", "inventory"], ["family_076", "family_086"], ["required_qty", "issued_qty", "shortage_qty"], ["job", "material"], ["jobNum", "materialPartNum"]),
  executable("job.bom_master", ["production"], ["family_006"], ["bom_component_qty"], ["material", "component"], ["partNum"]),
  executable("operation.labor_reporting", ["production"], ["family_092"], ["labor_hours", "labor_qty"], ["job", "resource_group"], ["jobNum", "employeeNum", "resourceGroupId", "departmentName", "fromDate", "dueBeforeDate"]),
  executable("operation.master_data", ["production"], ["family_038"], [], [], ["opCode", "opDescription"]),
  unsupported("operation.resource_group", ["production"], ["family_014"], "missing_verified_master_data"),
  unsupported("quotation.contract_config", ["quotation"], ["family_008", "family_080"], "missing_approved_data_source"),
  unsupported("finance.cost_margin", ["finance"], ["family_049", "family_053", "family_059", "family_100"], "missing_metric_definition"),
  unsupported("finance.composite_decision", ["finance", "sales", "purchase", "production", "inventory"], ["family_016", "family_027", "family_031", "family_037", "family_049", "family_050", "family_059", "family_062", "family_100"], "missing_dimension_bridge"),
];

const ERP_SQL_CAPABILITY_VOCABULARY = [
  "erp", "sql", "t-sql", "报表", "finereport", "数据表",
  "采购", "采购订单", "purchase", "供应商", "vendor", "收货",
  "库存", "inventory", "入库", "出库", "物料", "料号",
  "销售", "销售订单", "客户订单", "sales order", "customer order", "客户", "订单", "欠交", "出货", "发货",
  "工单", "生产订单", "job", "生产任务", "生产进度", "工序", "生产工序", "未完工工序", "工序进度",
  "报工", "员工报工", "资源群组", "资源组", "班组", "加工中心", "opmaster", "工序代码", "工序字典", "工序主数据",
  "应收", "应付", "收入", "成本", "毛利", "回款", "付款", "发票", "财务", "费用", "余额", "事业部", "车间",
  "合同", "合同号", "购销合同", "产品报价",
] as const;

export function matchesErpSqlCapabilityVocabulary(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return ERP_SQL_CAPABILITY_VOCABULARY.some((term) => normalized.includes(term));
}

export function resolveCapability(code: string): ErpSqlCapabilityDefinition {
  const capability = getErpSqlCapabilities().find((item) => item.code === code);
  if (!capability) throw new Error(`Unknown ERP SQL capability: ${code}`);
  return capability;
}

export function getErpSqlCapabilities(overrides: {
  operationLaborReporting?: boolean;
  operationMasterData?: boolean;
} = {}): readonly ErpSqlCapabilityDefinition[] {
  const enabled = new Set([
    ...(isEnabled(overrides.operationLaborReporting, "ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED") ? ["operation.labor_reporting"] : []),
    ...(isEnabled(overrides.operationMasterData, "ERP_SQL_OPERATION_MASTER_DATA_ENABLED") ? ["operation.master_data"] : []),
  ]);
  return ERP_SQL_CAPABILITIES.map((capability) =>
    ["operation.labor_reporting", "operation.master_data"].includes(capability.code) && !enabled.has(capability.code)
      ? { ...capability, status: "unsupported" as const, reasonCode: "capability_disabled" }
      : capability,
  );
}

function isEnabled(override: boolean | undefined, envName: string): boolean {
  return override ?? process.env[envName] === "true";
}
