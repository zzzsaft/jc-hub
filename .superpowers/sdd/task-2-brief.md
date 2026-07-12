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

