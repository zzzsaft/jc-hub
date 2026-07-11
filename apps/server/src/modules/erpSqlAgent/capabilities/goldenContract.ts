import type { GoldenCapabilityCase, GoldenExpectedOutcome } from "./types.js";

const OUTCOMES = new Set<GoldenExpectedOutcome>(["execute", "clarify", "unsupported"]);

export function parseGoldenCapabilityCase(value: unknown): GoldenCapabilityCase {
  if (!isRecord(value)) throw new Error("Golden capability case must be an object");
  const expectedOutcome = requiredString(value, "expectedOutcome") as GoldenExpectedOutcome;
  if (!OUTCOMES.has(expectedOutcome)) throw new Error(`Invalid golden expectedOutcome: ${expectedOutcome}`);
  const unsupportedReason = value.unsupportedReason;
  if (unsupportedReason !== null && typeof unsupportedReason !== "string") {
    throw new Error("Golden unsupportedReason must be a string or null");
  }
  if ((expectedOutcome === "unsupported") !== (typeof unsupportedReason === "string" && unsupportedReason.length > 0)) {
    throw new Error("Unsupported golden cases must declare unsupportedReason, and other cases must use null");
  }
  return {
    businessType: requiredString(value, "businessType"),
    question: requiredString(value, "question"),
    expectedFamilyIds: stringArray(value, "expectedFamilyIds"),
    tags: stringArray(value, "tags"),
    capability: requiredString(value, "capability"),
    expectedOutcome,
    requiredMetrics: stringArray(value, "requiredMetrics"),
    requiredDimensions: stringArray(value, "requiredDimensions"),
    requiredFilters: stringArray(value, "requiredFilters"),
    requiredTimeSemantics: stringArray(value, "requiredTimeSemantics"),
    allowedTemplateFamilies: stringArray(value, "allowedTemplateFamilies"),
    unsupportedReason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) throw new Error(`Golden ${key} must be a non-empty string`);
  return item;
}

function stringArray(value: Record<string, unknown>, key: string): string[] {
  const item = value[key];
  if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string")) {
    throw new Error(`Golden ${key} must be a string array`);
  }
  return item;
}
