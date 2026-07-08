# ERP SQL Finance Metrics

Finance SQL generation is gated by approved metric definitions.

## Rules

- Approved SQL templates still execute first when they match the question and required params.
- Strict finance mode is the default. If no approved template matches a finance question, the agent may call the LLM generator only when `erp_agent.business_metric_catalog` has a matching `status = 'approved'` finance metric.
- Estimate finance mode is allowed only when the user explicitly asks for rough decision support, such as `估算`, `大概`, `大致`, `粗算`, `趋势`, or `决策参考`. In this mode, historical dataset/family references may authorize generation, but the result must be labeled as non-accounting guidance.
- Draft metrics remain documentation and review material only. They are never generation authority.
- Historical dataset and family references can help non-finance generation and estimate finance mode, but they are not enough to authorize strict finance SQL.

## Metric Definition

`business_metric_catalog.definition_json` stores the structured finance scope for an approved metric, such as amount expression, time field, tax/refund/cost policy, status filters, exclusions, required tables, and required fields. The generator receives this JSON with the metric reference and must not change those scopes.

`SqlGuardService` still validates generated finance SQL for amount, status, date fields, detail pre-aggregation, and visible scope explanation columns: `时间字段`, `金额字段`, `状态过滤`, `税退款口径`.

Mastra `validateSql` passes `module`, `references`, and `financeMode` into `SqlGuardService`. Strict mode accepts only approved `metric` or `template` references. Estimate mode accepts any historical SQL reference but requires at least one reference and returns a disclaimer: the result is for estimation/decision support only and cannot be used for finance reports, reconciliation, audit, payment, or settlement.

Workflow output may include `financeScope` with the mode, metric names, inferred time/amount/status fields, tax/refund policy note, reference metadata, and the estimate disclaimer.
