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
