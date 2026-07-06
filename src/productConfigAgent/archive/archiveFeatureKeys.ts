export const ARCHIVE_FEATURE_KEY_BY_TERM_TYPE: Record<string, string> = {
  product_type: "product_type",
  application: "application",
  plastic_material: "plastic_material",
  product_effective_width: "effective_width_mm",
  die_effective_width: "effective_width_mm",
  effective_width: "effective_width_mm",
  effective_width_mm: "effective_width_mm",
  die_width: "die_width_mm",
  die_width_mm: "die_width_mm",
  product_effective_thickness: "thickness_mm",
  thickness: "thickness_mm",
  thickness_mm: "thickness_mm",
  layer_count: "layer_count",
  heating_zone_count: "heating_zone_count",
  lip_adjustment_method: "lip_adjustment_method",
  deckle_type: "deckle_type",
};

export const TERM_TYPES_BY_ARCHIVE_FEATURE_KEY: Record<string, string[]> = Object.entries(
  ARCHIVE_FEATURE_KEY_BY_TERM_TYPE,
).reduce<Record<string, string[]>>((acc, [termType, featureKey]) => {
  acc[featureKey] = [...(acc[featureKey] ?? []), termType].sort();
  return acc;
}, {});

export function normalizeArchiveFeatureKey(value: unknown): string | null {
  const key = String(value ?? "").trim();
  if (!key) return null;
  return ARCHIVE_FEATURE_KEY_BY_TERM_TYPE[key] ?? key;
}

export function getArchiveFeatureKeysForTermType(termType: unknown): string[] {
  const featureKey = normalizeArchiveFeatureKey(termType);
  return featureKey ? [featureKey] : [];
}

export function getTermTypesForArchiveFeatureKey(featureKey: unknown): string[] {
  const normalized = normalizeArchiveFeatureKey(featureKey);
  if (!normalized) return [];
  return [...(TERM_TYPES_BY_ARCHIVE_FEATURE_KEY[normalized] ?? [normalized])].sort();
}
