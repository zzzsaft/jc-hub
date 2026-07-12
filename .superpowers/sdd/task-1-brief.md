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

