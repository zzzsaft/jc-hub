const ERP_PRODUCT_GROUP_HINTS: Record<string, string[]> = {
  flat_die: ["0910", "0918"],
  coating_die: ["091031"],
  blown_film_die: ["091020"],
  sizing_die: ["0901"],
  metering_pump: ["0902"],
  filter: ["0903"],
  feedblock: ["0904"],
  hydraulic_station: ["0905"],
  connector: ["0906"],
  melt_pipe: ["0906"],
  static_mixer: ["0907"],
  manifold: ["0908"],
  air_knife: ["0909"],
};

const ERP_PRODUCT_GROUP_INTERPRETATIONS: Record<string, { kind: "product_family" | "manufacturing_intermediate" | "internal_asset" | "repair_service"; productFamily?: string }> = {
  "0910": { kind: "product_family", productFamily: "flat_die" },
  "0918": { kind: "product_family", productFamily: "flat_die" },
  "091031": { kind: "product_family", productFamily: "coating_die" },
  "091020": { kind: "product_family", productFamily: "blown_film_die" },
  "0901": { kind: "product_family", productFamily: "sizing_die" },
  "0902": { kind: "product_family", productFamily: "metering_pump" },
  "0903": { kind: "product_family", productFamily: "filter" },
  "0904": { kind: "product_family", productFamily: "feedblock" },
  "0905": { kind: "product_family", productFamily: "hydraulic_station" },
  "0906": { kind: "product_family", productFamily: "connector" },
  "0907": { kind: "product_family", productFamily: "static_mixer" },
  "0908": { kind: "product_family", productFamily: "manifold" },
  "0909": { kind: "product_family", productFamily: "air_knife" },
  "091001": { kind: "manufacturing_intermediate" },
  "090101": { kind: "manufacturing_intermediate" },
  P504: { kind: "internal_asset" },
  "401": { kind: "repair_service" },
  "403": { kind: "repair_service" },
  "404": { kind: "repair_service" },
  "405": { kind: "repair_service" },
  "406": { kind: "repair_service" },
};

export function expectedErpProductGroups(productFamily: string): string[] {
  return ERP_PRODUCT_GROUP_HINTS[productFamily] ?? [];
}

export function erpProductGroupReference() {
  return Object.entries(ERP_PRODUCT_GROUP_HINTS).flatMap(([productFamily, prodCodes]) =>
    prodCodes.map((prodCode) => ({ product_family: productFamily, expected_erp_prod_code: prodCode })),
  );
}

export function interpretErpProductGroup(prodCode: string) {
  return ERP_PRODUCT_GROUP_INTERPRETATIONS[prodCode] ?? { kind: "unknown" as const };
}
