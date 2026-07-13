import type { AnalysisPlan, CapabilityDecision } from "../planner/index.js";
import type { ErpSqlCapabilityDefinition } from "./types.js";

export type CapabilityRequirements = {
  filters?: string[];
};

export const DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING = "diagnostic_composite_capability_bypass";

export class CapabilityDecisionService {
  resolveAndDecide(
    plan: AnalysisPlan | undefined,
    capabilities: readonly ErpSqlCapabilityDefinition[],
    modules: string[],
    requirements: CapabilityRequirements = {},
  ): CapabilityDecision {
    const candidates = capabilities.filter((capability) => capability.modules.some((module) => modules.includes(module)));
    if (candidates.length === 0) return unresolved("capability_not_published");
    const scored = candidates.map((capability) => ({ capability, score: resolutionScore(plan, capability, modules, requirements) }));
    const bestScore = Math.max(...scored.map((item) => item.score));
    const best = scored.filter((item) => item.score === bestScore);
    if (best.length !== 1) return unresolved("capability_resolution_ambiguous");
    return this.decide(plan, best[0].capability, requirements);
  }

  decide(
    plan: AnalysisPlan | undefined,
    capability: ErpSqlCapabilityDefinition,
    requirements: CapabilityRequirements = {},
  ): CapabilityDecision {
    const missingRequiredSlots = (capability.requiredPlanSlots ?? [])
      .filter((slot) => slot === "timeRange" && !plan?.timeRange)
      .map((slot) => `slot:${slot}`);
    const missingCoverage = [
      ...missing("metric", [...(plan?.metrics ?? []), ...(plan?.requiredMetrics ?? [])], capability.metrics),
      ...missing("dimension", plan?.dimensions ?? [], capability.dimensions),
      ...missing("filter", requirements.filters ?? [], capability.filterSlots),
      ...missing("time", timeSemantics(plan), capability.timeSemantics),
      ...missing("comparison", plan?.comparison ? [plan.comparison.kind] : [], capability.comparisonKinds),
      ...missingRequiredSlots,
    ];
    const diagnosticBypass = capability.code === "finance.composite_decision"
      && shouldBypassCompositeCapability(plan);
    const outcome = plan?.clarificationCandidates?.length || missingRequiredSlots.length > 0
      ? "clarify"
      : diagnosticBypass || (capability.status === "executable" && missingCoverage.length === 0)
        ? "execute"
        : "unsupported";
    return {
      outcome,
      capability: capability.code,
      missingCoverage,
      ...(outcome === "execute" && diagnosticBypass ? { diagnosticBypass: true } : {}),
      ...(outcome === "clarify"
        ? { reasonCode: missingRequiredSlots.length > 0 ? "missing_required_query_slot" : "ambiguous_requirements" }
        : outcome === "unsupported"
          ? { reasonCode: capability.reasonCode ?? "missing_capability_coverage" }
          : {}),
    };
  }
}

export function shouldBypassCompositeCapability(plan: AnalysisPlan | undefined): boolean {
  if (process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY !== "true" || !plan) return false;
  if (plan.scenario === "product_sales_inventory_backlog_trend") return true;
  const metrics = new Set([...(plan.metrics ?? []), ...(plan.requiredMetrics ?? [])]);
  return plan.mode === "decision_support" && metrics.size >= 2;
}

function resolutionScore(
  plan: AnalysisPlan | undefined,
  capability: ErpSqlCapabilityDefinition,
  modules: string[],
  requirements: CapabilityRequirements,
): number {
  const requested = [
    ...[...(plan?.metrics ?? []), ...(plan?.requiredMetrics ?? [])].map((item) => [item, capability.metrics] as const),
    ...(plan?.dimensions ?? []).map((item) => [item, capability.dimensions] as const),
    ...(requirements.filters ?? []).map((item) => [item, capability.filterSlots] as const),
    ...timeSemantics(plan).map((item) => [item, capability.timeSemantics] as const),
    ...(plan?.comparison ? [[plan.comparison.kind, capability.comparisonKinds] as const] : []),
  ];
  const matches = requested.filter(([item, coverage]) => coverage.includes(item as never)).length;
  const moduleMatches = capability.modules.filter((module) => modules.includes(module)).length;
  const extraModules = capability.modules.length - moduleMatches;
  return matches * 100 + moduleMatches * 10 - extraModules;
}

function unresolved(reasonCode: string): CapabilityDecision {
  return { outcome: "unsupported", capability: "ambiguous", missingCoverage: [], reasonCode };
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
