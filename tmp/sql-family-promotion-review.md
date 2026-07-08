# SQL Family Promotion Review

## Summary

- templateDraftCount: 5
- referenceFamilyCount: 12
- metricDraftCount: 13
- skippedCount: 0

## Template Drafts Review

### family_050 - 库存明细查询

- family_id: family_050
- template_name: 库存明细查询
- intent: inventory_stock_detail
- module: inventory
- source_report_names: ["计量泵组","液压站发货看板"]
- source_dataset_ids: [3647,3648,3653,3968,3969,3974,4655,4656,4661,4956]
- required_params: []
- optional_params: ["companyScope","partNum","partDescription","warehouseCode","binNum","prodCode","classId","onlyNonZeroStock"]
- tables: ["Erp.Part","Erp.PartBin","Erp.PartClass","Erp.PartWhse","Erp.ProdGrup","Erp.Warehse","Erp.WhseBin"]
- joins: ["Erp.Part -> Erp.PartWhse ON Company + PartNum","Erp.PartWhse -> Erp.PartBin ON Company + PartNum + WarehouseCode","Erp.PartBin -> Erp.WhseBin ON Company + BinNum + WarehouseCode","Erp.WhseBin -> Erp.Warehse ON Company + WarehouseCode","Erp.Warehse -> Erp.ProdGrup ON Company + ProdCode","Erp.ProdGrup -> Erp.PartClass ON Company + ClassID"]

sql_template

```sql
SELECT TOP 100
  p.Company AS [公司],
  p.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  pw.WarehouseCode AS [仓库],
  pb.BinNum AS [库位],
  pb.OnhandQty AS [库位库存],
  pw.OnHandQty AS [仓库库存],
  p.ProdCode AS [产品群组],
  p.ClassID AS [物料分类],
  wh.Name AS [仓库名称]
FROM Erp.Part p
INNER JOIN Erp.PartWhse pw ON pw.Company = p.Company AND pw.PartNum = p.PartNum
LEFT JOIN Erp.PartBin pb ON pb.Company = pw.Company AND pb.PartNum = pw.PartNum AND pb.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.WhseBin wb ON wb.Company = pb.Company AND wb.WarehouseCode = pb.WarehouseCode AND wb.BinNum = pb.BinNum
LEFT JOIN Erp.Warehse wh ON wh.Company = pw.Company AND wh.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.ProdGrup pg ON pg.Company = p.Company AND pg.ProdCode = p.ProdCode
LEFT JOIN Erp.PartClass pc ON pc.Company = p.Company AND pc.ClassID = p.ClassID
WHERE (@companyScope IS NULL OR p.Company = @companyScope)
  AND (@partNum IS NULL OR p.PartNum = @partNum)
  AND (@partDescription IS NULL OR p.PartDescription LIKE CONCAT('%', @partDescription, '%'))
  AND (@warehouseCode IS NULL OR pw.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@classId IS NULL OR p.ClassID = @classId)
  AND (@onlyNonZeroStock = 0 OR COALESCE(pb.OnhandQty, pw.OnHandQty, 0) <> 0)
```

query_plan_json

```json
{
  "intent": "inventory_stock_detail",
  "module": "inventory",
  "tables": [
    "Erp.Part",
    "Erp.PartBin",
    "Erp.PartClass",
    "Erp.PartWhse",
    "Erp.ProdGrup",
    "Erp.Warehse",
    "Erp.WhseBin"
  ],
  "joins": [
    "Erp.Part -> Erp.PartWhse ON Company + PartNum",
    "Erp.PartWhse -> Erp.PartBin ON Company + PartNum + WarehouseCode",
    "Erp.PartBin -> Erp.WhseBin ON Company + BinNum + WarehouseCode",
    "Erp.WhseBin -> Erp.Warehse ON Company + WarehouseCode",
    "Erp.Warehse -> Erp.ProdGrup ON Company + ProdCode",
    "Erp.ProdGrup -> Erp.PartClass ON Company + ClassID"
  ],
  "filters": [
    "companyScope",
    "partNum",
    "partDescription",
    "warehouseCode",
    "binNum",
    "prodCode",
    "classId",
    "onlyNonZeroStock"
  ],
  "params": {
    "required": [],
    "optional": [
      "companyScope",
      "partNum",
      "partDescription",
      "warehouseCode",
      "binNum",
      "prodCode",
      "classId",
      "onlyNonZeroStock"
    ]
  },
  "sourceFamilyId": "family_050",
  "sourceReportNames": [
    "计量泵组",
    "液压站发货看板"
  ],
  "limitations": [
    "草稿来自 family_050；Company 使用 @companyScope 控制，不硬编码公司、仓库或产品编码。",
    "draft only; must pass guard and manual approval before execution"
  ]
}
```

- notes: 草稿来自 family_050；Company 使用 @companyScope 控制，不硬编码公司、仓库或产品编码。

- [ ] SQL 是 SELECT-only
- [ ] 不包含 FineReport 宏 `${...}`
- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE
- [ ] 不包含 SELECT INTO #temp
- [ ] 没有硬编码 jctimes / JingyiMT / jytimes
- [ ] Company 过滤使用参数或 companyScope
- [ ] 核心 JOIN 带 Company
- [ ] 参数命名清楚
- [ ] 字段名已按真实 ERP schema 校验
- [ ] 业务口径与 source family 基本一致

### family_062 - 采购到货跟踪查询

- family_id: family_062
- template_name: 采购到货跟踪查询
- intent: purchase_receipt_delay_tracking
- module: purchase
- source_report_names: ["到货跟踪表","到货跟踪明细表"]
- source_dataset_ids: [4399,4400,4401,4402,4403,4996,4997,4998,4999,5000]
- required_params: []
- optional_params: ["companyScope","poNum","vendorName","buyerName","partNum","dueDateFrom","dueDateTo","receiptDateFrom","receiptDateTo","onlyOpen","onlyDelayed","dueBeforeDate"]
- tables: ["Erp.PODetail","Erp.POHeader","Erp.PORel","Erp.PurAgent","Erp.RcvDtl","Erp.Vendor"]
- joins: ["Erp.POHeader -> Erp.PODetail ON Company + PONum","Erp.PODetail -> Erp.Vendor ON Company + VendorNum","Erp.Vendor -> Erp.PORel ON Company + POLine + PONUM","Erp.PORel -> Erp.PurAgent ON Company + BuyerID","Erp.PODetail -> Erp.PORel ON Company + POLine + PONUM","Erp.PORel -> Erp.Vendor ON Company + VendorNum","Erp.Vendor -> Erp.PurAgent ON Company + BuyerID"]

sql_template

```sql
SELECT TOP 100
  poh.Company AS [公司],
  poh.PONum AS [采购单号],
  pod.POLine AS [采购行],
  por.PORelNum AS [采购释放],
  v.Name AS [供应商],
  pa.Name AS [采购员],
  pod.PartNum AS [物料编号],
  pod.LineDesc AS [物料描述],
  por.DueDate AS [交期],
  por.PromiseDt AS [承诺日期],
  por.XRelQty AS [订购数量],
  COALESCE(rcv.ReceivedQty, 0) AS [已收数量],
  por.XRelQty - COALESCE(rcv.ReceivedQty, 0) AS [未到数量],
  rcv.LastReceiptDate AS [最近收货日期],
  CASE WHEN COALESCE(rcv.ReceivedQty, 0) < por.XRelQty AND COALESCE(por.PromiseDt, por.DueDate) < CAST(GETDATE() AS date) THEN 1 ELSE 0 END AS [是否延期]
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod ON pod.Company = poh.Company AND pod.PONum = poh.PONum
INNER JOIN Erp.PORel por ON por.Company = pod.Company AND por.PONum = pod.PONum AND por.POLine = pod.POLine
LEFT JOIN Erp.Vendor v ON v.Company = poh.Company AND v.VendorNum = poh.VendorNum
LEFT JOIN Erp.PurAgent pa ON pa.Company = poh.Company AND pa.BuyerID = poh.BuyerID
LEFT JOIN (
  SELECT Company, PONum, POLine, PORelNum, SUM(OurQty) AS ReceivedQty, MAX(ReceiptDate) AS LastReceiptDate
  FROM Erp.RcvDtl
  GROUP BY Company, PONum, POLine, PORelNum
) rcv ON rcv.Company = por.Company AND rcv.PONum = por.PONum AND rcv.POLine = por.POLine AND rcv.PORelNum = por.PORelNum
WHERE (@companyScope IS NULL OR poh.Company = @companyScope)
  AND (@poNum IS NULL OR poh.PONum = @poNum)
  AND (@vendorName IS NULL OR v.Name LIKE CONCAT('%', @vendorName, '%'))
  AND (@buyerName IS NULL OR pa.Name LIKE CONCAT('%', @buyerName, '%'))
  AND (@partNum IS NULL OR pod.PartNum = @partNum)
  AND (@dueDateFrom IS NULL OR COALESCE(por.PromiseDt, por.DueDate) >= @dueDateFrom)
  AND (@dueDateTo IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= @dueDateTo)
  AND (@receiptDateFrom IS NULL OR rcv.LastReceiptDate >= @receiptDateFrom)
  AND (@receiptDateTo IS NULL OR rcv.LastReceiptDate <= @receiptDateTo)
  AND (@onlyOpen = 0 OR COALESCE(rcv.ReceivedQty, 0) < por.XRelQty)
  AND (@onlyDelayed = 0 OR (COALESCE(rcv.ReceivedQty, 0) < por.XRelQty AND COALESCE(por.PromiseDt, por.DueDate) < CAST(GETDATE() AS date)))
  AND (@dueBeforeDate IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= @dueBeforeDate)
```

query_plan_json

```json
{
  "intent": "purchase_receipt_delay_tracking",
  "module": "purchase",
  "tables": [
    "Erp.PODetail",
    "Erp.POHeader",
    "Erp.PORel",
    "Erp.PurAgent",
    "Erp.RcvDtl",
    "Erp.Vendor"
  ],
  "joins": [
    "Erp.POHeader -> Erp.PODetail ON Company + PONum",
    "Erp.PODetail -> Erp.Vendor ON Company + VendorNum",
    "Erp.Vendor -> Erp.PORel ON Company + POLine + PONUM",
    "Erp.PORel -> Erp.PurAgent ON Company + BuyerID",
    "Erp.PODetail -> Erp.PORel ON Company + POLine + PONUM",
    "Erp.PORel -> Erp.Vendor ON Company + VendorNum",
    "Erp.Vendor -> Erp.PurAgent ON Company + BuyerID"
  ],
  "filters": [
    "companyScope",
    "poNum",
    "vendorName",
    "buyerName",
    "partNum",
    "dueDateFrom",
    "dueDateTo",
    "receiptDateFrom",
    "receiptDateTo",
    "onlyOpen",
    "onlyDelayed",
    "dueBeforeDate"
  ],
  "params": {
    "required": [],
    "optional": [
      "companyScope",
      "poNum",
      "vendorName",
      "buyerName",
      "partNum",
      "dueDateFrom",
      "dueDateTo",
      "receiptDateFrom",
      "receiptDateTo",
      "onlyOpen",
      "onlyDelayed",
      "dueBeforeDate"
    ]
  },
  "sourceFamilyId": "family_062",
  "sourceReportNames": [
    "到货跟踪表",
    "到货跟踪明细表"
  ],
  "limitations": [
    "草稿来自 family_062；RcvDtl 聚合和 PORel.DueDate/PromiseDt 字段需按现场 Epicor 字段验证。",
    "draft only; must pass guard and manual approval before execution"
  ]
}
```

- notes: 草稿来自 family_062；RcvDtl 聚合和 PORel.DueDate/PromiseDt 字段需按现场 Epicor 字段验证。

- [ ] SQL 是 SELECT-only
- [ ] 不包含 FineReport 宏 `${...}`
- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE
- [ ] 不包含 SELECT INTO #temp
- [ ] 没有硬编码 jctimes / JingyiMT / jytimes
- [ ] Company 过滤使用参数或 companyScope
- [ ] 核心 JOIN 带 Company
- [ ] 参数命名清楚
- [ ] 字段名已按真实 ERP schema 校验
- [ ] 业务口径与 source family 基本一致

### family_076 - 工单物料需求查询

- family_id: family_076
- template_name: 工单物料需求查询
- intent: job_material_requirement_shortage
- module: production_inventory
- source_report_names: ["工单物料需求","模体料需求计划","缺料明细","TEST","未来需求"]
- source_dataset_ids: [3678,3989,3992,4000,4007,4010,4018,4020,4027]
- required_params: []
- optional_params: ["companyScope","jobNum","materialPartNum","parentPartNum","reqDueDateFrom","reqDueDateTo","warehouseCode","onlyUnissued","onlyShortage"]
- tables: ["Erp.JobHead","Erp.JobMtl","Erp.Part","Erp.PartClass","Erp.PartWhse"]
- joins: ["Erp.JobMtl -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.Part ON Company + PartNum","Erp.Part -> Erp.PartClass ON Company + ClassID","Erp.PartClass -> Erp.PartWhse ON Company + PartNum","Erp.PartClass -> Erp.PartWhse ON Company + PartNum + WarehouseCode"]

sql_template

```sql
SELECT TOP 100
  jm.Company AS [公司],
  jm.JobNum AS [工单号],
  jh.PartNum AS [成品物料],
  jm.PartNum AS [需求物料],
  p.PartDescription AS [物料描述],
  jm.RequiredQty AS [需求数量],
  jm.IssuedQty AS [已发数量],
  jm.RequiredQty - jm.IssuedQty AS [未发数量],
  pw.WarehouseCode AS [仓库],
  COALESCE(pw.OnHandQty, 0) AS [现有库存],
  jm.ReqDate AS [需求日期],
  CASE WHEN COALESCE(pw.OnHandQty, 0) < jm.RequiredQty - jm.IssuedQty THEN 1 ELSE 0 END AS [是否缺料]
FROM Erp.JobMtl jm
INNER JOIN Erp.JobHead jh ON jh.Company = jm.Company AND jh.JobNum = jm.JobNum
LEFT JOIN Erp.Part p ON p.Company = jm.Company AND p.PartNum = jm.PartNum
LEFT JOIN Erp.PartWhse pw ON pw.Company = jm.Company AND pw.PartNum = jm.PartNum
LEFT JOIN Erp.PartClass pc ON pc.Company = p.Company AND pc.ClassID = p.ClassID
WHERE (@companyScope IS NULL OR jm.Company = @companyScope)
  AND (@jobNum IS NULL OR jm.JobNum = @jobNum)
  AND (@materialPartNum IS NULL OR jm.PartNum = @materialPartNum)
  AND (@parentPartNum IS NULL OR jh.PartNum = @parentPartNum)
  AND (@reqDueDateFrom IS NULL OR jm.ReqDate >= @reqDueDateFrom)
  AND (@reqDueDateTo IS NULL OR jm.ReqDate <= @reqDueDateTo)
  AND (@warehouseCode IS NULL OR pw.WarehouseCode = @warehouseCode)
  AND (@onlyUnissued = 0 OR jm.RequiredQty > jm.IssuedQty)
  AND (@onlyShortage = 0 OR COALESCE(pw.OnHandQty, 0) < jm.RequiredQty - jm.IssuedQty)
```

query_plan_json

```json
{
  "intent": "job_material_requirement_shortage",
  "module": "production_inventory",
  "tables": [
    "Erp.JobHead",
    "Erp.JobMtl",
    "Erp.Part",
    "Erp.PartClass",
    "Erp.PartWhse"
  ],
  "joins": [
    "Erp.JobMtl -> Erp.JobHead ON Company + JobNum",
    "Erp.JobHead -> Erp.Part ON Company + PartNum",
    "Erp.Part -> Erp.PartClass ON Company + ClassID",
    "Erp.PartClass -> Erp.PartWhse ON Company + PartNum",
    "Erp.PartClass -> Erp.PartWhse ON Company + PartNum + WarehouseCode"
  ],
  "filters": [
    "companyScope",
    "jobNum",
    "materialPartNum",
    "parentPartNum",
    "reqDueDateFrom",
    "reqDueDateTo",
    "warehouseCode",
    "onlyUnissued",
    "onlyShortage"
  ],
  "params": {
    "required": [],
    "optional": [
      "companyScope",
      "jobNum",
      "materialPartNum",
      "parentPartNum",
      "reqDueDateFrom",
      "reqDueDateTo",
      "warehouseCode",
      "onlyUnissued",
      "onlyShortage"
    ]
  },
  "sourceFamilyId": "family_076",
  "sourceReportNames": [
    "工单物料需求",
    "模体料需求计划",
    "缺料明细",
    "TEST",
    "未来需求"
  ],
  "limitations": [
    "草稿来自 family_076；缺料暂按 OnHandQty < RequiredQty - IssuedQty，业务口径需人工确认。数据库验证显示 JobMtl.PartNum 与 JobMtl.BasePartNum 均存在且可编译；第一版采用 JobMtl.PartNum 作为工单物料需求行的需求物料字段。",
    "draft only; must pass guard and manual approval before execution"
  ]
}
```

- notes: 草稿来自 family_076；缺料暂按 OnHandQty < RequiredQty - IssuedQty，业务口径需人工确认。数据库验证显示 JobMtl.PartNum 与 JobMtl.BasePartNum 均存在且可编译；第一版采用 JobMtl.PartNum 作为工单物料需求行的需求物料字段。

- [ ] SQL 是 SELECT-only
- [ ] 不包含 FineReport 宏 `${...}`
- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE
- [ ] 不包含 SELECT INTO #temp
- [ ] 没有硬编码 jctimes / JingyiMT / jytimes
- [ ] Company 过滤使用参数或 companyScope
- [ ] 核心 JOIN 带 Company
- [ ] 参数命名清楚
- [ ] 字段名已按真实 ERP schema 校验
- [ ] 业务口径与 source family 基本一致

### family_016 - 销售订单明细查询

- family_id: family_016
- template_name: 销售订单明细查询
- intent: sales_order_detail
- module: sales
- source_report_names: ["buju","SalesReport","区域","星空","粒子","进出口最终用户查询","项目阶段督导"]
- source_dataset_ids: [94,366,371,3542,3545,3546,3547,3549,3552,3553]
- required_params: []
- optional_params: ["companyScope","orderNum","customerName","entryPerson","partNum","prodCode","orderDateFrom","orderDateTo","requestDateFrom","requestDateTo","onlyOpen"]
- tables: ["Erp.OrderDtl","Erp.OrderHed"]
- joins: ["Erp.OrderHed -> Erp.OrderDtl ON Company + OrderNum","Erp.OrderHed -> Erp.OrderDtl ON OrderNum"]

sql_template

```sql
SELECT TOP 100
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
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%'))
  AND (@entryPerson IS NULL OR oh.EntryPerson LIKE CONCAT(@entryPerson, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@orderDateFrom IS NULL OR oh.OrderDate >= @orderDateFrom)
  AND (@orderDateTo IS NULL OR oh.OrderDate <= @orderDateTo)
  AND (@requestDateFrom IS NULL OR od.RequestDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR od.RequestDate <= @requestDateTo)
  AND (@onlyOpen = 0 OR od.OpenLine = 1)
```

query_plan_json

```json
{
  "intent": "sales_order_detail",
  "module": "sales",
  "tables": [
    "Erp.OrderDtl",
    "Erp.OrderHed"
  ],
  "joins": [
    "Erp.OrderHed -> Erp.OrderDtl ON Company + OrderNum",
    "Erp.OrderHed -> Erp.OrderDtl ON OrderNum"
  ],
  "filters": [
    "companyScope",
    "orderNum",
    "customerName",
    "entryPerson",
    "partNum",
    "prodCode",
    "orderDateFrom",
    "orderDateTo",
    "requestDateFrom",
    "requestDateTo",
    "onlyOpen"
  ],
  "params": {
    "required": [],
    "optional": [
      "companyScope",
      "orderNum",
      "customerName",
      "entryPerson",
      "partNum",
      "prodCode",
      "orderDateFrom",
      "orderDateTo",
      "requestDateFrom",
      "requestDateTo",
      "onlyOpen"
    ]
  },
  "sourceFamilyId": "family_016",
  "sourceReportNames": [
    "buju",
    "SalesReport",
    "区域",
    "星空",
    "粒子",
    "进出口最终用户查询",
    "项目阶段督导"
  ],
  "limitations": [
    "草稿来自 family_016；EntryPerson、ProdCode 均为可选参数，不硬编码前缀。",
    "draft only; must pass guard and manual approval before execution"
  ]
}
```

- notes: 草稿来自 family_016；EntryPerson、ProdCode 均为可选参数，不硬编码前缀。

- [ ] SQL 是 SELECT-only
- [ ] 不包含 FineReport 宏 `${...}`
- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE
- [ ] 不包含 SELECT INTO #temp
- [ ] 没有硬编码 jctimes / JingyiMT / jytimes
- [ ] Company 过滤使用参数或 companyScope
- [ ] 核心 JOIN 带 Company
- [ ] 参数命名清楚
- [ ] 字段名已按真实 ERP schema 校验
- [ ] 业务口径与 source family 基本一致

### family_037 - 发货通知明细查询

- family_id: family_037
- template_name: 发货通知明细查询
- intent: sales_shipping_notice_detail
- module: sales_inventory
- source_report_names: ["发货通知","计量泵组","发货通知 滚动","未来产能分析","澄江发货看板","物流费用分析","涂布未来交付量统计","高端平模头"]
- source_dataset_ids: [3618,3621,3630,3644,3663,3675,3917,3965,4048,4613]
- required_params: []
- optional_params: ["companyScope","orderNum","customerName","partNum","prodCode","requestDateFrom","requestDateTo","warehouseCode","onlyOpenRelease","onlyShippingNotice"]
- tables: ["Erp.CustCnt","Erp.Customer","Erp.JobProd","Erp.OrderDtl","Erp.OrderHed","Erp.OrderRel","Erp.PartWhse","Erp.ShipTo"]
- joins: ["Erp.OrderDtl -> Erp.JobProd ON Company + OrderLine + OrderNum","Erp.JobProd -> Erp.OrderRel ON Company + OrderLine + OrderNum","Erp.OrderRel -> Erp.OrderHed ON Company + OrderNum","Erp.OrderHed -> Erp.Customer ON Company + CustNum","Erp.Customer -> Erp.ShipTo ON Company + CustNum + ShipToNum","Erp.ShipTo -> Erp.CustCnt ON Company + CustNum + ShipToNum"]

sql_template

```sql
SELECT TOP 100
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
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@requestDateFrom IS NULL OR rel.ReqDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR rel.ReqDate <= @requestDateTo)
  AND (@warehouseCode IS NULL OR rel.WarehouseCode = @warehouseCode)
  AND (@onlyOpenRelease = 0 OR rel.OpenRelease = 1)
  AND (@onlyShippingNotice = 0 OR rel.OurReqQty > 0)
```

query_plan_json

```json
{
  "intent": "sales_shipping_notice_detail",
  "module": "sales_inventory",
  "tables": [
    "Erp.CustCnt",
    "Erp.Customer",
    "Erp.JobProd",
    "Erp.OrderDtl",
    "Erp.OrderHed",
    "Erp.OrderRel",
    "Erp.PartWhse",
    "Erp.ShipTo"
  ],
  "joins": [
    "Erp.OrderDtl -> Erp.JobProd ON Company + OrderLine + OrderNum",
    "Erp.JobProd -> Erp.OrderRel ON Company + OrderLine + OrderNum",
    "Erp.OrderRel -> Erp.OrderHed ON Company + OrderNum",
    "Erp.OrderHed -> Erp.Customer ON Company + CustNum",
    "Erp.Customer -> Erp.ShipTo ON Company + CustNum + ShipToNum",
    "Erp.ShipTo -> Erp.CustCnt ON Company + CustNum + ShipToNum"
  ],
  "filters": [
    "companyScope",
    "orderNum",
    "customerName",
    "partNum",
    "prodCode",
    "requestDateFrom",
    "requestDateTo",
    "warehouseCode",
    "onlyOpenRelease",
    "onlyShippingNotice"
  ],
  "params": {
    "required": [],
    "optional": [
      "companyScope",
      "orderNum",
      "customerName",
      "partNum",
      "prodCode",
      "requestDateFrom",
      "requestDateTo",
      "warehouseCode",
      "onlyOpenRelease",
      "onlyShippingNotice"
    ]
  },
  "sourceFamilyId": "family_037",
  "sourceReportNames": [
    "发货通知",
    "计量泵组",
    "发货通知 滚动",
    "未来产能分析",
    "澄江发货看板",
    "物流费用分析",
    "涂布未来交付量统计",
    "高端平模头"
  ],
  "limitations": [
    "草稿来自 family_037；CheckBox20/CheckBox18/CheckBox19/Date20/Date19/ShortChar10 等 UD 字段待业务确认。",
    "draft only; must pass guard and manual approval before execution"
  ]
}
```

- notes: 草稿来自 family_037；CheckBox20/CheckBox18/CheckBox19/Date20/Date19/ShortChar10 等 UD 字段待业务确认。

- [ ] SQL 是 SELECT-only
- [ ] 不包含 FineReport 宏 `${...}`
- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE
- [ ] 不包含 SELECT INTO #temp
- [ ] 没有硬编码 jctimes / JingyiMT / jytimes
- [ ] Company 过滤使用参数或 companyScope
- [ ] 核心 JOIN 带 Company
- [ ] 参数命名清楚
- [ ] 字段名已按真实 ERP schema 校验
- [ ] 业务口径与 source family 基本一致

## Reference Families Review

### family_050 - 库存明细查询

- family_id: family_050
- family_name: 库存明细查询
- module: inventory
- intent: inventory_stock_detail_reference
- business_description: 物料、仓库、库位和产品群组库存明细参考 SQL family。
- core_tables: ["Erp.Part","Erp.PartBin","Erp.PartClass","Erp.PartWhse","Erp.ProdGrup","Erp.Warehse","Erp.WhseBin"]
- core_joins: ["Erp.Part -> Erp.PartWhse ON Company + PartNum","Erp.PartWhse -> Erp.PartBin ON Company + PartNum + WarehouseCode","Erp.PartBin -> Erp.WhseBin ON Company + BinNum + WarehouseCode","Erp.WhseBin -> Erp.Warehse ON Company + WarehouseCode","Erp.Warehse -> Erp.ProdGrup ON Company + ProdCode","Erp.ProdGrup -> Erp.PartClass ON Company + ClassID"]
- common_params: []
- representative_dataset_id: 4962

representative_sql preview

```sql
SELECT 
a.partDescription ,sum(d.OnhandQty ) AS sl
FROM erp.Part a
LEFT JOIN erp.PartWhse b ON (a.PartNum = b.PartNum AND a.Company = b.company)
LEFT JOIN erp.PartBin  d ON (b.PartNum = d.PartNum AND b.WarehouseCode=d.WarehouseCode AND b.Company = d.Company)
LEFT JOIN erp.WhseBin e ON (e.WarehouseCode = d.WarehouseCode AND d.Company = e.Company 
AND e.BinNum = d.BinNum)
LEFT JOIN erp.Warehse c ON (b.WarehouseCode = c.WarehouseCode AND b.Company = c.Company)
LEFT JOIN Erp.ProdGrup f ON (a.Company = f.Company AND a.ProdCode = f.ProdCode )
LEFT JOIN Erp.PartClass g ON (g.Company = a.Company AND g.ClassID = a.ClassID)
WHERE a.Company ='jctimes' AND a.ProdCode LIKE '09%' AND b.OnHandQty <>0 AND b.WarehouseCode IN ('cpc001') and a.prodcode not in ('090301','090201','090211','090212') and a.typecode <>'K'
AND a.ProdCode <>'09100103' AND a.ProdCode <>'091001'AND a.ProdCode <>'09100102'
AND a.ProdCode LIKE '0905'
GROUP BY a.partDescription
order by sum(d.OnhandQty) asc
```

- risk_flags: ["hardcoded_company_in_source"]

### family_062 - 采购到货跟踪查询

- family_id: family_062
- family_name: 采购到货跟踪查询
- module: purchase
- intent: purchase_receipt_delay_tracking_reference
- business_description: 采购未到货、延期到货、供应商、采购员和收货进度参考 SQL family。
- core_tables: ["Erp.PODetail","Erp.POHeader","Erp.PORel","Erp.PurAgent","Erp.RcvDtl","Erp.Vendor"]
- core_joins: ["Erp.POHeader -> Erp.PODetail ON Company + PONum","Erp.PODetail -> Erp.Vendor ON Company + VendorNum","Erp.Vendor -> Erp.PORel ON Company + POLine + PONUM","Erp.PORel -> Erp.PurAgent ON Company + BuyerID","Erp.PODetail -> Erp.PORel ON Company + POLine + PONUM","Erp.PORel -> Erp.Vendor ON Company + VendorNum","Erp.Vendor -> Erp.PurAgent ON Company + BuyerID"]
- common_params: ["七天将延期","三天将延期","两天将延期","将延期","状态","类别","采购员"]
- representative_dataset_id: 4997

representative_sql preview

```sql
select 
a.PONum as 订单编号
,a.OrderDate as 下单日期
,case when a.OpenOrder = 0 then N'已关闭' else N'未关闭' end 订单状态
,c.Name 供应商
,d.Name 采购员
,b.POLine 行号
, case when b.OpenLine = 0 then N'已关闭' else N'未关闭' end 行状态
,b.PartNum 物料编码
,b.LineDesc 物料描
,b.OrderQty 供应商数量
,b.PUM 供应商单位
,cast (b.XOrderQty as float )   我方数量
,b.IUM 我方单位
, (case when isnull(F.PromiseDt,'')<>'' and a.OrderDate >='2025-03-20' then F.PromiseDt else   b.DueDate end )  需求日期,
cast (SHS AS float ) 收货数,b.Character01 产品编号,b.CommentText 备注,(CASE WHEN ISNULL(f.JobNum ,'')='' THEN N'采购' ELSE N'外协' END ) 类别
from POHeader a
inner join PODetail b on a.PONum=b.PONUM and a.Company=b.Company
inner join Erp.PORel f on b.PONUM =f.PONum and b.POLine =f.POLine and b.Company =f.Company 
inner join erp.Vendor c on c.VendorNum=a.VendorNum and a.Company=c.Company
inner join erp.PurAgent d on d.BuyerID=a.BuyerID AND d.Company =a.Company 
LEFT JOIN (SELECT PONum ,POLine ,Company ,SUM(OurQty) SHS FROM Erp.RcvDtl where Received=1 GROUP BY  PONum ,POLine ,Com...
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_076 - 工单物料需求查询

- family_id: family_076
- family_name: 工单物料需求查询
- module: production_inventory
- intent: job_material_requirement_shortage_reference
- business_description: 工单物料需求、未发料、领料和缺料明细参考 SQL family。
- core_tables: ["Erp.JobHead","Erp.JobMtl","Erp.Part","Erp.PartClass","Erp.PartWhse"]
- core_joins: ["Erp.JobMtl -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.Part ON Company + PartNum","Erp.Part -> Erp.PartClass ON Company + ClassID","Erp.PartClass -> Erp.PartWhse ON Company + PartNum","Erp.PartClass -> Erp.PartWhse ON Company + PartNum + WarehouseCode"]
- common_params: ["交期止","交期起","物料编号","要求完工时间开始","要求完工时间结束"]
- representative_dataset_id: 3678

representative_sql preview

```sql
SELECT A.JobNum ,B.PartNum ,B.PartDescription ,A.PartNum as N'编号',C.PartDescription  as N'描述',A.RequiredQty -A.IssuedQty,A.IUM,A.ReqDate ,B.ReqDueDate ,e.SafetyQty,e.MinimumQty,e.MaximumQty,C.Character01 ,e.OnHandQty,B.CreateDate  FROM erp.JobMtl A
INNER JOIN erp.JobHead B ON (A.Company=B.Company AND A.JobNum=B.JobNum )
INNER JOIN Part C ON (A.Company=C.Company AND A.PartNum=C.PartNum)
LEFT JOIN erp.PartClass D ON (C.Company=D.Company AND C.ClassID=D.ClassID)
LEFT JOIN erp.PartWhse e ON (e.Company = c.Company AND C.PartNum = e.PartNum )
WHERE   a.Company ='jctimes' AND B.ReqDueDate>='2019-07-01' AND B.ReqDueDate<='2022-01-01' AND a.IssuedComplete ='0'
AND c.ProdCode IN ('030102','030103') AND e.WarehouseCode ='pjc001'
and b.jobcode ='1'
order by e.SafetyQty
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_016 - 销售订单明细查询

- family_id: family_016
- family_name: 销售订单明细查询
- module: sales
- intent: sales_order_detail_reference
- business_description: 销售订单、客户订单、订单行、产品和未关闭订单参考 SQL family。
- core_tables: ["Erp.OrderDtl","Erp.OrderHed"]
- core_joins: ["Erp.OrderHed -> Erp.OrderDtl ON Company + OrderNum","Erp.OrderHed -> Erp.OrderDtl ON OrderNum"]
- common_params: ["变动日期"]
- representative_dataset_id: 94

representative_sql preview

```sql
SELECT a.EntryPerson,a.OrderDate,b.PartNum,b.LineDesc FROM Erp.OrderHed a
inner JOIN Erp.OrderDtl b ON (a.OrderNum=b.OrderNum AND a.Company= b.Company)
WHERE a.OrderDate >='2022-8-30' AND a.Company='jctimes'
AND a.EntryPerson like'jcyxb%'
AND b.ProdCode LIKE '0910%'

 ${if (len(变动日期)==0,"","and a.OrderDate>='"+变动日期+"'")}
 order by a.OrderDate
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_037 - 发货通知明细查询

- family_id: family_037
- family_name: 发货通知明细查询
- module: sales_inventory
- intent: sales_shipping_notice_detail_reference
- business_description: 发货通知、待发货订单、欠发、客户收货信息和库存参考 SQL family。
- core_tables: ["Erp.CustCnt","Erp.Customer","Erp.JobProd","Erp.OrderDtl","Erp.OrderHed","Erp.OrderRel","Erp.PartWhse","Erp.ShipTo"]
- core_joins: ["Erp.OrderDtl -> Erp.JobProd ON Company + OrderLine + OrderNum","Erp.JobProd -> Erp.OrderRel ON Company + OrderLine + OrderNum","Erp.OrderRel -> Erp.OrderHed ON Company + OrderNum","Erp.OrderHed -> Erp.Customer ON Company + CustNum","Erp.Customer -> Erp.ShipTo ON Company + CustNum + ShipToNum","Erp.ShipTo -> Erp.CustCnt ON Company + CustNum + ShipToNum"]
- common_params: []
- representative_dataset_id: 3618

representative_sql preview

```sql
SELECT A.CheckBox18,A.CheckBox19,A.Date20,A.Date19,A.OrderNum,A.PartNum,A.LineDesc,A.SalesUM,A.OrderQty,isnull(G.Qty1,0) AS qty1,
isnull(G.qty2,0) AS Qty2,isnull(G.qty3,0) AS Qty3,
A.OrderComment,C.EntryPerson,E.Name,
E.Address1+E.Address2+E.Address3 AS Address,F.PhoneNum,F.CellPhoneNum,F.FaxNum,F.Name AS cname,A.Date17,A.Character09,A.OrderLine,
D.Country,A.Character10,A.shortChar10,A.ShipComment,aa.JobNum
FROM OrderDtl A 
LEFT JOIN erp.JobProd aa ON (a.Company = aa.Company AND A.OrderNum = aa.OrderNum AND A.OrderLine = aa.OrderLine)
LEFT JOIN erp.OrderRel B ON (A.Company=B.Company AND A.OrderNum=B.OrderNum AND A.OrderLine=B.OrderLine) 
LEFT JOIN OrderHed C ON (B.Company=C.Company AND B.OrderNum=C.OrderNum) 
LEFT JOIN erp.Customer D ON (C.Company=D.Company AND C.CustNum=D.CustNum) 
LEFT JOIN erp.ShipTo E ON (D.CustNum=E.CustNum AND D.Company=E.Company AND B.ShipToNum=E.ShipToNum) 
LEFT JOIN erp.CustCnt F ON (F.Company=E.Company AND F.CustNum=E.CustNum AND F.ShipToNum=E.ShipToNum AND B...
```

- risk_flags: ["hardcoded_company_in_source"]

### family_002 - 生产任务 / 今日任务 / 明日任务 / 拉动式生产

- family_id: family_002
- family_name: 生产任务 / 今日任务 / 明日任务 / 拉动式生产
- module: production
- intent: production_task_pull_schedule_reference
- business_description: 生产任务、今日/明日任务、拉动式生产过程参考 SQL family。
- core_tables: ["Erp.EmpBasic","Erp.JobAsmbl","Erp.JobHead","Erp.JobOpDtl","Erp.JobOper","Erp.LaborDtl","Erp.OpMaster","Erp.ResourceGroup"]
- core_joins: ["Erp.JobOper -> Erp.JobAsmbl ON Company + AssemblySeq + JobNum","Erp.OpMaster -> Erp.JobOpDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.JobOpDtl -> Erp.ResourceGroup ON Company + ResourceGrpID","Erp.ResourceGroup -> Erp.LaborDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.LaborDtl -> Erp.EmpBasic ON Company","Erp.JobAsmbl -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.OpMaster ON Company + OpCode","Erp.JobHead -> Erp.JobOper ON Company + JobNum","Erp.JobAsmbl -> Erp.OpMaster ON Company + OpCode"]
- common_params: ["产品编号","大于实际到料","大于实际完工","完工日期大于","完工日期小于","实际到料时间","实际完工时间","工单编号","工序","开始日期","截止日期","报工者","状态","班组","要求完工日期","要求完工时间开始","要求完工时间结束","计划时间","资源部门"]
- representative_dataset_id: 490

representative_sql preview

```sql
SELECT month(A.Date01) ,     
       sum(CASE a.OpComplete WHEN '1' THEN 1 ELSE 0 end)  AS wgl,
       sum(CASE a.OpComplete WHEN '0' THEN 1 ELSE 0 end)  AS wwgl,
       count(a.OpComplete) AS zl
                   from JobOper A
       LEFT JOIN erp.JobAsmbl A3 ON (A.JobNum=A3.JobNum AND A.AssemblySeq=A3.AssemblySeq AND A.Company=A3.Company) 
	   LEFT JOIN erp.JobHead B ON (A.JobNum=B.JobNum AND A.Company=B.Company) 
       LEFT JOIN erp.OpMaster C ON (A.OpCode=C.OpCode AND A.Company=C.Company) 
       LEFT JOIN erp.JobOpDtl D ON (A.JobNum=D.JobNum AND A.AssemblySeq=D.AssemblySeq AND A.OprSeq=D.OprSeq AND A.Company=D.Company) 
       LEFT JOIN erp.ResourceGroup E ON (D.ResourceGrpID=E.ResourceGrpID AND D.Company=E.Company) 
       LEFT JOIN erp.LaborDtl f ON (f.JobNum= a.JobNum AND f.AssemblySeq = a.AssemblySeq AND f.OprSeq= a.OprSeq AND f.Company = a.company)
       LEFT JOIN erp.EmpBasic AS g
ON g.EmpID = f.EmployeeNum AND g.Company = f.Company
       wHERE A.Company ='jctimes'  and...
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_009 - 生产任务执行 / 过程跟进

- family_id: family_009
- family_name: 生产任务执行 / 过程跟进
- module: production
- intent: production_task_execution_followup_reference
- business_description: 生产任务执行、过程跟进和完工时间筛选参考 SQL family。
- core_tables: ["Erp.EmpBasic","Erp.JobAsmbl","Erp.JobHead","Erp.JobOpDtl","Erp.JobOper","Erp.LaborDtl","Erp.OpMaster","Erp.Part","Erp.ResourceGroup"]
- core_joins: ["Erp.JobOper -> Erp.JobAsmbl ON Company + AssemblySeq + JobNum","Erp.JobAsmbl -> Erp.JobHead ON Company + JobNum","Erp.OpMaster -> Erp.JobOpDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.JobOpDtl -> Erp.ResourceGroup ON Company + ResourceGrpID","Erp.ResourceGroup -> Erp.LaborDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.LaborDtl -> Erp.EmpBasic ON Company","Erp.JobHead -> Erp.OpMaster ON Company + OpCode","Erp.EmpBasic -> Erp.Part ON PartNum","Erp.JobHead -> Erp.Part ON Company + Partnum","Erp.Part -> Erp.OpMaster ON Company + OpCode","Erp.EmpBasic -> Erp.Part ON Company + PartNum"]
- common_params: ["gynd","产品编号","接收未开工","班组","要求完工日期","要求完工时间开始","要求完工时间结束","计划时间","资源部门"]
- representative_dataset_id: 365

representative_sql preview

```sql
SELECT A.JobNum ,A.AssemblySeq ,A.OprSeq ,a.ActProdHours,B.PartNum ,B.PartDescription ,B.ReqDueDate,A.Date20,A.CommentText,A.OpCode ,C.OpDesc ,D.ResourceGrpID,E.Description 
       ,Case when A.Number10=0 then '99' else CASe WHEN  A.Number10<10 THEN '0'+ cast(Ceiling(A.Number10) AS Nvarchar) ELSE cast(Ceiling(A.Number10) AS Nvarchar) End end as Number09,
       A3.PartNum as nPartNum,A3.Description as nDescription,A.Character09,A.OpComplete,A.Date01,A.Date02,A.ProdStandard,a.ActProdHours,
       convert(nvarchar(10),A.date20 ,120)+ ' ' +a.Character09 AS jsdate ,g.name,
       convert(nvarchar(10),f.clockindate ,120)+ ' ' +f.DspClockInTime AS indate ,
       convert(nvarchar(10),f.ApprovedDate ,120)+ ' ' +f.DspClockOutTime AS outdate 
                     from JobOper A
       LEFT JOIN erp.JobAsmbl A3 ON (A.JobNum=A3.JobNum AND A.AssemblySeq=A3.AssemblySeq AND A.Company=A3.Company) 
	   LEFT JOIN erp.JobHead B ON (A.JobNum=B.JobNum AND A.Company=B.Company) 
       LEFT JOIN erp.OpMaste...
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_021 - 销售订单 - 工单 - 工序进度

- family_id: family_021
- family_name: 销售订单 - 工单 - 工序进度
- module: cross_module
- intent: sales_order_job_operation_progress_reference
- business_description: 销售订单、工单、工序进度跨模块追踪参考 SQL family。
- core_tables: ["Erp.JobAsmbl","Erp.JobHead","Erp.JobOper","Erp.JobProd","Erp.LaborDtl","Erp.OrderDtl","Erp.OrderHed"]
- core_joins: ["Erp.JobOper -> Erp.JobAsmbl ON Company + AssemblySeq + JobNum","Erp.JobAsmbl -> Erp.LaborDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.OrderHed -> Erp.OrderDtl ON Company + OrderNum","Erp.OrderDtl -> Erp.JobProd ON Company + OrderLine + OrderNum","Erp.JobProd -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.JobOper ON Company + JobNum","Erp.JobHead -> Erp.JobProd ON Company + JobNum","Erp.JobProd -> Erp.OrderHed ON Company + OrderNum","Erp.OrderHed -> Erp.OrderDtl ON Company + OrderLine + OrderNum + OrderRelNum","Erp.OrderDtl -> Erp.JobOper ON Company + JobNum"]
- common_params: ["int","left","right","交货日期大于","交货日期小于","交货期","产品编号","完工状态","工单编号","年份","状态"]
- representative_dataset_id: 43

representative_sql preview

```sql
SELECT convert(nvarchar(10),e.date20 ,120), 
count(f.Description)
 FROM erp.JobHead a 
LEFT JOIN erp.JobProd b
ON a.JobNum =b.JobNum and a.Company = b.Company
LEFT JOIN erp.OrderHed c
ON b.OrderNum = c.OrderNum AND b.Company = c.Company
LEFT JOIN erp.OrderDtl d
ON b.OrderNum= d.OrderNum AND b.OrderLine = d.OrderLine AND b.OrderRelNum = b.OrderRelNum AND b.Company= d.Company
LEFT JOIN JobOper e	
ON a.JobNum = e.JobNum AND a.Company = e.Company
LEFT JOIN erp.JobAsmbl AS f
ON f.JobNum= e.JobNum AND f.AssemblySeq=e.AssemblySeq AND f.Company=e.Company
LEFT JOIN erp.LaborDtl AS g
ON g.JobNum=e.JobNum AND g.AssemblySeq=e.AssemblySeq AND g.OprSeq = e.OprSeq AND g.Company= e.Company

WHERE a.company='jctimes' and e.date20 >=getdate()-19
 AND A.CREATEDATE>='2020-1-1' AND e.OpComplete <>'1' and e.opcode like 'wb%'
 GROUP BY convert(nvarchar(10),e.date20 ,120)
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_023 - 打光 / 完工分析 / 全局数据表

- family_id: family_023
- family_name: 打光 / 完工分析 / 全局数据表
- module: cross_module
- intent: polishing_completion_global_reference
- business_description: 打光、完工分析和全局数据表参考 SQL family。
- core_tables: ["PUB.JobHead","PUB.JobProd","PUB.OrderDtl","PUB.OrderHed"]
- core_joins: ["PUB.JobHead -> PUB.JobProd ON Company + JobNum","PUB.JobProd -> PUB.OrderHed ON Company + OrderNum","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderLine + OrderNum + OrderRelNum","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderNum","PUB.OrderDtl -> PUB.JobProd ON Company + OrderLine + OrderNum","PUB.JobProd -> PUB.JobHead ON Company + JobNum","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderLine + OrderNum"]
- common_params: ["交货日期大于","交货日期小于","完工日期大于","完工日期小于"]
- representative_dataset_id: 232

representative_sql preview

```sql
SELECT 
d.JobCompletionDate,count(d.JobNum)

FROM PUB.OrderHed AS a
LEFT JOIN PUB.OrderDtl AS b
ON a.OrderNum=b.OrderNum and a.Company = b.Company
LEFT JOIN PUB.JobProd AS c
ON c.OrderNum= b.OrderNum AND c.OrderLine = b.OrderLine AND c.Company = b.Company
LEFT JOIN PUB.JobHead AS d
ON d.JobNum= c.JobNum AND d.Company = c.Company
WHERE a.requestdate>='2016-12-1'  AND d.JobCompletionDate >='2017-04-01' 
AND (b.ProdCode LIKE '0910%' OR b.ProdCode='0909') and b.ProdCode<>091001 and b.ProdCode<>09100102 AND b.PartNum<>'0906010001' AND b.PartNum<>'0906010002'
and b.salescatid<>0004 and  b.salescatid<>'' AND a.EntryPerson LIKE 'jcyxb%'
GROUP BY d.JobCompletionDate
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_025 - 订单任务 + joboper 全局数据表

- family_id: family_025
- family_name: 订单任务 + joboper 全局数据表
- module: cross_module
- intent: order_task_joboper_global_reference
- business_description: 订单任务和 JobOper 全局过程数据参考 SQL family。
- core_tables: ["PUB.JobHead","PUB.JobOper","PUB.JobProd","PUB.OrderDtl","PUB.OrderHed"]
- core_joins: ["PUB.JobHead -> PUB.JobProd ON Company + JobNum","PUB.JobProd -> PUB.OrderHed ON Company + OrderNum","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderLine + OrderNum + OrderRelNum","PUB.OrderDtl -> PUB.JobOper ON Company + JobNum"]
- common_params: ["交货日期大于","交货日期小于","完工日期大于","完工日期小于","工单编号"]
- representative_dataset_id: 120

representative_sql preview

```sql
SELECT  a.JobNum,a.PartNum,a.PartDescription,a.ProdQty,a.CreatedBy,a.JobComplete,a.JobCompletionDate,
c.OrderDate,c.EntryPerson,c.OrderNum,d.RequestDate,e.AssemblySeq,e.OprSeq,e.CommentText,e.OpDesc,e.LastLaborDate,e.OpComplete,e.date20,e.OpCode
 FROM PUB.JobHead a 
LEFT JOIN PUB.JobProd b
ON a.JobNum =b.JobNum and a.Company = b.Company
LEFT JOIN PUB.OrderHed c
ON b.OrderNum = c.OrderNum AND b.Company = c.Company
LEFT JOIN PUB.OrderDtl d
ON b.OrderNum= d.OrderNum AND b.OrderLine = d.OrderLine AND b.OrderRelNum = b.OrderRelNum AND b.Company= d.Company
LEFT JOIN PUB.JobOper e	
ON a.JobNum = e.JobNum AND a.Company = e.Company

WHERE 
(a.CreatedBy ='jcscbxhl' OR a.CreatedBy ='jcscbtmf' OR a.CreatedBy='jcscblf')
  ${if (len(交货日期大于)==0,"","and d.RequestDate>='"+交货日期大于+"'")}
 ${if (len(交货日期小于)==0,"","and d.RequestDate<='"+交货日期小于+"'")} 
order by d.RequestDate
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_035 - 外协分析 / 喷丝板 / 熔喷进度

- family_id: family_035
- family_name: 外协分析 / 喷丝板 / 熔喷进度
- module: cross_module
- intent: outsourcing_spinneret_meltblown_progress_reference
- business_description: 外协分析、喷丝板和熔喷进度参考 SQL family。
- core_tables: ["PUB.JobAsmbl","PUB.JobHead","PUB.JobOper","PUB.JobProd","PUB.LaborDtl","PUB.OrderDtl","PUB.OrderHed"]
- core_joins: ["PUB.JobOper -> PUB.JobAsmbl ON Company + AssemblySeq + JobNum","PUB.JobAsmbl -> PUB.LaborDtl ON Company + AssemblySeq + JobNum + OprSeq","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderNum","PUB.OrderDtl -> PUB.JobProd ON Company + OrderLine + OrderNum","PUB.JobProd -> PUB.JobHead ON Company + JobNum","PUB.JobHead -> PUB.JobOper ON Company + JobNum","PUB.JobHead -> PUB.JobProd ON Company + JobNum","PUB.JobProd -> PUB.OrderHed ON Company + OrderNum","PUB.OrderHed -> PUB.OrderDtl ON Company + OrderLine + OrderNum + OrderRelNum","PUB.OrderDtl -> PUB.JobOper ON Company + JobNum"]
- common_params: ["int","left","right","交货日期大于","交货日期小于","交货期","产品编号","完工状态","工单编号","年份","状态"]
- representative_dataset_id: 148

representative_sql preview

```sql
SELECT  a.JobNum,a.PartNum,a.PartDescription,a.ProdQty,a.CreatedBy,a.JobComplete,a.JobCompletionDate,
c.OrderDate,c.EntryPerson,c.OrderNum,d.RequestDate,e.AssemblySeq,e.OprSeq,e.CommentText,e.OpDesc,e.LastLaborDate,e.OpComplete,e.date20,e.opcode,e.prodstandard,g.ApprovedDate,
f.Description
 FROM PUB.JobHead a 
LEFT JOIN PUB.JobProd b
ON a.JobNum =b.JobNum and a.Company = b.Company
LEFT JOIN PUB.OrderHed c
ON b.OrderNum = c.OrderNum AND b.Company = c.Company
LEFT JOIN PUB.OrderDtl d
ON b.OrderNum= d.OrderNum AND b.OrderLine = d.OrderLine AND b.OrderRelNum = b.OrderRelNum AND b.Company= d.Company
LEFT JOIN PUB.JobOper e	
ON a.JobNum = e.JobNum AND a.Company = e.Company
LEFT JOIN PUB.JobAsmbl AS f
ON f.JobNum= e.JobNum AND f.AssemblySeq=e.AssemblySeq AND f.Company=e.Company
LEFT JOIN PUB.LaborDtl AS g
ON g.JobNum=e.JobNum AND g.AssemblySeq=e.AssemblySeq AND g.OprSeq = e.OprSeq AND g.Company= e.Company

WHERE a.company='jctimes' and e.date20 >='2020-2-1'
  ${if (len(交货日期大于)==0,"","and d.Re...
```

- risk_flags: ["finereport_macro_in_source","hardcoded_company_in_source"]

### family_075 - 澄江报工明细

- family_id: family_075
- family_name: 澄江报工明细
- module: production
- intent: chengjiang_labor_detail_reference
- business_description: 澄江报工明细、工序部门和人员报工参考 SQL family。
- core_tables: ["Erp.Cjcc_yggz","Erp.EmpBasic","Erp.JCDept","Erp.JobAsmbl","Erp.JobHead","Erp.JobMtl","Erp.JobOper","Erp.LaborDtl","Erp.OpMaster","Erp.ResourceGroup","dbo.QiMoRate"]
- core_joins: ["Erp.JobOper -> Erp.JobAsmbl ON Company + AssemblySeq + JobNum","Erp.JobAsmbl -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.LaborDtl ON Company + AssemblySeq + JobNum + OprSeq","Erp.LaborDtl -> Erp.ResourceGroup ON unknown","Erp.ResourceGroup -> Erp.JCDept ON Company + JCDept","Erp.JCDept -> Erp.EmpBasic ON Company","Erp.EmpBasic -> Erp.JobHead ON Company + JobNum","Erp.JobHead -> Erp.OpMaster ON Company + OpCode"]
- common_params: ["a","b","c","time1","time2","产品编号","工单编号","工序","工序部门","开始日期大于","开始日期小于","报工人员","要求完工日期大于","要求完工日期小于","资源群组","部门"]
- representative_dataset_id: 3928

representative_sql preview

```sql
Select a.jobnum,a.jobcomplete,a.PartNum cppartnum,a.partDescription , a.reqDueDate ,a.createDate ,b.description,b.partnum,b.AssemblySeq,
c.oprseq,c.commentText,c.opcomplete,c.actProdhours ,c.lastLaborDate,c.OpCode,c.Character09,c.Character10,d.BurdenHrs,replace(h.name,' ','') name,
d.LaborHrs,CAST (C.ProdStandard*d.LaborQty AS float)  EarnedHrs,cast (C.ProdStandard AS float) 单件标准工时,CAST (C.ProdStandard*C.RunQty AS float) 总标准工时,
c.opdesc,c.AssemblySeq ,d.EmployeeNum,e.Description AS jczy,f.Description AS jcbm ,c.OpDesc,
  convert(nvarchar(10),d.clockindate ,120)+ ' ' +d.DspClockInTime AS indate ,cast (d.LaborQty as float) LaborQty,D.ResReasonCode,
   d.approveddate,(d.clockoutminute-d.clockinminute) as 'jgsj', cast (c.RunQty as  float) RunQty,convert(nvarchar(10),d.ApprovedDate ,120)+ ' ' +d.DspClockOutTime AS outdate 
   ,c.OprSeq,l.PartNum 原材料编号,l.Description 原材料描述,l.MfgComment 物料备注,m.OpDesc 工序描述 

from  JobOper As c
left join erp.JobAsmbl As b
on c.jobNum = b.jobNum  AND c.AssemblySe...
```

- risk_flags: ["finereport_macro_in_source","non_select_risk_in_source","hardcoded_company_in_source"]

## Metric Drafts Review

### family_013 - purchase_on_time_delivery_rate

- family_id: family_013
- metric_code: purchase_on_time_delivery_rate
- metric_name: 采购及时率 / 供应商及时率 / 采购延期
- module: purchase
- business_description: 采购及时率、供应商及时率和采购延期指标草稿。
- calculation_summary: 基于采购交期、收货日期、采购释放和收货明细计算及时/延期口径。
- core_tables: ["Erp.PODetail","Erp.POHeader","Erp.PORel","Erp.PurAgent","Erp.RcvDtl","Erp.RcvHead","Erp.Vendor"]
- params: ["ENDDATE","enddate","month1","startdate","year1","供应商","供应商类型","延期到货数","延期未到货数","开始日期","开始时间","截止日期","收货人","收货日期止","收货日期起","是否延期","结束时间","责任部门","采购单","采购单号","采购员"]
- definition_json: {"status":"skeleton","variableParts":["ENDDATE","enddate","month1","startdate","year1","供应商","供应商类型","延期到货数","延期未到货数","开始日期","开始时间","截止日期","收货人","收货日期止","收货日期起","是否延期","结束时间","责任部门","采购单","采购单号","采购员"],"sourceFamilyId":"family_013"}

representative_sql preview

```sql
SELECT a.OrderDate,a.PONum,a.Approve,a.OpenOrder,VendorID,a.Character01 as fqr,b.poline,b.Character01 as cpbh,b.ium,
b.PartNum,b.LineDesc,b.Character01,b.XOrderQty,b.openLine,c.Name AS gys,d.Name AS cgy ,e.DueDate ,e.OpenRelease ,
f.ReceivedComplete,f.ReceiptDate,f.Invoiced,f.WareHouseCode,f.OurQty,f.BinNum,f.ReceivedComplete,g.EntryPerson
FROM POHeader a
LEFT JOIN PODetail b ON (a.Company = b.Company AND a.PONum = b.PONUM)
LEFT JOIN erp.PORel e  ON (b.Company = e.Company AND b.POLine = e.POLine AND b.PONUM = e.PONum)
LEFT JOIN erp.Vendor c ON (a.VendorNum = c.VendorNum AND c.Company = a.Company)
LEFT JOIN erp.PurAgent d ON (d.BuyerID= a.BuyerID AND d.Company = a.Company )
inner join  erp.RcvDtl f ON (f.Company = b.Company AND f.PONum = b.PONUM AND f.POLine= b.POLine)
LEFT JOIN Erp.RcvHead g ON (g.Company = f.Company AND g.PackSlip = f.PackSlip AND g.VendorNum= f.VendorNum AND g.PurPoint = f.PurPoint)
WHERE a.Company ='jytimes' AND a.OrderDate >='2020-7-1' AND a.Approve ='1'and d.name ...
```

- notes: 指标口径复杂，本阶段只登记草稿，不进入可执行模板。

### family_024 - production_labor_hours_summary

- family_id: family_024
- metric_code: production_labor_hours_summary
- metric_name: 工时统计
- module: production
- business_description: 生产工时、车间工时和人员加工工时统计指标草稿。
- calculation_summary: 基于 LaborDtl、JobOper、ResourceGroup 等汇总工时。
- core_tables: ["Erp.EmpBasic","Erp.JobAsmbl","Erp.JobHead","Erp.JobOper","Erp.LaborDtl","Erp.ProdGrup","Erp.ResourceGroup"]
- params: ["a","b","工单编号","工序编号","工序部门","要求完工日期大于","要求完工日期小于"]
- definition_json: {"status":"skeleton","variableParts":["a","b","工单编号","工序编号","工序部门","要求完工日期大于","要求完工日期小于"],"sourceFamilyId":"family_024"}

representative_sql preview

```sql
Select    f.Description,a.partdescription,c.OpDesc,count((c.OpCode)) sl,sum(c.ProdStandard)/count(c.OpCode) AS jhgs,sum(d.LaborHrs)/count(c.OpCode) AS jggs
from  JobOper As c
left join erp.JobAsmbl As b
on c.jobNum = b.jobNum  AND c.AssemblySeq = b.AssemblySeq AND c.Company = b.Company
left join erp.JobHead As a 
on  c.jobNum = a.jobnum AND c.company = a.company
INNER join erp.ProdGrup AS a1 ON a1.company=a.Company AND a1.ProdCode=a.ProdCode
LEFT JOIN erp.LaborDtl AS d
ON c.JobNum = d.JobNum AND c.AssemblySeq =d.AssemblySeq AND c.OprSeq =d.OprSeq AND c.Company= d.Company
left JOIN  erp."Resource" AS e 
ON e.ResourceID = d.ResourceID and e.Company = d.Company
LEFT JOIN erp.ResourceGroup AS f
ON f.ResourceGrpID = e.ResourceGrpID and f.Company = e.Company
LEFT JOIN erp.EmpBasic AS h 
ON h.EmpID = d.EmployeeNum  AND h.Company = d.Company
where c.Company = 'jctimes' and d.approveddate>='2023-01-01'AND a.JobCode ='1'AND d.JCDept IN ('ZPCJ')
and a.prodcode = '091031'
AND c.JobNum NOT LIKE '%w...
```

- notes: 需确认工时字段、重复提交处理和班组口径。

### family_036 - inventory_transaction_running_balance

- family_id: family_036
- metric_code: inventory_transaction_running_balance
- metric_name: 中国式库存记录 / 进销存
- module: inventory
- business_description: 库存进出记录、历史消耗和进销存余额指标草稿。
- calculation_summary: 基于 PartTran、Part、PartWhse 按日期范围汇总入出库和结余。
- core_tables: ["Erp.Part","Erp.PartClass","Erp.PartTran","Erp.PartWhse","Erp.ProdGrup","Erp.RcvDtl"]
- params: ["变动日期开始","变动日期结束","物料分类","物料群组","类别"]
- definition_json: {"status":"skeleton","variableParts":["变动日期开始","变动日期结束","物料分类","物料群组","类别"],"sourceFamilyId":"family_036"}

representative_sql preview

```sql
SELECT a.packslip,a.ponum,a.jobnum,a.PartNum,a.TranDate ,a.TranQty,a.trantype ,a.WareHouseCode, a.PartDescription,a.WareHouse2,a.ActTranQty,a.trannum,a.binnum,
a.entryperson,a.InvAdjReason,a.PoNum,a.poline,a.jobnum,a.tranreference,a.ordernum,a.orderline,c.Description AS pdesc,e.description AS cdesc,
case
WHEN a.TranType = 'PUR-STK' AND a.TranQty >0 THEN 'rk' 
WHEN a.TranType = 'INS-STK' AND a.TranQty >0 THEN 'rk' 
WHEN a.TranType = 'STK-MTL' AND a.TranQty <0 THEN 'rk' 
WHEN a.TranType = 'STK-STK' AND a.TranQty >0 THEN 'rk' 
WHEN a.TranType = 'DMR-STK' AND a.TranQty >0 THEN 'rk' 
WHEN a.TranType = 'PUR-STK' AND a.TranQty <0 THEN 'ck' 
WHEN a.TranType = 'STK-STK' AND a.TranQty <0 THEN 'ck' 
WHEN a.TranType = 'STK-MTL' AND a.TranQty >0 THEN 'ck' 
WHEN a.TranType = 'STK-ASM' AND a.TranQty >0 THEN 'ck' 
WHEN a.TranType = 'ADJ-QTY' and a.TranQty >0  THEN 'rdz'
WHEN a.TranType = 'ADJ-QTY' and a.TranQty <0  THEN 'cdz' 
WHEN a.TranType = 'STK-UKN'  THEN 'ck' 
WHEN a.TranType = 'STK-CUS'  THEN '...
```

- notes: 需确认期初、消耗值、财务类别和仓库范围口径。

### family_057 - production_completion_on_time_rate

- family_id: family_057
- metric_code: production_completion_on_time_rate
- metric_name: 完工及时率
- module: production
- business_description: 完工及时率、年月完工及时统计指标草稿。
- calculation_summary: 基于销售交期、工单完工和发货相关日期统计及时/延期完成。
- core_tables: ["Erp.JobHead","Erp.JobOper","Erp.JobProd","Erp.OrderDtl","Erp.OrderHed","Erp.OrderRel","Erp.PODetail","Erp.Part","Erp.Partmtl","Erp.ProdGrup","Erp.RcvDtl","Erp.SalesCat","Erp.ShipDtl","Erp.ShipHead","Erp.UserComp"]
- params: ["a","b","end","enddate","month1","start","startdate","year1"]
- definition_json: {"status":"skeleton","variableParts":["a","b","end","enddate","month1","start","startdate","year1"],"sourceFamilyId":"family_057"}

representative_sql preview

```sql
declare @a varchar(20)='2025-01-01'
declare @b varchar(20)='2025-12-21'

--- -isnull(m.days,0) 补充排除采购延期导致的传动，控制系统延期
	select a.Company,a.OrderNum,b.OrderLine,b.PartNum,a.EntryPerson,b.SalesCatID,b.Character03,a.OrderDate,b.RequestDate
	,b.LineDesc,b.OrderQty,j.Description 销售类型,h.ProdCode,i.Description 群组,u.Name,h.ClassID,c.JobNum
	into #AAA
	from OrderHed a 
	inner join OrderDtl b on a.Company=b.Company and a.OrderNum=b.OrderNum
	left join erp.JobProd c on c.Company=a.Company and c.OrderNum=a.OrderNum and c.OrderLine=B.OrderLine
	inner join erp.Part h on a.Company=h.Company and b.PartNum=h.PartNum
	inner join erp.ProdGrup i on i.Company = h.Company and h.ProdCode=i.ProdCode
	inner join erp.SalesCat j on j.Company=a.Company and j.SalesCatID=b.SalesCatID
	inner join erp.OrderRel g on  g.Company=a.Company and g.OrderNum=a.OrderNum and g.OrderLine=b.OrderLine
	inner join erp.UserComp u on u.Company=a.Company and u.DcdUserID=a.EntryPerson
	where --(convert(varchar(10),b.RequestDate,120) >=@a...
```

- notes: 及时率口径复杂，本阶段只登记草稿。

### family_059 - production_cost_detail

- family_id: family_059
- metric_code: production_cost_detail
- metric_name: 成本数据表
- module: finance
- business_description: 生产成本数据表和成本明细指标草稿。
- calculation_summary: 基于工单、工序、报工、物料事务和成本扩展表整理成本明细。
- core_tables: ["Erp.JobHead","Erp.JobOper","Erp.LaborDtl","Erp.OrderDtl","Erp.OrderHed","Erp.Part","Erp.PartClass","Erp.PartTran","Erp.ProdGrup","Erp.Qimorate","dbo.QiMoJob","dbo.QiMoJob_Exception"]
- params: ["Company","begindate","comboBox0","enddate","开始时间","结束时间"]
- definition_json: {"status":"skeleton","variableParts":["Company","begindate","comboBox0","enddate","开始时间","结束时间"],"sourceFamilyId":"family_059"}

representative_sql preview

```sql
declare @Company nvarchar(100),
@begindate datetime,
@enddate datetime
set @Company='jctimes'
set @begindate='2023-07-01'
set @enddate='2023-07-01'
${if (len(开始时间)==0,""," set @begindate ='"+开始时间+"'")}
${if (len(结束时间)==0,""," set @enddate ='"+结束时间+"'")}
 
select ttttt.*,(ttttt.[期末在制成本（物料）]A+ttttt.[期末在制成本（人工）]A+ttttt.[期末在制成本（制费）]A+ttttt.[期末在制成本（外包）]A) as '期末总在制成本' 
,(ttttt.[期末在制成本（物料）]A+ttttt.[期末在制成本（人工）]A+ttttt.[期末在制成本（制费）]A+ttttt.[期末在制成本（外包）]A
-ttttt.[期初在制成本（人工）]A-ttttt.[期初在制成本（外包）]A-ttttt.[期初在制成本（物料）]A-ttttt.[期初在制成本（制费）]A
-ttttt.本月分摊人工成本-ttttt.本月分摊制费成本
+ttttt.[关闭待结成本（人工）]A+ttttt.[关闭待结成本（物料）]A+ttttt.[关闭待结成本（外包）]A+ttttt.[关闭待结成本（制费）]A) as '本月发生额'
from (
SELECT  str(ROW_NUMBER()  Over (ORDER BY qm.company,qm.jobnum))  as '行号'
                                 ,case qm.CalcFlag when '0' then N'待计算' when 1 then N'已计算' when '-1' then N'本次不参加计算' end '物料计算标记'
                                 ,case qm.CalcFlag2 when '0' then N'待计算' when 1 then N'已计算' when '-1' then N'本次不参加计算' end '人工/制费/外包计算标记'...
```

- notes: 成本敏感且口径复杂，本阶段只登记草稿，不生成可执行模板。

### finance_skeleton_summary - finance_summary

- family_id: finance_skeleton_summary
- metric_code: finance_summary
- metric_name: 财务汇总骨架模板
- module: finance
- business_description: 按时间和可选维度汇总收入、成本、税额、应收、实收等财务指标。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_summary","variableParts":["timeRange","dimensions","filters"],"amountExpressions":{"revenueGross":"CASE WHEN Erp.InvcDtl.TaxRegionCode <> '' THEN Erp.InvcDtl.DocInUnitPrice * Erp.InvcDtl.SellingShipQty ELSE Erp.InvcDtl.DocExtPrice END","revenueNet":"(CASE WHEN Erp.InvcDtl.TaxRegionCode <> '' THEN Erp.InvcDtl.DocInUnitPrice * Erp.InvcDtl.SellingShipQty ELSE Erp.InvcDtl.DocExtPrice END) / 1.13","taxAmount":"gross amount - net amount","costAmount":"Erp.PartTran.MtlUnitCost + Erp.PartTran.LbrUnitCost + Erp.PartTran.SubUnitCost + Erp.PartTran.BurUnitCost"},"timeField":"Erp.InvcHead.ApplyDate","statusFilter":"invoice lines joined through Erp.InvcHead; approval/posting status must be confirmed before approval","taxPolicy":"default split gross/net by 1.13 when TaxRegionCode is present; business must confirm rate exceptions","refundPolicy":"do not deduct RMA/refund until refund/writeoff definition is approved","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.PartTran","Erp.OrderDtl","Erp.OrderHed","Erp.Customer","Erp.ProdGrup"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.DocExtPrice","InvcDtl.DocInUnitPrice","InvcDtl.SellingShipQty","InvcDtl.TaxRegionCode"],"allowedDimensions":["Company","年月","客户","地区","事业部","产品","销售分类","行业分类"],"allowedFilters":["timeRange","companyScope","customerName","division","productGroup","salesCategory","industryCategory"],"detailPreAggregation":true,"evidence":["dataset 4462 收入统计表-圆模","dataset 4463 收入统计表-平模+配件","search-finance-income-tax.json"],"approvalBlockers":["确认是否用 ApplyDate 还是 InvoiceDate","确认 1.13 税率是否适用于所有收入","确认 Posted/OpenInvoice/void 状态过滤"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_detail - finance_detail

- family_id: finance_skeleton_detail
- metric_code: finance_detail
- metric_name: 财务明细骨架模板
- module: finance
- business_description: 输出发票、收款、退款、冲销、凭证或成本明细，保留业务单号和状态字段。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","orderBy","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_detail","variableParts":["timeRange","dimensions","filters","orderBy","limit"],"detailGrain":"one row per invoice line unless user asks invoice header summary","amountExpressions":{"lineGross":"CASE WHEN Erp.InvcDtl.TaxRegionCode <> '' THEN Erp.InvcDtl.DocInUnitPrice * Erp.InvcDtl.SellingShipQty ELSE Erp.InvcDtl.DocExtPrice END","lineNet":"(CASE WHEN Erp.InvcDtl.TaxRegionCode <> '' THEN Erp.InvcDtl.DocInUnitPrice * Erp.InvcDtl.SellingShipQty ELSE Erp.InvcDtl.DocExtPrice END) / 1.13"},"timeField":"Erp.InvcHead.ApplyDate","statusFilter":"invoice status must be confirmed before approval","taxPolicy":"reuse finance_summary gross/net policy","refundPolicy":"show refund/writeoff columns only after joining approved refund/writeoff definition","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.OrderDtl","Erp.OrderHed","Erp.Customer","Erp.ProdGrup","Erp.RMADtl","Erp.RMAHead"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.InvoiceLine","InvcDtl.OrderNum","InvcDtl.OrderLine","InvcDtl.PartNum","InvcDtl.DocExtPrice"],"allowedDimensions":["Company","年月","客户","发票","订单","物料","事业部","销售分类"],"allowedFilters":["timeRange","companyScope","customerName","invoiceNum","orderNum","partNum","division"],"orderByPolicy":"only use requested orderBy; default InvcHead.ApplyDate desc, InvoiceNum desc","limitPolicy":"default TOP 100; user limit may lower or raise within guard limit","detailPreAggregation":false,"evidence":["dataset 4462 收入统计表-圆模","dataset 4463 收入统计表-平模+配件","search-finance-income-tax.json"],"approvalBlockers":["确认发票状态过滤","确认税率例外","确认是否需要隐藏未过账发票"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_period_compare - finance_period_compare

- family_id: finance_skeleton_period_compare
- metric_code: finance_period_compare
- metric_name: 同比 / 环比骨架模板
- module: finance
- business_description: 按日、月、季度或年比较本期、上期、同期金额和变动率。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","comparePeriod","dimensions","filters"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_period_compare","variableParts":["timeRange","comparePeriod","dimensions","filters"],"baseMetric":"finance_summary.revenueNet or explicitly requested amount expression","timeField":"Erp.InvcHead.ApplyDate","comparePolicy":"period is derived from ApplyDate; month-over-month uses previous same-length period; year-over-year uses same period last year","amountExpression":"finance_summary.amountExpressions.revenueNet","statusFilter":"reuse finance_summary status filter after approval","taxPolicy":"reuse finance_summary gross/net policy","refundPolicy":"do not deduct refunds unless requested and approved refund/writeoff definition is available","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.DocExtPrice","InvcDtl.DocInUnitPrice","InvcDtl.SellingShipQty","InvcDtl.TaxRegionCode"],"allowedDimensions":["Company","年月","客户","地区","事业部","产品","销售分类","行业分类"],"allowedFilters":["timeRange","comparePeriod","companyScope","customerName","division","productGroup","salesCategory"],"outputMeasures":["currentAmount","previousAmount","deltaAmount","deltaRate"],"detailPreAggregation":true,"evidence":["dataset 4462 收入统计表-圆模","dataset 4463 收入统计表-平模+配件"],"approvalBlockers":["确认同比/环比默认周期","确认跨年财务期间是否按自然月","确认发票状态过滤"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_group_ranking - finance_group_ranking

- family_id: finance_skeleton_group_ranking
- metric_code: finance_group_ranking
- metric_name: 分组排行骨架模板
- module: finance
- business_description: 按客户、供应商、部门、业务员、产品或项目分组排行财务金额。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","orderBy","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_group_ranking","variableParts":["timeRange","dimensions","filters","orderBy","limit"],"baseMetric":"finance_summary.revenueNet unless user asks gross, tax, cost, receivable, refund, or margin","timeField":"Erp.InvcHead.ApplyDate","amountExpression":"finance_summary.amountExpressions.revenueNet","statusFilter":"reuse finance_summary status filter after approval","taxPolicy":"reuse finance_summary gross/net policy","refundPolicy":"do not deduct refunds unless requested and approved refund/writeoff definition is available","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.OrderDtl","Erp.OrderHed","Erp.Customer","Erp.ProdGrup"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.DocExtPrice","InvcDtl.DocInUnitPrice","InvcDtl.SellingShipQty"],"allowedDimensions":["客户","地区","事业部","产品","销售分类","行业分类","Company","年月"],"allowedFilters":["timeRange","companyScope","customerName","division","productGroup","salesCategory","industryCategory"],"orderByPolicy":"default amount desc; support amount asc only when user asks bottom ranking","limitPolicy":"default TOP 10 for ranking; user limit may override within guard limit","detailPreAggregation":true,"evidence":["dataset 4462 收入统计表-圆模","dataset 4463 收入统计表-平模+配件"],"approvalBlockers":["确认客户/地区/事业部维度字段来源","确认默认排序指标","确认发票状态过滤"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_exception_check - finance_exception_check

- family_id: finance_skeleton_exception_check
- metric_code: finance_exception_check
- metric_name: 异常核对骨架模板
- module: finance
- business_description: 核对负数金额、未过账、状态异常、金额为零、日期缺失和重复业务单据。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","exceptionRules","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_exception_check","variableParts":["timeRange","dimensions","filters","exceptionRules","limit"],"defaultExceptionRules":["missing_time_field","zero_or_negative_amount","missing_invoice_number","duplicate_invoice_line_key","tax_region_without_tax_split"],"timeField":"Erp.InvcHead.ApplyDate","amountExpression":"finance_summary.amountExpressions.revenueGross","statusFilter":"include suspicious status rows for audit; do not use as financial total","taxPolicy":"flag TaxRegionCode rows where gross/net split cannot be explained","refundPolicy":"flag RMA/refund joins separately; do not net into invoice totals","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.RMADtl","Erp.RMAHead"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.InvoiceLine","InvcDtl.DocExtPrice","InvcDtl.TaxRegionCode"],"allowedDimensions":["Company","年月","客户","发票","订单","事业部"],"allowedFilters":["timeRange","companyScope","customerName","invoiceNum","orderNum","exceptionRules"],"detailPreAggregation":false,"evidence":["dataset 4462 收入统计表-圆模","dataset 4868 应收/实收/退款 reference"],"approvalBlockers":["确认发票状态字段后增加 posted/open/void 异常","确认重复行 key","确认异常阈值"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_ar_cash_diff - finance_ar_cash_diff

- family_id: finance_skeleton_ar_cash_diff
- metric_code: finance_ar_cash_diff
- metric_name: 应收实收差异骨架模板
- module: finance
- business_description: 对比应收、已收、未收、退款和冲销差异，保留客户、发票、收款状态。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","tolerance","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_ar_cash_diff","variableParts":["timeRange","dimensions","filters","tolerance","limit"],"receivableExpression":"invoice gross/net amount from Erp.InvcHead + Erp.InvcDtl","receivedExpression":"payment/receipt amount not confirmed in available references","differenceExpression":"receivable - received - approved refunds/writeoffs","timeField":"Erp.InvcHead.ApplyDate","statusFilter":"invoice status and payment status must be confirmed before approval","taxPolicy":"reuse finance_summary gross/net policy","refundPolicy":"deduct only rows matched to approved refund/writeoff definition","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.RMADtl","Erp.RMAHead","Erp.OrderDtl","Erp.OrderHed","Erp.Customer"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.OrderNum","InvcDtl.OrderLine","InvcDtl.DocExtPrice"],"allowedDimensions":["Company","年月","客户","发票","订单","事业部"],"allowedFilters":["timeRange","companyScope","customerName","invoiceNum","orderNum","tolerance"],"detailPreAggregation":true,"evidence":["dataset 4868 应收/实收/退款 reference","dataset 4888 应收/实收/退款 reference","sql-reference-strict-audit.json"],"approvalBlockers":["确认实收表和收款字段","确认冲销如何关联发票/订单","确认容差默认值"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_refund_writeoff - finance_refund_writeoff

- family_id: finance_skeleton_refund_writeoff
- metric_code: finance_refund_writeoff
- metric_name: 退款 / 冲销骨架模板
- module: finance
- business_description: 汇总或明细查询退款、贷项、冲销和红字金额，明确税退款口径。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","orderBy","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_refund_writeoff","variableParts":["timeRange","dimensions","filters","orderBy","limit"],"refundExpression":"amount from Erp.RMADtl/Erp.RMAHead joined back to invoice/order context when available","writeoffExpression":"writeoff/credit memo amount not confirmed in available references","timeField":"refund/RMA date not confirmed; fallback to related Erp.InvcHead.ApplyDate before approval is not allowed","statusFilter":"only approved/posted refund or writeoff rows after business confirmation","taxPolicy":"must state gross/net treatment explicitly per query","refundPolicy":"refunds and writeoffs are separate measures; do not merge unless requested","requiredTables":["Erp.RMADtl","Erp.RMAHead"],"optionalTables":["Erp.InvcHead","Erp.InvcDtl","Erp.OrderDtl","Erp.OrderHed","Erp.Customer"],"requiredFields":["RMADtl.Company","RMADtl.RMANum","RMAHead.Company","RMAHead.RMANum"],"allowedDimensions":["Company","年月","客户","订单","发票","退款单"],"allowedFilters":["timeRange","companyScope","customerName","invoiceNum","orderNum"],"detailPreAggregation":true,"evidence":["dataset 4868 includes Erp.RMADtl","dataset 4888 includes Erp.RMADtl/Erp.RMAHead","sql-reference-strict-audit.json"],"approvalBlockers":["确认 RMA 金额字段","确认冲销/贷项表和字段","确认退款日期字段"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

### finance_skeleton_join_metric - finance_join_metric

- family_id: finance_skeleton_join_metric
- metric_code: finance_join_metric
- metric_name: 多表 join 指标骨架模板
- module: finance
- business_description: 先在明细表预聚合金额，再 join 主数据或业务维度表生成跨表财务指标。
- calculation_summary: 财务骨架模板：只固定高风险问题 family 和可变槽位，不自动生成可执行 SQL。
- core_tables: []
- params: ["timeRange","dimensions","filters","joinKeys","orderBy","limit"]
- definition_json: {"requiredControls":["timeField","amountField","statusFilter","taxRefundPolicy"],"outputControls":["时间字段","金额字段","状态过滤","税退款口径"],"executionPolicy":"draft_only_until_business_approval","status":"draft_definition","templateFamily":"finance_join_metric","variableParts":["timeRange","dimensions","filters","joinKeys","orderBy","limit"],"baseMetric":"finance_summary amount expressions pre-aggregated by invoice/order keys before joining dimensions","timeField":"Erp.InvcHead.ApplyDate","amountExpression":"finance_summary.amountExpressions.revenueNet","statusFilter":"reuse finance_summary status filter after approval","taxPolicy":"reuse finance_summary gross/net policy","refundPolicy":"join approved refund/writeoff aggregate separately; never multiply invoice rows by joining detail directly","requiredTables":["Erp.InvcHead","Erp.InvcDtl"],"optionalTables":["Erp.OrderDtl","Erp.OrderHed","Erp.Customer","Erp.ProdGrup","Erp.PartTran","Erp.RMADtl","Erp.RMAHead"],"requiredFields":["InvcHead.Company","InvcHead.InvoiceNum","InvcHead.ApplyDate","InvcDtl.OrderNum","InvcDtl.OrderLine","InvcDtl.DocExtPrice"],"allowedJoinKeys":["Company + InvoiceNum","Company + OrderNum + OrderLine","Company + PartNum","Company + CustNum"],"allowedDimensions":["客户","订单","物料","地区","事业部","产品","销售分类","行业分类"],"allowedFilters":["timeRange","companyScope","customerName","orderNum","partNum","division","productGroup"],"detailPreAggregation":true,"evidence":["dataset 4462 收入统计表-圆模 joins invoice/order/customer/product/cost","dataset 4888 joins invoice/RMA/order/customer"],"approvalBlockers":["确认每个 join key 的基数","确认成本表 PartTran 的取数窗口","确认 RMA 聚合粒度"]}

representative_sql preview

```sql

```

- notes: finance skeleton metric draft; keep LLM flexible inside listed variable parts; not executable until approved with concrete definition_json

## Guard Checklist

- [ ] dry-run review completed
- [ ] no template is approved automatically
- [ ] no ERP report SQL was executed
- [ ] no reference or metric family enters erp_query_templates

## Apply Command

```bash
npm run sql-family:promote-assets -- --classification=tmp/sql-family-business-usability-classification.json --business-samples=tmp/sql-family-business-samples.json --apply
```
