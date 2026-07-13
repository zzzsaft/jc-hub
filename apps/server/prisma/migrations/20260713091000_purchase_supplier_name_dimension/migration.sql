UPDATE "erp_agent"."business_metric_catalog"
SET
  "business_description" = '按采购订单统计采购金额，可按产品、订单或供应商名称展开；供应商编号仅作为内部实体键。',
  "definition_json" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "definition_json",
        '{dimensionExpressions}',
        COALESCE("definition_json"->'dimensionExpressions', '{}'::jsonb)
          || jsonb_build_object(
            'supplier', 'COALESCE(NULLIF(LTRIM(RTRIM(Vendor.Name)), N''''), N''未命名供应商'')'
          ),
        true
      ),
      '{dimensionKeyExpressions}',
      COALESCE("definition_json"->'dimensionKeyExpressions', '{}'::jsonb)
        || jsonb_build_object('supplier', 'POHeader.VendorNum'),
      true
    ),
    '{dimensionJoinSql}',
    COALESCE("definition_json"->'dimensionJoinSql', '{}'::jsonb)
      || jsonb_build_object(
        'supplier', jsonb_build_array(
          'JOIN Erp.Vendor Vendor ON Vendor.Company = POHeader.Company AND Vendor.VendorNum = POHeader.VendorNum'
        )
      ),
    true
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "metric_code" = 'purchase_amount'
  AND "status" = 'approved'
  AND "definition_json"->>'kind' = 'atomic_metric';
