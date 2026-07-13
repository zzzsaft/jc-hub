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
  const capability = requiredString(value, "capability");
  const requiredSlots = optionalStringArray(value, "requiredSlots");
  const requiredFilters = stringArray(value, "requiredFilters");
  for (const slot of requiredSlots ?? []) {
    const filter = mapRequiredSlotToFilter(slot, capability);
    if (!requiredFilters.includes(filter)) throw new Error(`Golden required slot ${slot} must map to required filter ${filter}`);
  }
  return {
    businessType: requiredString(value, "businessType"),
    question: requiredString(value, "question"),
    expectedFamilyIds: stringArray(value, "expectedFamilyIds"),
    tags: stringArray(value, "tags"),
    ...(requiredSlots ? { requiredSlots } : {}),
    capability,
    expectedOutcome,
    requiredMetrics: stringArray(value, "requiredMetrics"),
    requiredDimensions: stringArray(value, "requiredDimensions"),
    requiredFilters,
    requiredTimeSemantics: stringArray(value, "requiredTimeSemantics"),
    allowedTemplateFamilies: stringArray(value, "allowedTemplateFamilies"),
    unsupportedReason,
  };
}

export function mapRequiredSlotToFilter(slot: string, capability: string): string {
  return capability === "job.material_requirement" && slot === "partNum" ? "materialPartNum" : slot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== "string" || item.trim().length === 0) throw new Error(`Golden ${key} must be a non-empty string`);
  return item;
}

function stringArray(value: Record<string, unknown>, key: string): string[] {
  const item = value[key];
  if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string" || entry.trim().length === 0) || new Set(item).size !== item.length) {
    throw new Error(`Golden ${key} must be a string array`);
  }
  return item;
}

function optionalStringArray(value: Record<string, unknown>, key: string): string[] | undefined {
  return value[key] === undefined ? undefined : stringArray(value, key);
}
