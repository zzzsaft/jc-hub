export type PurchaseApplyArea = "总厂" | "澄江" | "";

export type PurchaseApplyFilters = {
  partNum: string;
  partDescription: string;
  jobNum: string;
  createdFrom: string;
  createdTo: string;
  requiredFrom: string;
  requiredTo: string;
  area: PurchaseApplyArea;
  demandOnly: boolean;
  cycleFrom: string;
  cycleTo: string;
  batchArrivalDate: string;
};

export type PurchaseApplyRow = {
  id: string;
  selected: boolean;
  operated: boolean;
  partNum: string;
  partDescription: string;
  needDrawing: boolean;
  smallBatch: boolean;
  requiredQty: number;
  orderQty: number;
  monthlyUsage: number;
  unit: string;
  arrivalDate: string;
  packageSpec: number;
  pieces: number;
  purchaseCycle: number;
  area: Exclude<PurchaseApplyArea, "">;
  stockLevel: string;
  remark: string;
  stockQty: number;
  supplierName: string;
  vendorId: string;
  vendorNum: string;
};

export type PurchaseSourceDetail = {
  id: string;
  partNum: string;
  area: string;
  supplierName: string;
  jobNum: string;
  requiredDate: string;
  requiredQty: number;
  issuedQty: number;
  balanceQty: number;
};

export type PurchasePoDetail = {
  id: string;
  partNum: string;
  area: string;
  applyDate: string;
  requiredDate: string;
  openQty: number;
  supplierName: string;
  poNum: string;
  netSize: string;
};

export type PurchaseInventoryDetail = {
  id: string;
  partNum: string;
  warehouse: string;
  bin: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
};

export type PurchaseApplySearchResult = {
  rows: PurchaseApplyRow[];
  sources: PurchaseSourceDetail[];
  pos: PurchasePoDetail[];
  inventories: PurchaseInventoryDetail[];
};
