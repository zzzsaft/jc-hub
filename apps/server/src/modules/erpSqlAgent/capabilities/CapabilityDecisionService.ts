import type { AnalysisPlan, CapabilityDecision } from "../planner/index.js";
import type { ErpSqlCapabilityDefinition } from "./types.js";

export type CapabilityRequirements = {
  filters?: string[];
};

export class CapabilityDecisionService {
  decide(
    plan: AnalysisPlan | undefined,
    capability: ErpSqlCapabilityDefinition,
    requirements: CapabilityRequirements = {},
  ): CapabilityDecision {
    const missingCoverage = [
      ...missing("metric", [...(plan?.metrics ?? []), ...(plan?.requiredMetrics ?? [])], capability.metrics),
      ...missing("dimension", plan?.dimensions ?? [], capability.dimensions),
      ...missing("filter", requirements.filters ?? [], capability.filterSlots),
      ...missing("time", timeSemantics(plan), capability.timeSemantics),
      ...missing("comparison", plan?.comparison ? [plan.comparison.kind] : [], capability.comparisonKinds),
    ];
    const outcome = plan?.clarificationCandidates?.length
      ? "clarify"
      : capability.status === "executable" && missingCoverage.length === 0
        ? "execute"
        : "unsupported";
    return {
      outcome,
      capability: capability.code,
      missingCoverage,
      ...(outcome === "clarify"
        ? { reasonCode: "ambiguous_requirements" }
        : outcome === "unsupported"
          ? { reasonCode: capability.reasonCode ?? "missing_capability_coverage" }
          : {}),
    };
  }
}

function missing(kind: string, required: readonly string[], covered: readonly string[]): string[] {
  const coverage = new Set(covered);
  return [...new Set(required)].filter((item) => !coverage.has(item)).map((item) => `${kind}:${item}`);
}

function timeSemantics(plan: AnalysisPlan | undefined): string[] {
  const range = plan?.timeRange;
  if (!range) return [];
  if (range.kind === "month") return ["calendar_month"];
  if (range.kind === "relative") return ["relative_window"];
  if (range.kind === "year_over_year") return ["previous_year_comparison"];
  return [range.kind];
}

export const capabilityDecisionService = new CapabilityDecisionService();
