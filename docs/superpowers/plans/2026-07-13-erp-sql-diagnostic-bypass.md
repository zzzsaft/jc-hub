# ERP SQL Diagnostic Composite Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off diagnostic bypass for unpublished composite decision capabilities and fix SQL Guard validation of derived-table output aliases.

**Architecture:** Keep the capability registry and golden contracts unchanged. A narrowly scoped environment switch changes only the runtime decision for `finance.composite_decision`, while a generic SQL AST helper recognizes columns projected by derived tables; all existing access, Company, schema, runtime, row, timeout, and read-only guards remain active.

**Tech Stack:** TypeScript, Node.js, node-sql-parser, Node test runner, Prisma-backed ERP SQL Agent.

## Global Constraints

- `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY` is enabled only when its value is exactly `true`.
- The switch defaults off and does not change the capability registry or golden expected outcomes.
- The bypass applies only to `finance.composite_decision` and preserves clarification for genuinely ambiguous or missing required query slots.
- Missing metric/dimension coverage is retained in the decision for diagnostics even when the bypass lets planning continue.
- Never bypass permissions, Company scope, read-only enforcement, physical schema validation, Runtime Guard, query limits, timeouts, or audit logging.
- Derived-column handling must be structural; do not hard-code `earliest_amount`, `latest_amount`, or `sales_growth_rate` as allowed field names.

---

### Task 1: Recognize derived-table output columns in SQL Guard

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/sqlGuard/service/SqlGuardService.ts:548-615`
- Test: `apps/server/test/erpSqlAgent/sqlGuard.test.ts`

**Interfaces:**
- Consumes: the existing parsed SELECT AST and `ReferencedField.derived` behavior.
- Produces: `collectDerivedTableOutputAliases(statement: UnknownRecord): Set<string>` used by `collectReferencedFields`.

- [ ] **Step 1: Add a failing regression test for nested SELECT aliases**

Append a test that validates a guarded sales-growth query with an inner aggregate derived table. Use the existing SQL Guard test repository/helper and assert that `earliest_amount` and `latest_amount` are not sent to physical schema validation:

```ts
test("SQL guard treats derived-table output aliases as derived fields", async () => {
  const checkedFields: string[] = [];
  const repository: SqlGuardSchemaRepository = {
    async tableExists(schemaName, tableName) {
      return `${schemaName}.${tableName}`.toLowerCase() === "erp.orderdtl";
    },
    async fieldExists(_schemaName, _tableName, fieldName) {
      checkedFields.push(fieldName);
      return ["company", "partnum", "orderdate", "docextpricedtl"].includes(fieldName.toLowerCase());
    },
  };
  const growthGuard = new SqlGuardService(repository);
  const result = await growthGuard.validate(`
    SELECT TOP 20 [Company], [product], [latest_amount] AS [order_amount],
      CASE WHEN [earliest_amount] <> 0
        THEN ([latest_amount] - [earliest_amount]) / NULLIF([earliest_amount], 0)
        ELSE NULL END AS [sales_growth_rate]
    FROM (
      SELECT [Company], [product],
        SUM(CASE WHEN [period] = '2026-04' THEN [order_amount] ELSE 0 END) AS [earliest_amount],
        SUM(CASE WHEN [period] = '2026-06' THEN [order_amount] ELSE 0 END) AS [latest_amount]
      FROM (
        SELECT [Company], [PartNum] AS [product], [OrderDate] AS [period],
          [DocExtPriceDtl] AS [order_amount]
        FROM [Erp].[OrderDtl]
      ) [metric]
      GROUP BY [Company], [product]
    ) [growth_window]
    ORDER BY [sales_growth_rate] DESC;
  `);

  assert.equal(result.valid, true, result.errors.join("; "));
  assert(!checkedFields.includes("earliest_amount"));
  assert(!checkedFields.includes("latest_amount"));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/sqlGuard.test.ts
```

Expected: FAIL because `earliest_amount` and `latest_amount` are validated against `Erp.OrderDtl`.

- [ ] **Step 3: Implement the smallest structural alias collector**

In `collectReferencedFields`, combine CTE and derived-table output names:

```ts
const derivedOutputAliases = new Set([
  ...collectCteOutputAliases(statement),
  ...collectDerivedTableOutputAliases(statement),
]);
```

Replace the CTE-only check with:

```ts
if (derivedOutputAliases.has(fieldName.toLowerCase())) {
  fields.push({
    fieldName,
    qualifier: normalizeIdentifier(stringValue(node.table)) ?? undefined,
    derived: true,
  });
  return;
}
```

Add a recursive collector that reads each `FROM (...SELECT...) alias` projection and its nested derived tables:

```ts
function collectDerivedTableOutputAliases(statement: UnknownRecord): Set<string> {
  const aliases = new Set<string>();
  for (const fromItem of arrayValue(statement.from)) {
    const ast = recordValue(recordValue(fromItem)?.expr)?.ast;
    if (!isRecord(ast)) continue;
    for (const column of arrayValue(ast.columns)) {
      if (!isRecord(column)) continue;
      const alias = normalizeIdentifier(stringValue(column.as));
      const expr = recordValue(column.expr);
      const directName = stringValue(expr?.type) === "column_ref"
        ? normalizeIdentifier(stringValue(expr?.column))
        : null;
      const outputName = alias ?? directName;
      if (outputName) aliases.add(outputName.toLowerCase());
    }
    for (const nested of collectDerivedTableOutputAliases(ast)) aliases.add(nested);
  }
  return aliases;
}
```

- [ ] **Step 4: Verify GREEN and physical-field regression protection**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/sqlGuard.test.ts
```

Expected: all SQL Guard tests pass, including the existing missing physical field rejection.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/server/src/modules/erpSqlAgent/sqlGuard/service/SqlGuardService.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts
git commit -m "fix(erp-sql): validate derived table aliases correctly"
```

---

### Task 2: Add the default-off composite capability diagnostic bypass

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts:108-113`
- Modify: `apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts:20-58`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:326-355`
- Modify: `.env.example`
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/operations/codex-implementation-log.md`
- Test: `apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: `CapabilityDecisionService.decide`, `CapabilityDecision`, and the locked `finance.composite_decision` workflow path.
- Produces: optional `CapabilityDecision.diagnosticBypass`, exported `DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING`, and a trace warning when the bypass is active.

- [ ] **Step 1: Add failing tests for default-off and enabled behavior**

In `erpSqlCapabilityRegistry.test.ts`, add a test that restores the environment in `finally`:

Extend the imports with:

```ts
import { capabilityDecisionService } from "../../src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.js";
import type { AnalysisPlan } from "../../src/modules/erpSqlAgent/planner/index.js";
```

```ts
test("composite capability diagnostic bypass is default-off and explicit", () => {
  const previous = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
  const capability = resolveCapability("finance.composite_decision");
  const plan = {
    mode: "decision_support",
    grain: ["customer"],
    metrics: ["sales_amount", "cost_amount", "gross_margin"],
    requiredMetrics: ["sales_amount", "cost_amount", "gross_margin"],
    filters: [],
    dimensions: ["customer"],
    orderBy: [],
    timeRange: { kind: "month", month: "2026-06" },
    limit: 5,
  } satisfies AnalysisPlan;

  try {
    delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    assert.equal(capabilityDecisionService.decide(plan, capability).outcome, "unsupported");

    process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = "true";
    const bypassed = capabilityDecisionService.decide(plan, capability);
    assert.equal(bypassed.outcome, "execute");
    assert.equal(bypassed.diagnosticBypass, true);
    assert(bypassed.missingCoverage.includes("metric:sales_amount"));
  } finally {
    if (previous === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY = previous;
  }
});
```

Add a workflow test using the existing toolchain stubs that enables the switch and asserts:

```ts
assert(result.warnings.includes("diagnostic_composite_capability_bypass"));
assert.notEqual(result.reasonCode, "capability_route_mismatch");
```

- [ ] **Step 2: Run focused capability/workflow tests and verify RED**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Expected: FAIL because `diagnosticBypass` and the environment-controlled execution path do not exist.

- [ ] **Step 3: Extend the decision type and implement the narrow bypass**

Add to `CapabilityDecision`:

```ts
diagnosticBypass?: boolean;
```

In `CapabilityDecisionService.ts`, export the warning and add a helper:

```ts
export const DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING = "diagnostic_composite_capability_bypass";

function shouldBypassCompositeCapability(capability: ErpSqlCapabilityDefinition): boolean {
  return capability.code === "finance.composite_decision"
    && process.env.ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY === "true";
}
```

Preserve clarification, but let this one capability continue despite unpublished status and missing coverage:

```ts
const diagnosticBypass = shouldBypassCompositeCapability(capability);
const outcome = plan?.clarificationCandidates?.length || missingRequiredSlots.length > 0
  ? "clarify"
  : diagnosticBypass || (capability.status === "executable" && missingCoverage.length === 0)
    ? "execute"
    : "unsupported";
```

Return `diagnosticBypass: true` only when the bypass actually produced `execute`.

- [ ] **Step 4: Surface the diagnostic warning in the locked capability workflow**

After computing `decision` in the non-complex locked capability branch, append the warning without suppressing later failures:

```ts
if (decision.diagnosticBypass) {
  trace.warnings.push(DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING);
}
```

Import the constant from `CapabilityDecisionService.ts`. Do not alter complex-query capability decisions, access checks, SQL validation, or runtime execution.

- [ ] **Step 5: Document the switch and implementation result**

Add to `.env.example`:

```dotenv
ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=false
```

Document in `docs/api/erp-sql-agent.md` that the switch is diagnostic-only, defaults off, preserves all SQL/access guards, and may return estimates or downstream failures rather than exact answers. Add a dated entry at the top of `docs/operations/codex-implementation-log.md` with scope and verification commands.

- [ ] **Step 6: Verify focused tests and full ERP SQL regression**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/erpComplexQueryRunner.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
npm run build:server
```

Expected: all selected tests pass with zero failures; server build exits 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add .env.example apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts docs/api/erp-sql-agent.md docs/operations/codex-implementation-log.md
git commit -m "feat(erp-sql): add diagnostic composite bypass"
```

---

### Task 3: Re-run the five frontend acceptance questions

**Files:**
- Modify only if results require recording: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Consumes: the feature branch server started with `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true` and the existing `/agent/chat` frontend.
- Produces: observed answer, outcome, reason code, task graph status, and row count for each of the five questions.

- [ ] **Step 1: Start the feature backend with the diagnostic switch**

```bash
env CODEX_SANDBOX_NETWORK_DISABLED=0 \
  DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
  NODE_ENV=development \
  CORS_ORIGIN=http://127.0.0.1:2035 \
  ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true \
  PORT=2030 npm run dev:server
```

Start the feature frontend against `http://127.0.0.1:2030` on port 2035.

- [ ] **Step 2: Execute all five questions through `/agent/chat`**

Create a new conversation for each question. Record the exact user-facing answer and result-detail warnings. For the sales/inventory/backlog question, also record each task graph step and join coverage.

- [ ] **Step 3: Verify the acceptance contract**

Expected:

- no question stops at `capability_route_mismatch` solely because `finance.composite_decision` is unpublished;
- the sales growth step no longer reports `earliest_amount` or `latest_amount` as missing ERP fields;
- any remaining rejection names the next real missing metric, bridge, semantic, schema, or execution condition;
- all executed queries remain read-only and bounded.

- [ ] **Step 4: Stop local test servers and report results**

Stop only the processes started for this acceptance run. Report failures as observed; do not broaden the bypass or change additional guards during acceptance.

## Plan Self-Review

- Spec coverage: capability bypass, warning, derived aliases, safety invariants, documentation, automated tests, and frontend acceptance are each assigned to a task.
- Placeholder scan: no TBD/TODO or deferred implementation steps.
- Type consistency: `CapabilityDecision.diagnosticBypass`, `DIAGNOSTIC_COMPOSITE_CAPABILITY_WARNING`, and the environment variable name are consistent across tasks.
