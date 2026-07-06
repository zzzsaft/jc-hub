export type ArchiveSearchQueryNormalization = {
  originalQuery: string;
  tokens: string[];
  normalizedTokens: string[];
  normalizedMaterials: string[];
};

const TOKEN_SPLIT_PATTERN = /[\s,，、/+＋;；:：.。!！?？()（）[\]【】"'“”‘’<>《》|\\]+/u;
const TOKEN_EXTRACT_PATTERN = /\d+(?:\.\d+)?mm|[A-Za-z]+|\d+(?:\.\d+)?|[\u4e00-\u9fff]+/giu;
const MATERIAL_FAMILY_ALIASES = new Map([
  ["PVC", "PVC"],
  ["UPVC", "PVC"],
  ["CPVC", "PVC"],
  ["RPVC", "PVC"],
]);

const COMPOUND_PHRASES: Array<{ phrase: string; parts: string[]; keepPhrase?: boolean }> = [
  { phrase: "波浪板模头", parts: ["波浪板", "模头"], keepPhrase: true },
  { phrase: "模头设备", parts: ["模头"] },
  { phrase: "片材模头", parts: ["片材", "模头"], keepPhrase: true },
  { phrase: "板材模头", parts: ["板材", "模头"], keepPhrase: true },
  { phrase: "涂布模头", parts: ["涂布", "模头"], keepPhrase: true },
];

const BUSINESS_TERMS = [
  "波浪板",
  "模头",
  "片材",
  "板材",
  "涂布",
  "平挤出",
];

export function normalizeArchiveSearchQuery(queryText: string, materials?: string[]): ArchiveSearchQueryNormalization {
  const originalQuery = String(queryText ?? "").trim();
  const rawTokens = [
    ...extractTokens(originalQuery),
    ...compoundPhraseTokens(originalQuery),
    ...normalizeMaterialsInput(materials),
  ];
  const tokens = dedupe(rawTokens.filter(shouldKeepToken));
  const normalizedTokens = dedupe(tokens.flatMap((token) => [token, ...tokenExpansions(token)]).filter(shouldKeepToken));
  const normalizedMaterials = dedupe([
    ...tokens.map(materialFamilyValue).filter((item): item is string => Boolean(item)),
    ...normalizeMaterialsInput(materials).map(materialFamilyValue).filter((item): item is string => Boolean(item)),
  ]);
  return { originalQuery, tokens, normalizedTokens, normalizedMaterials };
}

function extractTokens(queryText: string): string[] {
  const splitTokens = queryText
    .split(TOKEN_SPLIT_PATTERN)
    .flatMap((part) => extractPartTokens(part));
  return splitTokens;
}

function extractPartTokens(part: string): string[] {
  const tokens: string[] = [];
  for (const match of part.matchAll(TOKEN_EXTRACT_PATTERN)) {
    const value = match[0].trim();
    if (!value) continue;
    tokens.push(value);
    const numericMm = value.match(/^(\d+(?:\.\d+)?)mm$/iu);
    if (numericMm) tokens.push(numericMm[1]);
  }
  for (const term of BUSINESS_TERMS) {
    if (part.includes(term)) tokens.push(term);
  }
  return tokens;
}

function compoundPhraseTokens(queryText: string): string[] {
  const tokens: string[] = [];
  for (const rule of COMPOUND_PHRASES) {
    if (!queryText.includes(rule.phrase)) continue;
    if (rule.keepPhrase) tokens.push(rule.phrase);
    tokens.push(...rule.parts);
  }
  return tokens;
}

function normalizeMaterialsInput(materials?: string[]): string[] {
  if (!Array.isArray(materials)) return [];
  return materials.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function tokenExpansions(token: string): string[] {
  const materialFamily = materialFamilyValue(token);
  return materialFamily && materialFamily !== token.toUpperCase() ? [materialFamily] : [];
}

function materialFamilyValue(token: string): string | null {
  return MATERIAL_FAMILY_ALIASES.get(token.trim().toUpperCase()) ?? null;
}

function shouldKeepToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (/^mm$/iu.test(trimmed)) return false;
  if (/[\u4e00-\u9fff]/u.test(trimmed)) return true;
  return trimmed.length >= 2;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = /[A-Za-z]/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
