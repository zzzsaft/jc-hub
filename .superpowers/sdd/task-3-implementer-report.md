# Task 3 Implementer Report

## Outcome

- Added typed `dimensionFilters` for customer, order, supplier, product, warehouse, and job; retained the existing `product_category` key for multi-turn compatibility.
- The analysis planner now extracts explicit numeric sales order identifiers such as `226867`.
- The metric composer compiles filters only through approved `dimensionExpressions`.
  - Customer names keep the guarded Unicode `LIKE N'…'` behavior.
  - Order identifiers must contain digits only and compile as numeric equality.
  - Other entity values compile as escaped Unicode equality literals.
  - Missing approved expressions fail closed.
- Template candidates now expose `coveredFilterSlots`; selection verifies every plan dimension filter maps to a declared template slot before binding.
- Existing structured metric/time/comparison plans remain on the approved metric composer unless the template can safely prove the complete filter-only scope.

## TDD Evidence

Initial focused RED command:

```text
node --import tsx --test --test-name-pattern='order-scoped open shipping|captures an explicit order number|template without orderNum coverage' apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
```

Result: 3 tests, 0 passed, 3 failed for the expected missing order extraction, missing SQL predicate, and missing covered-template selection path.

After the minimal implementation, the same command passed 3/3.

## Final Verification

```text
node --import tsx --test apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
# 96 passed, 0 failed

node --import tsx --test apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts
# 14 passed, 0 failed

npm run build:server
# passed

git diff --check
# passed
```

## Scope Notes

- No Guard, permission, execution, or multi-turn context behavior was bypassed.
- No database schema, ERP write path, unrelated dirty file, or existing user template edit was changed.

## Reviewer Follow-up

The two blocking findings from the first review were addressed in a separate follow-up commit:

- Deterministic planning now recognizes explicitly labelled customer, order, supplier, product/part, warehouse, and job values. Product, warehouse, and job extraction requires an identifier containing a digit to avoid interpreting ordinary phrases such as “产品毛利” or “未完工工单” as entity values. Product categories remain separate.
- The LLM output contract now declares all six `dimensionFilters`, and LLM filters are merged per key with deterministic values taking precedence only for the same key.
- Executable repository candidates now read `coveredFilterSlots` exclusively from the approved template row's `queryPlanJson`. Missing or malformed metadata maps to `[]`; required and optional params no longer imply coverage.
- Repository-row mapping and template selection tests use the same `withTemplateCoverage` function as production.

Follow-up RED evidence:

```text
analysis planner deterministically extracts all six entity filters ... failed
analysis planner merges deterministic filters ... failed
```

The repository mapping test initially failed because the production export did not exist. After adding the row mapper, repository tests passed while both planner tests remained behaviorally red until extraction and merge were implemented.

## Rereviewer Follow-up

The remaining deterministic extraction false-positive was reproduced with RED cases for `客户流失趋势`, `客户满意度分析`, `供应商绩效分析`, `供应商交期趋势`, and `客户价值分析`.

Customer and supplier extraction now uses positive, auditable identity syntax instead of topic-word blacklists. It accepts known customer aliases, explicit `为/是/等于/=/冒号` assignments, quoted names, company/group names, and uppercase business identifiers. Bare free-form `客户X` / `供应商X` descriptions no longer become filters. Tests also preserve the mixed six-entity case, `jctimes` company syntax, quoted names, `BYD`, and the existing customer-abbreviation resolution workflow.
