INSERT INTO "erp_agent"."erp_query_templates" (
  "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
  "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
  "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
  "guard_passed", "approved", "approval_status", "approved_by", "approved_at", "notes", "usage_count", "success_count", "updated_at"
)
VALUES
(
  '产品报价外部库明细查询',
  'quotation_product_detail',
  'quotation',
  '产品报价、报价外部库、购销合同、合同号、报价产品参数',
  '产品报价外部库明细查询 family_008 JCJDY ProductQuotation',
  $json${
    "intent": "quotation_product_detail",
    "module": "quotation",
    "sourceFamilyId": "family_008",
    "params": { "optional": ["contractNo", "partName", "partType"] },
    "filters": ["ContractNo", "PartName", "PartType"],
    "guard": {
      "valid": true,
      "source": "20260710020000_erp_family_minimal_templates",
      "reason": "真实 ERP 已验证 JCJDY.dbo.ProductQuotation/ProductQuotationDetail；Epicor Erp.Configuration*/cfgPc* 不作为来源。"
    }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  CAST('JCJDY' AS varchar(20)) AS Company,
  pq.ID AS [报价ID],
  pq.ContractNo AS [合同号],
  pq.PartName AS [产品名称],
  pq.PartType AS [产品型号],
  pq.Qty AS [数量],
  pq.UM AS [单位],
  pq.Price AS [报价价格],
  pq.DiscountRate AS [折扣率],
  pq.Part0 AS [产品大类],
  pq.Title AS [报价标题],
  pq.CreateDate AS [创建日期],
  pqd.ID AS [明细ID],
  pqd.TiTle AS [明细标题],
  pqd.Name AS [参数名称],
  pqd.Content AS [参数内容]
FROM JCJDY.dbo.ProductQuotation pq
LEFT JOIN JCJDY.dbo.ProductQuotationDetail pqd ON pqd.Fid = pq.ID
WHERE (@contractNo IS NULL OR pq.ContractNo = @contractNo)
  AND (@partName IS NULL OR pq.PartName LIKE CONCAT('%', @partName, '%'))
  AND (@partType IS NULL OR pq.PartType LIKE CONCAT('%', @partType, '%'))
ORDER BY pq.CreateDate DESC, pq.ID DESC, pqd.ID$sql$,
  '{}'::jsonb,
  '{
    "contractNo": {"type": "string"},
    "partName": {"type": "string"},
    "partType": {"type": "string"}
  }'::jsonb,
  '["JCJDY.dbo.ProductQuotation", "JCJDY.dbo.ProductQuotationDetail"]'::jsonb,
  '["ID", "ContractNo", "PartName", "PartType", "Qty", "UM", "Price", "DiscountRate", "Part0", "Title", "CreateDate", "Fid", "TiTle", "Name", "Content"]'::jsonb,
  '["ProductQuotation.ID -> ProductQuotationDetail.Fid"]'::jsonb,
  'verified_external_erp',
  'family_008',
  '[]'::jsonb,
  '["产品报价/报价外部库"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable template only. Price/DiscountRate amount semantics still require business confirmation before creating an approved metric.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '产品配置合同外部库查询',
  'quotation_config_lookup',
  'quotation',
  '产品配置、合同配置、购销合同配置、合同号、配置内容',
  '产品配置合同外部库查询 family_080 JCJDY ProductQuotation',
  $json${
    "intent": "quotation_config_lookup",
    "module": "quotation",
    "sourceFamilyId": "family_080",
    "params": { "optional": ["contractNo", "partName", "configName"] },
    "filters": ["ContractNo", "PartName", "Name", "Content"],
    "guard": {
      "valid": true,
      "source": "20260710020000_erp_family_minimal_templates",
      "reason": "真实 ERP 未发现 Erp.Configuration*/cfgPc* 物理表；合同配置以 JCJDY 外部库为 approved executable source。"
    }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  CAST('JCJDY' AS varchar(20)) AS Company,
  pq.ContractNo AS [合同号],
  pq.PartName AS [产品名称],
  pq.PartType AS [产品型号],
  pq.Qty AS [数量],
  pq.UM AS [单位],
  pq.Price AS [报价价格],
  pq.DiscountRate AS [折扣率],
  pq.Part0 AS [产品大类],
  pq.Title AS [合同配置标题],
  pqd.TiTle AS [配置分组],
  pqd.Name AS [配置项],
  pqd.Content AS [配置内容],
  pq.CreateDate AS [创建日期]
FROM JCJDY.dbo.ProductQuotation pq
LEFT JOIN JCJDY.dbo.ProductQuotationDetail pqd ON pqd.Fid = pq.ID
WHERE (@contractNo IS NULL OR pq.ContractNo = @contractNo)
  AND (@partName IS NULL OR pq.PartName LIKE CONCAT('%', @partName, '%'))
  AND (@configName IS NULL OR pqd.Name LIKE CONCAT('%', @configName, '%') OR pqd.Content LIKE CONCAT('%', @configName, '%'))
ORDER BY pq.CreateDate DESC, pq.ID DESC, pqd.ID$sql$,
  '{}'::jsonb,
  '{
    "contractNo": {"type": "string"},
    "partName": {"type": "string"},
    "configName": {"type": "string"}
  }'::jsonb,
  '["JCJDY.dbo.ProductQuotation", "JCJDY.dbo.ProductQuotationDetail"]'::jsonb,
  '["ContractNo", "PartName", "PartType", "Qty", "UM", "Price", "DiscountRate", "Part0", "Title", "TiTle", "Name", "Content", "CreateDate"]'::jsonb,
  '["ProductQuotation.ID -> ProductQuotationDetail.Fid"]'::jsonb,
  'verified_external_erp',
  'family_080',
  '[]'::jsonb,
  '["产品配置/合同配置外部库"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable template only. Do not use Erp.ConfigurationSummary/ConfigurationValue/ConfigResults/cfgPcInPrice/cfgPcPriceHed because real ERP query reported invalid object names.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '采购订单金额明细查询',
  'purchase_order_amount_detail',
  'purchase',
  '采购金额、采购中心管理看板、财务采购管理、供应商采购金额、采购订单金额',
  '采购订单金额明细查询 family_049 POHeader PODetail',
  $json${
    "intent": "purchase_order_amount_detail",
    "module": "purchase",
    "sourceFamilyId": "family_049",
    "params": { "optional": ["companyScope", "poNum", "vendorName", "buyerName", "partNum", "orderDateFrom", "orderDateTo", "onlyApproved"] },
    "filters": ["OrderDate", "Approve", "VoidOrder", "VoidLine", "Vendor", "BuyerID", "PartNum"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  poh.Company AS [公司],
  poh.PONum AS [采购单号],
  poh.OrderDate AS [采购日期],
  v.Name AS [供应商],
  pa.Name AS [采购员],
  poh.Approve AS [是否批准],
  poh.OpenOrder AS [是否未关闭],
  poh.VoidOrder AS [订单作废],
  poh.DocTotalOrder AS [订单头金额],
  pod.POLine AS [采购行],
  pod.PartNum AS [物料编号],
  pod.LineDesc AS [物料描述],
  pod.OrderQty AS [采购数量],
  pod.DocUnitCost AS [单价],
  pod.ExtCost AS [行未税金额],
  pod.TotalTax AS [行税额],
  COALESCE(pod.ExtCost, 0) + COALESCE(pod.TotalTax, 0) AS [行含税金额],
  pod.VoidLine AS [行作废]
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod ON pod.Company = poh.Company AND pod.PONum = poh.PONum
LEFT JOIN Erp.Vendor v ON v.Company = poh.Company AND v.VendorNum = poh.VendorNum
LEFT JOIN Erp.PurAgent pa ON pa.Company = poh.Company AND pa.BuyerID = poh.BuyerID
WHERE (@companyScope IS NULL OR poh.Company = @companyScope)
  AND (@poNum IS NULL OR poh.PONum = @poNum)
  AND (@vendorName IS NULL OR v.Name LIKE CONCAT('%', @vendorName, '%') OR v.VendorID LIKE CONCAT('%', @vendorName, '%'))
  AND (@buyerName IS NULL OR pa.Name LIKE CONCAT('%', @buyerName, '%'))
  AND (@partNum IS NULL OR pod.PartNum = @partNum)
  AND (@orderDateFrom IS NULL OR poh.OrderDate >= @orderDateFrom)
  AND (@orderDateTo IS NULL OR poh.OrderDate <= @orderDateTo)
  AND poh.OrderDate >= '20000101'
  AND poh.OrderDate < DATEADD(year, 1, CAST(GETDATE() AS date))
  AND poh.VoidOrder = 0
  AND pod.VoidLine = 0
  AND (@onlyApproved = 0 OR poh.Approve = 1)
ORDER BY poh.OrderDate DESC, poh.PONum DESC, pod.POLine$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "poNum": {"type": "number"},
    "vendorName": {"type": "string"},
    "buyerName": {"type": "string"},
    "partNum": {"type": "string"},
    "orderDateFrom": {"type": "string"},
    "orderDateTo": {"type": "string"},
    "onlyApproved": {"type": "boolean"}
  }'::jsonb,
  '["Erp.POHeader", "Erp.PODetail", "Erp.Vendor", "Erp.PurAgent"]'::jsonb,
  '["Company", "PONum", "OrderDate", "VendorNum", "BuyerID", "Approve", "OpenOrder", "VoidOrder", "DocTotalOrder", "POLine", "PartNum", "LineDesc", "OrderQty", "DocUnitCost", "ExtCost", "TotalTax", "VoidLine", "VendorID", "Name"]'::jsonb,
  '["POHeader -> PODetail", "POHeader -> Vendor", "POHeader -> PurAgent"]'::jsonb,
  'verified_erp',
  'family_049',
  '[]'::jsonb,
  '["财务采购管理看板", "采购中心管理看板"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable template for purchase order amount detail. Not an approved metric: order/receipt/AP invoice amount basis still needs business confirmation. PORel is intentionally not joined to avoid release-level amount multiplication.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '生产入库成本明细查询',
  'production_receipt_cost_detail',
  'finance',
  '成本明细、产品成本、订单成本、料费、加工费、材料费、人工费、制造费、外协费',
  '生产入库成本明细查询 family_059 PartTran JobProd OrderDtl',
  $json${
    "intent": "production_receipt_cost_detail",
    "module": "finance",
    "sourceFamilyId": "family_059",
    "params": { "optional": ["companyScope", "jobNum", "orderNum", "partNum", "customerName", "tranDateFrom", "tranDateTo"] },
    "filters": ["MFG-STK", "TranQty", "TranDate", "JobNum", "OrderNum", "PartNum", "Customer"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  pt.Company AS [公司],
  pt.TranNum AS [事务号],
  pt.TranDate AS [事务日期],
  pt.TranType AS [事务类型],
  pt.PartNum AS [物料编号],
  pt.JobNum AS [工单号],
  COALESCE(jp.OrderNum, pt.OrderNum) AS [订单号],
  jp.OrderLine AS [订单行],
  c.Name AS [客户],
  pt.TranQty AS [入库数量],
  pt.MtlUnitCost AS [材料单位成本],
  pt.LbrUnitCost AS [人工单位成本],
  pt.BurUnitCost AS [制造单位成本],
  pt.SubUnitCost AS [外协单位成本],
  pt.MtlBurUnitCost AS [材料制造单位成本],
  pt.ExtCost AS [事务扩展成本],
  (COALESCE(pt.MtlUnitCost, 0) + COALESCE(pt.LbrUnitCost, 0) + COALESCE(pt.BurUnitCost, 0) + COALESCE(pt.SubUnitCost, 0) + COALESCE(pt.MtlBurUnitCost, 0)) * ABS(pt.TranQty) AS [成本分项合计]
FROM Erp.PartTran pt
LEFT JOIN Erp.JobProd jp ON jp.Company = pt.Company AND jp.JobNum = pt.JobNum
LEFT JOIN Erp.OrderDtl od ON od.Company = jp.Company AND od.OrderNum = jp.OrderNum AND od.OrderLine = jp.OrderLine
LEFT JOIN Erp.OrderHed oh ON oh.Company = od.Company AND oh.OrderNum = od.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
WHERE (@companyScope IS NULL OR pt.Company = @companyScope)
  AND pt.TranType = 'MFG-STK'
  AND pt.TranQty > 0
  AND pt.TranDate >= '20000101'
  AND pt.TranDate < DATEADD(year, 1, CAST(GETDATE() AS date))
  AND (@jobNum IS NULL OR pt.JobNum = @jobNum)
  AND (@orderNum IS NULL OR COALESCE(jp.OrderNum, pt.OrderNum) = @orderNum)
  AND (@partNum IS NULL OR pt.PartNum = @partNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%') OR c.CustID LIKE CONCAT('%', @customerName, '%'))
  AND (@tranDateFrom IS NULL OR pt.TranDate >= @tranDateFrom)
  AND (@tranDateTo IS NULL OR pt.TranDate <= @tranDateTo)
ORDER BY pt.TranDate DESC, pt.TranNum DESC$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "jobNum": {"type": "string"},
    "orderNum": {"type": "number"},
    "partNum": {"type": "string"},
    "customerName": {"type": "string"},
    "tranDateFrom": {"type": "string"},
    "tranDateTo": {"type": "string"}
  }'::jsonb,
  '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["Company", "TranNum", "TranDate", "TranType", "PartNum", "JobNum", "OrderNum", "OrderLine", "TranQty", "MtlUnitCost", "LbrUnitCost", "BurUnitCost", "SubUnitCost", "MtlBurUnitCost", "ExtCost", "Name", "CustID"]'::jsonb,
  '["PartTran -> JobProd", "JobProd -> OrderDtl", "OrderDtl -> OrderHed", "OrderHed -> Customer"]'::jsonb,
  'verified_erp',
  'family_059',
  '[]'::jsonb,
  '["成本数据表", "成本明细"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable detail template only. Aggregate cost metric still needs confirmation for returns, negative transactions, monthly QiMo snapshot priority, and cost-vs-ExtCost policy.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '费用总账明细查询',
  'finance_expense_gl_detail',
  'finance',
  '费用统计、财务费用、事业部费用、费用明细、费用按期间查询',
  '费用总账明细查询 family_053 GLJrnDtl',
  $json${
    "intent": "finance_expense_gl_detail",
    "module": "finance",
    "sourceFamilyId": "family_053",
    "params": { "optional": ["companyScope", "account", "segment1", "segment5", "dateFrom", "dateTo", "fiscalYear", "fiscalPeriod"] },
    "filters": ["JEDate", "FiscalYear", "FiscalPeriod", "GLAccount", "SegValue1", "SegValue5"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  gl.Company AS [公司],
  gl.FiscalYear AS [会计年],
  gl.FiscalPeriod AS [会计期间],
  gl.JournalCode AS [日记账代码],
  gl.JournalNum AS [日记账号],
  gl.JournalLine AS [日记账行],
  gl.JEDate AS [凭证日期],
  gl.GLAccount AS [会计科目],
  gl.SegValue1 AS [科目段1],
  gl.SegValue2 AS [科目段2],
  gl.SegValue3 AS [科目段3],
  gl.SegValue4 AS [科目段4],
  gl.SegValue5 AS [科目段5],
  gl.Description AS [摘要],
  gl.DebitAmount AS [借方金额],
  gl.CreditAmount AS [贷方金额],
  gl.BookDebitAmount AS [本位币借方],
  gl.BookCreditAmount AS [本位币贷方],
  COALESCE(gl.DebitAmount, 0) - COALESCE(gl.CreditAmount, 0) AS [借方净额],
  CAST('GLJrnDtl.JEDate' AS nvarchar(40)) AS [时间字段],
  CAST('DebitAmount/CreditAmount/BookDebitAmount/BookCreditAmount' AS nvarchar(120)) AS [金额字段],
  CAST('按 GLJrnDtl 已入账明细查询，费用科目范围需财务确认' AS nvarchar(120)) AS [状态过滤],
  CAST('总账费用口径，不处理税退款' AS nvarchar(120)) AS [税退款口径]
FROM Erp.GLJrnDtl gl
WHERE (@companyScope IS NULL OR gl.Company = @companyScope)
  AND (@account IS NULL OR gl.GLAccount LIKE CONCAT(@account, '%'))
  AND (@segment1 IS NULL OR gl.SegValue1 = @segment1)
  AND (@segment5 IS NULL OR gl.SegValue5 = @segment5)
  AND (@fiscalYear IS NULL OR gl.FiscalYear = @fiscalYear)
  AND (@fiscalPeriod IS NULL OR gl.FiscalPeriod = @fiscalPeriod)
  AND (@dateFrom IS NULL OR gl.JEDate >= @dateFrom)
  AND (@dateTo IS NULL OR gl.JEDate <= @dateTo)
  AND gl.JEDate >= '20000101'
  AND gl.JEDate < DATEADD(year, 1, CAST(GETDATE() AS date))
ORDER BY gl.JEDate DESC, gl.JournalNum DESC, gl.JournalLine$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "account": {"type": "string"},
    "segment1": {"type": "string"},
    "segment5": {"type": "string"},
    "dateFrom": {"type": "string"},
    "dateTo": {"type": "string"},
    "fiscalYear": {"type": "number"},
    "fiscalPeriod": {"type": "number"}
  }'::jsonb,
  '["Erp.GLJrnDtl"]'::jsonb,
  '["Company", "FiscalYear", "FiscalPeriod", "JournalCode", "JournalNum", "JournalLine", "JEDate", "GLAccount", "SegValue1", "SegValue2", "SegValue3", "SegValue4", "SegValue5", "Description", "DebitAmount", "CreditAmount", "BookDebitAmount", "BookCreditAmount"]'::jsonb,
  '[]'::jsonb,
  'verified_erp',
  'family_053',
  '[]'::jsonb,
  '["费用统计", "供应商余额表"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable detail template only. Expense account set, segment mapping, signs, posted status, and currency policy require finance confirmation before metric approval.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '供应商总账余额汇总查询',
  'vendor_balance_gl_summary',
  'finance',
  '供应商余额、供应商余额表、往来余额、供应商当前余额',
  '供应商总账余额汇总查询 family_053 GLJrnDtl COASegValues',
  $json${
    "intent": "vendor_balance_gl_summary",
    "module": "finance",
    "sourceFamilyId": "family_053",
    "params": { "optional": ["companyScope", "vendorName", "vendorSegment", "dateFrom", "dateTo"] },
    "filters": ["JEDate", "SegValue5", "SegmentCode", "SegmentName"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  gl.Company AS [公司],
  gl.SegValue5 AS [供应商段],
  coa.SegmentName AS [供应商名称],
  SUM(CASE WHEN @dateFrom IS NOT NULL AND gl.JEDate < @dateFrom THEN COALESCE(gl.CreditAmount, 0) - COALESCE(gl.DebitAmount, 0) ELSE 0 END) AS [期初余额],
  SUM(CASE WHEN @dateFrom IS NULL OR gl.JEDate >= @dateFrom THEN COALESCE(gl.DebitAmount, 0) ELSE 0 END) AS [本期借方],
  SUM(CASE WHEN @dateFrom IS NULL OR gl.JEDate >= @dateFrom THEN COALESCE(gl.CreditAmount, 0) ELSE 0 END) AS [本期贷方],
  SUM(COALESCE(gl.CreditAmount, 0) - COALESCE(gl.DebitAmount, 0)) AS [期末余额],
  CAST('GLJrnDtl.JEDate' AS nvarchar(40)) AS [时间字段],
  CAST('CreditAmount-DebitAmount' AS nvarchar(80)) AS [金额字段],
  CAST('按总账供应商段汇总，科目/段定义需财务确认' AS nvarchar(120)) AS [状态过滤],
  CAST('总账往来余额口径，不处理税退款' AS nvarchar(120)) AS [税退款口径]
FROM Erp.GLJrnDtl gl
LEFT JOIN Erp.COASegValues coa ON coa.Company = gl.Company AND coa.SegmentCode = gl.SegValue5
WHERE (@companyScope IS NULL OR gl.Company = @companyScope)
  AND (@vendorSegment IS NULL OR gl.SegValue5 = @vendorSegment)
  AND (@vendorName IS NULL OR coa.SegmentName LIKE CONCAT('%', @vendorName, '%'))
  AND (@dateTo IS NULL OR gl.JEDate <= @dateTo)
  AND gl.JEDate >= '20000101'
  AND gl.JEDate < DATEADD(year, 1, CAST(GETDATE() AS date))
  AND gl.SegValue5 IS NOT NULL
  AND gl.SegValue5 <> ''
  AND gl.SegValue5 <> '220201'
GROUP BY gl.Company, gl.SegValue5, coa.SegmentName
ORDER BY ABS(SUM(COALESCE(gl.CreditAmount, 0) - COALESCE(gl.DebitAmount, 0))) DESC$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "vendorName": {"type": "string"},
    "vendorSegment": {"type": "string"},
    "dateFrom": {"type": "string"},
    "dateTo": {"type": "string"}
  }'::jsonb,
  '["Erp.GLJrnDtl", "Erp.COASegValues"]'::jsonb,
  '["Company", "SegValue5", "SegmentCode", "SegmentName", "JEDate", "DebitAmount", "CreditAmount"]'::jsonb,
  '["GLJrnDtl.SegValue5 -> COASegValues.SegmentCode"]'::jsonb,
  'verified_erp',
  'family_053',
  '[]'::jsonb,
  '["供应商余额表"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable summary template only. Supplier segment mapping, sign convention, account exclusions, and opening/current/ending formulas require finance confirmation before metric approval.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '库存库龄呆滞明细查询',
  'inventory_aging_slow_moving_lookup',
  'inventory',
  '库龄、呆滞库存、库存年龄、超过180天库存、长期未动库存',
  '库存库龄呆滞明细查询 family_089 PartBin PartTran',
  $json${
    "intent": "inventory_aging_slow_moving_lookup",
    "module": "inventory",
    "sourceFamilyId": "family_089",
    "params": { "optional": ["companyScope", "partNum", "warehouseCode", "binNum", "minAgeDays", "onlyOnHand"] },
    "filters": ["OnhandQty", "TranDate", "WarehouseCode", "BinNum", "PartNum"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  pb.Company AS [公司],
  pb.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  pb.WarehouseCode AS [仓库],
  pb.BinNum AS [库位],
  pb.LotNum AS [批号],
  pb.OnhandQty AS [现存量],
  lr.LastReceiptDate AS [最近入库日期],
  DATEDIFF(day, lr.LastReceiptDate, CAST(GETDATE() AS date)) AS [最近入库库龄天数],
  CASE WHEN lr.LastReceiptDate IS NULL THEN 1 WHEN DATEDIFF(day, lr.LastReceiptDate, CAST(GETDATE() AS date)) >= COALESCE(@minAgeDays, 180) THEN 1 ELSE 0 END AS [是否疑似呆滞],
  CAST('最近入库日期口径；FIFO分桶库龄需后续按历史 3803/3956 另行确认' AS nvarchar(160)) AS [库龄口径说明]
FROM Erp.PartBin pb
LEFT JOIN Erp.Part p ON p.Company = pb.Company AND p.PartNum = pb.PartNum
LEFT JOIN (
  SELECT Company, PartNum, WarehouseCode, MAX(TranDate) AS LastReceiptDate
  FROM Erp.PartTran
  WHERE TranType IN ('PUR-STK', 'MFG-STK', 'ADJ-QTY')
    AND TranQty > 0
    AND TranDate >= '20000101'
    AND TranDate < DATEADD(year, 1, CAST(GETDATE() AS date))
  GROUP BY Company, PartNum, WarehouseCode
) lr ON lr.Company = pb.Company AND lr.PartNum = pb.PartNum AND lr.WarehouseCode = pb.WarehouseCode
WHERE (@companyScope IS NULL OR pb.Company = @companyScope)
  AND (@partNum IS NULL OR pb.PartNum = @partNum)
  AND (@warehouseCode IS NULL OR pb.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@onlyOnHand = 0 OR pb.OnhandQty > 0)
  AND (@minAgeDays IS NULL OR lr.LastReceiptDate IS NULL OR DATEDIFF(day, lr.LastReceiptDate, CAST(GETDATE() AS date)) >= @minAgeDays)
ORDER BY DATEDIFF(day, lr.LastReceiptDate, CAST(GETDATE() AS date)) DESC, pb.OnhandQty DESC$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "partNum": {"type": "string"},
    "warehouseCode": {"type": "string"},
    "binNum": {"type": "string"},
    "minAgeDays": {"type": "number"},
    "onlyOnHand": {"type": "boolean"}
  }'::jsonb,
  '["Erp.PartBin", "Erp.Part", "Erp.PartTran"]'::jsonb,
  '["Company", "PartNum", "PartDescription", "WarehouseCode", "BinNum", "LotNum", "OnhandQty", "TranType", "TranQty", "TranDate"]'::jsonb,
  '["PartBin -> Part", "PartBin -> PartTran aggregate by Company/PartNum/WarehouseCode"]'::jsonb,
  'verified_erp',
  'family_089',
  '[]'::jsonb,
  '["库龄", "呆滞库存"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable template for last-receipt aging evidence. It is not the approved FIFO aging/stale inventory metric; receipt types, transfers/returns, excluded warehouses, buckets, and stale thresholds need manual confirmation.',
  0,
  0,
  CURRENT_TIMESTAMP
),
(
  '订单销售成本毛利明细查询',
  'order_margin_cost_detail',
  'finance',
  '订单毛利、低毛利、客户订单毛利、销售金额、销售额、订单金额、成本对比、单价',
  '订单销售成本毛利明细查询 family_100 OrderDtl QiMoDanJia期末单价',
  $json${
    "intent": "order_margin_cost_detail",
    "module": "finance",
    "sourceFamilyId": "family_100",
    "params": { "optional": ["companyScope", "orderNum", "customerName", "partNum", "orderDateFrom", "orderDateTo", "maxMarginRate"] },
    "filters": ["OrderDate", "OrderNum", "Customer", "PartNum", "DocExtPriceDtl", "QiMoDanJia"],
    "guard": { "valid": true, "source": "20260710020000_erp_family_minimal_templates" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  od.Company AS [公司],
  oh.OrderNum AS [订单号],
  od.OrderLine AS [订单行],
  oh.OrderDate AS [订单日期],
  c.Name AS [客户],
  od.PartNum AS [物料编号],
  od.LineDesc AS [物料描述],
  od.OrderQty AS [订单数量],
  od.DocUnitPrice AS [销售单价],
  od.DocExtPriceDtl AS [销售金额],
  qmdj.MtlUnitCost AS [期末材料单位成本],
  qmdj.LaborUnitCost AS [期末人工单位成本],
  qmdj.BurUnitCost AS [期末制造单位成本],
  qmdj.SubUnitCost AS [期末外协单位成本],
  (COALESCE(qmdj.MtlUnitCost, 0) + COALESCE(qmdj.LaborUnitCost, 0) + COALESCE(qmdj.BurUnitCost, 0) + COALESCE(qmdj.SubUnitCost, 0)) * od.OrderQty AS [估算订单成本],
  od.DocExtPriceDtl - ((COALESCE(qmdj.MtlUnitCost, 0) + COALESCE(qmdj.LaborUnitCost, 0) + COALESCE(qmdj.BurUnitCost, 0) + COALESCE(qmdj.SubUnitCost, 0)) * od.OrderQty) AS [估算毛利],
  CASE WHEN od.DocExtPriceDtl = 0 THEN NULL ELSE (od.DocExtPriceDtl - ((COALESCE(qmdj.MtlUnitCost, 0) + COALESCE(qmdj.LaborUnitCost, 0) + COALESCE(qmdj.BurUnitCost, 0) + COALESCE(qmdj.SubUnitCost, 0)) * od.OrderQty)) / NULLIF(od.DocExtPriceDtl, 0) END AS [估算毛利率],
  CAST('OrderHed.OrderDate' AS nvarchar(40)) AS [时间字段],
  CAST('OrderDtl.DocExtPriceDtl 与 QiMoDanJia 期末单价成本分项' AS nvarchar(140)) AS [金额字段],
  CAST('订单预计毛利，QiMoDanJia 为自建期末单价表；Open/税/退货规则需确认' AS nvarchar(180)) AS [状态过滤],
  CAST('订单金额口径，未处理税退款' AS nvarchar(120)) AS [税退款口径]
FROM Erp.OrderDtl od
INNER JOIN Erp.OrderHed oh ON oh.Company = od.Company AND oh.OrderNum = od.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN dbo.QiMoDanJia qmdj ON qmdj.Company = od.Company AND qmdj.PartNum = od.PartNum AND qmdj.Year = YEAR(oh.OrderDate) AND qmdj.Month = MONTH(oh.OrderDate)
WHERE (@companyScope IS NULL OR od.Company = @companyScope)
  AND (@orderNum IS NULL OR od.OrderNum = @orderNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%') OR c.CustID LIKE CONCAT('%', @customerName, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@orderDateFrom IS NULL OR oh.OrderDate >= @orderDateFrom)
  AND (@orderDateTo IS NULL OR oh.OrderDate <= @orderDateTo)
  AND oh.OrderDate >= '20000101'
  AND oh.OrderDate < DATEADD(year, 1, CAST(GETDATE() AS date))
  AND (@maxMarginRate IS NULL OR CASE WHEN od.DocExtPriceDtl = 0 THEN NULL ELSE (od.DocExtPriceDtl - ((COALESCE(qmdj.MtlUnitCost, 0) + COALESCE(qmdj.LaborUnitCost, 0) + COALESCE(qmdj.BurUnitCost, 0) + COALESCE(qmdj.SubUnitCost, 0)) * od.OrderQty)) / NULLIF(od.DocExtPriceDtl, 0) END <= @maxMarginRate)
ORDER BY [估算毛利率] ASC, oh.OrderDate DESC$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "orderNum": {"type": "number"},
    "customerName": {"type": "string"},
    "partNum": {"type": "string"},
    "orderDateFrom": {"type": "string"},
    "orderDateTo": {"type": "string"},
    "maxMarginRate": {"type": "number"}
  }'::jsonb,
  '["Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer", "dbo.QiMoDanJia"]'::jsonb,
  '["Company", "OrderNum", "OrderLine", "OrderDate", "CustNum", "Name", "CustID", "PartNum", "LineDesc", "OrderQty", "DocUnitPrice", "DocExtPriceDtl", "MtlUnitCost", "LaborUnitCost", "BurUnitCost", "SubUnitCost", "Year", "Month"]'::jsonb,
  '["OrderDtl -> OrderHed", "OrderHed -> Customer", "OrderDtl.PartNum + OrderHed.OrderDate -> QiMoDanJia"]'::jsonb,
  'verified_erp',
  'family_100',
  '[]'::jsonb,
  '["订单毛利", "低毛利", "销售额+毛利复合"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved executable decision-support template only. QiMoDanJia is a self-built month-end unit price table. Do not treat as approved financial metric until order-vs-invoice basis, tax/refund policy, cost month matching rule, and low-margin threshold are confirmed.',
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
