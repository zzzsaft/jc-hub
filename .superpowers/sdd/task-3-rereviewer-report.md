# Task 3 Rereviewer Report

## Verdict: FAIL

Reviewed range: `0b77a7c3cdfab172d0953abb07ce705cae1fb125..b5d56773`

The two findings from the first review are substantially addressed, but the required ordinary-description false-positive boundary is still unsafe.

## Blocking finding

### Deterministic customer and supplier extraction still converts ordinary descriptions into entity filters

- `customerNameFor()` accepts almost any 2–24 character token after `客户` through end of input, while `isBadCustomerToken()` rejects only a short exact-match list: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts:418-422,452-453`.
- `labeledSupplier()` has the same issue: it accepts a free-form Chinese token through punctuation/end and rejects only values beginning with six hard-coded prefixes: `AnalysisPlannerService.ts:442-444`.
- Reproduced against an isolated `b5d56773` snapshot with a deterministic stub LLM:

```text
客户流失趋势     -> dimensionFilters.customer = "流失趋势"
客户满意度分析   -> dimensionFilters.customer = "满意度分析"
供应商绩效分析   -> dimensionFilters.supplier = "绩效分析"
```

These are ordinary analysis descriptions, not explicitly supplied entity identities. Once produced, deterministic filters override the same LLM keys and are compiled through approved expressions, so the query is silently narrowed to nonexistent customer/supplier names. This violates the requested “避免普通描述误提取” behavior. The new extraction test proves one positive six-entity sentence and one product-category negative only; it has no customer/supplier ordinary-description negatives (`apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:424-438`).

## Verified behavior

- All six filter keys are present in planner/tool schemas and the LLM output shape. Deterministic and LLM filters merge per key, with explicit deterministic values winning only their matching keys.
- Product/part extraction requires an identifier containing a digit. `产品类别` remains separate from `product`; `product_category` does not map to `partNum`. Probes for `按产品类别看销售额`, `产品毛利分析`, `未完工工单有哪些？`, and `仓库库存趋势` did not create entity filters.
- Metric composition validates order values as digits, uses numeric order equality, emits escaped Unicode `N'…'` literals for string entities, and fails closed when any selected approved metric lacks the requested dimension expression.
- Real executable repository candidates are mapped exclusively from `queryPlanJson.coveredFilterSlots`. Missing, non-array, or mixed-type metadata becomes `[]`; required/optional params are not used to infer coverage.
- The real template-selection loop calls `templateCoversPlan()` before binding. Filter-only structured plans can select a template only when every filter slot is explicitly covered; other structured shapes remain on the composer path.
- Template execution still requires approved/guard-passed rows, validates params, enforces module/access scope where supplied, and runs the runtime Guard before query execution. No Guard or permission bypass was introduced in the reviewed range.

## Verification

Isolated `git archive b5d56773` snapshot:

```text
node --import tsx --test \
  apps/server/test/erpSqlAgent/metricComposer.test.ts \
  apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts \
  apps/server/test/erpSqlAgent/sqlTemplates.test.ts \
  apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts
# 113 passed, 0 failed

node --import tsx --test \
  apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts \
  apps/server/test/erpSqlAgent/sqlGuard.test.ts \
  apps/server/test/erpSqlAgent/sqlRuntimeGuard.test.ts \
  apps/server/test/erpSqlAgent/sqlExecutor.test.ts
# 45 passed, 0 failed

git diff --check 0b77a7c3..b5d56773
# passed
```

Passing suites do not cover the blocking ordinary-description cases above.
