import { prisma } from "../../lib/prisma.js";

export type DictionaryValueKind =
  | "enum"
  | "enums"
  | "number"
  | "number_unit"
  | "text"
  | "boolean"
  | "date"
  | "number_or_boolean";

export type LlmDictionaryContext = {
  product_types?: Array<{
    canonical_value: string;
    display_name: string;
    description?: string | null;
    aliases: string[];
  }>;
  term_types: Array<{
    term_type: string;
    display_name: string;
    quote_display_name?: string | null;
    category?: string | null;
    value_kind: DictionaryValueKind;
    applicable_product_types: string[];
    aliases: string[];
  }>;
};

type DictionaryCache = {
  loadedAt: number;
  termTypes: any[];
  terms: any[];
  termTypeAliases: any[];
  valueAliases: any[];
  unitAliases: any[];
};

export class DictionaryMatcherService {
  private cache: DictionaryCache | null = null;
  private readonly ttlMs = 60_000;

  invalidate() {
    this.cache = null;
  }

  async getCache(): Promise<DictionaryCache> {
    if (this.cache && Date.now() - this.cache.loadedAt < this.ttlMs) return this.cache;
    const [termTypes, terms, termTypeAliases, valueAliases, unitAliases] = await Promise.all([
      prisma.dictionaryTermType.findMany({ where: { isActive: true }, orderBy: { termType: "asc" } }),
      prisma.dictionaryTerm.findMany({ where: { isActive: true }, orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }] }),
      prisma.dictionaryTermTypeAlias.findMany({ where: { isActive: true } }),
      prisma.dictionaryAlias.findMany({ where: { isActive: true } }),
      prisma.dictionaryUnitAlias.findMany({ where: { isActive: true } }),
    ]);
    this.cache = { loadedAt: Date.now(), termTypes, terms, termTypeAliases, valueAliases, unitAliases };
    return this.cache;
  }

  async getLlmDictionaryContext(): Promise<LlmDictionaryContext> {
    const cache = await this.getCache();
    const aliasesByTermType = groupBy(cache.termTypeAliases, (item) => item.termType);
    const productTypes = cache.terms
      .filter((term) => term.termType === "product_type")
      .map((term) => ({
        canonical_value: term.canonicalValue,
        display_name: term.displayName ?? term.canonicalValue,
        description: metadataString(term.metadata, "description"),
        aliases: cache.valueAliases
          .filter((alias) => String(alias.termId) === String(term.id))
          .map((alias) => alias.aliasValue),
      }));
    return {
      product_types: productTypes,
      term_types: cache.termTypes.map((termType) => ({
        term_type: termType.termType,
        display_name: termType.displayName,
        quote_display_name: metadataString(termType.metadata, "quoteDisplayName"),
        category: metadataString(termType.metadata, "category"),
        value_kind: (metadataString(termType.metadata, "valueKind") ?? termType.kind ?? "text") as DictionaryValueKind,
        applicable_product_types: metadataArray(termType.metadata, "applicableProductTypes"),
        aliases: (aliasesByTermType.get(termType.termType) ?? []).map((alias) => alias.aliasValue),
      })),
    };
  }

  async matchTermType(rawFieldName: string, itemProductTypeHint?: string) {
    const cache = await this.getCache();
    const normalized = normalizeAlias(rawFieldName);
    const alias = cache.termTypeAliases.find((item) => item.normalizedAlias === normalized);
    if (alias) {
      const exact = cache.termTypes.find((termType) => termType.termType === alias.termType);
      return {
        matched: true,
        rawFieldName,
        normalizedFieldName: normalized,
        termTypes: exact ? [exact.termType] : [alias.termType],
        matchMethod: "alias_exact" as const,
        itemProductTypeHint,
      };
    }
    const direct = cache.termTypes.find((termType) => normalizeAlias(termType.displayName) === normalized || normalizeAlias(termType.termType) === normalized);
    return {
      matched: Boolean(direct),
      rawFieldName,
      normalizedFieldName: normalized,
      termTypes: direct ? [direct.termType] : [],
      matchMethod: direct ? ("alias_exact" as const) : ("none" as const),
      itemProductTypeHint,
    };
  }

  async getTermTypeContext(termType: string): Promise<{
    termType: string;
    valueKind: DictionaryValueKind;
    kind: string;
    metadata: unknown;
  }> {
    const cache = await this.getCache();
    const row = cache.termTypes.find((item) => item.termType === termType);
    const valueKind = (metadataString(row?.metadata, "valueKind") ?? row?.kind ?? "text") as DictionaryValueKind;
    return {
      termType,
      valueKind,
      kind: row?.kind ?? "text",
      metadata: row?.metadata ?? {},
    };
  }

  async matchValue(termType: string, rawValue: string) {
    const cache = await this.getCache();
    const normalized = normalizeAlias(rawValue);
    const alias = cache.valueAliases.find((item) => item.termType === termType && item.normalizedAlias === normalized);
    if (alias) {
      const term = cache.terms.find((item) => String(item.id) === String(alias.termId));
      return {
        matched: true,
        termType,
        rawValue,
        normalizedValue: normalized,
        canonicalValue: term?.canonicalValue ?? alias.aliasValue,
        displayName: term?.displayName ?? term?.canonicalValue ?? alias.aliasValue,
        termId: alias.termId,
        aliasId: alias.id,
        confidence: alias.confidence,
        riskLevel: alias.riskLevel,
        matchMethod: "alias_exact" as const,
      };
    }
    const direct = cache.terms.find((term) => term.termType === termType && normalizeAlias(term.canonicalValue) === normalized);
    return {
      matched: Boolean(direct),
      termType,
      rawValue,
      normalizedValue: normalized,
      canonicalValue: direct?.canonicalValue,
      displayName: direct?.displayName ?? direct?.canonicalValue,
      termId: direct?.id,
      matchMethod: direct ? ("alias_exact" as const) : ("term_type_only" as const),
    };
  }

  async matchUnit(rawUnit: string) {
    const cache = await this.getCache();
    const normalized = normalizeAlias(rawUnit);
    const alias = cache.unitAliases.find((item) => item.normalizedAlias === normalized);
    return alias
      ? {
          matched: true,
          rawUnit,
          canonicalUnit: alias.canonicalUnit,
          displayUnit: alias.displayUnit ?? alias.canonicalUnit,
          aliasId: alias.id,
        }
      : { matched: false, rawUnit, canonicalUnit: rawUnit };
  }
}

export const dictionaryMatcherService = new DictionaryMatcherService();

export function normalizeAlias(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:，,、;；/\\_-]+/g, "");
}

function metadataString(metadata: unknown, key: string): string | null {
  return metadata && typeof metadata === "object" && typeof (metadata as any)[key] === "string" ? (metadata as any)[key] : null;
}

function metadataArray(metadata: unknown, key: string): string[] {
  return metadata && typeof metadata === "object" && Array.isArray((metadata as any)[key]) ? (metadata as any)[key].map(String) : [];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(keyFn(item), [...(map.get(keyFn(item)) ?? []), item]);
  return map;
}
