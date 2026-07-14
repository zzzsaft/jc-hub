import { createLinkedAbortController } from "../../../lib/abort.js";
import type {
  ComplexQueryGraphResult,
  ComplexQueryPlan,
  ComplexQueryStep,
  ComplexQueryStepId,
  ComplexQueryStepResult,
  ComplexQueryStepRunner,
} from "./types.js";

export class ComplexQueryGraphExecutor {
  async execute(
    plan: ComplexQueryPlan,
    executeStep: ComplexQueryStepRunner,
    parentSignal?: AbortSignal,
  ): Promise<ComplexQueryGraphResult> {
    if (plan.steps.length > plan.budget.maxQueries) throw new Error("complex_query_budget_exceeded");
    const scope = createLinkedAbortController({
      parent: parentSignal,
      timeoutMs: plan.budget.timeoutMs,
      timeoutCode: "ERP_COMPLEX_QUERY_TIMEOUT",
      timeoutMessage: `complex query exceeded ${plan.budget.timeoutMs}ms`,
    });
    const results = new Map<ComplexQueryStepId, ComplexQueryStepResult>();
    const pending = new Map(plan.steps.map((step) => [step.id, step]));
    try {
      while (pending.size > 0) {
        const ready = [...pending.values()].filter((step) => step.dependsOn.every((id) => results.has(id)));
        if (ready.length === 0) throw new Error("invalid_complex_query_graph");
        const layer = await Promise.all(ready.map((step) => this.runStep(step, results, executeStep, scope.signal)));
        ready.forEach((step, index) => {
          results.set(step.id, layer[index]!);
          pending.delete(step.id);
        });
      }
    } finally {
      scope.cleanup();
    }
    const steps = plan.steps.map((step) => results.get(step.id) ?? skipped(step.id, "missing_step_result"));
    const usable = steps.filter((step) => step.status === "completed" || step.status === "partial").length;
    const status = usable === steps.length
      ? "completed"
      : usable === 0
        ? "failed"
        : "partial";
    return { status, steps };
  }

  private async runStep(
    step: ComplexQueryStep,
    results: ReadonlyMap<ComplexQueryStepId, ComplexQueryStepResult>,
    executeStep: ComplexQueryStepRunner,
    signal: AbortSignal,
  ): Promise<ComplexQueryStepResult> {
    const upstream = new Map(step.dependsOn.map((id) => [id, results.get(id)!]));
    const blocked = [...upstream.values()].find((result) => !["completed", "partial"].includes(result.status));
    if (blocked) return skipped(step.id, `dependency_failed:${blocked.id}`);
    try {
      const result = await executeStep(step, upstream, signal);
      return { ...result, id: step.id };
    } catch (error) {
      return {
        id: step.id,
        status: "failed",
        fields: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function skipped(id: ComplexQueryStepId, error: string): ComplexQueryStepResult {
  return { id, status: "skipped", fields: [], rows: [], rowCount: 0, truncated: false, warnings: [], error };
}
