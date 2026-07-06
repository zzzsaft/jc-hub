import { z } from "zod";
import type { ErpModuleName } from "../../knowledge/index.js";

export const ErpSqlIntentSchema = z
  .object({
    originalQuestion: z.string(),
    normalizedQuestion: z.string(),
    module: optionalNull(z.enum(["sales", "purchase", "production", "inventory", "finance", "custom", "unknown"])),
    intentType: optionalNull(z.enum(["detail", "summary", "ranking", "trend", "anomaly", "trace"])),
    entities: z
      .object({
        partNum: optionalNull(z.string()),
        poNum: optionalNull(z.number().int()),
        jobNum: optionalNull(z.string()),
        orderNum: optionalNull(z.number().int()),
        vendorName: optionalNull(z.string()),
        vendorNum: optionalNull(z.number().int()),
        customerName: optionalNull(z.string()),
        customerNum: optionalNull(z.number().int()),
      })
      .default({}),
    dateRange: z
      .object({
        from: optionalNull(z.string()),
        to: optionalNull(z.string()),
        relativeDays: optionalNull(z.number().int().positive()),
        label: optionalNull(z.string()),
      })
      .nullish()
      .transform((value) => value ?? undefined),
    metrics: optionalNull(z.array(z.string())),
    groupBy: optionalNull(z.array(z.string())),
    orderBy: optionalNull(z.array(z.string())),
    limit: optionalNull(z.number().int().positive()),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

function optionalNull<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value === null ? undefined : value, schema.optional());
}

export type ErpSqlIntent = z.infer<typeof ErpSqlIntentSchema>;
export type ErpSqlIntentModule = ErpModuleName | "unknown";

export type ErpSqlIntentExtractor = {
  extract(question: string): Promise<ErpSqlIntent>;
};
