# Task 3 Recovery Report

## Status

Implemented and verified.

Commit: `ede6d3ce` (`feat(erp-sql): execute diagnostic query steps`)

## Recovery audit

- Preserved the disconnected agent's working-tree changes and audited every touched production file before editing.
- Kept `.superpowers` planning artifacts, prior reports/review diffs, and `node_modules` out of the Task 3 commit.
- Found and completed four integration gaps: trusted diagnostic authorization was conflated with switch qualification; the trusted atomic-metric bypass was still finance-step-only; generic complex routing preempted legacy paths while the switch was off; Task 3 execution/security tests were missing.

## Implementation

- Added `executeDiagnosticComplexQueryStep` with strict template → atomic composer → reference-assisted LLM order for the trusted diagnostic branch, one SQL result per step, structured business failures, abort propagation, and `diagnostic_llm_sql_fallback` only on the final branch.
- Preserved the legacy product sales/inventory/backlog composer-only behavior when the new switch is off.
- Required the exact `ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES=true`, finance module access, and `sensitive.finance=full` before SQL retrieval/generation.
- Kept public atomic composition approved-only; only the internal trusted call can include diagnostic metric definitions.
- Added `diagnosticBypassBusinessGates` to LLM generation, bypassing only the strict finance business metric gate while retaining schema evidence, prompt restrictions, SQL guard, repair guard, and single-SELECT validation.
- Split diagnostic runtime business-family tolerance from explicit slot coverage. Schema/Company/read-only guards remain authoritative; explicit time, numeric filter, sorting, and limit omissions still block.
- Kept template, composer, and LLM SQL on existing guarded executors. Added diagnostic-only rejection of explicit out-of-scope Company literals before the query client.
- Preserved complete-month coverage validation for the existing three-month product trend recipe.

## Tests

- Task 3 selected suite (with read-only schema/template DB access): **145 passed, 0 failed**.
- `npm run build:server`: passed.
- Added execution-order tests, exact-switch/access fail-closed tests, LLM bypass boundary tests, runtime explicit-slot tests, and zero-DB-call tests for invalid field, multi-statement, write SQL, missing Company, and out-of-scope Company.
- Independent code review found three important gaps (invalid composer fallback, cross-module template acceptance, and mocked-only security tests); all were fixed and the reviewer confirmed no Critical or Important issues remain.

The DB-backed Mastra tests initially failed without `DATABASE_URL`, then failed inside the sandbox because the configured remote database was unreachable. Per the repository sandbox-network workflow, the final read-only run used:

```bash
env CODEX_SANDBOX_NETWORK_DISABLED=0 DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
  node -r dotenv/config --test --import tsx \
  apps/server/test/erpSqlAgent/erpComplexQueryStepExecutor.test.ts \
  apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts \
  apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts \
  apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

## Scope intentionally not included

- No generic result-composer redesign (Task 4/5 territory).
- No dependency, migration, write path, worker, refresh job, or business LLM invocation.
- No changes to unrelated `.superpowers` artifacts inherited from prior tasks.

## Main task review findings

Status: Changes required.

1. Trusted diagnostic qualification occurs after `SqlPlannerService` schema retrieval; sales-only/masked-finance diagnostic requests must fail before any schema/template/metric/reference retrieval.
2. LLM fallback consumes the original `QueryPlan`, not the narrowed step `AnalysisPlan`, and Runtime Guard does not prove dependent `joinKeyFilterTuples`; the generated SQL can omit explicit step constraints and anchor tuples.
3. Diagnostic explicit coverage treats default step limits and all qualitative filters as user-explicit. Carry normalization/original-text provenance so only explicit time, numeric threshold, explicit sorting and explicit Top-N are mandatory.

Fix contract: add focused regressions for retrieval ordering, narrowed LLM input, anchor-tuple coverage and explicit-slot provenance; run Task 3 selected tests and server build; append evidence and commit.

## Second main review findings

Status: Changes still required.

1. Tuple coverage finds an exact expected subtree but permits outer predicates on tuple keys that narrow the effective tuple set, e.g. expected `(A/X) OR (B/Y)` followed by `AND Company='A'`; prove equality of the effective tuple-key set while still allowing unrelated time/status predicates.
2. Explicit time provenance covers only first-half/recent-month/calendar-month text; add deterministic provenance for every supported explicit form including current year/month, previous month, year-over-year and relative days.

Fix contract: add regressions for outer tuple-key narrowing and all supported explicit time phrases, run Task 3 selected tests and server build, append evidence and commit.

## Third main review finding

Status: One change still required.

- Explicit relative-time provenance does not recognize Planner-supported phrases: `近 3 个月`, `最近一个季度`, `近一季度`, `最近一个月`, `近 1 个月`, `最近半年`, `近 6 个月`. Align deterministic normalization/provenance with the Planner's explicit phrase set, without marking inference-only trend words explicit.

Fix contract: share or align the parser, add every phrase as regression coverage, run Task 3 selected tests and server build, append evidence and commit.

## Review fix

Status: implemented and verified.

- With `ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES=true`, analysis and trusted finance/full-sensitive authorization now happen before `SqlPlannerService`; rejected candidates perform zero schema, template, metric, reference, or generator retrieval. The switch-off path retains planner-before-analysis ordering.
- The final LLM fallback now receives the narrowed step `AnalysisPlan`, including metrics, time, filters, ordering, limit, and upstream correlated tuples.
- Runtime coverage now requires the exact `joinKeyFilterTuples` disjunction on reachable metric lineage. Broad `TOP 500`, cross-product `IN`, omitted tuples, and widened tuple sets fail closed.
- Diagnostic explicit-slot enforcement now carries provenance. Only recognized original-text or normalization-derived time, numeric threshold, sorting, and Top-N constraints are mandatory; default limit 20 and qualitative high/low filters are not treated as explicit.
- Added regressions for authorization/retrieval ordering, legacy ordering, narrowed LLM input, exact tuple acceptance and widening rejection, and explicit coverage provenance.

Fresh verification:

- Task 3 selected suite: **145 passed, 0 failed**.
- `npm run build:server`: passed.
- Task 4/5 were not changed.

## Second review fix

Status: implemented and verified.

- Tuple coverage now combines tuple-key predicates across the complete reachable metric lineage and compares the resulting effective tuple set with the expected set. Outer or sibling Company/product narrowing is rejected; unrelated time and status predicates remain allowed.
- Same-key column joins remain neutral for tuple projection, while unsupported tuple-key expressions fail closed.
- Deterministic explicit-time provenance now covers current year, current month, previous month, year-over-year/last-year comparison, relative days, first half, relative months, and a named calendar month.
- Added red-green regressions for the reviewer outer-narrowing examples, unrelated time/status predicates, and every supported explicit `AnalysisPlanTimeRange` form.

Fresh verification:

- Task 3 selected suite: **146 passed, 0 failed**.
- `npm run build:server`: passed.
- Task 4/5 were not changed.

## Third review fix

Status: implemented and verified.

- Added one shared deterministic explicit-time parser used by both `AnalysisPlannerService` and `DiagnosticPlanNormalizer`, removing the duplicated phrase sets.
- Explicit relative-month phrases now preserve planner semantics: 30 days for one month, 90 days for three months/one quarter, and 180 days for six months/half a year.
- Covered `近3个月`, `最近一个季度`, `近一季度`, `最近一个月`, `近1个月`, `最近半年`, and `近6个月`, including whitespace variants.
- Planner inference-only words such as `逐月`, `持续`, `趋势`, and `下降` remain outside explicit provenance.

Fresh verification:

- Task 3 selected suite: **148 passed, 0 failed**.
- `npm run build:server`: passed.
- Task 4/5 were not changed.
