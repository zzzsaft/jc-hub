export type ProductMasterDataTermType = "metering_pump_model" | "filter_model";

export interface ProductMasterDataCandidate {
  id?: string | number;
  model?: string;
  name?: string;
  pumpage?: string | number;
  rotateSpeed?: string | number;
  heatingPower?: string | number;
  shearSensitivity?: string | number;
  production?: string | number;
  filterBoard?: string | number;
  dimension?: string;
  weight?: string | number;
  meshDiameter?: string | number;
  effectiveFilterArea?: string | number;
  power?: string | number;
  pressure?: string | number;
  [key: string]: any;
}

export interface ProductMasterDataSearchResponse {
  items?: ProductMasterDataCandidate[];
  results?: ProductMasterDataCandidate[];
  data?: ProductMasterDataCandidate[] | { items?: ProductMasterDataCandidate[]; results?: ProductMasterDataCandidate[] };
  [key: string]: unknown;
}

export interface ProductModelBindingPayload {
  termType: ProductMasterDataTermType;
  rawValue: string;
  fieldName?: string;
  itemIndex?: string | number;
  documentId?: string | number;
  extractionResultId?: string | number;
  sourceTable: "crm_products_pump" | "crm_product_filter";
  masterDataId?: string | number;
  model?: string;
  candidate: ProductMasterDataCandidate;
}
