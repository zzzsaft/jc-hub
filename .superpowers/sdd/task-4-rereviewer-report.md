# Task 4 Rereviewer Report

## Verdict: FAIL

The remediation in `0f7da5c3` fixes the exact probes named by the first review: widened multi-value `IN`, numeric order `LIKE`, projection-only `CASE`, wrong literal time bounds, literal constant comparison aliases, omitted `requiredMetrics`, substring aliases, and projection-only `high`/`low` are rejected. Real composer/template workflow tests, the committed year-over-year positive case, and top-ranking `ORDER BY ... TOP` coverage remain green. The runtime guard is also wired before both generated-SQL executor branches and before template `queryClient.query`, coverage failures clear SQL and become `semantic_mismatch`, and the development downgrade is gated by `coverageResult.valid`.

However, the coverage service still proves only that a matching atomic predicate or column exists somewhere in the AST. It does not prove that the predicate constrains the returned rows or that comparison outputs represent the requested periods. The following are blocking false positives.

## Blocking findings

1. **[P1] Boolean widening and unrelated subqueries still satisfy required concrete filters.** `collectPredicateExpression` flattens both `AND` and `OR` into one unordered list (`AnalysisPlanCoverageService.ts:102-129`), and `hasBoundDimensionPredicate` accepts any matching node in that list (`:148-163`). Independent probes at `0f7da5c3` returned `valid: true` for all of:

   - `WHERE OrderNum = 226867 OR 1 = 1`
   - `WHERE EXISTS (SELECT 1 FROM Erp.OrderDtl d WHERE d.OrderNum = 226867)` on an otherwise unfiltered outer `OrderHed` query
   - `JOIN Erp.OrderDtl d ON d.OrderNum = h.OrderNum OR d.OrderNum = 226867`

   Each query can return orders other than `226867`, so the required order filter is not actually covered. The newly added `IN`/`LIKE`/projection probes exercise atomic syntax but not boolean/query-scope semantics. Filter proof must preserve `AND`/`OR` structure and query correlation instead of pooling predicates from every SELECT/JOIN scope.

2. **[P1] Exact time-window shapes on non-time columns are accepted.** `timeExpressionSignature` deliberately normalizes every `column_ref` to the same token (`AnalysisPlanCoverageService.ts:195-199,247-257`). Consequently this current-year plan returned `valid: true`:

   ```sql
   SELECT TOP 100 Company
   FROM Erp.OrderHed
   WHERE OrderNum >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
     AND OrderNum < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))
   ```

   The remediation now checks the requested bounds, but it still does not establish that those bounds apply to a date/time expression. This allows SQL with no time restriction to pass the plan's time contract.

3. **[P1] Comparison coverage accepts column-derived constants unrelated to comparison periods.** `coversComparison` only requires each current/previous alias expression to contain a column (`AnalysisPlanCoverageService.ts:260-279`); it does not connect either expression to the current/previous predicate windows. A probe using the exact required year-over-year WHERE windows but projecting `SUM(DocOrderAmt) * 0 AS order_amount_comparison` returned `valid: true`. The literal `0 AS ..._comparison` regression is fixed, but the same false claim survives any column-containing constant expression (and similarly arbitrary unrelated columns). Comparison outputs need provenance from the corresponding current/previous windowed branches, not merely `expressionHasColumn`.

4. **[P2] `high` and `low` threshold direction is not checked.** `hasMetricThreshold` accepts any of `<`, `<=`, `>`, `>=` for both operations (`AnalysisPlanCoverageService.ts:177-193`). Independent probes showed both `high` with `order_amount < 10` and `low` with `order_amount > 10` return `valid: true`. The projection-only bypass is closed, and the real `ORDER BY` + limit ranking form remains valid, but threshold-based coverage can invert the requested semantic filter.

## Confirmed remediation and integration

- Multi-value `OrderNum IN (226867, 226868)`, numeric order `LIKE '%226867%'`, and SELECT `CASE WHEN OrderNum = 226867` are rejected; single-value `IN (226867)` is accepted.
- Wrong historical literals and SELECT-only time expressions are rejected; the committed exact current-year and year-over-year positive cases are accepted.
- Literal `0 AS order_amount_comparison` is rejected.
- `metrics` and `requiredMetrics` are merged, and `not_gross_margin_rate_extra` no longer covers `gross_margin_rate`.
- Projection alone no longer covers `high`/`low`; a numeric threshold or matching metric sort plus limit is required (subject to finding 4).
- Template execution passes `analysisPlan` to the runtime guard at `SqlTemplateExecutionService.ts:61-82` and calls the query client only afterward at `:103-107`.
- Composer/rule and fallback/reference/LLM branches pass the same plan at `erpSqlToolchain.workflow.ts:437-488` and `:542-600`; invalid generations return empty SQL before executor.
- The development semantic-mismatch downgrade requires `coverageResult.valid` at `toolchain.tools.ts:721-725`, so a detected coverage failure cannot bypass the guard.

## Verification evidence

- Detached worktree at `0f7da5c3`.
- `node --import tsx --test apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` — **124 passed, 0 failed**. This differs from the implementer report's stated 125/125, but the committed suite is green.
- Independent AST-coverage probes reproduced all false positives listed above.
- `git diff --check e0279dc6..0f7da5c3` — passed.
- `npm run build:server` — failed in unchanged, out-of-scope `apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetEvidenceSnapshot.ts:13` with two existing TS7006 implicit-`any` errors. That file is identical across the reviewed range, so this is not attributed to Task 4, but the implementer report's build-pass claim is not reproducible from the detached commit.

No source files were modified during rereview; only this requested report was added.
