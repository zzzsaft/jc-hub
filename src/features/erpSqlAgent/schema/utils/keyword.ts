const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;

/** Normalizes nullable text into a trimmed string or null. */
export function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Splits natural-language text into deduplicated search keywords. */
export function tokenizeSchemaQuery(query: string): string[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const matches = normalizedQuery.match(WORD_PATTERN) ?? [];
  const tokens = matches
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  return [...new Set([normalizedQuery, ...tokens])];
}

/** Escapes SQL LIKE wildcards while preserving the user's keyword text. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Converts Epicor-style boolean text into a boolean value. */
export function parseBoolean(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}
