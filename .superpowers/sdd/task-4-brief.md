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
