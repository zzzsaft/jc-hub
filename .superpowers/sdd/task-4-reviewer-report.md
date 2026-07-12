# Task 4 Reviewer Report

## Verdict: FAIL

Commit `f32066bc` wires the coverage guard into template and generated-SQL execution before the executor, preserves the existing schema/access/finance guard calls, clears SQL on failure, reports `semantic_mismatch`, and prevents the development downgrade when `coverageResult.valid` is false. However, the coverage implementation does not prove several required semantics and admits range-widened or entirely non-filtering SQL. These are blocking correctness defects for the task.

## Blocking findings

1. **[P1] The concrete order filter is not exact and can be widened.** `hasBoundDimensionPredicate` accepts an `IN` predicate when *any* literal equals the requested value, and accepts `LIKE` after deleting every `%` (`AnalysisPlanCoverageService.ts:118-128`). Thus the required order `226867` is reported covered by both `OrderNum IN (226867, 226868)` and `OrderNum LIKE '%226867%'`. This fails the brief's specific-value proof and permits extra orders. The added order test only checks total omission (`sqlRuntimeGuard.test.ts:105-126`), so it does not cover the dangerous widened cases.

2. **[P1] Predicate checks traverse the whole statement rather than WHERE/JOIN predicate roots.** `nodes` is built from the complete statement (`AnalysisPlanCoverageService.ts:45,91-99`) and then passed to dimension, semantic-filter, and time checks (`:55-62`). A projection such as `SELECT CASE WHEN OrderNum=226867 THEN 1 ELSE 0 END AS flag, OrderNum FROM Erp.OrderHed` passes the order-filter contract while returning every order. Likewise, a date comparison inside a projected `CASE` passes time coverage. This is AST-backed syntactically, but it does not satisfy the requested AST-backed semantic location proof.

3. **[P1] Time and comparison coverage validates labels/shapes, not the requested compiled windows.** `hasTimePredicate` accepts any binary expression containing a column whose name resembles date/time (`AnalysisPlanCoverageService.ts:146-149`); it never verifies `current_year`, a requested month, relative-day count, bounds, or comparison periods. For example, a `current_year` plan accepts `WHERE OrderDate < '20000101'`. `coversComparison` only requires aliases such as `order_amount_comparison` (`:151-158`), so `SELECT SUM(DocOrderAmt) AS order_amount, 0 AS order_amount_comparison ...` passes year-over-year comparison with no previous/current windows. The positive test uses plausible SQL but asserts only this same weak shape (`sqlRuntimeGuard.test.ts:158-183`).

4. **[P1] Required metrics can be skipped and identifier matching is over-broad.** Coverage checks only `plan.metrics` (`AnalysisPlanCoverageService.ts:50`) and ignores `plan.requiredMetrics`, even though the existing semantic-family guard explicitly treats both as expected metrics (`sqlSemanticFamilies.ts:53-56`). In addition, `identifierMatches` accepts arbitrary substring containment (`AnalysisPlanCoverageService.ts:195-198`), so unrelated aliases containing a metric/dimension token can satisfy contracts. This can let generated fallback SQL proceed without all required analysis metrics.

5. **[P2] `high`/`low` filters are explicitly treated as projection-only.** `coversSemanticFilter` returns true for `high`/`low` whenever the metric is projected (`AnalysisPlanCoverageService.ts:137-143`), despite the result contract claiming filter coverage. This is an over-permissive validation: it proves no threshold, ordering, or limiting behavior. If the planner cannot supply a numeric threshold, this requirement should fail closed or have an explicit, separately-defined contract rather than silently count projection as filtering.

## Integration and contract checks

- Template path carries `analysisPlan` into `SqlTemplateExecutionService`, whose runtime guard runs before `queryClient.query` (`erpSqlToolchain.workflow.ts:276-297`; `SqlTemplateExecutionService.ts:58-102`).
- Composer/rule/LLM generations converge on runtime validation with `analysisPlan` before `runExecuteSqlTool` (`erpSqlToolchain.workflow.ts:332-491`). The legacy/no-analysis-plan branch also passes the optional value (`:492-603`).
- Coverage failures set semantic status to `semantic_mismatch`, make the guard invalid, and clear executable SQL (`SqlRuntimeGuardService.ts:27-48`). Workflow failure output uses `sql: ""`; `formatOutput` supplies empty rows when absent (`erpSqlToolchain.workflow.ts:463-477,985-1016`).
- Development downgrade requires `coverageResult.valid` (`toolchain.tools.ts:721-725`), so a genuine coverage failure cannot take that bypass. The problem is that the false-positive cases above incorrectly produce `coverageResult.valid === true`.
- The commit does not weaken the existing SQL Guard, access, or finance Guard implementations; it composes coverage after the existing schema and semantic checks (`SqlRuntimeGuardService.ts:14-48`).

## Verification

- Detached worktree at commit `f32066bc`: `node --import tsx --test apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` — **119 passed, 0 failed**.
- Independent probes against the committed coverage service confirmed false-positive acceptance for widened `IN`, wildcard `LIKE`, SELECT `CASE` order predicates, wrong historical time bounds, and constant comparison aliases.
- The green suite therefore demonstrates wiring and omission detection, but does not protect the core semantic edge cases required by the brief (including LIKE/IN/CASE and concrete order-value proof).
