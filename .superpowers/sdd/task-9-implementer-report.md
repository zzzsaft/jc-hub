# Task 9 Implementer Report

## Published

- Finance metric definitions now require explicit amount, status field, status predicates, time field, and visible scope explanation evidence.
- The additive migration publishes `statusField`, `scopeExplanation`, and reviewed document keys for existing verified order, invoice, production-cost component, open-shipping, open-job, purchase, and collection scopes.
- Composite plans fail closed when any required metric or bridge is missing. The workflow returns `unsupported`, empty SQL, and `missingCoverage` without template 66, historical-reference, or generic order-detail fallback.
- `gross_margin_amount`, `gross_margin_rate`, and `shipped_amount` have catalog kill switches: `status = draft`, `definition_json.enabled = false`.

## Remaining gaps

- A reviewed `PartTran -> OrderDtl` document-key pre-aggregation bridge is still required before gross-margin metrics can be approved again.
- A reviewed shipment lifecycle status field/predicate is required before `shipped_amount` can be approved again.
- Division and other cross-domain dimension bridges remain unverified; `finance.cost_margin` and `finance.composite_decision` stay unsupported in the golden capability registry.
- The webpage finance/composite golden subset with concurrency 2 belongs to Task 10 and was intentionally not run here.

## TDD evidence

- RED: four focused tests failed against the previous behavior: missing explicit status field, missing amount expression, unsafe detail bridge, and composite fallback.
- GREEN: the focused metricComposer/sqlGuard/Mastra suite passed after the implementation and all review fixes; see the final verification count below.

## Verification

- `node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts` — 150 passed, 0 failed.
- `DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder' npm run prisma:validate` — schema valid; placeholder URL was used only for offline schema validation.
- `npm run build:server` — passed.
- `git diff --check` — passed.
- No database write or live approved-metric audit was run.

## Review

- Independent review found that two tests still fabricated `ShipDtl.OrderNum` as finance status evidence despite the `shipped_amount` kill switch.
- Resolved by keeping shipment proration coverage operational-only and asserting workflow `unsupported` for the disabled metric. The full verification command was rerun after the fix.
- Independent acceptance review then found two additional fail-open gaps: optional `metrics` were dropped when `requiredMetrics` existed, and any status-like SQL predicate could satisfy unrelated approved status metadata.
- Resolved with union coverage before all SQL lookup paths, declared composite-member checks, and AST-exact WHERE/JOIN predicate matching for plural or narrowly compatible singular status filters. Added optional-metric, wrong-table, wrong-value, empty-contract, and singular-compatibility regressions.
- Final review found composite membership names could bypass atomic kill switches and physical SQL aliases produced false negatives. Resolved by live approved-atomic member resolution with disabled/draft/non-atomic/cycle rejection, plus per-SELECT alias-to-physical-table canonicalization. Documentation now distinguishes structured unsupported outcomes from explicit rough/legacy estimate mode.
- Follow-up review identified member-to-member dependency cycles; atomic members carrying any dependency metadata now fail closed, and a matched composite governance error cannot be overwritten by atomic fallback.
- Acceptance review identified detached CTE status evidence as a remaining scope bypass. Predicate discovery now starts at the final SELECT and follows only referenced CTE/subquery sources with a visited-set cycle guard; regressions cover unreferenced rejection and a reachable two-CTE positive chain.
