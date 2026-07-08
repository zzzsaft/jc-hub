UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = jsonb_set(
    jsonb_set(
      "definition_json",
      '{dimensions}',
      '["customer", "order", "product", "division", "salesperson"]'::jsonb
    ),
    '{dimensionExpressions}',
    ("definition_json"->'dimensionExpressions') || '{"salesperson": "OrderHed.EntryPerson"}'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN (
  'order_amount',
  'gross_margin_amount',
  'gross_margin_rate',
  'cost_component_amount',
  'open_order_amount',
  'material_cost_amount',
  'labor_cost_amount',
  'burden_cost_amount',
  'subcontract_cost_amount'
)
  AND "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = '按采购订单统计采购金额，可按产品/订单/供应商展开。',
  "definition_json" = jsonb_set(
    jsonb_set(
      "definition_json",
      '{dimensions}',
      '["product", "order", "supplier"]'::jsonb
    ),
    '{dimensionExpressions}',
    ("definition_json"->'dimensionExpressions') || '{"supplier": "POHeader.VendorNum"}'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" = 'purchase_amount'
  AND "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric';
