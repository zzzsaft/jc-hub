INSERT INTO "erp_agent"."erp_query_templates" (
  "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
  "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
  "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
  "guard_passed", "approved", "approval_status", "approved_by", "approved_at", "notes", "usage_count", "success_count", "updated_at"
)
VALUES (
  '采购到货跟踪查询',
  'purchase_receipt_delay_tracking',
  'purchase',
  '采购未到货、采购单到货情况、今天/本周/未来应到货、延期未到货、供应商汇总、采购单行未收齐',
  '采购到货跟踪查询 family_062',
  $json${
    "intent": "purchase_receipt_delay_tracking",
    "module": "purchase",
    "sourceFamilyId": "family_062",
    "params": {
      "optional": ["companyScope", "poNum", "vendorName", "buyerName", "partNum", "dueDateFrom", "dueDateTo", "receiptDateFrom", "receiptDateTo", "onlyDelayed", "dueBeforeDate"]
    },
    "filters": ["OpenOrder", "OpenLine", "Approve", "unreceivedQty", "vendorName", "poNum", "dueBeforeDate"],
    "guard": { "valid": true, "source": "20260709060000_purchase_delivery_template" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  poh.Company AS [公司],
  poh.PONum AS [采购单号],
  pod.POLine AS [采购行],
  v.Name AS [供应商],
  pa.Name AS [采购员],
  pod.PartNum AS [物料编号],
  pod.LineDesc AS [物料描述],
  por.DueDate AS [交期],
  pod.XOrderQty AS [订购数量],
  COALESCE(rcv.ReceivedQty, 0) AS [已收数量],
  pod.XOrderQty - COALESCE(rcv.ReceivedQty, 0) AS [未到数量],
  rcv.LastReceiptDate AS [最近收货日期],
  CASE WHEN pod.XOrderQty > COALESCE(rcv.ReceivedQty, 0) AND por.DueDate < CAST(GETDATE() AS date) THEN 1 ELSE 0 END AS [是否延期]
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod ON pod.Company = poh.Company AND pod.PONum = poh.PONum
LEFT JOIN Erp.PORel por ON por.Company = pod.Company AND por.PONum = pod.PONum AND por.POLine = pod.POLine
LEFT JOIN Erp.Vendor v ON v.Company = poh.Company AND v.VendorNum = poh.VendorNum
LEFT JOIN Erp.PurAgent pa ON pa.Company = poh.Company AND pa.BuyerID = poh.BuyerID
LEFT JOIN (
  SELECT Company, PONum, POLine, SUM(OurQty) AS ReceivedQty, MAX(ReceiptDate) AS LastReceiptDate
  FROM Erp.RcvDtl
  GROUP BY Company, PONum, POLine
) rcv ON rcv.Company = pod.Company AND rcv.PONum = pod.PONum AND rcv.POLine = pod.POLine
WHERE (@companyScope IS NULL OR poh.Company = @companyScope)
  AND poh.OpenOrder = 1
  AND pod.OpenLine = 1
  AND poh.Approve = 1
  AND pod.XOrderQty > COALESCE(rcv.ReceivedQty, 0)
  AND (@poNum IS NULL OR poh.PONum = @poNum)
  AND (@vendorName IS NULL OR v.Name LIKE CONCAT('%', @vendorName, '%') OR v.VendorID LIKE CONCAT('%', @vendorName, '%'))
  AND (@buyerName IS NULL OR pa.Name LIKE CONCAT('%', @buyerName, '%'))
  AND (@partNum IS NULL OR pod.PartNum = @partNum)
  AND (@dueDateFrom IS NULL OR por.DueDate >= @dueDateFrom)
  AND (@dueDateTo IS NULL OR por.DueDate <= @dueDateTo)
  AND (@receiptDateFrom IS NULL OR rcv.LastReceiptDate >= @receiptDateFrom)
  AND (@receiptDateTo IS NULL OR rcv.LastReceiptDate <= @receiptDateTo)
  AND (@onlyDelayed = 0 OR por.DueDate < CAST(GETDATE() AS date))
  AND (@dueBeforeDate IS NULL OR por.DueDate <= @dueBeforeDate)$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "poNum": {"type": "number"},
    "vendorName": {"type": "string"},
    "buyerName": {"type": "string"},
    "partNum": {"type": "string"},
    "dueDateFrom": {"type": "string"},
    "dueDateTo": {"type": "string"},
    "receiptDateFrom": {"type": "string"},
    "receiptDateTo": {"type": "string"},
    "onlyDelayed": {"type": "boolean"},
    "dueBeforeDate": {"type": "string"}
  }'::jsonb,
  '["Erp.POHeader", "Erp.PODetail", "Erp.PORel", "Erp.Vendor", "Erp.PurAgent", "Erp.RcvDtl"]'::jsonb,
  '["Company", "PONum", "POLine", "Name", "PartNum", "LineDesc", "DueDate", "XOrderQty", "ReceivedQty", "ReceiptDate", "OpenOrder", "OpenLine", "Approve"]'::jsonb,
  '["POHeader -> PODetail", "PODetail -> PORel", "POHeader -> Vendor", "POHeader -> PurAgent", "PODetail -> RcvDtl aggregate"]'::jsonb,
  'finereport_family',
  'family_062',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved minimal executable template for family_062 golden fast path; receipt quantity is aggregated by PO line.',
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
