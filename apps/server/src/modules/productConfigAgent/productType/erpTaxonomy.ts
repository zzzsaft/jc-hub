const ERP_PRODUCT_GROUP_HINTS: Record<string, string[]> = {
  flat_die: ["0910"],
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

export function expectedErpProductGroups(productFamily: string): string[] {
  return ERP_PRODUCT_GROUP_HINTS[productFamily] ?? [];
}

export function erpProductGroupReference() {
  return Object.entries(ERP_PRODUCT_GROUP_HINTS).flatMap(([productFamily, prodCodes]) =>
    prodCodes.map((prodCode) => ({ product_family: productFamily, expected_erp_prod_code: prodCode })),
  );
}
