import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";
import type { ProductConfigTool } from "./types.js";

export const searchArchiveItemsTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    return archiveItemSearchService.searchArchiveItems({
      queryText: readString(args.queryText) ?? readString(args.userMessage) ?? "",
      productType: readString(args.productType) ?? readString(entities.productType),
      materials: readStringArray(args.materials) ?? readStringArray(entities.materials),
      application: readString(args.application) ?? readString(entities.application),
      lipAdjustmentMethod: readString(args.lipAdjustmentMethod) ?? readString(entities.lipAdjustmentMethod),
      deckleType: readString(args.deckleType) ?? readString(entities.deckleType),
      widthMm: readNumber(args.widthMm) ?? readNumber(entities.widthMm),
      limit: readNumber(args.limit),
    });
  },
};

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object" ? (args.entities as Record<string, any>) : {};
}

function readString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(readString).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function readNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
