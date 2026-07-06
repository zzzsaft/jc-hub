import type { ProductConfigAgentDraftConfig } from "../agent/types.js";
import type { ProductConfigTool } from "./types.js";

export const generateConfigDraftTool: ProductConfigTool = {
  async run(args, context) {
    const entities = readEntities(args);
    const rules = context.toolResults.get_product_rules as any;
    const searchResults = Object.entries(context.toolResults)
      .filter(([key]) => key.startsWith("search_"))
      .map(([stepId, result]) => ({ stepId, result }));
    const draft: ProductConfigAgentDraftConfig = {
      title: buildTitle(entities),
      customerName: entities.customerName,
      customerId: entities.customerId,
      industry: entities.industry,
      productType: entities.productType,
      productNumber: entities.productNumber,
      items: [
        {
          itemIndex: 1,
          productType: entities.productType,
          productNumber: entities.productNumber,
          fields: buildFields(rules, entities),
        },
      ],
      evidence: searchResults,
    };
    context.draftConfig = draft;
    return draft;
  },
};

function buildTitle(entities: Record<string, any>): string {
  const parts = [entities.customerName, entities.productType, entities.productNumber].filter(Boolean);
  return parts.length ? `${parts.join(" ")} 配置表` : "产品配置表草稿";
}

function buildFields(rules: any, entities: Record<string, any>) {
  const fields = Array.isArray(rules?.fields) ? rules.fields.slice(0, 12) : [];
  if (fields.length === 0) {
    return [
      {
        fieldName: "产品类型",
        termType: "product_type",
        value: entities.productType ?? "待确认",
        source: "user_intent",
        confidence: entities.productType ? 0.8 : 0.2,
      },
      {
        fieldName: "产品编号",
        termType: "product_number",
        value: entities.productNumber ?? "待确认",
        source: "user_intent",
        confidence: entities.productNumber ? 0.8 : 0.2,
      },
    ];
  }
  return fields.map((field: any) => ({
    fieldName: field.displayName ?? field.termType,
    termType: field.termType,
    value: "待确认",
    source: "product_rules",
    confidence: 0.3,
  }));
}

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object" ? (args.entities as Record<string, any>) : {};
}
