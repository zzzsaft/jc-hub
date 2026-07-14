# ERP SQL Diagnostic All-Business-Gates Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off diagnostic finance-composite path that normalizes explicit user constraints, runs multiple independently guarded read-only queries, joins real results, and produces Analyst/Reviewer conclusions for the five acceptance questions.

**Architecture:** Reuse the existing ERP SQL toolchain and generalize the current three-step `ComplexQueryGraphExecutor` instead of creating another agent framework. A small diagnostic policy/normalizer qualifies the request; a finite plan builder creates query steps; each step uses template retrieval first, atomic composition second, and the existing guarded LLM SQL generator last. A result composer reports deterministic join coverage, then a two-call analysis service produces and reviews the narrative using the existing external-data protection switches.

**Tech Stack:** TypeScript 5.7, Node.js 20 test runner, Zod 4, Mastra workflow tools, existing SQL Server Guard/Runtime Guard/executor, React/Vite frontend.

## Global Constraints

- `ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES` is enabled only when its value is exactly lowercase `true`; default behavior is unchanged.
- The path is limited to the authenticated ERP SQL main workflow, finance composite requests, `modules` containing `finance`, and `sensitive.finance === "full"`.
- One complex question may execute several database calls, but each call contains exactly one read-only `SELECT` and still passes Company, physical schema, SQL Guard, Runtime Guard, row, query-count, timeout, concurrency, and audit enforcement.
- Template retrieval is first, existing atomic composition second, and existing LLM SQL generation only the final fallback.
- Deterministic normalization may restore only explicit time, threshold, comparison, and Top-N text; it must not freely rewrite the plan.
- Diagnostic output is always `estimate` and includes `diagnostic_all_business_gates_bypassed`; add `diagnostic_plan_normalized` and `diagnostic_llm_sql_fallback` only when actually used.
- Do not add dependencies, database migrations, metric approvals, Golden writes, ERP writes, or a vector database/RAG platform.
- Per user instruction, do not use a TDD RED phase: implement each bounded task first, then add and run focused tests before committing.

---

### Task 1: Diagnostic policy and deterministic plan normalization

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/diagnostic/diagnosticBusinessGate.ts`
- Create: `apps/server/src/modules/erpSqlAgent/diagnostic/DiagnosticPlanNormalizer.ts`
- Create: `apps/server/src/modules/erpSqlAgent/diagnostic/index.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts:38-114`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts:45-70`
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts:70-138`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts:364-415`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/service/AnalysisPlanCoverageService.ts:180-264`
- Test: `apps/server/test/erpSqlAgent/diagnosticPlanNormalizer.test.ts`
- Test: `apps/server/test/erpSqlAgent/metricComposer.test.ts`
- Test: `apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts`

**Interfaces:**
- Produces: `isAllBusinessGatesDiagnosticEnabled(): boolean`.
- Produces: `qualifiesForAllBusinessGatesDiagnostic(plan: AnalysisPlan | undefined, scope: ErpSqlAccessScope): boolean`.
- Produces: `DiagnosticPlanNormalizer.normalize(question: string, plan: AnalysisPlan): DiagnosticPlanNormalizationResult`.
- Produces: `AnalysisPlanTimeRange` member `{ kind: "current_year_first_half" }`.
- Produces: filter shape `{ metric: string; op: "lt" | existing ops; value?: number }`, using ratio `0.2` for “低于 20%”.

- [ ] **Step 1: Add the exact-true policy and trusted finance qualification**

Create the minimal policy module:

```ts
export const DIAGNOSTIC_ALL_BUSINESS_GATES_WARNING = "diagnostic_all_business_gates_bypassed";
export const DIAGNOSTIC_PLAN_NORMALIZED_WARNING = "diagnostic_plan_normalized";
export const DIAGNOSTIC_LLM_SQL_FALLBACK_WARNING = "diagnostic_llm_sql_fallback";

export function isAllBusinessGatesDiagnosticEnabled(): boolean {
  return process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES === "true";
}

export function qualifiesForAllBusinessGatesDiagnostic(
  plan: AnalysisPlan | undefined,
  scope: ErpSqlAccessScope,
): boolean {
  const metrics = new Set([...(plan?.metrics ?? []), ...(plan?.requiredMetrics ?? [])]);
  return isAllBusinessGatesDiagnosticEnabled()
    && Boolean(plan?.route === "complex_composed" || metrics.size >= 2)
    && scope.modules.includes("finance")
    && scope.sensitive.finance === "full";
}
```

Do not accept `devFullAccess` as a separate shortcut; the existing dev scope already explicitly contains finance and full sensitive access.

- [ ] **Step 2: Extend the plan contract for first-half and explicit thresholds**

Add `current_year_first_half` to the time-range union and Zod schema. Extend `AnalysisPlanFilter` and its Zod schema with `op: "lt"` and optional finite `value`. Keep the existing Planner prompt values and add `lt` plus `value` so old plans remain compatible.

```ts
export type AnalysisPlanFilter = {
  metric: string;
  op: "rank_high" | "rank_low" | "high" | "low" | "overdue" | "lt";
  value?: number;
};
```

- [ ] **Step 3: Implement deterministic normalization and correction audit**

Create these exact result types and service:

```ts
export type DiagnosticPlanCorrection = {
  field: string;
  before: unknown;
  after: unknown;
  sourceText: string;
};

export type DiagnosticPlanNormalizationResult = {
  plan: AnalysisPlan;
  corrections: DiagnosticPlanCorrection[];
  warnings: string[];
};

export class DiagnosticPlanNormalizer {
  normalize(question: string, plan: AnalysisPlan): DiagnosticPlanNormalizationResult;
}
```

Use bounded regexes only:

```ts
const firstHalf = /今年上半年/u;
const recentMonths = /最近\s*(\d{1,2})\s*个?月/u;
const calendarMonth = /(?:^|\D)(1[0-2]|0?[1-9])\s*月份?/u;
const marginBelow = /毛利率?\s*(?:低于|小于|<)\s*(\d+(?:\.\d+)?)\s*%/u;
const topN = /(?:最高|最多|前)\s*(\d{1,3})\s*(?:类|个|名|条)?/u;
```

Apply: “今年上半年” → `{kind:"current_year_first_half"}`; “最近 3 个月” → `{kind:"relative", days:90}` while retaining existing `completeMonthCount:3` for the growth scenario; “6 月份” → `{kind:"month", month:6}`; “毛利低于 20%” → replace/add `{metric:"gross_margin_rate", op:"lt", value:0.2}`; Top N → clamped `1..500`. Record a correction only when the normalized value differs.

- [ ] **Step 4: Make Composer and Runtime Guard understand the normalized constraints**

For `current_year_first_half`, emit and verify the same two clauses:

```sql
TimeField >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
TimeField < DATEFROMPARTS(YEAR(GETDATE()), 7, 1)
```

For `{metric:"gross_margin_rate", op:"lt", value:0.2}`, make the metric composer place the aggregate predicate in `HAVING` or the final composed query predicate, never in a pre-aggregation `WHERE`. Extend coverage verification so it requires a `< 0.2` predicate bound to the gross-margin-rate output/expression; a merely ascending sort must not satisfy it.

- [ ] **Step 5: Add focused post-implementation tests**

Test exact switch parsing (`undefined`, `false`, `1`, `TRUE`, `true`), finance/full-sensitive qualification, and the four normalizations. Assert idempotence: normalizing an already-correct plan yields zero corrections. Add SQL assertions for Jan 1–Jul 1 and `< 0.2`, plus Runtime Guard rejection when either explicit constraint is missing.

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/diagnosticPlanNormalizer.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/server/src/modules/erpSqlAgent/diagnostic apps/server/src/modules/erpSqlAgent/planner apps/server/src/modules/erpSqlAgent/runtimeGuard apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts apps/server/test/erpSqlAgent/diagnosticPlanNormalizer.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts
git commit -m "feat(erp-sql): normalize diagnostic finance plans"
```

### Task 2: Generalize the complex query graph into finite finance query steps

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryPlanService.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryPlan.test.ts`
- Test: `apps/server/test/erpSqlAgent/erpComplexQueryRunner.test.ts`

**Interfaces:**
- Consumes: normalized `AnalysisPlan` from Task 1.
- Produces: string `ComplexQueryStepId`, not the current three-value union.
- Produces: `ComplexQueryStep` with explicit `question`, `module`, `metrics`, `dimensions`, `joinKeys`, dependencies, and limit.
- Preserves: current `product_sales_inventory_backlog_trend` plan and behavior.

- [ ] **Step 1: Generalize types without changing graph execution semantics**

Use the existing graph executor and replace hard-coded product-only types with:

```ts
export type ComplexQueryStepId = string;

export type ComplexQueryStep = {
  id: ComplexQueryStepId;
  question: string;
  capabilityCode: string;
  module: "sales" | "inventory" | "finance";
  metrics: string[];
  dimensions: string[];
  joinKeys: string[];
  dependsOn: ComplexQueryStepId[];
  timeRange?: AnalysisPlanTimeRange;
  filters: AnalysisPlan["filters"];
  orderBy: AnalysisPlan["orderBy"];
  limit: number;
};

export type ComplexQueryPlan = {
  scenario: string;
  objective: string;
  resultLimit: number;
  entityGrain: string[];
  steps: ComplexQueryStep[];
  joinPolicy: { keys: string[]; allowNameBasedJoin: false };
  budget: { maxQueries: 8; maxRowsPerQuery: 500; timeoutMs: 30_000 };
  diagnostic: boolean;
};
```

Keep cycle detection, max query count, max rows, abort propagation, failed dependency skipping, and parallel execution of independent layers.

- [ ] **Step 2: Add finite step recipes for the five acceptance shapes**

Keep the existing Q3 recipe. For diagnostic qualified plans, derive steps by requested metrics, not by Router capability:

- sales anchor: `order_amount` or `invoice_revenue`, dimensions from customer/product/order/product_category;
- margin: `gross_margin_rate` at the same available grain;
- costs: one step containing material/labor/burden/subcontract/cost-component metrics;
- inventory: `inventory_on_hand_qty` keyed by Company/product;
- backlog: open shipping quantity/amount keyed by Company/product;
- collection: delay days/overdue amount keyed by Company/customer/order.

The builder must cap at eight steps and merge metrics with identical module, dimensions, filters, time range, and dependencies into one step. Never create one step per metric when a single aggregate SELECT can safely return the group.

- [ ] **Step 3: Narrow each step from the normalized source plan**

Replace the product-only `narrowPlan()` with:

```ts
function narrowPlan(step: ComplexQueryStep, source: AnalysisPlan): AnalysisPlan {
  return {
    route: "complex_composed",
    mode: "decision_support",
    scenario: source.scenario,
    grain: step.dimensions,
    dimensions: step.dimensions,
    metrics: step.metrics,
    requiredMetrics: step.metrics,
    filters: step.filters,
    orderBy: step.orderBy,
    limit: step.limit,
    timeRange: step.timeRange,
    assumptions: source.assumptions,
  };
}
```

Add upstream filters only for exact keys present in both the anchor result and dependent step. Keep name-based joins disabled.

- [ ] **Step 4: Add post-implementation plan/runner tests**

Assert the current Q3 recipe is unchanged. Add four finance plans matching Q1/Q2/Q4/Q5 and assert expected step groups, limits, time/threshold propagation, no cycles, at most eight queries, and exact dependency skipping.

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/complexQueryPlan.test.ts apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts apps/server/test/erpSqlAgent/erpComplexQueryRunner.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/server/src/modules/erpSqlAgent/complexQuery apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts apps/server/test/erpSqlAgent/complexQueryPlan.test.ts apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts apps/server/test/erpSqlAgent/erpComplexQueryRunner.test.ts
git commit -m "feat(erp-sql): plan diagnostic finance query graphs"
```

### Task 3: Execute every step through template, composer, then guarded LLM fallback

**Files:**
- Create: `apps/server/src/ai/mastra/workflows/erpComplexQueryStepExecutor.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:220-340,946-1030`
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts:409-850`
- Modify: `apps/server/src/modules/erpSqlAgent/generator/service/LlmSqlGeneratorService.ts:30-130`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/types/SqlRuntimeGuardTypes.ts:32-52`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/service/SqlRuntimeGuardService.ts:13-48`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/service/AnalysisPlanCoverageService.ts:35-75`
- Test: `apps/server/test/erpSqlAgent/erpComplexQueryStepExecutor.test.ts`
- Test: `apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts`
- Test: `apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: `ComplexQueryStep`, narrowed `AnalysisPlan`, original `QueryPlan`, authorized `ErpSqlAccessScope`.
- Produces: `executeDiagnosticComplexQueryStep(input): Promise<ComplexQueryStepResult>`.
- Produces per step: `source?: "template" | "composer" | "llm"`, `sqlCount: 1`, warnings, fields, rows, row count, truncation, and semantic status.

- [ ] **Step 1: Extract the current step execution into one reusable function**

Create:

```ts
export type DiagnosticComplexStepInput = {
  question: string;
  step: ComplexQueryStep;
  analysisPlan: AnalysisPlan;
  queryPlan: QueryPlan;
  accessScope: ErpSqlAccessScope;
  signal: AbortSignal;
};

export async function executeDiagnosticComplexQueryStep(
  input: DiagnosticComplexStepInput,
): Promise<ComplexQueryStepResult>;
```

The function must begin with `assertModuleAllowed(input.accessScope, [input.step.module])`; finance steps additionally require `sensitive.finance === "full"`. Return structured unsupported/failed results instead of throwing business-generation errors; rethrow aborts.

- [ ] **Step 2: Implement strict fallback order**

For each step:

1. Call `runFindSqlTemplateTool` with the step question, narrowed plan, required metrics and derived slots.
2. If a candidate exists, call `runExecuteSqlTemplateTool`; accept only a valid, executed result.
3. Otherwise call `runComposeAtomicMetricsTool(..., "estimate", ..., step.module, {allowDiagnosticUnapprovedMetrics:true})`.
4. If composition fails, call `runFindSqlReferenceTool`, `runGenerateSqlTool(..., "estimate")`, `runValidateSqlTool`, `runValidateSqlRuntimeTool`, then `runExecuteSqlTool`.
5. Add `diagnostic_llm_sql_fallback` only at step 4.

Every branch must end in the existing executor, which applies Company scope and query limits. Do not call `ErpSqlQueryClient` directly. Store only one SQL generation per step, so `sqlCount` is always 0 or 1.

Update `runComposeAtomicMetricsTool` so `allowDiagnosticUnapprovedMetrics` accepts either the existing narrow diagnostic predicate or the new trusted all-business-gates predicate passed by the main workflow. The public Mastra tool remains approved-only because it never receives that trusted option/scope.

- [ ] **Step 3: Permit diagnostic finance LLM generation without removing physical guards**

Add an explicit option to `LlmSqlGeneratorService.generate` or `SqlGeneratorPlan`, named `diagnosticBypassBusinessGates`, and use it only to skip `isStrictFinanceWithoutMetric`. Do not alter `hasNoSchemaEvidence`, the system prompt, schema restriction, `sqlGuardService.validate`, repair guard, or single-SELECT rules.

```ts
if (!plan.diagnosticBypassBusinessGates && isStrictFinanceWithoutMetric(plan)) {
  return noApprovedFinanceMetricResult(plan);
}
```

- [ ] **Step 4: Split Runtime Guard physical safety from diagnostic business coverage**

Add these optional fields to `SqlRuntimeGuardInput`:

```ts
diagnosticBusinessGateBypass?: boolean;
diagnosticRequiredCoverage?: {
  time: boolean;
  filters: string[];
  sorting: boolean;
  limit: boolean;
};
```

When `diagnosticBusinessGateBypass` is false, preserve current behavior. When true:

- always run `schemaGuard.validate` unchanged; its result remains authoritative for single SELECT, physical schema/fields, Company and finance SQL safety;
- run `evaluateSqlSemantic` for audit, but downgrade non-physical family/metric mismatch to `estimate` instead of making the result invalid;
- validate only the normalized explicit slots selected by `diagnosticRequiredCoverage` through `AnalysisPlanCoverageService`; missing explicit time, numeric threshold, requested sorting or Top-N remains `semantic_mismatch` and blocks execution;
- return the full observed semantic/coverage errors for traceability even when a business-only error is non-blocking.

This is the only Runtime Guard bypass. Do not skip `sqlGuardService`, executor access scoping, query budgets or audit.

- [ ] **Step 5: Wire diagnostic qualification before all capability mismatch exits**

In `runErpSqlToolchain`, normalize the analyzed plan only after access scope exists, then compute `diagnosticAllBusinessGates`. When true:

- require finance authorization before template/composer calls;
- push `diagnostic_all_business_gates_bypassed`;
- bypass Router lock mismatch, capability coverage, clarification candidates caused only by business coverage, and existing complex recipe rejection;
- build/run the generalized complex plan;
- never bypass access, SQL or runtime guards.

Keep the current production and narrower diagnostic branches byte-for-byte equivalent when the new switch is off.

- [ ] **Step 6: Add post-implementation execution and security tests**

Test template acceptance skips composer/LLM; template miss uses composer; composer miss uses LLM and warning; invalid field, multi-statement, write SQL, missing Company and out-of-scope Company all execute zero DB calls. Verify diagnostic Runtime Guard tolerates metric-family/dimension-review mismatch but still rejects missing explicit first-half, `<20%`, sorting or Top-N coverage. Test a sales-only scope and masked finance scope both fail before retrieval/generation. Test switch values other than exact `true` still return the old `capability_route_mismatch`.

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/erpComplexQueryStepExecutor.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/server/src/ai/mastra/workflows/erpComplexQueryStepExecutor.ts apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts apps/server/src/modules/erpSqlAgent/generator/service/LlmSqlGeneratorService.ts apps/server/src/modules/erpSqlAgent/runtimeGuard apps/server/test/erpSqlAgent/erpComplexQueryStepExecutor.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "feat(erp-sql): execute diagnostic query steps"
```

### Task 4: Generic deterministic composition plus Analyst/Reviewer

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryResultComposer.ts`
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryAnalysisService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryAnalysisService.test.ts`
- Test: `apps/server/test/erpSqlAgent/auditDataProtection.test.ts`

**Interfaces:**
- Produces: generic `ComplexQueryComposedResult` with dynamic fields, rows and `joinCoverage` entries per dependent step.
- Produces: `ComplexQueryAnalysisService.analyze(input): Promise<ComplexQueryReviewedAnalysis>`.
- Preserves: existing Q3 field values and coverage meaning while migrating the API coverage shape to an array.

- [ ] **Step 1: Generalize deterministic joining**

Use the first independent successful step as anchor. For every dependent result, join only on `plan.joinPolicy.keys` that exist in both field lists. Reject duplicate exact keys per step; never use fuzzy/name-based matching. Return:

```ts
export type ComplexQueryJoinCoverage = {
  stepId: string;
  keys: string[];
  anchorRows: number;
  matchedRows: number;
  unmatchedRows: number;
  coverageRate: number;
};

export type ComplexQueryComposedResult = {
  status: "completed" | "partial";
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  joinCoverage: ComplexQueryJoinCoverage[];
};
```

Prefix colliding non-key fields with the step ID. Preserve nulls and emit `complex_join_unmatched:<stepId>:<count>`.

- [ ] **Step 2: Add a two-call analysis service with existing privacy switches**

Define:

```ts
export type ComplexQueryReviewedAnalysis = {
  summary: string;
  highlights: string[];
  caveats: string[];
  review: { status: "approved" | "revised" | "rejected"; issues: string[] };
  audit: { externalDataSent: boolean; externalRawRowsSent: boolean };
};
```

The Analyst system prompt must say “only use supplied results; cite step/field evidence; never infer missing causes.” The Reviewer receives the Analyst JSON plus question, plan corrections, step status, row counts, coverage and warnings; it may return approved, revised text, or rejected. A rejected review returns no highlights and a caveat explaining the evidence gap.

Reuse `ERP_RESULT_NARRATOR_EXTERNAL_ENABLED`, `ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED`, and `ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED`. With external narration off, return deterministic step/row/coverage text and make no LLM call. With raw rows off, send only protected warnings, field categories and numeric aggregates as `ResultNarratorService` does.

- [ ] **Step 3: Integrate analysis after composition**

Call Analyst/Reviewer only if at least one step is usable. Pass partial failures and unmatched coverage as caveats. Do not let either role generate SQL or call tools. If both LLM calls fail, retain the deterministic fallback analysis and add `complex_analysis_llm_failed`.

- [ ] **Step 4: Add post-implementation composition, role and privacy tests**

Test Q3 compatibility, multi-key customer/order/product joins, duplicate key rejection, unmatched preservation, partial steps, Analyst prompt evidence, Reviewer revision/rejection, external-off zero requester calls, aggregate-only payload, and raw-row payload only with all three existing trusted switches.

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts apps/server/test/erpSqlAgent/complexQueryAnalysisService.test.ts apps/server/test/erpSqlAgent/auditDataProtection.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/server/src/modules/erpSqlAgent/complexQuery apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts apps/server/test/erpSqlAgent/complexQueryAnalysisService.test.ts apps/server/test/erpSqlAgent/auditDataProtection.test.ts
git commit -m "feat(erp-sql): review diagnostic composite results"
```

### Task 5: Output contract and frontend diagnostic visibility

**Files:**
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:74-155,286-336,1380-1449`
- Modify: `apps/web/src/pages/agent/types.ts:105-160`
- Modify: `apps/web/src/pages/agent/components/AgentResultDrawer.tsx:21-92`
- Modify: existing agent page LESS file containing `.erp-chat-complex-*` styles
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: generalized graph, correction audit, composed result, reviewed analysis.
- Produces: `complexAnalysis.scenario: string`, dynamic step IDs/labels/source/sqlCount, coverage array, corrections, and reviewer state.

- [ ] **Step 1: Extend the server Zod output contract**

Change only `complexAnalysis`; retain existing top-level fields:

```ts
complexAnalysis: z.object({
  scenario: z.string(),
  status: z.enum(["completed", "partial", "failed"]),
  steps: z.array(z.object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["completed", "partial", "clarification_required", "unsupported", "failed", "skipped"]),
    source: z.enum(["template", "composer", "llm"]).optional(),
    sqlCount: z.number().int().min(0).max(1),
    rowCount: z.number(),
    error: z.string().optional(),
  })),
  joinCoverage: z.array(z.object({
    stepId: z.string(), keys: z.array(z.string()), anchorRows: z.number(),
    matchedRows: z.number(), unmatchedRows: z.number(), coverageRate: z.number(),
  })),
  corrections: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown(), sourceText: z.string() })),
  review: z.object({ status: z.enum(["approved", "revised", "rejected"]), issues: z.array(z.string()) }).optional(),
}).optional()
```

Always force diagnostic complex output to `semanticStatus:"estimate"`, `executionPath:"estimate"`, and the existing finance disclaimer.

- [ ] **Step 2: Update the result drawer without adding a new page**

Replace the fixed `STEP_LABELS` lookup with server-provided `label`. Show source (`模板`/`指标组合`/`LLM 兜底`), `sqlCount`, row count, each coverage percentage, plan corrections, and reviewer status/issues. Reuse the current card and responsive styles; no new dependency or chart.

- [ ] **Step 3: Add workflow/output assertions**

For each of Q1/Q2/Q4/Q5 assert: no `capability_route_mismatch`, at least two steps, diagnostic warning, estimate/disclaimer, `sqlCount <= 1` per step, normalized Q2/Q4 corrections, and reviewer state. Keep all existing Q3 assertions passing after adapting its coverage shape.

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
npm run build:web
```

Expected: test passes; web build succeeds with only previously documented warnings.

- [ ] **Step 4: Commit Task 5**

```bash
git add apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts apps/web/src/pages/agent/types.ts apps/web/src/pages/agent/components/AgentResultDrawer.tsx apps/web/src/pages/agent apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "feat(erp-sql): expose diagnostic query analysis"
```

### Task 6: Full regression, real five-question acceptance, and implementation log

**Files:**
- Modify: `docs/operations/codex-implementation-log.md`
- Create or update: a timestamped acceptance artifact under `tmp/erp-sql-diagnostic-five-question-acceptance/` (do not commit secrets or raw sensitive rows)

**Interfaces:**
- Consumes: completed implementation and configured read-only diagnostic environment.
- Produces: verification evidence for tests, builds, five frontend runs, query counts, row counts, coverage, warnings, reviewer state, and exact remaining gaps.

- [ ] **Step 1: Run the targeted ERP SQL regression**

Run all ERP SQL Agent test files using the repository runner or explicit Node test invocation already used by the branch. Record total/pass/fail counts; do not claim success from stale output.

- [ ] **Step 2: Run both builds**

```bash
npm run build:server
npm run build:web
```

Expected: both exit 0. Classify any warning as new or pre-existing.

- [ ] **Step 3: Start the server with the diagnostic switch and read-only DB access**

Set `ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES=true` only for the acceptance process. Keep the existing authorization policy, finance sensitive permission, Company scope, SQL execution switch, query limits and audit switches unchanged. Do not run migrations or writes.

- [ ] **Step 4: Submit the five questions through `/agent/chat`**

For every question capture: trace ID, normalized plan corrections, number of query steps, source and row count per step, join coverage, warnings, semantic status, Analyst answer, Reviewer state, and exact failed/missing step. Verify all executed SQL traces are single read-only SELECT statements.

- [ ] **Step 5: Update the implementation log**

Prepend a concise entry to `docs/operations/codex-implementation-log.md` containing implementation scope, security boundaries retained, test/build evidence, and the five-question outcome. Do not describe partial or zero-data answers as complete business answers.

- [ ] **Step 6: Commit verification documentation**

```bash
git add docs/operations/codex-implementation-log.md
git commit -m "docs(erp-sql): record full diagnostic acceptance"
```

- [ ] **Step 7: Final branch review**

Run `git status --short`, `git diff --check`, inspect commits since `ca13ea47`, and use `superpowers:verification-before-completion` followed by `superpowers:requesting-code-review`. Preserve the pre-existing untracked `node_modules` and report it separately.
