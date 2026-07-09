INSERT INTO "erp_agent"."erp_query_templates" (
  "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
  "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
  "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
  "guard_passed", "approved", "approval_status", "approved_by", "approved_at", "notes", "usage_count", "success_count", "updated_at"
)
VALUES (
  '销售订单明细查询',
  'sales_order_detail',
  'sales',
  '销售订单明细、客户订单列表、订单物料明细、未关闭销售订单',
  '销售订单明细查询 family_016',
  $json${
    "intent": "sales_order_detail",
    "module": "sales",
    "sourceFamilyId": "family_016",
    "params": {
      "optional": ["companyScope", "orderNum", "customerName", "entryPerson", "partNum", "prodCode", "orderDateFrom", "orderDateTo", "requestDateFrom", "requestDateTo", "onlyOpen"]
    },
    "filters": ["orderNum", "customerName", "partNum", "orderDate", "requestDate", "onlyOpen"],
    "guard": { "valid": true, "source": "20260710010000_sales_order_shipping_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  oh.Company AS [公司],
  oh.OrderNum AS [订单号],
  od.OrderLine AS [订单行],
  c.Name AS [客户],
  oh.EntryPerson AS [录入人],
  od.PartNum AS [物料编号],
  od.LineDesc AS [物料描述],
  od.OrderQty AS [下单数量],
  od.DocExtPriceDtl AS [签约金额],
  oh.OrderDate AS [下单日期],
  od.RequestDate AS [需求日期],
  od.OpenLine AS [行是否未关闭]
FROM Erp.OrderHed oh
INNER JOIN Erp.OrderDtl od ON od.Company = oh.Company AND od.OrderNum = oh.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN Erp.Part p ON p.Company = od.Company AND p.PartNum = od.PartNum
LEFT JOIN Erp.ProdGrup pg ON pg.Company = p.Company AND pg.ProdCode = p.ProdCode
WHERE (@companyScope IS NULL OR oh.Company = @companyScope)
  AND (@orderNum IS NULL OR oh.OrderNum = @orderNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%') OR c.CustID LIKE CONCAT('%', @customerName, '%'))
  AND (@entryPerson IS NULL OR oh.EntryPerson LIKE CONCAT(@entryPerson, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@orderDateFrom IS NULL OR oh.OrderDate >= @orderDateFrom)
  AND (@orderDateTo IS NULL OR oh.OrderDate <= @orderDateTo)
  AND (@requestDateFrom IS NULL OR od.RequestDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR od.RequestDate <= @requestDateTo)
  AND (@onlyOpen = 0 OR od.OpenLine = 1)$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "orderNum": {"type": "number"},
    "customerName": {"type": "string"},
    "entryPerson": {"type": "string"},
    "partNum": {"type": "string"},
    "prodCode": {"type": "string"},
    "orderDateFrom": {"type": "string"},
    "orderDateTo": {"type": "string"},
    "requestDateFrom": {"type": "string"},
    "requestDateTo": {"type": "string"},
    "onlyOpen": {"type": "boolean"}
  }'::jsonb,
  '["Erp.OrderHed", "Erp.OrderDtl", "Erp.Customer", "Erp.Part", "Erp.ProdGrup"]'::jsonb,
  '["Company", "OrderNum", "OrderLine", "CustNum", "Name", "CustID", "EntryPerson", "PartNum", "LineDesc", "OrderQty", "DocExtPriceDtl", "OrderDate", "RequestDate", "OpenLine", "ProdCode"]'::jsonb,
  '["OrderHed -> OrderDtl", "OrderHed -> Customer", "OrderDtl -> Part", "Part -> ProdGrup"]'::jsonb,
  'finereport_family',
  'family_016',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved minimal executable template for family_016 golden fast path; uses OrderHed + OrderDtl with Customer filter.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '发货通知明细查询',
  'sales_shipping_notice_detail',
  'sales_inventory',
  '发货通知明细、待发货订单、欠发订单、未发完销售订单',
  '发货通知明细查询 family_037',
  $json${
    "intent": "sales_shipping_notice_detail",
    "module": "sales_inventory",
    "sourceFamilyId": "family_037",
    "params": {
      "optional": ["companyScope", "orderNum", "customerName", "partNum", "prodCode", "requestDateFrom", "requestDateTo", "warehouseCode", "onlyOpenRelease", "onlyShippingNotice"]
    },
    "filters": ["orderNum", "customerName", "partNum", "requestDate", "warehouseCode", "openRelease", "ourReqQty"],
    "guard": { "valid": true, "source": "20260710010000_sales_order_shipping_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  od.Company AS [公司],
  od.OrderNum AS [订单号],
  od.OrderLine AS [订单行],
  rel.OrderRelNum AS [释放号],
  c.Name AS [客户],
  st.Name AS [收货方],
  od.PartNum AS [物料编号],
  od.LineDesc AS [物料描述],
  od.OrderQty AS [订单数量],
  rel.OurReqQty AS [待发数量],
  rel.ReqDate AS [需求日期],
  rel.WarehouseCode AS [仓库],
  COALESCE(pw.OnHandQty, 0) AS [仓库库存],
  cc.Name AS [联系人]
FROM Erp.OrderDtl od
INNER JOIN Erp.OrderRel rel ON rel.Company = od.Company AND rel.OrderNum = od.OrderNum AND rel.OrderLine = od.OrderLine
INNER JOIN Erp.OrderHed oh ON oh.Company = od.Company AND oh.OrderNum = od.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN Erp.ShipTo st ON st.Company = rel.Company AND st.CustNum = oh.CustNum AND st.ShipToNum = rel.ShipToNum
LEFT JOIN Erp.CustCnt cc ON cc.Company = st.Company AND cc.CustNum = st.CustNum AND cc.ShipToNum = st.ShipToNum
LEFT JOIN Erp.JobProd jp ON jp.Company = od.Company AND jp.OrderNum = od.OrderNum AND jp.OrderLine = od.OrderLine
LEFT JOIN Erp.PartWhse pw ON pw.Company = od.Company AND pw.PartNum = od.PartNum AND pw.WarehouseCode = rel.WarehouseCode
LEFT JOIN Erp.Part p ON p.Company = od.Company AND p.PartNum = od.PartNum
WHERE (@companyScope IS NULL OR od.Company = @companyScope)
  AND (@orderNum IS NULL OR od.OrderNum = @orderNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%') OR c.CustID LIKE CONCAT('%', @customerName, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@requestDateFrom IS NULL OR rel.ReqDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR rel.ReqDate <= @requestDateTo)
  AND (@warehouseCode IS NULL OR rel.WarehouseCode = @warehouseCode)
  AND (@onlyOpenRelease = 0 OR rel.OpenRelease = 1)
  AND (@onlyShippingNotice = 0 OR rel.OurReqQty > 0)$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "orderNum": {"type": "number"},
    "customerName": {"type": "string"},
    "partNum": {"type": "string"},
    "prodCode": {"type": "string"},
    "requestDateFrom": {"type": "string"},
    "requestDateTo": {"type": "string"},
    "warehouseCode": {"type": "string"},
    "onlyOpenRelease": {"type": "boolean"},
    "onlyShippingNotice": {"type": "boolean"}
  }'::jsonb,
  '["Erp.OrderDtl", "Erp.OrderRel", "Erp.OrderHed", "Erp.Customer", "Erp.ShipTo", "Erp.CustCnt", "Erp.JobProd", "Erp.PartWhse", "Erp.Part"]'::jsonb,
  '["Company", "OrderNum", "OrderLine", "OrderRelNum", "CustNum", "Name", "ShipToNum", "PartNum", "LineDesc", "OrderQty", "OurReqQty", "ReqDate", "WarehouseCode", "OnHandQty", "CustID", "ProdCode", "OpenRelease"]'::jsonb,
  '["OrderDtl -> OrderRel", "OrderDtl -> OrderHed", "OrderHed -> Customer", "OrderRel -> ShipTo", "ShipTo -> CustCnt", "OrderDtl -> JobProd", "OrderRel -> PartWhse", "OrderDtl -> Part"]'::jsonb,
  'finereport_family',
  'family_037',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved minimal executable template for family_037 golden fast path; uses OrderRel.ReqDate and OrderRel.OurReqQty, not nonexistent DueDate/OurShipQty fields.',
  0,
  0,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("source_family_id", "intent") WHERE "source_family_id" IS NOT NULL DO UPDATE SET
  "name" = excluded."name",
  "module" = excluded."module",
  "question_pattern" = excluded."question_pattern",
  "normalized_question" = excluded."normalized_question",
  "query_plan_json" = excluded."query_plan_json",
  "sql_template" = excluded."sql_template",
  "required_params" = excluded."required_params",
  "optional_params" = excluded."optional_params",
  "tables" = excluded."tables",
  "fields" = excluded."fields",
  "joins" = excluded."joins",
  "source_type" = excluded."source_type",
  "source_dataset_ids" = excluded."source_dataset_ids",
  "source_report_names" = excluded."source_report_names",
  "source_sql_hashes" = excluded."source_sql_hashes",
  "guard_passed" = TRUE,
  "approved" = TRUE,
  "approval_status" = 'approved',
  "approved_by" = excluded."approved_by",
  "approved_at" = COALESCE("erp_agent"."erp_query_templates"."approved_at", CURRENT_TIMESTAMP),
  "notes" = excluded."notes",
  "updated_at" = CURRENT_TIMESTAMP;
