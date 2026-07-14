import type { AgentComplexAnalysis } from "../types";

type LegacyComplexAnalysis = Omit<AgentComplexAnalysis, "steps" | "joinCoverage" | "corrections"> & {
  steps: Array<Omit<AgentComplexAnalysis["steps"][number], "label" | "sqlCount"> & {
    label?: string;
    sqlCount?: number;
  }>;
  joinCoverage?: AgentComplexAnalysis["joinCoverage"] | (Omit<AgentComplexAnalysis["joinCoverage"][number], "stepId" | "keys"> & {
    stepId?: string;
    keys?: string[];
  });
  corrections?: AgentComplexAnalysis["corrections"];
};

const LEGACY_STEP_LABELS: Record<string, string> = {
  sales_growth: "销售趋势",
  inventory: "库存",
  backlog: "未交付",
};

export function normalizeComplexAnalysis(analysis: AgentComplexAnalysis | LegacyComplexAnalysis): AgentComplexAnalysis {
  const coverage = analysis.joinCoverage;
  return {
    ...analysis,
    steps: analysis.steps.map((step) => ({
      ...step,
      label: step.label ?? LEGACY_STEP_LABELS[step.id] ?? step.id,
      sqlCount: step.sqlCount ?? 0,
    })),
    joinCoverage: Array.isArray(coverage)
      ? coverage
      : coverage ? [{ ...coverage, stepId: coverage.stepId ?? "legacy_join", keys: coverage.keys ?? ["Company", "product"] }] : [],
    corrections: analysis.corrections ?? [],
  };
}
