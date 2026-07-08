import type { PurchaseApplyFilters } from "./types";

export const DEFAULT_FILTERS: PurchaseApplyFilters = {
  partNum: "",
  partDescription: "",
  jobNum: "",
  createdFrom: "2024-05-01",
  createdTo: "",
  requiredFrom: "2024-05-01",
  requiredTo: "",
  area: "",
  demandOnly: false,
  cycleFrom: "0",
  cycleTo: "120",
  batchArrivalDate: "",
};

export const AREA_OPTIONS = [
  { value: "", label: "全部厂区" },
  { value: "总厂", label: "总厂" },
  { value: "澄江", label: "澄江" },
];

export const STOCK_LEVEL_OPTIONS = ["A", "B", "C", "临采", "安全库存"];
