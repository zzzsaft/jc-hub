UPDATE "erp_agent"."erp_query_templates"
SET
  "approved" = FALSE,
  "guard_passed" = FALSE,
  "approval_status" = 'retired',
  "notes" = 'Retired by 20260710030000: family_092 now uses LaborDtl report details; resource-group dictionaries belong to family_014.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "source_family_id" = 'family_092'
  AND "intent" = 'labor_resource_group_lookup';

INSERT INTO "erp_agent"."erp_query_templates" (
  "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
  "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
  "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
  "guard_passed", "approved", "approval_status", "approved_by", "approved_at", "notes", "updated_at"
)
VALUES
(
  '库存库位明细查询',
  'inventory_stock_detail',
  'inventory',
  '库存明细、库位库存、现有库存、按物料仓库库位查询',
  '库存库位明细查询 family_050 PartBin PartWhse',
  $json${
    "intent": "inventory_stock_detail",
    "module": "inventory",
    "sourceFamilyId": "family_050",
    "params": { "optional": ["companyScope", "partNum", "partDescription", "warehouseCode", "binNum", "prodCode", "onlyNonZeroStock"] },
    "filters": ["PartNum", "PartDescription", "WarehouseCode", "BinNum", "ProdCode", "OnhandQty"],
    "guard": { "valid": true, "source": "20260710030000_erp_golden_family_fast_paths" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  pb.Company AS [公司],
  pb.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  p.ProdCode AS [产品群组],
  pb.WarehouseCode AS [仓库],
  wh.Description AS [仓库名称],
  pb.BinNum AS [库位],
  wb.Description AS [库位描述],
  pb.LotNum AS [批号],
  pw.OnHandQty AS [仓库现存量],
  pb.OnhandQty AS [库位现存量],
  COALESCE(pb.OnhandQty, 0)
    - COALESCE(pb.AllocatedQty, 0)
    - COALESCE(pb.JobAllocatedQty, 0)
    - COALESCE(pb.SalesAllocatedQty, 0)
    - COALESCE(pb.TFOrdAllocatedQty, 0) AS [库位可用量]
FROM Erp.PartBin pb
INNER JOIN Erp.Part p ON p.Company = pb.Company AND p.PartNum = pb.PartNum
LEFT JOIN Erp.PartWhse pw ON pw.Company = pb.Company AND pw.PartNum = pb.PartNum AND pw.WarehouseCode = pb.WarehouseCode
LEFT JOIN Erp.Warehse wh ON wh.Company = pb.Company AND wh.WarehouseCode = pb.WarehouseCode
LEFT JOIN Erp.WhseBin wb ON wb.Company = pb.Company AND wb.WarehouseCode = pb.WarehouseCode AND wb.BinNum = pb.BinNum
WHERE (@companyScope IS NULL OR pb.Company = @companyScope)
  AND (@partNum IS NULL OR pb.PartNum = @partNum)
  AND (@partDescription IS NULL OR p.PartDescription LIKE CONCAT('%', @partDescription, '%'))
  AND (@warehouseCode IS NULL OR pb.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@onlyNonZeroStock = 0 OR pb.OnhandQty <> 0)
ORDER BY pb.PartNum, pb.WarehouseCode, pb.BinNum, pb.LotNum$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "partNum": {"type": "string"},
    "partDescription": {"type": "string"},
    "warehouseCode": {"type": "string"},
    "binNum": {"type": "string"},
    "prodCode": {"type": "string"},
    "onlyNonZeroStock": {"type": "boolean"}
  }'::jsonb,
  '["Erp.PartBin", "Erp.Part", "Erp.PartWhse", "Erp.Warehse", "Erp.WhseBin"]'::jsonb,
  '["Company", "PartNum", "PartDescription", "ProdCode", "WarehouseCode", "Description", "BinNum", "LotNum", "OnHandQty", "OnhandQty", "AllocatedQty", "JobAllocatedQty", "SalesAllocatedQty", "TFOrdAllocatedQty"]'::jsonb,
  '["PartBin -> Part", "PartBin -> PartWhse", "PartBin -> Warehse", "PartBin -> WhseBin"]'::jsonb,
  'verified_erp',
  'family_050',
  '[]'::jsonb,
  '["库存明细"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved ordinary stock/bin detail fast path. Safety-stock and aging/stale questions must use family_089.',
  CURRENT_TIMESTAMP
),
(
  '工单物料需求缺料查询',
  'job_material_requirement_shortage',
  'production_inventory',
  '工单物料需求、缺料、未发料、已领未领、需求数量',
  '工单物料需求缺料查询 family_076 JobMtl JobHead',
  $json${
    "intent": "job_material_requirement_shortage",
    "module": "production_inventory",
    "sourceFamilyId": "family_076",
    "params": { "optional": ["companyScope", "jobNum", "partNum", "parentPartNum", "warehouseCode", "fromDate", "dueBeforeDate", "onlyShortage", "onlyOpen"] },
    "filters": ["JobNum", "PartNum", "RequiredQty", "IssuedQty", "IssuedComplete", "ReqDate", "JobClosed", "JobComplete"],
    "guard": { "valid": true, "source": "20260710030000_erp_golden_family_fast_paths" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  jm.Company AS [公司],
  jm.JobNum AS [工单号],
  jm.AssemblySeq AS [装配序号],
  jm.MtlSeq AS [物料序号],
  jh.PartNum AS [工单产品],
  jm.PartNum AS [需求物料],
  jm.Description AS [物料描述],
  jm.RequiredQty AS [需求数量],
  jm.IssuedQty AS [已领数量],
  jm.RequiredQty - jm.IssuedQty AS [未领数量],
  jm.IssuedComplete AS [是否发齐],
  jm.ReqDate AS [需求日期],
  jm.WarehouseCode AS [仓库],
  p.IUM AS [库存单位],
  jh.JobReleased AS [工单已下达],
  jh.JobComplete AS [工单已完工],
  jh.JobClosed AS [工单已关闭]
FROM Erp.JobMtl jm
INNER JOIN Erp.JobHead jh ON jh.Company = jm.Company AND jh.JobNum = jm.JobNum
LEFT JOIN Erp.Part p ON p.Company = jm.Company AND p.PartNum = jm.PartNum
WHERE (@companyScope IS NULL OR jm.Company = @companyScope)
  AND (@jobNum IS NULL OR jm.JobNum = @jobNum)
  AND (@partNum IS NULL OR jm.PartNum = @partNum)
  AND (@parentPartNum IS NULL OR jh.PartNum = @parentPartNum)
  AND (@warehouseCode IS NULL OR jm.WarehouseCode = @warehouseCode)
  AND (@fromDate IS NULL OR jm.ReqDate >= @fromDate)
  AND (@dueBeforeDate IS NULL OR jm.ReqDate <= @dueBeforeDate)
  AND (@onlyShortage = 0 OR (jm.RequiredQty > jm.IssuedQty AND jm.IssuedComplete = 0))
  AND (@onlyOpen = 0 OR (jh.JobClosed = 0 AND jh.JobComplete = 0))
ORDER BY jm.ReqDate, jm.JobNum, jm.AssemblySeq, jm.MtlSeq$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "jobNum": {"type": "string"},
    "partNum": {"type": "string"},
    "parentPartNum": {"type": "string"},
    "warehouseCode": {"type": "string"},
    "fromDate": {"type": "string"},
    "dueBeforeDate": {"type": "string"},
    "onlyShortage": {"type": "boolean"},
    "onlyOpen": {"type": "boolean"}
  }'::jsonb,
  '["Erp.JobMtl", "Erp.JobHead", "Erp.Part"]'::jsonb,
  '["Company", "JobNum", "AssemblySeq", "MtlSeq", "PartNum", "Description", "RequiredQty", "IssuedQty", "IssuedComplete", "ReqDate", "WarehouseCode", "IUM", "JobReleased", "JobComplete", "JobClosed"]'::jsonb,
  '["JobMtl -> JobHead", "JobMtl -> Part"]'::jsonb,
  'verified_erp',
  'family_076',
  '[]'::jsonb,
  '["工单物料需求", "缺料明细"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved JobMtl shortage detail fast path; RequiredQty-IssuedQty is operational remaining issue quantity.',
  CURRENT_TIMESTAMP
),
(
  '报工班组资源组辅助字典',
  'department_resource_group_lookup',
  'production_master_data',
  '班组、资源群组、资源组、部门、加工中心辅助字典',
  '报工班组资源组辅助字典 family_014 LaborDtl JCDept',
  $json${
    "intent": "department_resource_group_lookup",
    "module": "production_master_data",
    "sourceFamilyId": "family_014",
    "params": { "optional": ["companyScope", "departmentName", "resourceGroupId"] },
    "filters": ["JCDept", "ResourceGrpID", "Description"],
    "guard": { "valid": true, "source": "20260710030000_erp_golden_family_fast_paths" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  ld.Company AS [公司],
  ld.JCDept AS [部门编号],
  d.Description AS [部门名称],
  ld.ResourceGrpID AS [资源群组],
  COUNT(DISTINCT ld.ResourceID) AS [已报工资源数]
FROM Erp.LaborDtl ld
LEFT JOIN Erp.JCDept d ON d.Company = ld.Company AND d.JCDept = ld.JCDept
WHERE (@companyScope IS NULL OR ld.Company = @companyScope)
  AND (@departmentName IS NULL OR d.Description LIKE CONCAT('%', @departmentName, '%') OR ld.JCDept = @departmentName)
  AND (@resourceGroupId IS NULL OR ld.ResourceGrpID = @resourceGroupId)
  AND ld.ResourceGrpID IS NOT NULL
  AND ld.ResourceGrpID <> ''
GROUP BY ld.Company, ld.JCDept, d.Description, ld.ResourceGrpID
ORDER BY ld.Company, d.Description, ld.ResourceGrpID$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "departmentName": {"type": "string"},
    "resourceGroupId": {"type": "string"}
  }'::jsonb,
  '["Erp.LaborDtl", "Erp.JCDept"]'::jsonb,
  '["Company", "JCDept", "Description", "ResourceGrpID", "ResourceID"]'::jsonb,
  '["LaborDtl.JCDept -> JCDept.JCDept"]'::jsonb,
  'verified_erp',
  'family_014',
  '[]'::jsonb,
  '["报工资源群组辅助字典"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Observed labor resource-group dictionary. It intentionally avoids QiMoJob and ResourceGroup; groups without labor history are not included.',
  CURRENT_TIMESTAMP
),
(
  '工单报工明细查询',
  'labor_detail_lookup',
  'production',
  '报工明细、员工报工记录、工单工时、按资源群组查看报工',
  '工单报工明细查询 family_092 LaborDtl',
  $json${
    "intent": "labor_detail_lookup",
    "module": "production",
    "sourceFamilyId": "family_092",
    "params": { "optional": ["companyScope", "jobNum", "employeeNum", "resourceGroupId", "departmentName", "fromDate", "dueBeforeDate"] },
    "filters": ["JobNum", "EmployeeNum", "ResourceGrpID", "JCDept", "ClockInDate"],
    "guard": { "valid": true, "source": "20260710030000_erp_golden_family_fast_paths" }
  }$json$::jsonb,
  $sql$SELECT TOP 100
  ld.Company AS [公司],
  ld.LaborHedSeq AS [报工头序号],
  ld.LaborDtlSeq AS [报工明细序号],
  ld.EmployeeNum AS [员工编号],
  ld.JobNum AS [工单号],
  ld.AssemblySeq AS [装配序号],
  ld.OprSeq AS [工序序号],
  ld.OpCode AS [工序代码],
  ld.ResourceGrpID AS [资源群组],
  ld.ResourceID AS [资源],
  ld.JCDept AS [部门班组],
  ld.ClockInDate AS [报工日期],
  ld.LaborType AS [报工类型],
  ld.LaborHrs AS [人工工时],
  ld.BurdenHrs AS [制造工时],
  ld.LaborQty AS [报工数量],
  ld.ScrapQty AS [报废数量],
  ld.Complete AS [是否完成]
FROM Erp.LaborDtl ld
WHERE (@companyScope IS NULL OR ld.Company = @companyScope)
  AND (@jobNum IS NULL OR ld.JobNum = @jobNum)
  AND (@employeeNum IS NULL OR ld.EmployeeNum = @employeeNum)
  AND (@resourceGroupId IS NULL OR ld.ResourceGrpID = @resourceGroupId)
  AND (@departmentName IS NULL OR ld.JCDept = @departmentName)
  AND (@fromDate IS NULL OR ld.ClockInDate >= @fromDate)
  AND (@dueBeforeDate IS NULL OR ld.ClockInDate <= @dueBeforeDate)
  AND ld.ClockInDate >= '20000101'
  AND ld.ClockInDate < DATEADD(year, 1, CAST(GETDATE() AS date))
ORDER BY ld.ClockInDate DESC, ld.LaborHedSeq DESC, ld.LaborDtlSeq DESC$sql$,
  '{}'::jsonb,
  '{
    "companyScope": {"type": "string"},
    "jobNum": {"type": "string"},
    "employeeNum": {"type": "string"},
    "resourceGroupId": {"type": "string"},
    "departmentName": {"type": "string"},
    "fromDate": {"type": "string"},
    "dueBeforeDate": {"type": "string"}
  }'::jsonb,
  '["Erp.LaborDtl"]'::jsonb,
  '["Company", "LaborHedSeq", "LaborDtlSeq", "EmployeeNum", "JobNum", "AssemblySeq", "OprSeq", "OpCode", "ResourceGrpID", "ResourceID", "JCDept", "ClockInDate", "LaborType", "LaborHrs", "BurdenHrs", "LaborQty", "ScrapQty", "Complete"]'::jsonb,
  '[]'::jsonb,
  'verified_erp',
  'family_092',
  '[]'::jsonb,
  '["报工明细"]'::jsonb,
  '[]'::jsonb,
  TRUE,
  TRUE,
  'approved',
  'system:migration',
  CURRENT_TIMESTAMP,
  'Approved LaborDtl report-detail fast path. It intentionally avoids QiMoJob and ResourceGroup.',
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
