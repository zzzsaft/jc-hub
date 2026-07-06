import type { ProductConfigAgentValidationResult } from "../agent/types.js";
import type { ProductConfigTool } from "./types.js";

export const validateConfigTool: ProductConfigTool = {
  async run(_args, context) {
    const draft = context.draftConfig as any;
    const issues: ProductConfigAgentValidationResult["issues"] = [];
    if (!draft) {
      issues.push({ type: "missing_draft", severity: "blocker", message: "No draft config was generated" });
    }
    if (draft && !draft.productType && !draft.productNumber) {
      issues.push({
        type: "missing_product_identity",
        severity: "warning",
        message: "Product type or product number should be confirmed",
      });
    }
    if (draft && (!Array.isArray(draft.items) || draft.items.length === 0)) {
      issues.push({ type: "missing_items", severity: "blocker", message: "Draft config must include at least one item" });
    }
    const validation: ProductConfigAgentValidationResult = {
      canSave: !issues.some((issue) => issue.severity === "blocker"),
      issues,
    };
    context.validation = validation;
    context.warnings.push(...issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message));
    return validation;
  },
};
