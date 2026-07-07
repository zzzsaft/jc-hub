import type { ProductConfigAgentContext } from "../agent/types.js";

export type ProductConfigTool = {
  run(args: Record<string, unknown>, context: ProductConfigAgentContext): Promise<unknown>;
};
