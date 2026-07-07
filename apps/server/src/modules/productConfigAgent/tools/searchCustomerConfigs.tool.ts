import type { ProductConfigTool } from "./types.js";

export const searchCustomerConfigsTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    return {
      source: "customer_history",
      customerName: entities.customerName ?? null,
      customerId: entities.customerId ?? null,
      supported: false,
      matches: [],
      warnings: ["customer-specific natural language config retrieval is not connected yet"],
    };
  },
};

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object" ? (args.entities as Record<string, any>) : {};
}
