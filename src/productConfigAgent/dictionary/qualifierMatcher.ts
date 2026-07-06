export type QualifierMatch = {
  qualifier: string;
  normalizedQualifier: string;
  baseText: string;
  confidence: number;
};

export type StripQualifierResult = {
  rawQualifier: string;
  normalizedQualifier: string;
  strippedValue: string;
};

const QUALIFIER_PATTERNS = [
  /(上模|下模|左侧|右侧|前段|后段|入口|出口|内层|外层)/u,
  /(第[一二三四五六七八九十0-9]+(?:层|段|套)|[0-9]+#)/u,
];

export function matchQualifierText(value: unknown): QualifierMatch | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  for (const pattern of QUALIFIER_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const qualifier = match[1];
    const baseText = text.replace(qualifier, "").trim();
    return {
      qualifier,
      normalizedQualifier: normalizeQualifier(qualifier),
      baseText,
      confidence: baseText ? 0.82 : 0.68,
    };
  }
  return null;
}

export function stripQualifier(value: unknown): StripQualifierResult | null {
  const match = matchQualifierText(value);
  if (!match?.baseText) return null;
  return {
    rawQualifier: match.qualifier,
    normalizedQualifier: match.normalizedQualifier,
    strippedValue: match.baseText,
  };
}

export function normalizeQualifier(value: string): string {
  return value
    .trim()
    .replace(/^第([0-9]+)(层|段|套)$/u, "$1$2")
    .replace(/左侧/u, "left")
    .replace(/右侧/u, "right")
    .replace(/入口/u, "inlet")
    .replace(/出口/u, "outlet")
    .replace(/上模/u, "upper_die")
    .replace(/下模/u, "lower_die");
}
