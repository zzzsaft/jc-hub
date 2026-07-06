import { normalizeAlias } from "./matcher.service.js";

const VALUE_LIKE_FIELD_PATTERN = /(PVC|PET|PP|PE|ABS|PC|双柱|液压|高压|低压|自由发泡|片材|流延膜|板材|薄膜)/iu;
const FIELD_NAME_PATTERN = /(型号|规格|类型|方式|材质|材料|配置|压力|功率|温度|宽度|厚度|备注|说明)/u;

export function isLikelyValueLikeFieldName(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (FIELD_NAME_PATTERN.test(text)) return false;
  return VALUE_LIKE_FIELD_PATTERN.test(text);
}

export function detectValueLikeFieldName(value: unknown, knownValueAliases: string[] = []) {
  const normalized = normalizeAlias(String(value ?? ""));
  const matchedKnownAlias = knownValueAliases
    .map((alias) => normalizeAlias(alias))
    .find((alias) => alias && alias === normalized);
  if (!isLikelyValueLikeFieldName(value) && !matchedKnownAlias) return null;
  return {
    type: "value_like_field_name",
    severity: "warning" as const,
    rawFieldName: String(value ?? "").trim(),
    matchedKnownAlias: matchedKnownAlias ?? null,
    message: "Field name looks like a dictionary value rather than a stable term type",
  };
}
