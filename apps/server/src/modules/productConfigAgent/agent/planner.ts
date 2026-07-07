import { parseProductConfigAgentIntent } from "./intentParser.js";
import type { ProductConfigAgentPlan } from "./types.js";

export async function createProductConfigPlan(userMessage: string): Promise<ProductConfigAgentPlan> {
  return createDeterministicProductConfigPlan(userMessage);
}

export function createDeterministicProductConfigPlan(userMessage: string): ProductConfigAgentPlan {
  const parsed = parseProductConfigAgentIntent(userMessage);
  const { intent, entities } = parsed;
  const commonArgs = { userMessage, entities };
  const steps: ProductConfigAgentPlan["steps"] = [];

  if (intent === "search_cases") {
    steps.push({ id: "search_archive_items", tool: "searchArchiveItems", args: { ...commonArgs, queryText: userMessage } });
    return { ...parsed, steps };
  }
  if (intent === "clarify") return { ...parsed, steps: [] };
  if (entities.customerName) steps.push({ id: "search_customer_configs", tool: "searchCustomerConfigs", args: commonArgs });
  if (entities.industry) steps.push({ id: "search_industry_configs", tool: "searchIndustryConfigs", args: commonArgs });
  if (entities.productNumber || entities.productType || entities.referenceMode === "similar") {
    steps.push({ id: "search_similar_configs", tool: "searchSimilarConfigs", args: commonArgs });
  }
  steps.push(
    { id: "get_product_rules", tool: "getProductRules", args: commonArgs },
    { id: "generate_config_draft", tool: "generateConfigDraft", args: commonArgs },
    { id: "validate_config", tool: "validateConfig", args: commonArgs },
    { id: "save_product_config", tool: "saveProductConfig", args: commonArgs },
  );
  return { ...parsed, steps };
}
