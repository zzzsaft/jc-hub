import { normalizeAlias } from "../dictionary/matcher.service.js";

export type ProductTypeDefinition = {
  canonicalValue: string;
  displayName?: string | null;
  aliases?: string[];
};

export type ProductTypeResolution = {
  canonicalValue: string;
  displayName: string;
  matchedText: string;
  method: "exact" | "specific_rule" | "contained_alias" | "generic_fallback";
};

export type ProductItemRole = "main_product" | "system" | "component" | "accessory" | "spare_part";

const GENERIC_ALIASES = new Set(["模头", "模具", "设备", "系统", "装置"]);
const SPARE_PATTERN = /备件|易损|备用/;
const ACCESSORY_PATTERN = /附件|配件|另购|小车|工作台|物料架/;
const COMPONENT_PATTERN = /水套|法兰|加热管|加热棒|加热器|适配器|支架|固定板|吊装块|吊架|密封圈|垫片|螺栓|垫圈|油管|多孔板|芯棒|镶套|过渡板|稳流铜片|塞尺|油缸|万向轴|传动轴|泵体|控制柜|电控柜|流量计|调节装置|拉丝板|隔热板|吸风罩|真空罩|摆叶片|胶辊|三辊|流延辊|电机|模唇|侧板|挡条|挡块/;

const SPECIFIC_RULES: Array<[RegExp, string]> = [
  [/GD[\s_-]*E\d+/i, "metering_pump"],
  [/GD[\s_-]*(?:SP|SSP|DP|ACB)[\s_-]*[A-Z]?\d*/i, "filter"],
  [/(?:JTHHQ|GD[\s_-]*SM)/i, "static_mixer"],
  [/吹膜|圆模头|吹膜圆模/, "blown_film_die"],
  [/涂布|涂覆|狭缝涂布/, "coating_die"],
  [/熔喷.*模头|模头.*熔喷|喷丝板|喷丝组件/, "spinneret_plate"],
  [/定型模/, "sizing_die"],
  [/静态混合|螺旋混合/, "static_mixer"],
  [/分配器/, "feedblock"],
  [/合流器/, "manifold"],
  [/换网器|过滤器/, "filter"],
  [/计量泵/, "metering_pump"],
  [/液压站/, "hydraulic_station"],
  [/风刀|气刀/, "air_knife"],
  [/(?:(?:恒|背|备)压|排料|换向|开车)阀/, "valve"],
];

function entries(definitions: ProductTypeDefinition[]) {
  return definitions.flatMap((definition) => [
    definition.canonicalValue,
    definition.displayName,
    ...(definition.aliases ?? []),
  ].filter((value): value is string => Boolean(value?.trim())).map((raw) => ({
    raw: raw.trim(),
    normalized: normalizeAlias(raw),
    definition,
  }))).filter((entry) => entry.normalized.length >= 2)
    .sort((left, right) => right.normalized.length - left.normalized.length);
}

function result(definition: ProductTypeDefinition, matchedText: string, method: ProductTypeResolution["method"]): ProductTypeResolution {
  return {
    canonicalValue: definition.canonicalValue,
    displayName: definition.displayName ?? definition.canonicalValue,
    matchedText,
    method,
  };
}

export function resolveProductType(
  rawValue: unknown,
  definitions: ProductTypeDefinition[],
  options: { allowContainedAlias?: boolean; allowGenericFallback?: boolean } = {},
): ProductTypeResolution | null {
  const value = String(rawValue ?? "").normalize("NFKC").trim();
  const normalized = normalizeAlias(value);
  if (!normalized) return null;
  const catalog = entries(definitions);

  const exact = catalog.find((entry) => entry.normalized === normalized);
  if (exact) return result(exact.definition, exact.raw, "exact");

  for (const [pattern, canonicalValue] of SPECIFIC_RULES) {
    if (!pattern.test(value)) continue;
    const definition = definitions.find((item) => item.canonicalValue === canonicalValue);
    if (definition) return result(definition, pattern.source, "specific_rule");
  }

  if (options.allowContainedAlias !== false) {
    const contained = catalog.find((entry) => !GENERIC_ALIASES.has(entry.raw) && normalized.includes(entry.normalized));
    if (contained) return result(contained.definition, contained.raw, "contained_alias");
  }

  if (options.allowGenericFallback !== false && /模头|模具/.test(value)) {
    const flatDie = definitions.find((item) => item.canonicalValue === "flat_die");
    if (flatDie) return result(flatDie, "模头", "generic_fallback");
  }
  return null;
}

export function classifyProductItemRole(rawValue: unknown, resolution?: ProductTypeResolution | null): ProductItemRole {
  const value = String(rawValue ?? "").normalize("NFKC").trim();
  if (SPARE_PATTERN.test(value)) return "spare_part";
  if (/(?:支架|水套|法兰|加热管|加热棒|适配器|泵体|模唇|垫片|吸风罩|真空罩|小车)(?:\W|\d|套|件|支|根)*$/u.test(value)) {
    return ACCESSORY_PATTERN.test(value) ? "accessory" : "component";
  }
  if (!resolution && COMPONENT_PATTERN.test(value)) return ACCESSORY_PATTERN.test(value) ? "accessory" : "component";
  if (resolution?.canonicalValue.endsWith("_system") || /系统$/.test(value)) return "system";
  return "main_product";
}

export function productTypeDefinitionsFromContext(productTypes: Array<{
  canonical_value: string;
  display_name: string;
  aliases: string[];
}> = []): ProductTypeDefinition[] {
  return productTypes.map((item) => ({
    canonicalValue: item.canonical_value,
    displayName: item.display_name,
    aliases: item.aliases,
  }));
}
