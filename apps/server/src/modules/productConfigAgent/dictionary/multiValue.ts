const MULTI_VALUE_SEPARATOR = /[、，,;；|／/]+|(?:\s+(?:和|与|及|或)\s+)/u;
const UNIT_RATE_PATTERN = /^(?:kg\/h|g\/10min|ml\/min|m\/min|l\/min|n\/m)$/iu;

export function splitMultiValueText(value: unknown): string[] {
  const text = String(value ?? "").trim();
  if (!text || UNIT_RATE_PATTERN.test(text.replace(/\s+/g, ""))) return text ? [text] : [];
  return [
    ...new Set(
      text
        .split(MULTI_VALUE_SEPARATOR)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function isLikelyMultiValue(value: unknown): boolean {
  return splitMultiValueText(value).length > 1;
}

export function buildMultiValueSplitSuggestion(termType: string, rawValue: string) {
  return splitMultiValueText(rawValue).map((part) => ({
    termType,
    rawValue: part,
    canonicalValue: part,
    confidence: 0.76,
  }));
}
