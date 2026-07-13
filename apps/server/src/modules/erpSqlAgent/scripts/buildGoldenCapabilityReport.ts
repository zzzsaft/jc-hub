import type { GoldenCapabilityCase, GoldenExpectedOutcome } from "../capabilities/types.js";

export type GoldenCapabilityStatus =
  | "execute_pass"
  | "clarify_pass"
  | "unsupported_pass"
  | "semantic_fail"
  | "routing_fail"
  | "guard_fail"
  | "transport_fail";

export type GoldenCapabilityObservedResult = {
  success: boolean;
  outcome?: GoldenExpectedOutcome;
  capabilityCode?: string;
  reasonCode?: string;
  traceId?: string;
  semanticStatus?: "exact" | "estimate" | "semantic_mismatch";
  guardErrors?: string[];
  transportError?: boolean;
  executionPath?: "template" | "composer" | "rule" | "llm" | "estimate";
  scope?: {
    capability: string;
    metrics: string[];
    dimensions: string[];
    filters: Record<string, string>;
    timeRange?: unknown;
    templateCoverage: string[];
  };
};

export type GoldenCapabilityReportCase = {
  contract: GoldenCapabilityCase;
  result: GoldenCapabilityObservedResult;
};

export function buildGoldenCapabilityReport(cases: GoldenCapabilityReportCase[]) {
  const evaluated = cases.map(({ contract, result }) => ({
    question: contract.question,
    businessType: contract.businessType,
    capability: contract.capability,
    status: classify(contract, result),
    ...(result.traceId ? { traceId: result.traceId } : {}),
    ...(contract.unsupportedReason ? { unsupportedReason: contract.unsupportedReason } : {}),
  }));
  const counts = emptyCounts();
  const byCapability: Record<string, ReturnType<typeof emptyCounts>> = {};
  const byBusinessType: Record<string, ReturnType<typeof emptyCounts>> = {};
  const unsupportedReasons: Record<string, number> = {};
  for (const item of evaluated) {
    counts[item.status] += 1;
    (byCapability[item.capability] ??= emptyCounts())[item.status] += 1;
    (byBusinessType[item.businessType] ??= emptyCounts())[item.status] += 1;
    if (item.status === "unsupported_pass" && item.unsupportedReason) {
      unsupportedReasons[item.unsupportedReason] = (unsupportedReasons[item.unsupportedReason] ?? 0) + 1;
    }
  }
  return {
    total: evaluated.length,
    counts,
    byCapability,
    byBusinessType,
    unsupportedReasons,
    missingTrace: evaluated.filter((item) => !item.traceId).map((item) => item.question),
    failures: evaluated.filter((item) => item.status.endsWith("_fail")),
    cases: evaluated,
  };
}

function classify(contract: GoldenCapabilityCase, result: GoldenCapabilityObservedResult): GoldenCapabilityStatus {
  if (result.transportError || !hasValue(result.traceId)) return "transport_fail";
  if (result.outcome !== contract.expectedOutcome || result.capabilityCode !== contract.capability) return "routing_fail";
  if ((result.guardErrors?.length ?? 0) > 0) return "guard_fail";
  if (result.semanticStatus === "semantic_mismatch") return "semantic_fail";
  if (contract.expectedOutcome === "clarify") return result.success ? "routing_fail" : "clarify_pass";
  if (contract.expectedOutcome === "unsupported") {
    return !result.success && result.reasonCode === contract.unsupportedReason ? "unsupported_pass" : "semantic_fail";
  }
  if (!result.success) return "guard_fail";
  return coversContract(contract, result) ? "execute_pass" : "semantic_fail";
}

function coversContract(contract: GoldenCapabilityCase, result: GoldenCapabilityObservedResult): boolean {
  const { scope, executionPath } = result;
  if (!executionPath) return false;
  if (!scope || scope.capability !== contract.capability) return false;
  if (!containsAll(scope.metrics, contract.requiredMetrics) || !containsAll(scope.dimensions, contract.requiredDimensions)) return false;
  if (executionPath === "template" && (scope.templateCoverage.length === 0 || scope.templateCoverage.some((family) => !contract.allowedTemplateFamilies.includes(family)))) return false;
  if (executionPath !== "template" && scope.templateCoverage.some((family) => !contract.allowedTemplateFamilies.includes(family))) return false;
  if (contract.requiredTimeSemantics.length > 0 && !scope.timeRange) return false;
  return contract.requiredFilters.every((filter) => filterAliases(filter).some((alias) => hasValue(scope.filters[alias])));
}

function filterAliases(filter: string): string[] {
  const aliases: Record<string, string[]> = {
    customerName: ["customerName", "customer"],
    orderNum: ["orderNum", "order"],
    vendorName: ["vendorName", "supplier"],
    partNum: ["partNum", "product"],
    materialPartNum: ["materialPartNum", "product"],
    warehouseCode: ["warehouseCode", "warehouse"],
    jobNum: ["jobNum", "job"],
  };
  return aliases[filter] ?? [filter];
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function containsAll(actual: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((item) => actual.includes(item));
}

function emptyCounts(): Record<GoldenCapabilityStatus, number> {
  return {
    execute_pass: 0,
    clarify_pass: 0,
    unsupported_pass: 0,
    semantic_fail: 0,
    routing_fail: 0,
    guard_fail: 0,
    transport_fail: 0,
  };
}
