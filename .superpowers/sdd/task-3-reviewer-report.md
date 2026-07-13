# Task 3 Reviewer Report

## Verdict: FAIL

Commit reviewed: `9ec8d32770217b65a0ca417bd1b1756f3f826e2e`

The focused and adjacent tests pass in an isolated archive of the commit, but two required production behaviors are not implemented end to end.

## Blocking findings

### 1. Six-entity typed filter extraction is only implemented for customer and order

- `AnalysisPlanDimensionFilter` and both Zod schemas admit all six requested entity keys (`customer`, `order`, `supplier`, `product`, `warehouse`, `job`), but the deterministic extractor only returns `customer` and `order`: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts:419-425`.
- The LLM planner prompt's declared `outputShape` does not mention `dimensionFilters` at all: `AnalysisPlannerService.ts:324-334`. Therefore supplier/product/warehouse/job extraction is neither deterministically implemented nor requested from the LLM contract.
- In the LLM path, whenever the question contains a deterministically recognized customer/order, the spread at `AnalysisPlannerService.ts:356-358` replaces the entire LLM-produced `dimensionFilters` object with the two-key deterministic result, potentially discarding other entity filters from the same question.
- The new tests prove only order extraction (`apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:418-423`). The composer test for supplier/product/warehouse/job injects a hand-built plan directly (`apps/server/test/erpSqlAgent/metricComposer.test.ts:506-528`), so it does not prove extraction or propagation.

Impact: questions scoped by supplier, product, warehouse, or job do not reliably produce the typed filters required by the brief, and mixed questions can lose an LLM-extracted entity filter.

### 2. `coveredFilterSlots` is not real template metadata and can falsely claim coverage

- The production `ErpQueryTemplate` model has only `requiredParams` and `optionalParams`; it has no `coveredFilterSlots` field: `apps/server/prisma/schema.prisma:1149-1181`.
- Consequently, the real repository candidate type also has no coverage property (`apps/server/src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.ts:28-31`). The tool accepts an optional synthetic property and otherwise derives coverage from every required/optional parameter name: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts:892-896`.
- This inference is not proof that a parameter safely constrains the requested dimension. In particular, template guard validation checks SQL binding only for **required** params (`apps/server/src/modules/erpSqlAgent/templates/service/SqlTemplateGuardService.ts:18-21`); an optional param can be present in metadata yet absent from SQL and still be advertised as covered by the fallback.
- The coverage test mocks candidates with an ad-hoc `coveredFilterSlots` property (`apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:438-455`). It never exercises a candidate returned from the Prisma-backed repository, so it cannot detect that production metadata is absent.

Impact: the required default fail-closed behavior is not achieved for real template rows. Existing parameter declarations can be promoted to filter-coverage claims without an explicit, reviewed coverage declaration, allowing a scoped plan to select a template that does not actually apply that scope.

## Verified behavior

- Order `226867` is extracted and compiles as numeric equality through the approved `dimensionExpressions.order`: `AnalysisPlannerService.ts:421-425`; `MetricComposerService.ts:305-311`.
- Order values are digits-only before interpolation (`MetricComposerService.ts:329-335`); the injection regression test passes.
- String entity values use Unicode `N'...'` literals and single quotes are doubled (`MetricComposerService.ts:309-311`); the supplier quote regression test passes.
- Missing dimension expressions fail closed across every selected metric (`MetricComposerService.ts:329-339`).
- `product_category` remains distinct from `product`; template slot mapping has no fallback from `product_category` to `partNum` (`SqlTemplateGuardService.ts:39-53`), so this change does not make PartNum masquerade as a grouping dimension.
- No question text or template ID special case was added to the selection guard. Existing family scoring patterns predate this commit.
- SQL Guard, runtime Guard, access scope, and permission checks were not weakened by this diff. Composer still invokes access-scope and SQL guard checks after composition (`MetricComposerService.ts:100+`).
- Slot names introduced by the dimension-to-template mapping align with the existing capability/intent vocabulary: `orderNum`, `customerName`, `vendorName`, `partNum`, `warehouseCode`, `jobNum` (`SqlTemplateGuardService.ts:39-45`; `capabilities/registry.ts:41-48`). `product_category` intentionally has no `partNum` alias.

## Verification run

Run against an isolated `git archive 9ec8d327` snapshot (not the dirty working tree):

```text
node --import tsx --test \
  apps/server/test/erpSqlAgent/metricComposer.test.ts \
  apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts \
  apps/server/test/erpSqlAgent/sqlTemplates.test.ts \
  apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts
```

Result: `110 passed, 0 failed` in approximately 6.1 seconds.

These passing tests establish the implemented order/composer behavior but do not cover the two production-path gaps above.
