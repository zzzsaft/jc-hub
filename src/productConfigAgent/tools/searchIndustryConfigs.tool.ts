import type { ProductConfigTool } from "./types.js";

export const searchIndustryConfigsTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    return {
      source: "industry_common_configs",
      industry: entities.industry ?? null,
      productType: entities.productType ?? null,
      supported: false,
      matches: [],
      warnings: ["industry config retrieval is not connected yet"],
    };
  },
};

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object" ? (args.entities as Record<string, any>) : {};
}
