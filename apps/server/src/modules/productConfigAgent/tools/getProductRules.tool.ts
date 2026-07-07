import { prisma } from "../../../lib/prisma.js";
import type { ProductConfigTool } from "./types.js";

export const getProductRulesTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    const [termTypes, productTypes] = await Promise.all([
      prisma.dictionaryTermType.findMany({
        where: { isActive: true },
        orderBy: [{ displayName: "asc" }],
        take: 200,
      }),
      prisma.dictionaryTerm.findMany({
        where: { termType: "product_type", isActive: true },
        orderBy: [{ displayName: "asc" }, { canonicalValue: "asc" }],
        take: 200,
      }),
    ]);
    return {
      productType: entities.productType ?? null,
      productTypes: productTypes.map((item) => ({
        canonicalValue: item.canonicalValue,
        displayName: item.displayName ?? item.canonicalValue,
      })),
      fields: termTypes
        .filter((item) => appliesToProductType(item.applicableProductTypes, entities.productType))
        .map((item) => ({
          termType: item.termType,
          displayName: item.displayName,
          valueKind: item.valueKind,
          category: item.category,
          description: item.description,
          applicableProductTypes: jsonStringArray(item.applicableProductTypes),
        })),
    };
  },
};

function appliesToProductType(applicableProductTypes: unknown, productType: unknown): boolean {
  const target = String(productType ?? "").trim();
  const applicable = jsonStringArray(applicableProductTypes);
  return !target || applicable.length === 0 || applicable.includes("common") || applicable.includes(target);
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object" ? (args.entities as Record<string, any>) : {};
}
