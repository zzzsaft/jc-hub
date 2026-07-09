UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = '按销售订单明细统计订单金额，可按客户、订单、产品展开。',
  "calculation_summary" = 'SUM(OrderDtl.DocExtPriceDtl)，通过 OrderHed 取订单日期和客户，通过 Customer.Name/CustID 支持客户名过滤。',
  "core_tables" = '["Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  "core_joins" = '["OrderDtl -> OrderHed -> Customer"]'::jsonb,
  "definition_json" = $json${
    "kind": "atomic_metric",
    "metricCode": "order_amount",
    "grain": "order_line",
    "dimensions": ["customer", "order", "product"],
    "dimensionExpressions": {
      "customer": "COALESCE(Customer.Name, Customer.CustID)",
      "order": "OrderDtl.OrderNum",
      "product": "OrderDtl.PartNum"
    },
    "keyExpressions": { "Company": "OrderDtl.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "OrderDtl.DocExtPriceDtl",
    "aggregation": "SUM",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderDtl"],
    "joinSql": [
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按销售订单明细 DocExtPriceDtl 原币金额，税退款以 ERP 订单字段为准。"
  }$json$::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN ('order_amount', 'open_order_amount')
  AND "status" = 'approved';

UPDATE "erp_agent"."business_metric_catalog"
SET "definition_json" = jsonb_set("definition_json", '{metricCode}', to_jsonb("metric_code"))
WHERE "metric_code" IN ('order_amount', 'open_order_amount')
  AND "status" = 'approved';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = CASE "metric_code"
    WHEN 'gross_margin_amount' THEN '按生产入库成本和销售订单明细金额估算毛利金额，可按客户、订单、产品展开。'
    WHEN 'gross_margin_rate' THEN '按生产入库成本和销售订单明细金额估算毛利率，可按客户、订单、产品展开。'
    ELSE '按生产入库事务统计成本金额，可按客户、订单、产品展开。'
  END,
  "calculation_summary" = CASE "metric_code"
    WHEN 'gross_margin_amount' THEN 'SUM(OrderDtl.DocExtPriceDtl) - SUM((PartTran.MtlUnitCost + PartTran.LbrUnitCost + PartTran.BurUnitCost + PartTran.SubUnitCost) * ABS(PartTran.TranQty))。'
    WHEN 'gross_margin_rate' THEN '(SUM(OrderDtl.DocExtPriceDtl) - SUM(cost)) / NULLIF(SUM(OrderDtl.DocExtPriceDtl), 0)。'
    ELSE 'SUM((PartTran.MtlUnitCost + PartTran.LbrUnitCost + PartTran.BurUnitCost + PartTran.SubUnitCost) * ABS(PartTran.TranQty))。'
  END,
  "core_tables" = '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  "core_joins" = '["PartTran -> JobProd -> OrderDtl -> OrderHed -> Customer"]'::jsonb,
  "definition_json" =
    jsonb_build_object(
      'kind', 'atomic_metric',
      'metricCode', "metric_code",
      'grain', 'production_cost_transaction',
      'dimensions', '["customer", "order", "product"]'::jsonb,
      'dimensionExpressions', '{"customer": "COALESCE(Customer.Name, Customer.CustID)", "order": "OrderDtl.OrderNum", "product": "PartTran.PartNum"}'::jsonb,
      'keyExpressions', '{"Company": "PartTran.Company"}'::jsonb,
      'timeField', 'PartTran.TranDate',
      'amountExpression', CASE "metric_code"
        WHEN 'gross_margin_amount' THEN 'OrderDtl.DocExtPriceDtl - ((PartTran.MtlUnitCost + PartTran.LbrUnitCost + PartTran.BurUnitCost + PartTran.SubUnitCost) * ABS(PartTran.TranQty))'
        WHEN 'gross_margin_rate' THEN 'SUM(OrderDtl.DocExtPriceDtl - ((PartTran.MtlUnitCost + PartTran.LbrUnitCost + PartTran.BurUnitCost + PartTran.SubUnitCost) * ABS(PartTran.TranQty))) / NULLIF(SUM(OrderDtl.DocExtPriceDtl), 0)'
        ELSE '(PartTran.MtlUnitCost + PartTran.LbrUnitCost + PartTran.BurUnitCost + PartTran.SubUnitCost) * ABS(PartTran.TranQty)'
      END,
      'aggregation', CASE "metric_code" WHEN 'gross_margin_rate' THEN 'AVG' ELSE 'SUM' END,
      'statusFilters', '["PartTran.TranType IN (''MFG-STK'', ''MFG-CUS'')", "PartTran.TranQty <> 0"]'::jsonb,
      'requiredTables', '["Erp.PartTran"]'::jsonb,
      'joinSql', '[
        "JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum",
        "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
        "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
        "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
      ]'::jsonb,
      'joinKeys', '["Company"]'::jsonb,
      'mode', 'decision_support',
      'taxRefundPolicy', '生产成本 + 订单明细金额估算口径；不可用于财务报表、审计或结算。'
    ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN ('gross_margin_amount', 'gross_margin_rate', 'cost_component_amount')
  AND "status" = 'approved';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    "definition_json" #- '{dimensionExpressions,division}' #- '{dimensionExpressions,salesperson}',
    '{dimensions}',
    (SELECT jsonb_agg(value) FROM jsonb_array_elements_text("definition_json"->'dimensions') AS t(value) WHERE value NOT IN ('division', 'salesperson'))
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'invoice_revenue',
    'material_cost_amount',
    'labor_cost_amount',
    'burden_cost_amount',
    'subcontract_cost_amount',
    'open_shipping_qty',
    'open_shipping_amount',
    'shipped_amount',
    'open_job_margin_cost_risk'
  );

UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    "definition_json" #- '{dimensionExpressions,product}',
    '{dimensions}',
    (SELECT jsonb_agg(value) FROM jsonb_array_elements_text("definition_json"->'dimensions') AS t(value) WHERE value <> 'product')
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" = 'invoice_revenue'
  AND "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric';
