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
- GREEN: `node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts` passed 138/138 after the implementation.

## Verification

- `node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts` — 138 passed, 0 failed.
- `DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder' npm run prisma:validate` — schema valid; placeholder URL was used only for offline schema validation.
- `npm run build:server` — passed.
- `git diff --check` — passed.
- No database write or live approved-metric audit was run.

## Review

- Independent review found that two tests still fabricated `ShipDtl.OrderNum` as finance status evidence despite the `shipped_amount` kill switch.
- Resolved by keeping shipment proration coverage operational-only and asserting workflow `unsupported` for the disabled metric. The full verification command was rerun after the fix.
