import type { ProductConfigTool } from "./types.js";

export const saveProductConfigTool: ProductConfigTool = {
  async run(_args, context) {
    if (!context.draftConfig) throw new Error("draftConfig is required before saveProductConfig");
    if (!context.validation) {
      throw new Error("validation is required before saveProductConfig");
    }
    if (context.validation && !context.validation.canSave) {
      throw new Error("draftConfig cannot be saved because validation has blockers");
    }
    if (!context.saveGeneratedConfig) {
      return { saved: false, reason: "saveGeneratedConfig callback is not configured" };
    }
    const draft = context.draftConfig as any;
    const savedConfig = await context.saveGeneratedConfig({
      title: typeof draft?.title === "string" ? draft.title : null,
      status: context.options?.confirmed === true ? "confirmed" : "draft",
      config: context.draftConfig,
      validation: context.validation,
    });
    context.savedConfig = savedConfig;
    return savedConfig;
  },
};
