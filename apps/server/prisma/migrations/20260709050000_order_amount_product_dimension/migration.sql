UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = CASE "metric_code"
    WHEN 'open_order_amount' THEN '按打开销售订单明细统计未交付订单金额，可按客户、订单、产品展开。'
    ELSE '按销售订单明细统计订单金额，可按客户、订单、产品展开。'
  END,
  "calculation_summary" = CASE "metric_code"
    WHEN 'open_order_amount' THEN 'SUM(OrderDtl.DocExtPriceDtl)，通过 OrderHed 取订单日期和打开状态，通过 OrderDtl.PartNum 取产品。'
    ELSE 'SUM(OrderDtl.DocExtPriceDtl)，通过 OrderHed 取订单日期，通过 OrderDtl.PartNum 取产品。'
  END,
  "core_tables" = '["Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  "core_joins" = '["OrderDtl -> OrderHed -> Customer"]'::jsonb,
  "definition_json" = jsonb_build_object(
    'kind', 'atomic_metric',
    'metricCode', "metric_code",
    'grain', 'order_line',
    'dimensions', '["customer", "order", "product"]'::jsonb,
    'dimensionExpressions', '{
      "customer": "COALESCE(Customer.Name, Customer.CustID)",
      "order": "OrderDtl.OrderNum",
      "product": "OrderDtl.PartNum"
    }'::jsonb,
    'keyExpressions', '{"Company": "OrderDtl.Company"}'::jsonb,
    'timeField', 'OrderHed.OrderDate',
    'amountExpression', 'OrderDtl.DocExtPriceDtl',
    'aggregation', 'SUM',
    'statusFilters', CASE "metric_code"
      WHEN 'open_order_amount' THEN '["OrderHed.OpenOrder = 1"]'::jsonb
      ELSE '[]'::jsonb
    END,
    'requiredTables', '["Erp.OrderDtl"]'::jsonb,
    'joinSql', '[
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ]'::jsonb,
    'joinKeys', '["Company"]'::jsonb,
    'mode', 'strict',
    'taxRefundPolicy', '按销售订单明细 DocExtPriceDtl 原币金额；税退款以 ERP 订单字段为准。'
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN ('order_amount', 'open_order_amount')
  AND "status" = 'approved';
