import type { DictionaryOptions, UnitAlias } from "../quoteAgent/types";

const DICTIONARY_OPTIONS_CACHE_KEY = "quote-agent-dictionary-options-cache-v1";
const UNIT_ALIASES_CACHE_KEY = "quote-agent-unit-aliases-cache-v1";
export const DICTIONARY_OPTIONS_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

type DictionaryOptionsCache = {
  options: DictionaryOptions;
  savedAt: number;
};

type UnitAliasesCache = {
  aliases: UnitAlias[];
  savedAt: number;
};

let memoryCache: DictionaryOptionsCache | null = null;
let unitAliasesMemoryCache: UnitAliasesCache | null = null;

const isDictionaryOptions = (value: unknown): value is DictionaryOptions => {
  const options = value as DictionaryOptions;
  return (
    Array.isArray(options?.termTypes) &&
    Array.isArray(options?.values) &&
    Array.isArray(options?.productTypes)
  );
};

export function readDictionaryOptionsCache(): DictionaryOptionsCache | null {
  if (memoryCache) return memoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DICTIONARY_OPTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DictionaryOptionsCache;
    if (!isDictionaryOptions(parsed?.options) || typeof parsed.savedAt !== "number") return null;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function isDictionaryOptionsCacheFresh(cache: DictionaryOptionsCache | null) {
  return Boolean(cache && Date.now() - cache.savedAt < DICTIONARY_OPTIONS_CACHE_MAX_AGE_MS);
}

export function writeDictionaryOptionsCache(options: DictionaryOptions) {
  const cache = { options, savedAt: Date.now() };
  memoryCache = cache;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DICTIONARY_OPTIONS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage can be unavailable or full; memory cache still covers this session.
  }
}

export function readUnitAliasesCache(): UnitAliasesCache | null {
  if (unitAliasesMemoryCache) return unitAliasesMemoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UNIT_ALIASES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnitAliasesCache;
    if (!Array.isArray(parsed?.aliases) || typeof parsed.savedAt !== "number") return null;
    unitAliasesMemoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function isUnitAliasesCacheFresh(cache: UnitAliasesCache | null) {
  return Boolean(cache && Date.now() - cache.savedAt < DICTIONARY_OPTIONS_CACHE_MAX_AGE_MS);
}

export function writeUnitAliasesCache(aliases: UnitAlias[]) {
  const cache = { aliases, savedAt: Date.now() };
  unitAliasesMemoryCache = cache;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UNIT_ALIASES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage can be unavailable or full; memory cache still covers this session.
  }
}
