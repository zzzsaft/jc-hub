-- Publish explicit finance guard evidence only for existing reviewed ERP metric scopes.
UPDATE "erp_agent"."business_metric_catalog"
SET
  "definition_json" = "definition_json" || jsonb_build_object(
    'enabled', true,
    'statusField', CASE "metric_code"
      WHEN 'order_amount' THEN 'OrderHed.OpenOrder'
      WHEN 'open_order_amount' THEN 'OrderHed.OpenOrder'
      WHEN 'invoice_revenue' THEN 'InvcHead.Posted'
      WHEN 'material_cost_amount' THEN 'PartTran.TranType'
      WHEN 'labor_cost_amount' THEN 'PartTran.TranType'
      WHEN 'burden_cost_amount' THEN 'PartTran.TranType'
      WHEN 'subcontract_cost_amount' THEN 'PartTran.TranType'
      WHEN 'cost_component_amount' THEN 'PartTran.TranType'
      WHEN 'open_shipping_qty' THEN 'OrderRel.OpenRelease'
      WHEN 'open_shipping_amount' THEN 'OrderRel.OpenRelease'
      WHEN 'open_job_margin_cost_risk' THEN 'JobHead.JobClosed'
      WHEN 'purchase_amount' THEN 'POHeader.OpenOrder'
      WHEN 'collection_delay_days' THEN 'InvcHead.Posted'
      WHEN 'collection_overdue_amount' THEN 'InvcHead.Posted'
    END,
    'scopeExplanation', jsonb_build_object(
      'timeField', "definition_json"->>'timeField',
      'amountExpression', COALESCE("definition_json"->>'amountExpression', "definition_json"->>'valueExpression', "definition_json"->>'rateExpression'),
      'statusFilters', COALESCE("definition_json"->'statusFilters', '[]'::jsonb),
      'taxRefundPolicy', COALESCE("definition_json"->>'taxRefundPolicy', '按 approved atomic metric definition_json')
    ),
    'documentPreaggregationKeys', CASE "metric_code"
      WHEN 'order_amount' THEN '["Company", "OrderNum", "OrderLine"]'::jsonb
      WHEN 'open_order_amount' THEN '["Company", "OrderNum", "OrderLine"]'::jsonb
      WHEN 'purchase_amount' THEN '["Company", "PONum", "POLine"]'::jsonb
      WHEN 'open_shipping_qty' THEN '["Company", "OrderNum", "OrderLine", "OrderRelNum"]'::jsonb
      WHEN 'open_shipping_amount' THEN '["Company", "OrderNum", "OrderLine", "OrderRelNum"]'::jsonb
      ELSE '[]'::jsonb
    END
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric'
  AND "metric_code" IN (
    'order_amount', 'open_order_amount', 'invoice_revenue',
    'material_cost_amount', 'labor_cost_amount', 'burden_cost_amount', 'subcontract_cost_amount', 'cost_component_amount',
    'open_shipping_qty', 'open_shipping_amount', 'open_job_margin_cost_risk', 'purchase_amount',
    'collection_delay_days', 'collection_overdue_amount'
  );

-- Kill switch: these definitions multiply an order-line amount across PartTran rows.
-- They stay non-executable until a reviewed document-key pre-aggregation bridge is published.
UPDATE "erp_agent"."business_metric_catalog"
SET
  "status" = 'draft',
  "definition_json" = "definition_json" || jsonb_build_object(
    'enabled', false,
    'unsupportedReason', 'missing_verified_parttran_order_detail_preaggregation_bridge'
  ),
  "notes" = CONCAT_WS(E'\n', NULLIF("notes", ''), 'Disabled 2026-07-12: PartTran -> OrderDtl amount bridge lacks reviewed document-key pre-aggregation.'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN ('gross_margin_amount', 'gross_margin_rate')
  AND "status" = 'approved';

UPDATE "erp_agent"."business_metric_catalog"
SET
  "status" = 'draft',
  "definition_json" = "definition_json" || jsonb_build_object(
    'enabled', false,
    'unsupportedReason', 'missing_verified_shipment_status_field'
  ),
  "notes" = CONCAT_WS(E'\n', NULLIF("notes", ''), 'Disabled 2026-07-12: shipped amount scope has no reviewed shipment status field/predicate.'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" = 'shipped_amount'
  AND "status" = 'approved';
