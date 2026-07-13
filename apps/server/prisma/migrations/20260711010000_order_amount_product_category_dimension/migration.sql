UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = CASE "metric_code"
    WHEN 'open_order_amount' THEN '按打开销售订单明细统计未交付订单金额，可按客户、订单、产品、产品类别展开。'
    ELSE '按销售订单明细统计订单金额，可按客户、订单、产品、产品类别展开。'
  END,
  "core_tables" = COALESCE("core_tables", '[]'::jsonb) || '["Erp.ProdGrup"]'::jsonb,
  "core_joins" = COALESCE("core_joins", '[]'::jsonb) || '["OrderDtl -> ProdGrup"]'::jsonb,
  "definition_json" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "definition_json",
        '{dimensions}',
        COALESCE("definition_json"->'dimensions', '[]'::jsonb) || '["product_category"]'::jsonb
      ),
      '{dimensionExpressions,product_category}',
      to_jsonb('COALESCE(NULLIF(ProdGrup.Description, N''''), NULLIF(OrderDtl.ProdCode, N''''), N''未分类'')'::text),
      true
    ),
    '{dimensionJoinSql}',
    COALESCE("definition_json"->'dimensionJoinSql', '{}'::jsonb) || jsonb_build_object(
      'product_category',
      jsonb_build_array('LEFT JOIN Erp.ProdGrup ProdGrup ON ProdGrup.Company = OrderDtl.Company AND ProdGrup.ProdCode = OrderDtl.ProdCode')
    ),
    true
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" IN ('order_amount', 'open_order_amount')
  AND "status" = 'approved'
  AND NOT (COALESCE("definition_json"->'dimensions', '[]'::jsonb) ? 'product_category');
