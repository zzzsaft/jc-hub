import { productConfigTools } from "../tools/index.js";
import type { ProductConfigAgentContext, ProductConfigAgentExecuteOptions, ProductConfigAgentPlan } from "./types.js";

export async function executeProductConfigPlan(
  plan: ProductConfigAgentPlan,
  options?: ProductConfigAgentExecuteOptions,
): Promise<ProductConfigAgentContext> {
  const context: ProductConfigAgentContext = {
    toolResults: {},
    toolTrace: [],
    draftConfig: null,
    validation: null,
    savedConfig: null,
    warnings: [],
    ...options?.context,
  };

  for (const step of plan.steps) {
    const tool = productConfigTools[step.tool];
    if (!tool) throw new Error(`Unsupported product config tool: ${step.tool}`);
    await options?.onToolStart?.({ step });
    const startedAt = Date.now();
    try {
      const result = await tool.run(step.args, context);
      context.toolResults[step.id] = result;
      context.toolTrace?.push({
        stepId: step.id,
        tool: step.tool,
        durationMs: Date.now() - startedAt,
        status: "success",
        input: step.args,
        output: result,
      });
      await options?.onToolFinish?.({ step, result, durationMs: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.toolResults[step.id] = { error: message };
      context.toolTrace?.push({
        stepId: step.id,
        tool: step.tool,
        durationMs: Date.now() - startedAt,
        status: "failed",
        input: step.args,
        error: message,
      });
      context.warnings.push(`${step.tool} failed: ${message}`);
      await options?.onToolFinish?.({ step, error, durationMs: Date.now() - startedAt });
    }
  }
  return context;
}
