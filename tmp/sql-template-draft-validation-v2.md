# SQL Template Draft Validation

## Summary

- templateCount: 5
- schemaPassCount: 5
- compilePassCount: 4
- samplePassCount: 0
- failedCount: 1

## Templates

### family_050 - 库存明细查询

- schema: pass
- compile: pass
- sample: skipped
- recommendation: ready_for_draft_apply

Missing columns:

- none

### family_062 - 采购到货跟踪查询

- schema: pass
- compile: fail - Internal Server Error
- sample: skipped
- recommendation: needs_template_fix

Missing columns:

- none

Compile debug:

- familyId: family_062
- templateName: 采购到货跟踪查询
- compileStatus: fail
- rawExecutorStatusCode: 500
- rawExecutorErrorMessage: Internal Server Error
- sqlServerErrorNumber: 
- sqlServerErrorState: 
- sqlServerErrorLine: 
- sqlServerErrorProcedure: 
- sqlServerErrorServerName: 
- validationMode: compile_top_0_wrapped_select
- rawExecutorResponseBody: "Internal Server Error"

parameterSubstitutions:

```json
{
  "@companyScope": "'jctimes'",
  "@poNum": "NULL",
  "@vendorName": "NULL",
  "@buyerName": "NULL",
  "@partNum": "NULL",
  "@dueDateFrom": "NULL",
  "@dueDateTo": "NULL",
  "@receiptDateFrom": "NULL",
  "@receiptDateTo": "NULL",
  "@onlyOpen": "0",
  "@onlyDelayed": "0",
  "@daysBeforeDue": "NULL"
}
```

expandedCompileSql:

```sql
SELECT TOP 0 * FROM (
SELECT
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
WHERE ('jctimes' IS NULL OR poh.Company = 'jctimes')
  AND (NULL IS NULL OR poh.PONum = NULL)
  AND (NULL IS NULL OR v.Name LIKE CONCAT('%', NULL, '%'))
  AND (NULL IS NULL OR pa.Name LIKE CONCAT('%', NULL, '%'))
  AND (NULL IS NULL OR pod.PartNum = NULL)
  AND (NULL IS NULL OR COALESCE(por.PromiseDt, por.DueDate) >= NULL)
  AND (NULL IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= NULL)
  AND (NULL IS NULL OR rcv.LastReceiptDate >= NULL)
  AND (NULL IS NULL OR rcv.LastReceiptDate <= NULL)
  AND (0 = 0 OR COALESCE(rcv.ReceivedQty, 0) < por.XRelQty)
  AND (0 = 0 OR (COALESCE(rcv.ReceivedQty, 0) < por.XRelQty AND COALESCE(por.PromiseDt, por.DueDate) < CAST(GETDATE() AS date)))
  AND (NULL IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= DATEADD(day, NULL, CAST(GETDATE() AS date)))
) AS draft_validate
```


### family_076 - 工单物料需求查询

- schema: pass
- compile: pass
- sample: skipped
- recommendation: ready_for_draft_apply

Missing columns:

- none

### family_016 - 销售订单明细查询

- schema: pass
- compile: pass
- sample: skipped
- recommendation: ready_for_draft_apply

Missing columns:

- none

### family_037 - 发货通知明细查询

- schema: pass
- compile: pass
- sample: skipped
- recommendation: ready_for_draft_apply

Missing columns:

- none

## Missing Columns

- none

## Suggested Fixes

- Fix templates only after checking missing columns and compile errors against ERP schema.
- Keep failed templates as draft/reference until schema mapping is resolved.

