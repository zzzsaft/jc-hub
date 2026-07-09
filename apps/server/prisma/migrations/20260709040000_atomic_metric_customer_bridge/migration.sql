UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    jsonb_set(
      "definition_json",
      '{dimensionExpressions,customer}',
      to_jsonb('COALESCE(Customer.Name, Customer.CustID)'::text),
      true
    ),
    '{joinSql}',
    COALESCE("definition_json"->'joinSql', '[]'::jsonb)
      || '["LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"]'::jsonb,
    true
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'order_amount',
    'open_order_amount',
    'gross_margin_amount',
    'gross_margin_rate',
    'cost_component_amount',
    'material_cost_amount',
    'labor_cost_amount',
    'burden_cost_amount',
    'subcontract_cost_amount',
    'open_shipping_qty',
    'open_shipping_amount',
    'shipped_amount',
    'open_job_margin_cost_risk'
  )
  AND "definition_json"->'dimensions' ? 'customer'
  AND COALESCE("definition_json"->'dimensionExpressions'->>'customer', '') !~* '(name|custid|customer|客户)'
  AND COALESCE("definition_json"->'joinSql', '[]'::jsonb)::text NOT LIKE '%Erp.Customer Customer%';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    "definition_json",
    '{dimensionExpressions,customer}',
    to_jsonb('COALESCE(Customer.Name, Customer.CustID)'::text),
    true
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'order_amount',
    'open_order_amount',
    'gross_margin_amount',
    'gross_margin_rate',
    'cost_component_amount',
    'material_cost_amount',
    'labor_cost_amount',
    'burden_cost_amount',
    'subcontract_cost_amount',
    'open_shipping_qty',
    'open_shipping_amount',
    'shipped_amount',
    'open_job_margin_cost_risk'
  )
  AND "definition_json"->'dimensions' ? 'customer'
  AND COALESCE("definition_json"->'dimensionExpressions'->>'customer', '') !~* '(name|custid|customer|客户)'
  AND COALESCE("definition_json"->'joinSql', '[]'::jsonb)::text LIKE '%Erp.Customer Customer%';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "core_tables" = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements("core_tables" || '["Erp.Customer"]'::jsonb) AS item(value)
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "definition_json"->'dimensions' ? 'customer'
  AND COALESCE("definition_json"->'dimensionExpressions'->>'customer', '') ~* '(name|custid|customer|客户)';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    jsonb_set(
      "definition_json",
      '{dimensionExpressions,customer}',
      to_jsonb('COALESCE(Customer.Name, Customer.CustID)'::text),
      true
    ),
    '{joinSql}',
    COALESCE("definition_json"->'joinSql', '[]'::jsonb)
      || '["LEFT JOIN Erp.Customer Customer ON Customer.Company = InvcHead.Company AND Customer.CustNum = InvcHead.CustNum"]'::jsonb,
    true
  ),
  "core_tables" = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements("core_tables" || '["Erp.Customer"]'::jsonb) AS item(value)
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'invoice_revenue',
    'collection_delay_days',
    'collection_overdue_amount'
  )
  AND "definition_json"->'dimensions' ? 'customer'
  AND COALESCE("definition_json"->'dimensionExpressions'->>'customer', '') !~* '(name|custid|customer|客户)'
  AND COALESCE("definition_json"->'joinSql', '[]'::jsonb)::text NOT LIKE '%Erp.Customer Customer%';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    "definition_json",
    '{dimensionExpressions,customer}',
    to_jsonb('COALESCE(Customer.Name, Customer.CustID)'::text),
    true
  ),
  "core_tables" = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements("core_tables" || '["Erp.Customer"]'::jsonb) AS item(value)
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'invoice_revenue',
    'collection_delay_days',
    'collection_overdue_amount'
  )
  AND "definition_json"->'dimensions' ? 'customer'
  AND COALESCE("definition_json"->'dimensionExpressions'->>'customer', '') !~* '(name|custid|customer|客户)'
  AND COALESCE("definition_json"->'joinSql', '[]'::jsonb)::text LIKE '%Erp.Customer Customer%';
