# ERP SQL Finance Metrics

Finance SQL generation is gated by approved metric definitions.

## Rules

- Production runtime uses one semantic + current-schema gate for approved templates, approved composite/atomic metrics, rule SQL, and LLM fallback. Golden evaluation no longer owns the only semantic-family decision.
- Approved SQL templates still execute first when they match the question and required params.
- Strict finance mode is the default. If no approved template or approved metric fully covers a finance question, the Mastra toolchain downgrades generation to estimate mode instead of hiding data, and the output must clearly say the data may be wrong and is for reference only.
- Estimate finance mode is used when the user explicitly asks for rough decision support, such as `估算`, `大概`, `大致`, `粗算`, `趋势`, or `决策参考`, or when strict mode lacks approved metric coverage. In this mode, historical dataset/family references may authorize generation, but the result must be labeled as non-accounting guidance.
- Draft metrics remain documentation and review material only. They are never generation authority.
- Historical dataset and family references can help non-finance generation, scenario evidence, and estimate finance mode, but they are not enough to mark a result as strict/approved finance SQL.
- Strict finance questions with an `analysisPlan` and missing required approved atomic metrics continue through estimate generation after reference retrieval. The workflow reports `low_confidence_metric_sql` warnings, keeps missing metric evidence in `analysisPlan`, and labels the result as potentially inaccurate reference data.

## Metric Definition

`business_metric_catalog.definition_json` stores the structured finance scope for an approved metric, such as amount expression, time field, tax/refund/cost policy, status filters, exclusions, required tables, and required fields. The generator receives this JSON with the metric reference and must not change those scopes.

Atomic metrics use `definition_json.kind = "atomic_metric"`. The Mastra ERP SQL toolchain can first build an `analysisPlan` from business-analysis questions with rules first and JSON-only LLM fallback for still-unmatched analysis phrasing, then compose strict SQL only when every requested metric has `status = 'approved'`, `kind = 'atomic_metric'`, and compatible grain or shared `joinKeys`. Missing or incompatible atomic metrics downgrade the generated result to estimate mode.

Scenario recipes are lightweight planner rules, not executable SQL templates. v1 recipes cover sales/margin/cost by product/customer/order, customer revenue/margin risk, purchase cost/margin impact, division sales/margin/backlog summary, customer monthly margin trend, division sales/margin monthly trend, product sales/inventory/backlog trend, shipped customer margin/collection summary, open job customer margin/cost risk, and product customer concentration. A recipe sets scenario code, required metrics, supported dimensions, default ordering, TopN behavior, optional monthly grain, and optional result shape; execution authority still comes only from approved templates, approved composite metrics, or approved atomic metrics.

Trend and concentration recipes reuse approved atomic metrics instead of adding scenario-only metrics. `customer_margin_monthly_trend` uses `order_amount` and `gross_margin_rate` by customer with `timeGrain = month`, defaulting trend-like recent questions to a 180-day relative range; `division_sales_margin_monthly_trend` does the same by division. `product_sales_inventory_backlog_trend` combines `order_amount`, `inventory_on_hand_qty`, `open_shipping_qty`, and `open_shipping_amount` by product only, because current inventory is a snapshot metric and should not be forced through order grain. `product_customer_concentration` uses `order_amount` by product and customer, then the composer adds `customer_share_rate` and `customer_count` window columns. v1 does not apply a built-in threshold for “concentration too high” and does not auto-diagnose continuous decline in SQL.

Approved composite finance metrics may run before atomic composition when they exactly cover a known strict finance question and provide reviewed `representative_sql`. The SQL still goes through `SqlGuardService` with the approved metric reference; this is only a shortcut for already-reviewed fixed-scope metrics, not a general bypass.

Supported v1 atomic definitions are deliberately small: `metricCode`, `grain`, `dimensions`, `dimensionExpressions`, `timeField`, `amountExpression`, `statusFilters`, `requiredTables`, optional `joinSql`, `joinKeys`, `overdueFilters`, and mode metadata. The composer uses these values directly and still passes the generated SQL through `SqlGuardService`.

Approved open shipping metrics use the `family_037` scope `OrderRel -> OrderDtl -> OrderHed -> Customer`: `open_shipping_qty = SUM(OrderRel.OurReqQty)` and `open_shipping_amount = SUM(OrderDtl.DocExtPriceDtl * OrderRel.OurReqQty / NULLIF(OrderDtl.OrderQty, 0))`, with `OrderRel.OpenRelease = 1` and `OrderRel.OurReqQty > 0`. Overdue delivery only adds `OrderRel.ReqDate < CAST(GETDATE() AS date)`. These are operational backlog metrics, not invoice, collection, settlement, or accounting revenue metrics. The older `open_order_amount` remains a coarse open-order amount metric, not the approved 待发/未交付金额口径.

Approved production cost component metrics use `PartTran` production cost transactions only: `material_cost_amount`, `labor_cost_amount`, `burden_cost_amount`, and `subcontract_cost_amount` calculate `UnitCost * ABS(TranQty)` for `MFG-STK/MFG-CUS`. They are production cost metrics, not refund, RMA, invoice, collection, purchase, or inventory-adjustment metrics.

Approved inventory on-hand quantity uses `PartWhse.OnHandQty` only. `inventory_on_hand_qty` is an operational quantity metric by product and warehouse; it is not an amount, cost, available-to-promise, invoice, collection, or settlement metric.

Approved shipped amount uses the shipment scope `ShipDtl -> ShipHead` plus `ShipDtl -> OrderDtl -> OrderHed -> Customer`. `shipped_amount` calculates order-line amount prorated by shipped quantity: `OrderDtl.DocExtPriceDtl * (OurInventoryShipQty + OurJobShipQty) / OrderDtl.OrderQty`, with `ShipHead.ShipDate` as the time field. This is an operational shipment amount, not invoice revenue, collection, settlement, or refund scope. The shipped customer margin/collection recipe is customer-grain in strict mode because overdue collection metrics are approved at invoice customer/order grain, not invoice product allocation grain.

Approved open job risk uses `JobHead -> JobProd -> OrderDtl -> OrderHed -> Customer`. `open_job_margin_cost_risk` counts `DISTINCT JobHead.JobNum` where `JobClosed = 0`, `JobComplete = 0`, and the job is linked to a customer order. This is an operational risk count used beside order amount, gross margin, and approved cost components; it is not a monetary accounting metric.

Approved overdue collection metrics use the invoice balance scope only: `collection_delay_days = MAX(DATEDIFF(day, InvcHead.DueDate, CAST(GETDATE() AS date)))` and `collection_overdue_amount = SUM(InvcHead.DocInvoiceBal)` from `Erp.InvcHead`, with `Posted = 1`, `OpenInvoice = 1`, `DocInvoiceBal > 0`, and `DueDate < CAST(GETDATE() AS date)`. This is an operational unpaid-invoice-balance scope; it does not join `CashDtl/CashHead` or split actual receipts, refunds, write-offs, reversals, or bad-debt handling.

`SqlGuardService` still validates generated finance SQL for amount, status, date fields, detail pre-aggregation, and visible scope explanation columns: `时间字段`, `金额字段`, `状态过滤`, `税退款口径`.

Mastra `validateSql` passes `module`, `references`, and `financeMode` into `SqlGuardService`. Strict mode accepts only approved `metric` or `template` references. Estimate mode accepts any historical SQL reference but requires at least one reference and returns a disclaimer: the result is for estimation/decision support only and cannot be used for finance reports, reconciliation, audit, payment, or settlement.

Workflow output may include `financeScope` with the mode, metric names, inferred time/amount/status fields, tax/refund policy note, reference metadata, and the estimate disclaimer.

## Runtime result contract

`semanticStatus=exact` requires the candidate sources to cover every family group implied by `analysisPlan.requiredMetrics/metrics` and the final SQL to pass the current schema guard. `semanticStatus=estimate` is allowed only after the same semantic match and schema validation; it represents a confidence/approval gap and always carries the reference-only disclaimer. `semanticStatus=semantic_mismatch` is a hard execution gate, not an estimate: the public response uses `sql=""` and makes zero executor calls.

Approved template `guard_passed` and stored table/field lists are historical approval evidence only. Runtime renders parameters, applies access scope, and validates the resulting SQL again. Schema failure, failed one-shot LLM repair, or semantic mismatch rolls the public result back to empty SQL while protected trace data may retain the candidate SQL/hash, expected/actual families and metrics, and guard errors.
