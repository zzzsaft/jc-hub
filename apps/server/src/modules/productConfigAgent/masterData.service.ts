import { prisma } from "../../lib/prisma.js";

export type ProductConfigAgentModelTermType = "metering_pump_model" | "filter_model";

export type ProductConfigAgentMasterDataSource =
  | "crm_products_pump"
  | "crm_product_filter";

export type ProductConfigAgentMasterDataMatch = {
  matched: boolean;
  source: ProductConfigAgentMasterDataSource;
  id?: string;
  model?: string | null;
  rawValue: string;
  matchMethod?:
    | "model_exact"
    | "model_trim_exact"
    | "model_case_insensitive"
    | "model_normalized"
    | "attributes_unique_exact";
  details?: Record<string, unknown>;
};

const MODEL_TERM_TYPE_SOURCE: Record<
  ProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataSource
> = {
  metering_pump_model: "crm_products_pump",
  filter_model: "crm_product_filter",
};

const ATTRIBUTE_TERM_TYPE_MAP: Record<
  ProductConfigAgentModelTermType,
  Array<{ termType: string; masterField: string }>
> = {
  filter_model: [
    { termType: "dimension", masterField: "dimension" },
    { termType: "weight", masterField: "weight" },
    { termType: "filter_diameter", masterField: "filterDiameter" },
    { termType: "effective_filter_area", masterField: "effectiveFilterArea" },
    { termType: "capacity", masterField: "production" },
  ],
  metering_pump_model: [
    { termType: "pump_displacement", masterField: "pumpage" },
    { termType: "rotation_speed", masterField: "rotateSpeed" },
    { termType: "heating_power", masterField: "heatingPower" },
    { termType: "capacity", masterField: "production" },
  ],
};

export function isProductConfigAgentModelTermType(
  termType: string,
): termType is ProductConfigAgentModelTermType {
  return termType === "metering_pump_model" || termType === "filter_model";
}

export function sourceForModelTermType(
  termType: ProductConfigAgentModelTermType,
): ProductConfigAgentMasterDataSource {
  return MODEL_TERM_TYPE_SOURCE[termType];
}

export function normalizeMasterDataModel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[._\-\/\\|,;:()[\]{}<>]/g, "");
}

export function normalizeMasterDataAttribute(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\uff10-\uff19]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[，。；：、]/g, "")
    .replace(/[‐‑‒–—－]/g, "-")
    .replace(/[×＊*]/g, "x")
    .replace(/平方厘米|平方公分|cm²|㎠/gi, "cm2")
    .replace(/毫米/gi, "mm")
    .replace(/厘米/gi, "cm")
    .replace(/公斤|千克/gi, "kg")
    .replace(/每小时|\/小时|每时/gi, "/h")
    .replace(/\/+/g, "/")
    .replace(/\s+/g, "")
    .replace(/[()（）[\]{}<>]/g, "");
}

export class ProductConfigAgentMasterDataService {
  async search(params: {
    termType?: string;
    q?: string;
    model?: string;
    source?: ProductConfigAgentMasterDataSource;
    limit?: number;
  }) {
    const termType = normalizeModelTermType(params.termType);
    const source = params.source ?? (termType ? sourceForModelTermType(termType) : undefined);
    const keyword = String(params.model ?? params.q ?? "").trim();
    const normalized = normalizeMasterDataModel(keyword);
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 50) || 50));
    const where: any = {};
    if (source) where.source = source;
    if (keyword) {
      where.OR = [
        { model: { contains: keyword, mode: "insensitive" } },
        { name: { contains: keyword, mode: "insensitive" } },
        ...(normalized ? [{ normalizedModel: { contains: normalized, mode: "insensitive" } }] : []),
      ];
    }
    const items = await prisma.masterDataProduct.findMany({
      where,
      orderBy: [{ source: "asc" }, { model: "asc" }, { id: "asc" }],
      take: limit,
    });
    return { items: mapBigInts(items) };
  }

  async matchModel(params: {
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
  }): Promise<ProductConfigAgentMasterDataMatch> {
    const source = sourceForModelTermType(params.termType);
    const rawValue = String(params.rawValue ?? "");
    const trimmed = rawValue.trim();
    if (!trimmed) return { matched: false, source, rawValue };
    const rows = await prisma.masterDataProduct.findMany({
      where: { source, model: { not: null } },
      take: 10000,
    });
    const normalized = normalizeMasterDataModel(trimmed);
    const exact = rows.find((row) => row.model === rawValue);
    if (exact) return this.rowMatch(exact, rawValue, "model_exact");
    const trimExact = rows.find((row) => row.model === trimmed);
    if (trimExact) return this.rowMatch(trimExact, rawValue, "model_trim_exact");
    const lower = trimmed.toLowerCase();
    const caseInsensitive = rows.find((row) => String(row.model ?? "").toLowerCase() === lower);
    if (caseInsensitive) return this.rowMatch(caseInsensitive, rawValue, "model_case_insensitive");
    const normalizedMatch = rows.find((row) => row.normalizedModel === normalized || normalizeMasterDataModel(row.model) === normalized);
    if (normalizedMatch) return this.rowMatch(normalizedMatch, rawValue, "model_normalized");
    return { matched: false, source, rawValue };
  }

  async matchModelByAttributes(params: {
    termType: ProductConfigAgentModelTermType;
    attributes: Record<string, unknown[]>;
  }) {
    const source = sourceForModelTermType(params.termType);
    const mappings = ATTRIBUTE_TERM_TYPE_MAP[params.termType];
    const usableAttributes = Object.fromEntries(
      Object.entries(params.attributes)
        .map(([termType, values]) => [
          termType,
          [...new Set((values ?? []).map(normalizeMasterDataAttribute).filter(Boolean))],
        ])
        .filter(([, values]) => values.length > 0),
    ) as Record<string, string[]>;
    const providedMappedAttributes = mappings.filter(
      (mapping) => (usableAttributes[mapping.termType] ?? []).length > 0,
    );
    if (providedMappedAttributes.length < 2) {
      return {
        masterDataMatch: {
          matched: false,
          source,
          rawValue: "",
          details: { providedAttributes: Object.keys(usableAttributes), requiredMatchCount: 2 },
        },
        matchedAttributes: [],
        candidateCount: 0,
        candidates: [],
        reason: "insufficient_attributes",
      };
    }

    const rows = await prisma.masterDataProduct.findMany({ where: { source }, take: 10000 });
    const candidates = [];
    for (const row of rows) {
      const details = objectRecord(row.detailsJson);
      const normalizedAttributes = objectRecord(row.normalizedAttributesJson);
      const matchedAttributes: string[] = [];
      let hasConflict = false;
      for (const mapping of providedMappedAttributes) {
        const masterValue = String(
          normalizedAttributes[mapping.masterField] ??
            normalizeMasterDataAttribute(details[mapping.masterField]),
        );
        if (!masterValue) continue;
        const values = usableAttributes[mapping.termType] ?? [];
        if (values.includes(masterValue)) matchedAttributes.push(mapping.termType);
        else {
          hasConflict = true;
          break;
        }
      }
      if (!hasConflict && matchedAttributes.length >= 2) candidates.push({ row, matchedAttributes });
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      return {
        masterDataMatch: this.rowMatch(candidate.row, candidate.row.model ?? "", "attributes_unique_exact", {
          matchedAttributes: candidate.matchedAttributes,
          sourceAttributes: usableAttributes,
        }),
        matchedAttributes: candidate.matchedAttributes,
        candidateCount: 1,
        candidates: [this.attributeCandidate(candidate.row, candidate.matchedAttributes)],
        reason: "matched",
      };
    }

    return {
      masterDataMatch: {
        matched: false,
        source,
        rawValue: "",
        details: { providedAttributes: usableAttributes, candidateCount: candidates.length },
      },
      matchedAttributes: [],
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 10).map((candidate) => this.attributeCandidate(candidate.row, candidate.matchedAttributes)),
      reason: candidates.length > 1 ? "multiple_matches" : "no_match",
    };
  }

  async bindModel(params: {
    documentId?: string | number;
    extractionResultId: string | number;
    itemIndex: number;
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    masterDataId: string | number;
  }) {
    const row = await prisma.masterDataProduct.findFirst({
      where: {
        id: BigInt(params.masterDataId),
        source: sourceForModelTermType(params.termType),
      },
    });
    if (!row) throw new Error("Master data product not found");
    const extraction = await prisma.extractionResult.findFirst({
      where: {
        id: BigInt(params.extractionResultId),
        ...(params.documentId ? { documentId: BigInt(params.documentId) } : {}),
      },
    });
    if (!extraction) throw new Error("Extraction result not found");
    const masterDataMatch = this.rowMatch(row, params.rawValue, "model_exact", { confirmed: true });
    const normalizedExtractionJson = applyBindingToNormalizedJson({
      json: extraction.normalizedExtractionJson,
      itemIndex: params.itemIndex,
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataMatch,
    });
    const dictionaryProposals = applyBindingToDictionaryProposals({
      json: extraction.dictionaryProposals,
      itemIndex: params.itemIndex,
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataMatch,
    });
    await prisma.extractionResult.update({
      where: { id: extraction.id },
      data: { normalizedExtractionJson: toJson(normalizedExtractionJson), dictionaryProposals: toJson(dictionaryProposals) },
    });
    return { ok: true, masterDataMatch };
  }

  private rowMatch(row: any, rawValue: string, matchMethod: ProductConfigAgentMasterDataMatch["matchMethod"], detailsPatch?: Record<string, unknown>) {
    return {
      matched: true,
      source: row.source,
      id: String(row.id),
      model: row.model,
      rawValue,
      matchMethod,
      details: { ...objectRecord(row.detailsJson), ...detailsPatch },
    } satisfies ProductConfigAgentMasterDataMatch;
  }

  private attributeCandidate(row: any, matchedAttributes: string[]) {
    return {
      id: String(row.id),
      model: row.model,
      name: row.name,
      source: row.source,
      matchedAttributes,
      details: objectRecord(row.detailsJson),
    };
  }
}

export const productConfigAgentMasterDataService = new ProductConfigAgentMasterDataService();

function normalizeModelTermType(value?: string): ProductConfigAgentModelTermType | null {
  if (value === "metering_pump_model" || value === "filter_model") return value;
  return null;
}

function applyBindingToNormalizedJson(params: {
  json: unknown;
  itemIndex: number;
  termType: ProductConfigAgentModelTermType;
  rawValue: string;
  masterDataMatch: ProductConfigAgentMasterDataMatch;
}) {
  const json = clone(params.json);
  if (!isObject(json) || !Array.isArray(json.items)) return json;
  for (const item of json.items as any[]) {
    if (Number(item?.item_index) !== Number(params.itemIndex)) continue;
    const fields = isObject(item.fields) ? item.fields : {};
    const field = fields[params.termType];
    if (field === undefined) continue;
    fields[params.termType] = attachMasterDataMatch(field, params.masterDataMatch);
  }
  return json;
}

function applyBindingToDictionaryProposals(params: {
  json: unknown;
  itemIndex: number;
  termType: ProductConfigAgentModelTermType;
  rawValue: string;
  masterDataMatch: ProductConfigAgentMasterDataMatch;
}) {
  const root = clone(params.json ?? {});
  const proposals = isObject(root) ? root : {};
  const items = Array.isArray((proposals as any).items) ? (proposals as any).items : [];
  for (const item of items) {
    if (Number(item?.itemIndex ?? item?.item_index) !== Number(params.itemIndex)) continue;
    for (const proposal of Array.isArray(item.proposals) ? item.proposals : []) {
      if (proposal?.termType === params.termType && String(proposal?.rawValue ?? "") === params.rawValue) {
        proposal.masterDataMatch = { ...params.masterDataMatch, confirmed: true };
      }
    }
  }
  return proposals;
}

function attachMasterDataMatch(value: unknown, match: ProductConfigAgentMasterDataMatch): unknown {
  if (Array.isArray(value)) return value.map((item) => attachMasterDataMatch(item, match));
  if (isObject(value)) return { ...value, masterDataMatch: { ...match, confirmed: true } };
  return { value, masterDataMatch: { ...match, confirmed: true } };
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function clone(value: unknown): any {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function mapBigInts(value: any): any {
  if (Array.isArray(value)) return value.map(mapBigInts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "bigint" ? Number(item) : item instanceof Date ? item.toISOString() : mapBigInts(item),
    ]),
  );
}
