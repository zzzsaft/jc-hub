# ERP SQL Diagnostic Unapproved Metric Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已确认的财务复合诊断计划可以读取并尝试组合现有 draft/disabled atomic metric，同时保留全部结构、权限、SQL 与运行时安全校验。

**Architecture:** 复用现有 `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY` 和 `shouldBypassCompositeCapability()`，只在 finance 复合 Composer 路径扩大 atomic metric 的目录查询范围。Repository 携带目录审批状态，Composer 仅跳过 approval/`enabled=false` 门槛并在实际使用时写入稳定 warning；Workflow 依据该 warning 将成功结果强制标记为 `estimate`。不新增数据库迁移、业务写入、自由 SQL fallback 或新依赖。

**Tech Stack:** TypeScript、Node.js test runner、Prisma SQL、Mastra workflow、现有 ERP SQL Guard/Runtime Guard。

## Global Constraints

- `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY` 只有精确字符串 `true` 才启用；`undefined`、`false`、`1`、`TRUE` 全部关闭。
- 仅 finance 路径且 `shouldBypassCompositeCapability(analysisPlan) === true` 时可读取 `approved`/`draft` atomic metric。
- 默认路径仍只读取 `status='approved'`，并继续拒绝 `definition_json.enabled=false`。
- 实际使用 draft 或 disabled 定义时，warnings 必须包含精确标记 `diagnostic_unapproved_metric_bypass`；全部 approved/enabled 时不得出现。
- 带该标记的成功结果必须为 `semanticStatus='estimate'`，并保留现有估算免责声明。
- 非 atomic、定义不存在、缺 required table/value/time/dimension/join/grain/join key/status predicate/document pre-aggregation key 时继续 fail-closed。
- finance 权限、Company scope、Schema Guard、SQL Guard、Runtime Guard、TOP、行数、超时、并发和审计不绕过。
- 不修改 metric 目录状态，不写 Golden 正式预期，不补造未验证 ERP 关联，不新增依赖。
- 按用户确认不采用 TDD：先实现最小改动，再补测试并运行回归；不要求 RED 阶段证据。

---

## File map

- `apps/server/src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.ts`：为 atomic lookup 增加显式诊断查询参数并返回目录审批状态。
- `apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts`：集中定义未批准指标诊断 warning 常量；继续复用现有复合计划判定。
- `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`：仅在显式诊断参数下允许 disabled/draft 定义，检测实际绕过并输出 warning/reference 信号。
- `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts`：把复合诊断判定传入 Repository 与 Composer。
- `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`：成功使用未批准指标后强制 estimate，并保证 warning 进入响应和 trace。
- `apps/server/test/erpSqlAgent/metricComposer.test.ts`：覆盖 Composer 的允许、默认拒绝和结构 fail-closed。
- `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`：覆盖开关值、复合/非复合范围、lookup 参数、warning、estimate 和权限回归。
- `.env.erp-agent.example`、`docs/api/erp-sql-agent.md`、`docs/architecture/erp-sql-finance-metrics.md`、`docs/operations/codex-implementation-log.md`：记录开关复用、风险边界和验证结果。

### Task 1: Expand atomic metric lookup only for qualifying diagnostics

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.ts:57-105,480-530`
- Modify: `apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts:6-10`

**Interfaces:**
- Consumes: existing `shouldBypassCompositeCapability(plan: AnalysisPlan | undefined): boolean`.
- Produces: `AtomicMetricCandidateInput.includeUnapproved?: boolean`, `ApprovedMetricCandidate.approvalStatus?: string`, and `DIAGNOSTIC_UNAPPROVED_METRIC_WARNING`.

- [ ] **Step 1: Add the minimal public fields and warning constant**

In `SqlTemplateRepository.ts`, extend only the existing types:

```ts
export type AtomicMetricCandidateInput = ReferenceFamilyCandidateInput & {
  metricCodes: string[];
  includeUnapproved?: boolean;
};

export type ApprovedMetricCandidate = {
  // existing fields stay unchanged
  approvalStatus?: string;
};
```

In `CapabilityDecisionService.ts`, add next to the existing composite warning:

```ts
export const DIAGNOSTIC_UNAPPROVED_METRIC_WARNING = "diagnostic_unapproved_metric_bypass";
```

- [ ] **Step 2: Make the repository status predicate explicit and safe**

Before the query in `findApprovedAtomicMetricCandidates`, derive a Prisma fragment and select the status:

```ts
const statusFilter = input.includeUnapproved
  ? Prisma.sql`status IN ('approved', 'draft')`
  : Prisma.sql`status = 'approved'`;

const rows = await prisma.$queryRaw<Array<{
  // existing row fields
  approvalStatus: string;
}>>(Prisma.sql`
  SELECT
    -- existing selected columns
    status AS "approvalStatus"
  FROM "erp_agent"."business_metric_catalog"
  WHERE ${statusFilter}
    AND definition_json->>'kind' = 'atomic_metric'
    AND metric_code IN (${Prisma.join(input.metricCodes)})
  ORDER BY metric_code
  LIMIT ${Math.min(Math.max(input.limit ?? input.metricCodes.length, 1), 50)}
`);
```

Map `approvalStatus` and expose it in existing reference diagnostics without adding another schema:

```ts
approvalStatus: row.approvalStatus,
matchedSignals: [`metric:${row.metricCode}`, `approval_status:${row.approvalStatus}`],
```

Do not alter `findApprovedMetricCandidates`; approved composite metric lookup remains production-only.

- [ ] **Step 3: Run type/build validation for the repository contract**

Run:

```bash
npm run build:server
git diff --check
```

Expected: both commands exit `0`; no caller is forced to pass `includeUnapproved`, because it is optional.

- [ ] **Step 4: Commit the independently reviewable lookup change**

```bash
git add apps/server/src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.ts apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts
git commit -m "feat(erp-sql): expose diagnostic atomic metrics"
```

### Task 2: Allow only the approval gate to be bypassed and mark actual use

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts:37-150,568-582`
- Test: `apps/server/test/erpSqlAgent/metricComposer.test.ts`

**Interfaces:**
- Consumes: `ApprovedMetricCandidate.approvalStatus` and `DIAGNOSTIC_UNAPPROVED_METRIC_WARNING` from Task 1.
- Produces: `MetricComposerService.compose({ diagnosticUnapprovedMetricBypass?: boolean })`; successful diagnostic generations carry the stable warning only when at least one selected definition is draft or disabled.

- [ ] **Step 1: Add the explicit Composer input and actual-use detection**

Import the warning constant and add the optional input:

```ts
diagnosticUnapprovedMetricBypass?: boolean;
```

Keep missing/non-atomic checks unchanged. Replace only the disabled gate and derive actual use after definitions are parsed:

```ts
const disabled = metrics
  .filter((_metric, index) => definitions[index]?.enabled === false)
  .map((metric) => metric.metricCode);
if (disabled.length > 0 && !input.diagnosticUnapprovedMetricBypass) {
  return { ok: false, error: `approved atomic metric 已禁用: ${disabled.join(", ")}`, missingApprovedMetrics: disabled };
}

const diagnosticMetrics = input.diagnosticUnapprovedMetricBypass
  ? metrics.filter((metric, index) => metric.approvalStatus === "draft" || definitions[index]?.enabled === false)
  : [];
const usedDiagnosticMetric = diagnosticMetrics.length > 0;
```

Do not condition any later structure, dimension, pre-aggregation, access or guard check on this flag.

- [ ] **Step 2: Add auditable assumptions, warning and reference signals**

For successful composition, retain the existing approved assumption when no bypass was used. When it was used, emit:

```ts
assumptions: [
  usedDiagnosticMetric
    ? "SQL composed from existing diagnostic atomic metric definitions; approval was not asserted."
    : "SQL composed from approved atomic metric definitions only.",
  // existing assumptions
],
warnings: [
  ...guardResult.warnings,
  ...(usedDiagnosticMetric ? [DIAGNOSTIC_UNAPPROVED_METRIC_WARNING] : []),
  // existing warnings
],
```

`mapMetricReference()` already carries `matchedSignals`; the `approval_status:*` signal from Task 1 therefore reaches generation references and trace storage without a new reference type.

- [ ] **Step 3: Add tests after implementation for gate behavior and structural safety**

Append focused tests to `metricComposer.test.ts`:

```ts
test("diagnostic composer allows a complete draft disabled atomic metric and marks actual use", async () => {
  const draft = metric("draft_order_amount") as any;
  draft.approvalStatus = "draft";
  draft.definitionJson = { ...(draft.definitionJson as object), enabled: false };
  const result = await new MetricComposerService(guard).compose({
    question: "按产品看诊断订单金额",
    analysisPlan: {
      mode: "decision_support", grain: ["product"], metrics: ["draft_order_amount"],
      filters: [], dimensions: ["product"], orderBy: [],
    },
    metrics: [draft],
    financeMode: "estimate",
    diagnosticUnapprovedMetricBypass: true,
  });
  assert.equal(result.ok, true);
  assert(result.ok && result.generation.warnings.includes("diagnostic_unapproved_metric_bypass"));
});

test("diagnostic composer still blocks draft finance detail joins without pre-aggregation keys", async () => {
  const draft = metric("gross_margin_rate", "SUM(OrderDtl.DocExtPriceDtl) / NULLIF(SUM(PartTran.MtlUnitCost), 0)", {
    enabled: false,
    statusField: "PartTran.TranType",
    statusFilters: ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')"],
    requiredTables: ["Erp.PartTran"],
    joinSql: ["JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = PartTran.Company"],
  }) as any;
  draft.approvalStatus = "draft";
  const result = await new MetricComposerService(guard).compose({
    question: "按产品看毛利率",
    analysisPlan: { mode: "decision_support", grain: ["product"], metrics: ["gross_margin_rate"], filters: [], dimensions: ["product"], orderBy: [] },
    metrics: [draft], financeMode: "estimate", diagnosticUnapprovedMetricBypass: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /document pre-aggregation keys/u);
});
```

Also extend the existing disabled-metric test so the same definition without `diagnosticUnapprovedMetricBypass: true` remains rejected.

- [ ] **Step 4: Run the focused Composer suite**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/metricComposer.test.ts
npm run build:server
git diff --check
```

Expected: all Composer tests pass, build exits `0`, and the original pre-aggregation failure still reports `document pre-aggregation keys`.

- [ ] **Step 5: Commit the Composer change and tests**

```bash
git add apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts apps/server/test/erpSqlAgent/metricComposer.test.ts
git commit -m "feat(erp-sql): compose diagnostic draft metrics"
```

### Task 3: Scope the bypass in Mastra and force estimate output

**Files:**
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts:504-545`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:8-17,500-675,890-920`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:2400-2570` plus adjacent composite diagnostic tests

**Interfaces:**
- Consumes: `includeUnapproved`, `diagnosticUnapprovedMetricBypass`, `shouldBypassCompositeCapability()`, and `DIAGNOSTIC_UNAPPROVED_METRIC_WARNING`.
- Produces: a finance-only diagnostic atomic tool path; successful bypass output includes warning, `semanticStatus: "estimate"`, estimate disclaimer, and estimate execution path.

- [ ] **Step 1: Compute one finance-scoped diagnostic boolean in the tool**

Import `shouldBypassCompositeCapability` and pass one derived boolean to both layers:

```ts
const diagnosticUnapprovedMetricBypass = Boolean(financeMode)
  && shouldBypassCompositeCapability(analysisPlan);

const metrics = await sqlTemplateRepository.findApprovedAtomicMetricCandidates({
  question,
  module: "finance",
  metricCodes,
  limit: metricCodes.length,
  signal,
  includeUnapproved: diagnosticUnapprovedMetricBypass,
});

const result = await metricComposerService.compose({
  question, analysisPlan, metrics, financeMode, accessScope, signal, module,
  diagnosticUnapprovedMetricBypass,
});
```

This intentionally leaves Q3’s sales/inventory subqueries approved-only because their calls have no `financeMode`.

- [ ] **Step 2: Force the successful workflow result to estimate after actual use**

Import `DIAGNOSTIC_UNAPPROVED_METRIC_WARNING`. Immediately after accepting `composed.generation`, derive actual use from the stable warning and lower the effective mode:

```ts
generation = composed.generation;
sqlReferences = composed.references ?? generation.references ?? [];
if (generation.warnings.includes(DIAGNOSTIC_UNAPPROVED_METRIC_WARNING)) {
  effectiveFinanceMode = "estimate";
}
```

At the final successful `formatOutput`, use the effective mode and explicit status:

```ts
const diagnosticMetricEstimate = generation.warnings.includes(DIAGNOSTIC_UNAPPROVED_METRIC_WARNING);

financeScope: buildFinanceScope(effectiveFinanceMode, generation, sqlReferences),
semanticStatus: diagnosticMetricEstimate ? "estimate" : generation.semanticResult?.status,
```

No invalid generation or execution error is converted into success.

- [ ] **Step 3: Make the workflow stub observable without changing production APIs**

Extend the local `stubToolchain()` test options:

```ts
onFindAtomicMetrics?: (input: { includeUnapproved?: boolean; metricCodes: string[] }) => void;
```

Call it from the existing repository stub:

```ts
(sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = async (input: any) => {
  options.onFindAtomicMetrics?.(input);
  return options.atomicMetrics ?? [];
};
```

- [ ] **Step 4: Add tests after implementation for exact switch semantics and output**

Add one table-driven test that runs `undefined`, `false`, `1`, `TRUE`, and `true`, capturing `includeUnapproved`. Use a decision-support plan with two metrics and `routeCapabilityCode: "finance.composite_decision"`. Assert only exact `true` produces `includeUnapproved === true`.

Add a successful draft test using a structurally complete candidate:

```ts
const draftMetric = { ...makeAtomicMetric("order_amount"), approvalStatus: "draft" };
(draftMetric.definitionJson as any).enabled = false;
```

With the exact switch enabled, assert:

```ts
assert.equal(result.success, true);
assert(result.warnings.includes("diagnostic_unapproved_metric_bypass"));
assert.equal(result.semanticStatus, "estimate");
assert.equal(result.disclaimer, "此数据不准确，仅供参考");
assert.equal(result.executionPath, "estimate");
```

Add negative assertions for:

- the same draft candidate with the switch disabled;
- a strict single-metric plan;
- a non-finance atomic tool call;
- a user scope without `finance`, which must throw/fail before execution;
- an all-approved/enabled composite plan under the switch, which must not emit the warning.

- [ ] **Step 5: Run workflow and capability regressions**

Run:

```bash
node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts
npm run build:server
git diff --check
```

Expected: all tests pass; previous `diagnostic_composite_capability_bypass` tests and three-query Q3 test remain green.

- [ ] **Step 6: Commit the integration and regression tests**

```bash
git add apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "feat(erp-sql): scope diagnostic metric bypass"
```

### Task 4: Document, fully verify, and rerun the five frontend questions

**Files:**
- Modify: `.env.erp-agent.example:12`
- Modify: `docs/api/erp-sql-agent.md:1-15`
- Modify: `docs/architecture/erp-sql-finance-metrics.md`
- Modify: `docs/operations/codex-implementation-log.md:1`
- Modify: `docs/superpowers/specs/2026-07-14-erp-diagnostic-unapproved-metric-bypass-design.md`

**Interfaces:**
- Consumes: the completed implementation and the existing `/agent/chat` frontend.
- Produces: operator-facing boundaries plus a five-question acceptance record containing response status, warning, semantic status, SQL/row count, and next real blocker.

- [ ] **Step 1: Update configuration and operator documentation**

Keep the existing env variable; add comments rather than another switch:

```dotenv
# Diagnostic only: exact "true" lets qualifying composite finance plans inspect existing draft/disabled atomic metrics.
# All metric structure, access, SQL and runtime guards remain enabled; successful bypass results are estimates.
ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=false
```

In API and finance architecture docs state:

- only exact `true` and qualifying finance composite plans;
- only existing `approved`/`draft`, `kind='atomic_metric'` definitions;
- warning `diagnostic_unapproved_metric_bypass` only on actual use;
- successful diagnostic output is `estimate`;
- gross margin definitions are still expected to fail if `documentPreaggregationKeys` are absent;
- no metric approval or database mutation occurs.

- [ ] **Step 2: Run the full target regression and builds**

Run:

```bash
node --test --import tsx \
  apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts \
  apps/server/test/erpSqlAgent/sqlGuard.test.ts \
  apps/server/test/erpSqlAgent/metricComposer.test.ts \
  apps/server/test/erpSqlAgent/sqlPlanner.test.ts \
  apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts
npm run build:server
npm run build:web
git diff --check
git status --short
```

Expected: all target tests pass; both builds exit `0`; only planned files and the pre-existing untracked `node_modules` appear.

- [ ] **Step 3: Start the feature branch app in diagnostic mode**

Use the existing local environment and exact switch:

```bash
ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true npm run dev:server
npm run dev:web
```

Expected: server and web dev processes become ready without migration or metric catalog writes.

- [ ] **Step 4: Submit the five agreed questions through the frontend**

Submit, in order:

```text
6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？
今年上半年哪些客户贡献收入最高，但毛利偏低？对应产品、订单和主要成本项是什么？
最近3个月销售增长最快的产品有哪些，库存是否够，未交付订单还有多少？
6月份毛利低于20%的订单有哪些，客户是谁，产品是什么，是材料成本高还是加工成本高？
哪些客户订单金额大但回款慢，同时毛利也偏低？
```

For each response record: `success/outcome/reasonCode`, visible answer/error, `diagnostic_unapproved_metric_bypass`, `semanticStatus`, executed query count, row count, and the next structure/guard failure. Do not describe a blocked question as answered.

- [ ] **Step 5: Add the implementation log entry with measured evidence**

At the top of “实现记录”, record the code boundary, target test count, build exits, and the five actual frontend outcomes. Explicitly note whether gross margin remains blocked by document pre-aggregation keys.

- [ ] **Step 6: Commit documentation and acceptance evidence**

```bash
git add .env.erp-agent.example docs/api/erp-sql-agent.md docs/architecture/erp-sql-finance-metrics.md docs/operations/codex-implementation-log.md docs/superpowers/specs/2026-07-14-erp-diagnostic-unapproved-metric-bypass-design.md docs/superpowers/plans/2026-07-14-erp-diagnostic-unapproved-metric-bypass.md
git commit -m "docs(erp-sql): record diagnostic metric bypass"
```

### Task 5: Final safety review and handoff

**Files:**
- Review only: all files changed since `69df8adb`

**Interfaces:**
- Consumes: Tasks 1-4 commits and verification output.
- Produces: a merge-ready or concretely blocked handoff; no unverified success claim.

- [ ] **Step 1: Review the final diff against the safety invariants**

Run:

```bash
git diff --stat 69df8adb..HEAD
git diff 69df8adb..HEAD -- apps/server/src/modules/erpSqlAgent apps/server/src/ai/mastra apps/server/test/erpSqlAgent .env.erp-agent.example docs/api docs/architecture docs/operations docs/superpowers
```

Confirm from code, not intention:

- default query still says approved-only;
- the bypass requires exact `true`, finance mode and a qualifying composite plan;
- no structure/access/guard checks are conditional on the bypass;
- warning appears only for actual draft/disabled use;
- successful bypass output is estimate;
- no migration, catalog update, Golden write, or arbitrary LLM SQL was added.

- [ ] **Step 2: Re-run final verification after any review fix**

Run the same test/build commands from Task 4 Step 2. Expected: clean pass after the final code state.

- [ ] **Step 3: Report the outcome**

Provide commit IDs, changed modules, exact test/build results, all five frontend outcomes, and any remaining real business-definition blocker. Mention the pre-existing untracked `node_modules` as intentionally untouched.

