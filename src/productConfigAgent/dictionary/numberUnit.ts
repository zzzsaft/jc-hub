export type CachedUnitAlias = {
  id?: string | number | bigint;
  canonicalUnit: string;
  displayUnit?: string | null;
  aliasValue?: string;
};

export type NormalizedNumberUnit = {
  rawValue: string;
  numericText?: string;
  numberKind: "single" | "range" | "none";
  value?: string;
  rangeStart?: string;
  rangeEnd?: string;
  rangeMin?: string;
  rangeMax?: string;
  unitRaw?: string;
  normalizedUnitRaw?: string;
  unitCanonical?: string;
  displayUnit?: string;
  matchedAliasId?: string;
  trailingText?: string;
  trailingFieldName?: string;
  trailingRawValue?: string;
  normalizedValue: string;
  warnings: string[];
};

const NUMBER_PATTERN = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const RANGE_SEPARATOR_PATTERN = String.raw`(?:-|~|～|－|—|–|至|到)`;
const NUMBER_AT_START_PATTERN = new RegExp(String.raw`^\s*(${NUMBER_PATTERN})(.*)$`, "u");
const RANGE_SEPARATOR_AT_START_PATTERN = new RegExp(String.raw`^\s*${RANGE_SEPARATOR_PATTERN}\s*(.*)$`, "u");
const NUMBER_WITH_REST_PATTERN = new RegExp(String.raw`^\s*(${NUMBER_PATTERN})(.*)$`, "u");
const TRAILING_SPLIT_PATTERN = new RegExp(String.raw`^\s*([^0-9.,，;；:：+()（）<>【】\[\]\s]+)\s*(${NUMBER_PATTERN}.*)$`, "u");
const MALFORMED_DECIMAL_TAIL_PATTERN = /^\s*\.\d/;

export function normalizeUnitAliasText(value: unknown): string {
  let normalized = String(value ?? "")
    .trim()
    .replace(/³/g, "3")
    .replace(/²/g, "2")
    .replace(/µ/g, "u")
    .replace(/μ/g, "u")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/／/g, "/")
    .replace(/\s+/g, "")
    .replace(/以内|以下|左右|约|大约|可调/g, "")
    .replace(/\/每小时/g, "/h")
    .replace(/\/小时/g, "/h")
    .replace(/每小时/g, "/h")
    .replace(/\/hr\b/gi, "/h")
    .replace(/\/hour\b/gi, "/h")
    .replace(/\/+/g, "/")
    .toLowerCase();

  if (normalized === "米") normalized = "m";
  if (normalized === "°" || normalized === "°c") normalized = "℃";
  return normalized;
}

export function normalizeNumberUnit(rawValue: unknown, aliasMap: Map<string, CachedUnitAlias> = new Map()): NormalizedNumberUnit {
  const value = String(rawValue ?? "").trim();
  const compact = normalizeNumberUnitPunctuation(value);
  const parsed = parseNumberUnitParts(compact, aliasMap);
  if (!parsed || parsed.malformed) {
    return {
      rawValue: value,
      numberKind: "none",
      normalizedValue: value,
      warnings: ["number_unit_parse_failed"],
    };
  }

  const normalizedUnitRaw = parsed.unitRaw ? normalizeUnitAliasText(parsed.unitRaw) : undefined;
  const alias = normalizedUnitRaw ? aliasMap.get(normalizedUnitRaw) : undefined;
  const unitCanonical = alias?.canonicalUnit;
  const displayUnit = alias?.displayUnit || alias?.canonicalUnit;
  const renderedUnit = displayUnit || parsed.unitRaw;
  const numberKind = parsed.second ? "range" : "single";
  const numericText = parsed.second ? `${parsed.first}-${parsed.second}` : parsed.first;
  const normalizedValue = [numericText, renderedUnit].filter(Boolean).join(" ");
  const result: NormalizedNumberUnit = {
    rawValue: value,
    numericText,
    numberKind,
    unitRaw: parsed.unitRaw || undefined,
    normalizedUnitRaw,
    unitCanonical,
    displayUnit: displayUnit ?? undefined,
    matchedAliasId: alias?.id === undefined ? undefined : String(alias.id),
    trailingText: parsed.trailingText,
    trailingFieldName: parsed.trailingFieldName,
    trailingRawValue: parsed.trailingRawValue,
    normalizedValue,
    warnings: [],
  };

  if (parsed.second) {
    result.rangeStart = parsed.first;
    result.rangeEnd = parsed.second;
    const a = Number(parsed.first);
    const b = Number(parsed.second);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      result.rangeMin = String(Math.min(a, b));
      result.rangeMax = String(Math.max(a, b));
    }
  } else {
    result.value = parsed.first;
  }

  if (parsed.unitRaw && !alias) result.warnings.push("unit_alias_no_match");
  if (!parsed.unitRaw) result.warnings.push("unit_missing");
  if (parsed.trailingText) result.warnings.push("number_unit_trailing_text");
  return result;
}

function normalizeNumberUnitPunctuation(value: string): string {
  return value.replace(/，/g, ",").replace(/（/g, "(").replace(/）/g, ")").replace(/－|—|–/g, "-").trim();
}

function parseNumberUnitParts(
  value: string,
  aliasMap: Map<string, CachedUnitAlias>,
):
  | {
      first: string;
      second?: string;
      unitRaw: string;
      trailingText?: string;
      trailingFieldName?: string;
      trailingRawValue?: string;
      malformed?: boolean;
    }
  | undefined {
  const firstMatch = value.match(NUMBER_AT_START_PATTERN);
  if (!firstMatch) return undefined;

  const first = firstMatch[1];
  let rest = firstMatch[2] ?? "";
  const firstUnit = readUnitToken(rest, aliasMap);
  rest = firstUnit.rest;

  let second: string | undefined;
  let secondUnit = "";
  const rangeMatch = rest.match(RANGE_SEPARATOR_AT_START_PATTERN);
  if (rangeMatch) {
    const secondMatch = (rangeMatch[1] ?? "").match(NUMBER_WITH_REST_PATTERN);
    if (secondMatch) {
      second = secondMatch[1];
      rest = secondMatch[2] ?? "";
      if (MALFORMED_DECIMAL_TAIL_PATTERN.test(rest)) return { first, unitRaw: firstUnit.unitRaw, malformed: true };
      const parsedSecondUnit = readUnitToken(rest, aliasMap);
      secondUnit = parsedSecondUnit.unitRaw;
      rest = parsedSecondUnit.rest;
    }
  }

  if (!second && MALFORMED_DECIMAL_TAIL_PATTERN.test(rest)) return { first, unitRaw: firstUnit.unitRaw, malformed: true };

  const unitRaw = cleanUnitToken(secondUnit || firstUnit.unitRaw);
  const trailingText = stripBoundaryPunctuation(cleanTrailingText(rest));
  const trailingSplit = trailingText.match(TRAILING_SPLIT_PATTERN);
  return {
    first,
    second,
    unitRaw,
    trailingText: trailingText || undefined,
    trailingFieldName: trailingSplit?.[1]?.trim(),
    trailingRawValue: trailingSplit?.[2]?.trim(),
  };
}

function readUnitToken(input: string, aliasMap: Map<string, CachedUnitAlias>): { unitRaw: string; rest: string } {
  const trimmedStart = input.trimStart();
  let index = 0;
  while (index < trimmedStart.length) {
    const char = trimmedStart[index];
    const next = trimmedStart.slice(index);
    if (char === "," || char === ";" || char === "+" || char === "<" || char === "(" || char === "[" || char === "【" || /\s/u.test(char)) {
      break;
    }
    if (RANGE_SEPARATOR_AT_START_PATTERN.test(next)) break;
    if (/\d/u.test(char) && !(index > 0 && (char === "2" || char === "3"))) break;
    index += 1;
  }

  const greedyUnitRaw = trimmedStart.slice(0, index);
  const greedyRest = trimmedStart.slice(index);
  const knownPrefix = findKnownUnitPrefix(greedyUnitRaw, aliasMap);
  if (knownPrefix && knownPrefix.length < greedyUnitRaw.length) {
    const rest = `${greedyUnitRaw.slice(knownPrefix.length)}${greedyRest}`;
    if (shouldSplitKnownUnitPrefix(knownPrefix, rest)) return { unitRaw: knownPrefix, rest };
  }
  return { unitRaw: greedyUnitRaw, rest: greedyRest };
}

function findKnownUnitPrefix(value: string, aliasMap: Map<string, CachedUnitAlias>): string | undefined {
  if (!value || aliasMap.size === 0) return undefined;
  let best: string | undefined;
  for (let length = 1; length <= value.length; length += 1) {
    const prefix = value.slice(0, length);
    if (aliasMap.has(normalizeUnitAliasText(prefix))) best = prefix;
  }
  return best;
}

function shouldSplitKnownUnitPrefix(prefix: string, rest: string): boolean {
  if (!prefix || !rest) return false;
  const first = rest.trimStart()[0];
  return Boolean(first && !/[a-zA-Z]/u.test(first));
}

function stripBoundaryPunctuation(value: string): string {
  return value
    .trim()
    .replace(/^[,;，、。；+<(\s]+/u, "")
    .replace(/[)>，、。；\]\s]+$/u, "")
    .trim();
}

function cleanUnitToken(value: string): string {
  return value
    .trim()
    .replace(/以内|以下|左右|约|大约/g, "")
    .replace(/可调/g, "")
    .replace(/\/每/g, "/")
    .trim();
}

function cleanTrailingText(value: string): string {
  return value
    .trim()
    .replace(/^[,;，；+<(\s]+/u, "")
    .replace(/[)>）】\]\s]+$/u, "")
    .trim();
}
