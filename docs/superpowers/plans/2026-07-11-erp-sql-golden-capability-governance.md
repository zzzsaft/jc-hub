# ERP SQL Golden Capability Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert ERP SQL golden questions into capability-contract acceptance tests, prevent scope-incorrect SQL from executing, distinguish unsupported capabilities from failures, repair routing and high-priority query assets, and keep the service available under bounded webpage concurrency.

**Architecture:** A versioned capability registry sits between structured planning and SQL/template selection. The planner emits requirements; the registry resolves `execute|clarify|unsupported`; template/composer/runtime guards prove metric, dimension, filter, time, comparison and sorting coverage before execution. Web regression evaluates semantic contracts rather than HTTP success alone.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, Mastra workflows, Node test runner, React/Vite.

## Global Constraints

- Preserve existing ERP SQL Guard, access policy and sensitive-field boundaries.
- Do not add SQL branches keyed to individual question text.
- Do not lower Finance Guard requirements to improve pass rate.
- Do not treat PartNum or descriptions as an unapproved product classification.
- `unsupported` and `clarify` outcomes must not generate or execute SQL.
- Frontend regression concurrency defaults to 2 and may not exceed 4.

---

### Task 1: Capability and Golden Contracts

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/capabilities/types.ts`
- Create: `apps/server/src/modules/erpSqlAgent/capabilities/registry.ts`
- Create: `apps/server/src/modules/erpSqlAgent/capabilities/goldenContract.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/templates/golden/sqlTemplateGoldenQuestions.json`
- Test: `apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts`

**Interfaces:**
- Produces: `ErpSqlCapabilityDefinition`, `GoldenExpectedOutcome`, `parseGoldenCapabilityCase()`, `resolveCapability()`.

- [ ] **Step 1: Write failing contract tests**

```ts
test("every golden case declares one capability and expected outcome", () => {
  const cases = loadGoldenCases();
  for (const item of cases) {
    assert.ok(item.capability);
    assert.match(item.expectedOutcome, /^(execute|clarify|unsupported)$/);
  }
});

test("quotation capabilities are unsupported until a data source is published", () => {
  const result = resolveCapability("quotation.contract_config");
  assert.equal(result.status, "unsupported");
  assert.equal(result.reasonCode, "missing_approved_data_source");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts`

Expected: FAIL because the registry and required golden properties do not exist.

- [ ] **Step 3: Implement the minimum registry types**

```ts
export type GoldenExpectedOutcome = "execute" | "clarify" | "unsupported";

export type ErpSqlCapabilityDefinition = {
  code: string;
  status: "executable" | "clarification_only" | "unsupported" | "planned";
  modules: string[];
  metrics: string[];
  dimensions: string[];
  filterSlots: string[];
  timeSemantics: string[];
  comparisonKinds: Array<"year_over_year" | "month_over_month">;
  templateFamilies: string[];
  reasonCode?: string;
};
```

Add registry entries for the nine current business types. Mark `quotation.contract_config` unsupported. Split inventory safety stock, operation/labor and finance capabilities from their broader business types.

- [ ] **Step 4: Migrate all 187 cases**

Each case receives `capability`, `expectedOutcome`, `requiredMetrics`, `requiredDimensions`, `requiredFilters`, `requiredTimeSemantics`, `allowedTemplateFamilies`, and `unsupportedReason`. Use `execute` only when current approved assets cover the requirement; use `unsupported` for unpublished assets and `clarify` only for genuine ambiguity.

- [ ] **Step 5: Verify GREEN**

Run the focused test and `npm run build:server`.

Expected: all capability registry tests pass and TypeScript builds.

---

### Task 2: Capability Decision Before SQL Paths

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts`
- Create: `apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: `AnalysisPlan` and capability definition.
- Produces: `CapabilityDecision = { outcome, capability, missingCoverage, reasonCode }`.

- [ ] **Step 1: Write failing workflow tests**

```ts
test("unsupported capability never reaches template or generator", async () => {
  const result = await runErpSqlToolchainWorkflow({ question: "查合同号 HT20260001 的产品报价" });
  assert.equal(result.success, false);
  assert.equal(result.outcome, "unsupported");
  assert.equal(result.capabilityCode, "quotation.contract_config");
  assert.equal(result.sql, "");
  assert.equal(templateCalls, 0);
  assert.equal(generatorCalls, 0);
  assert.equal(executorCalls, 0);
});
```

- [ ] **Step 2: Verify RED**

Run the named Mastra test. Expected: FAIL because current workflow continues into SQL lookup/generation.

- [ ] **Step 3: Implement decision service**

The service compares required metrics, dimensions, filters, time semantics and comparison kinds against registry coverage. Return `clarify` only when the plan has explicit ambiguity candidates; otherwise missing published coverage returns `unsupported`.

- [ ] **Step 4: Gate the workflow immediately after analysis planning**

Return a stable response containing `outcome`, `capabilityCode`, `reasonCode`, `missingCoverage`, and no SQL. Preserve access authorization before exposing capability details.

- [ ] **Step 5: Verify GREEN**

Run: `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts && npm run build:server`.

---

### Task 3: Generic Entity Filters and Scope-Safe Templates

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/templates/types/SqlTemplateTypes.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/templates/service/SqlTemplateGuardService.ts`
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts`
- Test: `apps/server/test/erpSqlAgent/metricComposer.test.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Produces: typed `dimensionFilters` for `customer`, `order`, `supplier`, `product`, `warehouse`, and `job`.
- Template metadata produces `coveredFilterSlots: string[]`.

- [ ] **Step 1: Write failing scope tests**

```ts
test("order-scoped open shipping SQL contains the requested order filter", async () => {
  const result = await compose({ dimensions: ["order"], dimensionFilters: { order: "226867" } });
  assert.match(result.sql, /OrderNum\s*=\s*226867/);
});

test("template without orderNum coverage cannot answer an order-scoped question", () => {
  assert.equal(templateCoversPlan(templateWithoutOrderSlot, planRequiringOrder), false);
});
```

- [ ] **Step 2: Verify RED**

Run the two focused test files. Expected: current composer ignores non-customer filters and template coverage passes without filter proof.

- [ ] **Step 3: Compile filters through approved dimension expressions**

Use the metric definition's `dimensionExpressions[dimension]`. String values use escaped Unicode literals; numeric order identifiers are validated as digits before numeric comparison. Reject filters whose dimension expression is absent.

- [ ] **Step 4: Add template filter coverage**

Templates must declare every supported slot. Coverage validation compares the plan's required filter keys to template metadata before selection.

- [ ] **Step 5: Verify GREEN**

Run: `node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`. Expected: all pass, including order `226867` and the real customer used in the webpage audit.

---

### Task 4: Query-Plan Coverage Runtime Guard

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/runtimeGuard/service/AnalysisPlanCoverageService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/types/SqlRuntimeGuardTypes.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/runtimeGuard/service/SqlRuntimeGuardService.ts`
- Test: `apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts`

**Interfaces:**
- Produces: `AnalysisPlanCoverageResult` with missing metrics, dimensions, filters, time, comparison, sorting and limit coverage.

- [ ] **Step 1: Write failing guard tests**

```ts
test("runtime guard rejects SQL that omits a required order filter", async () => {
  const result = await guard.validate(sqlReturningAllOrders, { analysisPlan: order226867Plan });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /required filter.*order/i);
});
```

- [ ] **Step 2: Verify RED**

Expected: current semantic family checks allow the range-widened SQL.

- [ ] **Step 3: Implement AST-backed coverage checks**

Reuse existing SQL parser output. Match required dimensions to SELECT/GROUP BY, filters to WHERE/JOIN predicates and bound values, time/comparison to compiled windows, and order/limit to ORDER BY/TOP. Do not parse SQL with new regular-expression-only logic when the existing AST exposes the node.

- [ ] **Step 4: Integrate before executor**

All template, composer, rule and LLM SQL paths pass the same `analysisPlan` to runtime guard. A coverage failure returns `semantic_mismatch` and never calls executor.

- [ ] **Step 5: Verify GREEN**

Run runtime guard, Mastra and template execution tests.

---

### Task 5: Result Scope Contract

**Files:**
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/agent/types/ErpSqlAgentTypes.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/agent/service/ResultNarratorService.ts`
- Modify: `apps/web/src/pages/agent/types.ts`
- Modify: `apps/web/src/pages/agent/components/AgentResultDrawer.tsx`
- Test: `apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Produces: `scope = { capability, metrics, dimensions, filters, timeRange, comparison, templateCoverage }`.

- [ ] **Step 1: Write failing response-contract test**

Assert that an order-scoped result exposes `scope.filters.order = "226867"` and that narrator input receives the same scope.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Add scope metadata**

Build scope from the validated plan, not from narrator inference. Technical scope remains detail-only; it is not hidden from audit.

- [ ] **Step 4: Add optional result-range assertion**

When the filtered dimension is returned, verify every non-null row matches the requested value. A mismatch converts the response to `semantic_mismatch` and suppresses rows.

- [ ] **Step 5: Verify GREEN**

Run server tests and web build.

---

### Task 6: ERP Capability Routing

**Files:**
- Modify: `apps/server/src/ai/agentRuntime/router.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/agent/domain.ts`
- Test: `apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`

**Interfaces:**
- Consumes: capability matcher plus current message.
- Produces: ERP route decision even when capability status is unsupported.

- [ ] **Step 1: Write failing routing table tests**

Include `未完工工序`, `生产任务`, `资源群组`, `班组`, `员工报工`, `OpMaster`, `工序代码`, and the shop-floor assessment golden. Assert `agentType=mastraErpSqlAgent` with no generic out-of-scope response.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Route by capability vocabulary**

Centralize vocabulary in the capability registry. Keep unrelated weather/general questions outside ERP.

- [ ] **Step 4: Verify GREEN**

Run agent runtime tests and the 26 previously misrouted golden cases.

---

### Task 7: Bounded Concurrency and Process Survival

**Files:**
- Modify: `apps/server/src/ai/agentRuntime/service.ts`
- Modify: `apps/server/src/ai/llm/concurrencyLimiter.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/executor/service/SqlExecutorService.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/web/src/pages/agent/hooks/useAgentChatPageState.ts`
- Test: `apps/server/test/agentRuntime/agentRuntimeHttp.test.ts`
- Test: `apps/server/test/erpSqlAgent/concurrencyLimiter.test.ts`

**Interfaces:**
- Produces: bounded Agent, LLM and ERP query queues; stable overload response `{ code: "AGENT_OVERLOADED", retryable: true }`.

- [ ] **Step 1: Write failing overload tests**

Submit five concurrent runs against a limit of two. Assert two execute, bounded queued requests either complete or receive 429, and health remains 200.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Add independent bounded limiters**

Use existing limiter utilities. No new dependency. Configure concurrency and queue size through documented environment variables.

- [ ] **Step 4: Add frontend concurrency control**

Disable additional sends when two runs are active and show a compact “查询排队中/服务繁忙” state. Do not create eight simultaneous sessions from ordinary UI.

- [ ] **Step 5: Add process-level error containment**

Log uncaught request failures, finish the affected run, and keep the HTTP server alive. Readiness reports dependency degradation separately from liveness.

- [ ] **Step 6: Verify GREEN**

Run concurrency tests, server/web builds and a four-page browser smoke test.

---

### Task 8: Safety Stock and Operation/Labor Assets

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/templates/service/SqlFamilyAssetPromotionService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/scenarios.ts`
- Add migration: `apps/server/prisma/migrations/20260712010000_erp_sql_inventory_operation_capabilities/migration.sql`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`
- Test: `apps/server/test/erpSqlAgent/sqlTemplateExecution.test.ts`

**Interfaces:**
- Publishes approved read-only assets for safety stock and operation/labor capabilities.

- [ ] **Step 1: Reproduce the three safety-stock Internal Server Errors in tests**

Capture the actual failing stage and assert the intended capability response.

- [ ] **Step 2: Audit ERP schema evidence**

Confirm safety-stock fields and joins; confirm JobOper/LaborDtl/ResourceGrp/OpMaster keys and Company joins. If a capability lacks verified fields, keep it unsupported rather than creating a guessed asset.

- [ ] **Step 3: Add approved assets only for verified schemas**

All list queries remain paginated/TOP bounded and pass access scope plus runtime guard.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplateExecution.test.ts && npm run prisma:validate`. Then execute the safety-stock and operation/labor golden subset through the webpage with concurrency 2.

---

### Task 9: Finance and Composite Metric Coverage

**Files:**
- Add migration: `apps/server/prisma/migrations/20260712020000_erp_sql_finance_metric_coverage/migration.sql`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/sqlGuard/service/SqlGuardService.ts`
- Test: `apps/server/test/erpSqlAgent/metricComposer.test.ts`
- Test: `apps/server/test/erpSqlAgent/sqlGuard.test.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Approved finance definitions expose amount, status, status predicates, document pre-aggregation keys and scope explanation.

- [ ] **Step 1: Write failing tests for the observed Guard classes**

Cover missing status field, missing status predicate, missing amount field, and detail amount joins without document-key pre-aggregation.

- [ ] **Step 2: Verify RED against current definitions**

- [ ] **Step 3: Fix definitions, not Guard requirements**

Update only metrics with verified ERP semantics. Composite plans with any uncovered metric return unsupported.

- [ ] **Step 4: Prevent irrelevant fallback**

When a composite capability is unsupported, prohibit template #66 or generic order detail fallback.

- [ ] **Step 5: Verify GREEN**

Run: `node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`. Then execute the finance/composite golden subset through the webpage with concurrency 2.

---

### Task 10: Web Golden Runner and Migration Report

**Files:**
- Create: `apps/server/src/modules/erpSqlAgent/scripts/buildGoldenCapabilityReport.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/scripts/runGoldenSqlGeneration.ts`
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/architecture/erp-sql-finance-metrics.md`
- Modify: `docs/operations/codex-implementation-log.md`
- Test: `apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`

**Interfaces:**
- Produces report counts for `execute_pass`, `clarify_pass`, `unsupported_pass`, `semantic_fail`, `routing_fail`, `guard_fail`, `transport_fail`.

- [ ] **Step 1: Write failing report tests**

Assert that a returned table with a missing required filter is `semantic_fail`, not pass; an expected unsupported response is `unsupported_pass`.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement deterministic report mapping**

Use golden contracts and trace metadata. Do not infer pass/fail from response prose alone.

- [ ] **Step 4: Run full verification**

Commands:

```bash
npm test
npm run build:server
npm run build:web
npm run prisma:validate
git diff --check
```

Expected: zero failures.

- [ ] **Step 5: Run real webpage acceptance**

Use at most four pages, substitute placeholder entities from prior discovery queries, and verify all 187 cases against their declared outcome. Confirm `/health` remains 200 throughout.

- [ ] **Step 6: Publish migration report**

Report counts by capability and business type, list unsupported reasons, retain failing trace IDs, and document intentionally unsupported quotation/product classification capabilities.

---

## Delivery Order

Tasks 1–5 form the correctness gate and must ship before query-asset expansion. Task 6 and Task 7 may follow in the same release only after their focused tests pass. Tasks 8 and 9 are separate migrations with independent rollback. Task 10 is the release gate.

## Rollback

- Capability decisions are versioned; rollback selects the previous registry version.
- New metric/template assets use additive migrations and can be disabled without deleting history.
- Runtime coverage guard can be disabled only per capability through an audited emergency switch; existing SQL safety and permission guards remain mandatory.
- Frontend concurrency limits can be rolled back independently, but backend queue limits remain active.
