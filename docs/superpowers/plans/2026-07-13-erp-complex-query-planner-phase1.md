# ERP Complex Query Planner Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first sales/inventory/backlog composite scenario's single-SQL path with a validated query task graph, guarded step execution, deterministic composition, partial-result reporting, and visible step progress.

**Architecture:** Reuse the existing `AnalysisPlannerService` to recognize `product_sales_inventory_backlog_trend`, then deterministically translate that `AnalysisPlan` into three typed steps. A small graph executor schedules independent/dependent work within a fixed budget; each production step continues through approved atomic metrics, runtime guard, access scope, and the existing SQL executor. A deterministic composer joins only `Company + product`, reports coverage, and produces the existing table response plus a `complexAnalysis` audit payload.

**Tech Stack:** TypeScript, Zod, Node `node:test`, Mastra workflow wrappers, React/Ant Design, existing ERP SQL services.

## Global Constraints

- ERP access remains read-only; no ERP or production-database writes are added.
- Planner output never authorizes free SQL and never expands the caller's Company/module/field scope.
- The first phase supports only `product_sales_inventory_backlog_trend` with sales, inventory, and open-shipping steps.
- Join keys are exactly `Company + product`; name-based and unregistered many-to-many joins are rejected.
- Maximum queries are 5, maximum rows per step are 500, and the graph deadline is 30,000 ms.
- Missing values stay missing and are never silently converted to zero.
- Existing simple-query behavior and response fields remain compatible.
- No new dependency is introduced.

---

## File Structure

- Create `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`: task-plan, step-result, coverage, and composed-result contracts.
- Create `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryPlanService.ts`: scenario-to-task-graph translation and validation.
- Create `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryGraphExecutor.ts`: dependency scheduling, budget enforcement, partial/skipped states.
- Create `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryResultComposer.ts`: deterministic `Company + product` merge and join coverage.
- Create `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`: public exports.
- Create `apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts`: production adapter that composes, guards, executes, and traces each task step.
- Modify `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`: route the supported scenario through the complex runner and expose compatible output.
- Create `apps/server/test/erpSqlAgent/complexQueryPlan.test.ts`.
- Create `apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts`.
- Create `apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts`.
- Modify `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`: workflow integration and simple-query regression.
- Modify `apps/web/src/pages/agent/types.ts`: typed complex-analysis response.
- Modify `apps/web/src/pages/agent/components/AgentChatPanels.tsx`: labels for complex task stages.
- Modify `apps/web/src/pages/agent/components/AgentResultDrawer.tsx`: plan, step state, and coverage details.
- Modify `docs/api/erp-sql-agent.md`, `docs/frontend/erp-migration.md`, and `docs/operations/codex-implementation-log.md`.

### Task 1: Typed Plan Translation and Validation

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryPlanService.ts`
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryPlan.test.ts`

**Interfaces:**
- Consumes: `AnalysisPlan` from `planner/types/SqlPlannerTypes.ts`.
- Produces: `ComplexQueryPlan`, `ComplexQueryStep`, `ComplexQueryPlanResult`, and `complexQueryPlanService.build(analysisPlan)`.

- [ ] **Step 1: Write the failing plan tests**

```ts
test("builds the sales inventory backlog task graph", () => {
  const result = complexQueryPlanService.build(makeAnalysisPlan());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.entityGrain, ["Company", "product"]);
  assert.deepEqual(result.plan.steps.map((step) => step.id), ["sales_growth", "inventory", "backlog"]);
  assert.deepEqual(result.plan.steps[1].dependsOn, ["sales_growth"]);
  assert.deepEqual(result.plan.joinPolicy.keys, ["Company", "product"]);
});

test("rejects unsupported scenarios and cyclic or over-budget plans", () => {
  assert.deepEqual(complexQueryPlanService.build({ ...makeAnalysisPlan(), scenario: "other" }), {
    ok: false,
    reason: "unsupported_complex_scenario",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryPlan.test.ts`

Expected: FAIL because `complexQueryPlanService` does not exist.

- [ ] **Step 3: Add the minimal contracts and deterministic translator**

```ts
export type ComplexQueryStepStatus = "completed" | "partial" | "clarification_required" | "unsupported" | "failed" | "skipped";

export type ComplexQueryStep = {
  id: "sales_growth" | "inventory" | "backlog";
  capabilityCode: string;
  metrics: string[];
  dimensions: ["product"];
  dependsOn: Array<"sales_growth" | "inventory" | "backlog">;
  inputFrom?: { stepId: "sales_growth"; keys: ["Company", "product"] };
  timeRange?: AnalysisPlanTimeRange;
  timeGrain?: "month";
  limit: number;
};

export type ComplexQueryPlan = {
  scenario: "product_sales_inventory_backlog_trend";
  objective: string;
  entityGrain: ["Company", "product"];
  steps: ComplexQueryStep[];
  joinPolicy: { keys: ["Company", "product"]; allowNameBasedJoin: false };
  budget: { maxQueries: 5; maxRowsPerQuery: 500; timeoutMs: 30000 };
};
```

`build()` returns exactly three steps: monthly `order_amount`, current `inventory_on_hand_qty`, and current `open_shipping_qty/open_shipping_amount`. It validates unique ids, known dependencies, acyclic graph, exact join keys, and the fixed budget.

- [ ] **Step 4: Run the plan tests and verify GREEN**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryPlan.test.ts`

Expected: all plan tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/erpSqlAgent/complexQuery apps/server/test/erpSqlAgent/complexQueryPlan.test.ts
git commit -m "feat(erp-sql): add complex query task plans"
```

### Task 2: Dependency Graph Execution and Partial States

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryGraphExecutor.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts`

**Interfaces:**
- Consumes: validated `ComplexQueryPlan` and `executeStep(step, upstream, signal)` callback.
- Produces: `ComplexQueryGraphResult` with one typed result for every declared step.

- [ ] **Step 1: Write failing scheduling tests**

```ts
test("runs sales first and starts dependent inventory and backlog after it", async () => {
  const calls: string[] = [];
  const result = await new ComplexQueryGraphExecutor().execute(plan, async (step) => {
    calls.push(step.id);
    return completed(step.id);
  });
  assert.equal(calls[0], "sales_growth");
  assert.deepEqual(new Set(calls.slice(1)), new Set(["inventory", "backlog"]));
  assert.equal(result.status, "completed");
});

test("skips dependent steps when sales fails", async () => {
  const result = await new ComplexQueryGraphExecutor().execute(plan, async (step) =>
    step.id === "sales_growth" ? failed(step.id, "query_failed") : completed(step.id));
  assert.deepEqual(result.steps.map((step) => step.status), ["failed", "skipped", "skipped"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts`

Expected: FAIL because the executor is missing.

- [ ] **Step 3: Implement the smallest dependency scheduler**

Use topological readiness, `Promise.all` for each ready layer, one linked abort controller for the 30-second deadline, and no retries. A failed/unsupported step marks only descendants `skipped`; independent completed steps remain available. Enforce `steps.length <= maxQueries` before invoking callbacks.

```ts
export class ComplexQueryGraphExecutor {
  async execute(
    plan: ComplexQueryPlan,
    executeStep: ComplexQueryStepRunner,
    signal?: AbortSignal,
  ): Promise<ComplexQueryGraphResult>;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts`

Expected: scheduling, skip propagation, deadline, and budget tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/erpSqlAgent/complexQuery apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts
git commit -m "feat(erp-sql): execute complex query graphs"
```

### Task 3: Deterministic Result Composition

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/complexQuery/ComplexQueryResultComposer.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/types.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/complexQuery/index.ts`
- Test: `apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts`

**Interfaces:**
- Consumes: step results whose fields contain `Company`, `product`, and declared metrics.
- Produces: visible fields/rows plus `joinCoverage`, warnings, and per-step status.

- [ ] **Step 1: Write failing composition tests**

```ts
test("joins exact Company and product keys without treating missing values as zero", () => {
  const result = new ComplexQueryResultComposer().compose(plan, [sales, inventory, backlog]);
  assert.deepEqual(result.fields, ["Company", "product", "sales_growth_rate", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount"]);
  assert.equal(result.rows[0][3], null);
  assert.deepEqual(result.joinCoverage, { anchorRows: 2, matchedRows: 1, unmatchedRows: 1, coverageRate: 0.5 });
});

test("rejects duplicate Company and product rows", () => {
  assert.throws(() => composer.compose(plan, [duplicateSales, inventory, backlog]), /duplicate_join_key/u);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts`

Expected: FAIL because the composer is missing.

- [ ] **Step 3: Implement exact-key composition and deterministic growth calculation**

The sales step returns monthly rows. Group them by `Company + product`, sort periods, and calculate `(latest - earliest) / abs(earliest)` when two valid periods and a non-zero baseline exist; otherwise emit `null`. Use the sales products as the anchor set, exact-map inventory/backlog by `Company\u0000product`, preserve nulls, and compute full-match coverage.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts`

Expected: exact join, null, growth, duplicate-key, and partial-result tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/erpSqlAgent/complexQuery apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts
git commit -m "feat(erp-sql): compose complex query results"
```

### Task 4: Mastra Workflow Integration

**Files:**
- Create: `apps/server/src/ai/mastra/workflows/erpComplexQueryRunner.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Modify: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: supported `AnalysisPlan`, existing access scope, trace callbacks, atomic metric composer, runtime guard, and SQL executor.
- Produces: `complexAnalysis` in `ErpSqlToolchainOutput`, composed table fields/rows, partial warnings, and SSE tool events.

- [ ] **Step 1: Write the failing workflow test**

```ts
test("ERP SQL toolchain executes sales inventory backlog as three guarded queries", async () => {
  const result = await runErpSqlToolchainWorkflow({ question });
  assert.equal(executorCalls, 3);
  assert.deepEqual(composedMetricGroups, [
    ["order_amount"],
    ["inventory_on_hand_qty"],
    ["open_shipping_qty", "open_shipping_amount"],
  ]);
  assert.equal(result.success, true);
  assert.equal(result.complexAnalysis?.scenario, "product_sales_inventory_backlog_trend");
  assert.equal(result.complexAnalysis?.steps.length, 3);
});
```

Also add a regression proving a single purchase/sales lookup does not call the complex runner.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

Expected: the target scenario still follows the single composite path and the new assertions fail.

- [ ] **Step 3: Implement the production runner and output schema**

For each task step, derive a narrow `AnalysisPlan`, call `runComposeAtomicMetricsTool`, call `runValidateSqlRuntimeTool` with the narrow plan and a step-specific question, and then call `runExecuteSqlTool`. Emit step ids `complex_query_sales_growth`, `complex_query_inventory`, `complex_query_backlog`, and `compose_complex_query_result` through the existing `step()` trace wrapper. Return `sql: ""` because no single SQL represents the composed answer; individual SQL remains protected in child trace data.

Add this optional schema shape:

```ts
complexAnalysis: z.object({
  scenario: z.literal("product_sales_inventory_backlog_trend"),
  status: z.enum(["completed", "partial", "failed"]),
  steps: z.array(z.object({ id: z.string(), status: z.string(), rowCount: z.number(), error: z.string().optional() })),
  joinCoverage: z.object({ anchorRows: z.number(), matchedRows: z.number(), unmatchedRows: z.number(), coverageRate: z.number() }),
}).optional()
```

- [ ] **Step 4: Run server tests and verify GREEN**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/complexQueryPlan.test.ts apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

Expected: all selected tests pass, including simple-query regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/mastra/workflows apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "feat(erp-sql): run complex queries as guarded task graphs"
```

### Task 5: Client Visibility and Documentation

**Files:**
- Modify: `apps/web/src/pages/agent/types.ts`
- Modify: `apps/web/src/pages/agent/components/AgentChatPanels.tsx`
- Modify: `apps/web/src/pages/agent/components/AgentResultDrawer.tsx`
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/frontend/erp-migration.md`
- Modify: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Consumes: `complexAnalysis` response and existing SSE tool events.
- Produces: Chinese progress labels and a read-only result-detail summary.

- [ ] **Step 1: Add client types and labels**

Add `complexAnalysis` to `AgentSqlResult`, and map:

```ts
complex_query_sales_growth: "查询销售增长",
complex_query_inventory: "查询库存",
complex_query_backlog: "查询未交付",
compose_complex_query_result: "合并分析结果",
```

- [ ] **Step 2: Render task status and coverage in the result drawer**

Render only when `result.complexAnalysis` exists. Show each step id/status/row count and `matchedRows / anchorRows` coverage. Do not render raw child SQL or hidden rows.

- [ ] **Step 3: Update API, frontend, and implementation documentation**

Document `complexAnalysis`, `sql=""` for composed answers, partial status, fixed join keys, SSE labels, compatibility, and exact verification commands. Add the implementation record at the top of the log.

- [ ] **Step 4: Run full verification**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/complexQueryPlan.test.ts apps/server/test/erpSqlAgent/complexQueryGraphExecutor.test.ts apps/server/test/erpSqlAgent/complexQueryResultComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
npm run build:server
npm run build:web
git diff --check
```

Expected: all tests pass, both builds exit 0, and `git diff --check` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/agent docs/api/erp-sql-agent.md docs/frontend/erp-migration.md docs/operations/codex-implementation-log.md
git commit -m "docs(erp-sql): expose complex query execution details"
```

## Plan Self-Review

- Spec coverage: Phase 1 routing, typed plan, validation, dependencies, budgets, guarded subqueries, exact-key composition, partial states, progress, API/frontend docs, and verification are assigned to Tasks 1-5.
- Deliberate Phase 2 exclusions: RAG evidence packaging, Business Analyst, Evidence Reviewer, and Reviewer follow-up queries remain outside this plan, matching the approved phased design.
- Type consistency: `ComplexQueryPlan`, `ComplexQueryStep`, `ComplexQueryGraphResult`, and `complexAnalysis` are defined once and consumed by later tasks with matching names.
- Dependency check: no new package is required; all execution adapters use existing repository services and guards.
