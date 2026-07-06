import type { QueryPlanScenario } from "../types/SqlPlannerTypes.js";

export const SCENARIO_TABLES: Record<QueryPlanScenario, string[]> = {
  purchaseSpendByType: ["POHeader", "PODetail", "Part", "PartClass"],
  purchaseDelayVendor: ["POHeader", "PODetail", "PORel", "Vendor"],
  purchaseDetail: ["POHeader", "PODetail"],
  openJob: ["JobHead"],
  inventoryBalance: ["PartWhse"],
  recentInventoryTran: ["Part", "PartTran"],
  salesBackorder: ["OrderHed", "OrderDtl", "OrderRel"],
  generic: [],
};

export const SCENARIO_DATE_FIELDS: Partial<Record<QueryPlanScenario, string>> = {
  purchaseSpendByType: "poh.OrderDate",
  purchaseDelayVendor: "por.DueDate",
  recentInventoryTran: "pt.TranDate",
  salesBackorder: "orh.ReqDate",
};
