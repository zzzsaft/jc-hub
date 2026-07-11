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
  executable("purchase.delivery_tracking", ["purchase"], ["family_062"], ["ordered_qty", "received_qty", "open_receipt_qty"], ["purchase_order", "purchase_order_line", "supplier", "material"], ["poNum", "vendorName", "dueDate"]),
  executable("sales.order_detail", ["sales"], ["family_016"], ["order_qty", "order_amount"], ["order", "customer", "material", "product"], ["orderNum", "customerName"]),
  executable("sales.open_shipping", ["sales", "inventory"], ["family_037"], ["open_shipping_qty", "open_shipping_amount"], ["order", "customer", "material"], ["orderNum", "customerName"]),
  executable("inventory.stock_lookup", ["inventory"], ["family_027", "family_050"], ["inventory_on_hand_qty"], ["material", "warehouse", "bin", "product_group"], ["partNum", "warehouseCode", "partDescription"]),
  unsupported("inventory.safety_stock", ["inventory"], ["family_089"], "missing_approved_data_source"),
  executable("production.task_progress", ["production"], ["family_031"], ["operation_progress"], ["job", "operation"], ["jobNum", "date"]),
  executable("job.material_requirement", ["production", "inventory"], ["family_076", "family_086"], ["required_qty", "issued_qty", "shortage_qty"], ["job", "material"], ["jobNum", "materialPartNum"]),
  executable("job.bom_master", ["production"], ["family_006"], ["bom_component_qty"], ["material", "component"], ["partNum"]),
  unsupported("operation.labor_reporting", ["production"], ["family_014", "family_092"], "capability_not_published"),
  unsupported("operation.master_data", ["production"], ["family_038"], "capability_not_published"),
  unsupported("operation.resource_group", ["production"], ["family_014"], "capability_not_published"),
  unsupported("quotation.contract_config", ["quotation"], ["family_008", "family_080"], "missing_approved_data_source"),
  unsupported("finance.cost_margin", ["finance"], ["family_049", "family_053", "family_059", "family_100"], "missing_metric_definition"),
  unsupported("finance.composite_decision", ["finance", "sales", "purchase", "production", "inventory"], ["family_016", "family_027", "family_031", "family_037", "family_049", "family_050", "family_059", "family_062", "family_100"], "missing_dimension_bridge"),
];

const CAPABILITY_BY_CODE = new Map(ERP_SQL_CAPABILITIES.map((item) => [item.code, item]));

export function resolveCapability(code: string): ErpSqlCapabilityDefinition {
  const capability = CAPABILITY_BY_CODE.get(code);
  if (!capability) throw new Error(`Unknown ERP SQL capability: ${code}`);
  return capability;
}
