import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";
import { productConfigSearchService } from "../archive/productConfigSearch.service.js";
import type { ProductConfigTool } from "./types.js";

export const searchSimilarConfigsTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    const query = entities.productNumber
      ?? entities.productType
      ?? entities.customerId
      ?? entities.customerName
      ?? readString(args.queryText)
      ?? readString(args.userMessage);
    if (!query) {
      return {
        source: "archive_product_configs",
        supported: true,
        matches: [],
        warnings: ["queryText, userMessage, productNumber, productType, customerId, or customerName is required for archive search"],
      };
    }
    if (entities.productNumber) {
      return productConfigSearchService.searchProductConfigs({
        productNumber: String(entities.productNumber),
        customerId: entities.customerId ? String(entities.customerId) : undefined,
        includeErp: false,
      });
    }
    return archiveItemSearchService.searchArchiveItems({
      queryText: readString(args.queryText) ?? readString(args.userMessage) ?? String(query),
      productType: readString(entities.productType),
      materials: Array.isArray(entities.materials) ? entities.materials.map(String) : undefined,
      application: readString(entities.application),
      widthMm: readNumber(entities.widthMm),
      limit: 10,
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

function readNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
