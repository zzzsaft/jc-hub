# ERP SQL Composite Route Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a validated Planner composite plan override an incorrect ordinary Router capability only when the existing diagnostic switch is exactly `true`.

**Architecture:** Keep capability governance unchanged and add one small workflow predicate over `AnalysisPlan`. The recognized inventory scenario continues through the existing three-step graph; other decision-support plans with at least two unique requested metrics use the existing `finance.composite_decision` diagnostic decision path.

**Tech Stack:** TypeScript, Node test runner, Mastra workflow, existing ERP SQL capability services.

## Global Constraints

- `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY` must equal the exact string `true`; all other values are disabled.
- Unknown Router capabilities, ordinary strict plans, single-metric plans, and missing required clarification slots remain fail-closed.
- Do not bypass access scope, Company scope, read-only SQL, schema validation, Runtime Guard, TOP, row, query-count, timeout, concurrency, or audit limits.
- Do not add dependencies, keyword routes, or capability publication changes.

---

### Task 1: Prove composite Router overrides fail today

**Files:**
- Modify: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: `runErpSqlToolchainWorkflow`, `runErpSqlToolchainWorkflowWithAccess`, existing `stubToolchain` fixtures.
- Produces: regression tests for inventory-task-graph and finance-composite Router overrides.

- [ ] **Step 1: Add an inventory composite failure test**

Extend the existing `ERP SQL toolchain executes sales inventory backlog as three guarded queries` test so that, with `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true`, a second call locked to `sales.order_detail` succeeds, executes three additional graph steps, and includes `diagnostic_composite_capability_bypass`.

```ts
const original = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
const overridden = await runErpSqlToolchainWorkflowWithAccess(
  { question, routeCapabilityCode: "sales.order_detail" },
  { accessScope: { ...TEST_SCOPE, modules: ["sales", "inventory"] } },
);
assert.equal(overridden.success, true);
assert.equal(overridden.capabilityCode, "complex.product_sales_inventory_backlog");
assert(overridden.warnings.includes("diagnostic_composite_capability_bypass"));
assert.equal(executorCalls, 6);
```

Restore the environment variable in `finally`.

- [ ] **Step 2: Add a finance composite failure test**

Extend `ERP SQL toolchain marks a diagnostic composite capability bypass` with a call whose Router locks `sales.order_detail` while the Planner returns a decision-support plan containing `order_amount` and `gross_margin_rate`.

```ts
const overridden = await runErpSqlToolchainWorkflow({
  question,
  routeCapabilityCode: "sales.order_detail",
});
assert.notEqual(overridden.reasonCode, "capability_route_mismatch");
assert.equal(overridden.capabilityCode, "finance.composite_decision");
assert(overridden.warnings.includes("diagnostic_composite_capability_bypass"));
```

- [ ] **Step 3: Preserve the non-composite boundary test**

Keep `ERP SQL toolchain clarifies before SQL when planner conflicts with locked route capability` unchanged; its strict single-metric plan must still return `capability_route_mismatch`, including when the environment switch is enabled in a separate assertion.

- [ ] **Step 4: Run RED tests**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Expected: the new inventory and finance override assertions fail with `capability_route_mismatch`; the pre-existing boundary test passes.

### Task 2: Implement the smallest Planner composite override

**Files:**
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: `AnalysisPlan`, `resolveCapability`, `DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING`.
- Produces: local predicate `shouldOverrideCompositeRoute(plan: AnalysisPlan | undefined): boolean`.

- [ ] **Step 1: Add the local predicate**

Add one workflow-local helper; do not add a service or new file.

```ts
function shouldOverrideCompositeRoute(plan: AnalysisPlan | undefined): boolean {
  if (process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY !== "true" || !plan) return false;
  if (plan.scenario === "product_sales_inventory_backlog_trend") return true;
  const metrics = new Set([...(plan.metrics ?? []), ...(plan.requiredMetrics ?? [])]);
  return plan.mode === "decision_support" && metrics.size >= 2;
}
```

- [ ] **Step 2: Allow the known inventory task graph to override Router lock**

After building `complexPlan`, compute the predicate. In the complex route mismatch condition, fail only when the predicate is false. When it is true, append `DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING` once before running the existing complex decision and graph.

```ts
const diagnosticCompositeOverride = shouldOverrideCompositeRoute(analyzedPlan);
if (input.routeCapabilityCode
  && ![capabilityCode, "finance.composite_decision"].includes(input.routeCapabilityCode)
  && !diagnosticCompositeOverride) {
  return capabilityFailure(
    trace,
    merge(intentResult.warnings, plan.warnings, analysisPlanResult.warnings, trace.warnings),
    input.routeCapabilityCode,
    "capability_route_mismatch",
  );
}
if (diagnosticCompositeOverride) trace.warnings.push(DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING);
```

- [ ] **Step 3: Route other validated composite plans through finance composite decision**

In the normal capability block, select `finance.composite_decision` only for the diagnostic composite predicate; otherwise retain the original locked/resolved selection. Suppress the Router mismatch check only for that predicate.

```ts
const decisionCapability = diagnosticCompositeOverride
  ? resolveCapability("finance.composite_decision")
  : lockedCapability;
const decision = decisionCapability
  ? runDecideSqlCapabilityTool(analysisPlanResult.analysisPlan, decisionCapability, governedFilters)
  : runResolveSqlCapabilityTool(analysisPlanResult.analysisPlan, capabilityCandidates, modules, governedFilters);
const routeMismatch = Boolean(lockedCapability && !diagnosticCompositeOverride && (
  (modules.length > 0 && !lockedCapability.modules.some((module) => modules.includes(module)))
  || decision.outcome === "unsupported"
));
```

The existing `decision.diagnosticBypass` branch adds the stable warning for the finance path.

- [ ] **Step 4: Run GREEN tests**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Expected: all Mastra ERP SQL tests pass, including the new override and unchanged fail-closed assertions.

- [ ] **Step 5: Commit the behavior change**

```bash
git add apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "feat(erp-sql): let composite plans override diagnostic routes"
```

### Task 3: Update the diagnostic contract and verify the full slice

**Files:**
- Modify: `.env.erp-agent.example`
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Consumes: the unchanged environment variable and warning name.
- Produces: an accurate operator-facing contract and acceptance record.

- [ ] **Step 1: Update configuration and API documentation**

Replace the finance-only wording with the exact Planner-override boundary: known inventory scenario, or `decision_support` with at least two unique metrics. State that unknown capability and non-composite mismatch remain blocked.

Use this contract language in both locations:

```text
诊断开关仅允许 Planner 已确认的复合计划覆盖错误的普通 Router capability：已识别的销售/库存/未交付场景，或 decision_support 模式下至少两个不同指标。未知 capability、普通 strict/单指标问题及所有 SQL 安全限制仍保持 fail-closed。
```

- [ ] **Step 2: Run the target regression suite**

Run with the project database configuration:

```bash
env CODEX_SANDBOX_NETWORK_DISABLED=0 DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env node -r dotenv/config --test --import tsx apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/erpComplexQueryRunner.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Expected: zero failures and a test count greater than the previous 180.

- [ ] **Step 3: Build the server**

Run:

```bash
npm run build:server
```

Expected: TypeScript exits 0.

- [ ] **Step 4: Re-run the five frontend questions**

Start the branch backend with `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true` and the local frontend, then submit the five agreed questions through `/agent/chat`. Record each visible answer, trace warnings, SQL presence, row count, and the next real failure if execution remains unavailable.

- [ ] **Step 5: Update the implementation log with observed evidence**

Record exact automated counts and all five frontend outcomes. Do not claim an answer was produced unless the page returned business rows or an analysis derived from them.

- [ ] **Step 6: Commit documentation and acceptance evidence**

```bash
git add .env.erp-agent.example docs/api/erp-sql-agent.md docs/operations/codex-implementation-log.md
git commit -m "docs(erp-sql): document composite route diagnostics"
```

### Task 4: Final verification and handoff

**Files:**
- Verify only; no planned code changes.

**Interfaces:**
- Consumes: committed implementation and documentation.
- Produces: clean diff evidence and a branch handoff that distinguishes passing automation from actual business-answer coverage.

- [ ] **Step 1: Verify worktree state**

Run `git diff --check`, `git status --short`, and inspect commits since base. Ignore the pre-existing untracked worktree `node_modules`; do not stage it.

- [ ] **Step 2: Report outcomes**

List automated test/build evidence, exact five-question UI outcomes, remaining governed data gaps, branch name, and commit IDs. Do not merge, push, or delete the worktree without explicit user direction.
