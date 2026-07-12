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
