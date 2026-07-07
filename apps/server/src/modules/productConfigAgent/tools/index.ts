import type { ProductConfigAgentToolName } from "../agent/types.js";
import { generateConfigDraftTool } from "./generateConfigDraft.tool.js";
import { getProductRulesTool } from "./getProductRules.tool.js";
import { saveProductConfigTool } from "./saveProductConfig.tool.js";
import { searchArchiveItemsTool } from "./searchArchiveItems.tool.js";
import { searchCustomerConfigsTool } from "./searchCustomerConfigs.tool.js";
import { searchIndustryConfigsTool } from "./searchIndustryConfigs.tool.js";
import { searchSimilarConfigsTool } from "./searchSimilarConfigs.tool.js";
import type { ProductConfigTool } from "./types.js";
import { validateConfigTool } from "./validateConfig.tool.js";

export const productConfigTools = {
  searchArchiveItems: searchArchiveItemsTool,
  searchCustomerConfigs: searchCustomerConfigsTool,
  searchIndustryConfigs: searchIndustryConfigsTool,
  searchSimilarConfigs: searchSimilarConfigsTool,
  getProductRules: getProductRulesTool,
  generateConfigDraft: generateConfigDraftTool,
  validateConfig: validateConfigTool,
  saveProductConfig: saveProductConfigTool,
} satisfies Record<ProductConfigAgentToolName, ProductConfigTool>;

export type { ProductConfigTool } from "./types.js";
