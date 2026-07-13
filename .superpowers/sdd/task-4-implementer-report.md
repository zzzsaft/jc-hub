# Task 4 Implementer Report

## Outcome

- Added AST-backed `AnalysisPlanCoverageService` using the already-installed `node-sql-parser` Transact-SQL parser.
- Runtime coverage now reports structured missing metrics, dimensions, filters, time, comparison, sorting, and limit requirements.
- Coverage failures become `semantic_mismatch`, clear executable SQL, and cannot use the development semantic-mismatch downgrade.
- Both generated-SQL workflow branches and template execution carry the same `analysisPlan` into the runtime guard before executor.

## TDD evidence

- RED: `runtime guard rejects SQL that omits a required order filter` failed with `true !== false` because SQL returning all orders was accepted for order `226867`.
- GREEN: the same test passes after AST predicate/value coverage was added.
- Workflow regressions now assert uncovered fallback/reference SQL returns `semantic_mismatch` and executor calls remain zero.

## Verification

- `node --import tsx --test apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` — 120/120 passed.
- `npm run build:server` — passed.
- `git diff --check` — passed.

## Scope and debt

- Existing SQL Guard parses SQL internally but does not expose its AST through `SqlGuardResult`. Task 4 therefore reuses the same installed parser in the coverage service without adding a dependency or regex-only SQL parser.
- Non-blocking debt: extract a shared parser boundary later if parse-once performance becomes material; doing so now would expand the SQL Guard public contract beyond Task 4.
- Existing SQL safety, access, and finance guards remain unchanged. No emergency bypass or question-specific exception was added.

## Review remediation

- Added RED probes for widened order `IN`/`LIKE`, SELECT `CASE` predicate spoofing, wrong current-year windows, constant comparison aliases, omitted `requiredMetrics`, substring aliases, and projection-only `high`/`low`; all now pass.
- Predicate evidence is restricted to WHERE and JOIN ON roots across outer queries, subqueries, and CTEs. SELECT/HAVING expressions cannot satisfy filter or time coverage.
- Time coverage compares AST structure against the exact resolved AnalysisPlan window, including current and prior comparison windows. Comparison outputs must be sourced from columns rather than constants.
- Concrete dimension filters require exact equality or a single-value IN; numeric order filters never accept LIKE. Declared dimension-rule members and bounded customer-name LIKE remain explicit cases.
- Metrics merge `metrics` and `requiredMetrics`; identifiers use exact normalized aliases/tokens rather than substring matching.
- `high`/`low` requires a numeric predicate or matching metric sort plus limit; uncovered composer and fallback paths return `semantic_mismatch` with executor count zero.
- Review verification: targeted runtime/Mastra/template/composer suite passed 125/125; `npm run build:server` and `git diff --check` passed.

## Rereview remediation

- Added RED probes for OR-widened WHERE/JOIN predicates, unrelated EXISTS subquery scope, exact date functions applied to non-time fields, zero-multiplied comparison sources, and inverted high/low thresholds.
- Concrete filter and semantic-filter evidence now rejects predicates beneath any OR ancestor. Coverage considers only the outer SELECT and declared CTE SELECT scopes, so an unrelated nested subquery cannot prove outer-row scope.
- Comparison time windows retain their required OR structure only when every OR leaf exactly matches one of the requested current/prior window predicates; unrelated OR leaves fail closed.
- Time signatures distinguish approved date-like identifiers from other columns, preventing OrderNum or another non-time field from satisfying a time contract.
- Comparison metric sources must be direct current/prior qualified columns (or a single-source aggregate/function), must use different qualifiers, and each qualifier must participate in a period predicate. Arithmetic constantization such as `metric * 0` is rejected.
- `high` thresholds accept only `>`/`>=` (or reversed equivalent), while `low` accepts only `<`/`<=`; matching same-metric sort direction plus limit remains valid.
- Rereview verification: targeted runtime/Mastra/template/composer suite passed 126/126; real composer, template, year-over-year, and top-ranking paths remain green.
