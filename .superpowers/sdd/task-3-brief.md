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
