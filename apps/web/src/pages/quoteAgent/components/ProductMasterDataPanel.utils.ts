import type {
  ProductMasterDataCandidate,
  ProductMasterDataTermType,
} from "../types";

const sourceTable: Record<ProductMasterDataTermType, "crm_products_pump" | "crm_product_filter"> = {
  metering_pump_model: "crm_products_pump",
  filter_model: "crm_product_filter",
};

export function valueOf(source: Record<string, any> | null | undefined, keys: readonly string[]) {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

export function modelOf(source: Record<string, any> | null | undefined) {
  return valueOf(source, ["model", "productModel", "product_model", "matchedModel", "matched_model"]);
}

export function normalizeCandidate(candidate: ProductMasterDataCandidate): ProductMasterDataCandidate {
  return {
    ...candidate,
    model: modelOf(candidate) || candidate.model,
    rotateSpeed: candidate.rotateSpeed ?? candidate.rotate_speed,
    heatingPower: candidate.heatingPower ?? candidate.heating_power,
    shearSensitivity: candidate.shearSensitivity ?? candidate.shear_sensitivity,
    filterBoard: candidate.filterBoard ?? candidate.filter_board,
    meshDiameter: candidate.meshDiameter ?? candidate.mesh_diameter,
    effectiveFilterArea: candidate.effectiveFilterArea ?? candidate.effective_filter_area,
  };
}

export function matchRecord(match: Record<string, any> | null) {
  if (!match) return null;
  const record = match.record || match.data || match.product || match.masterData || match.master_data || match.matchedRecord || match.matched_record || match;
  return normalizeCandidate(record);
}

export function sourceOf(match: Record<string, any> | null, termType: ProductMasterDataTermType) {
  return String(match?.sourceTable || match?.source_table || match?.table || sourceTable[termType]);
}

export function candidateKey(candidate: ProductMasterDataCandidate, index: number) {
  return String(candidate.id ?? candidate.model ?? index);
}
