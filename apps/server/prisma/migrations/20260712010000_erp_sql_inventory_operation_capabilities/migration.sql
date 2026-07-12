-- Additive publication for schema-verified operation/labor read-only capabilities.
-- inventory.safety_stock deliberately remains unpublished: SafetyQty has no approved executable evidence.

INSERT INTO "erp_agent"."erp_query_templates" (
  "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
  "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
  "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
  "guard_passed", "approved", "approval_status", "approved_by", "approved_at", "notes", "updated_at"
) VALUES (
  '工序字典查询',
  'operation_master_lookup',
  'production_master_data',
  '查询 OpMaster 工序代码和名称',
  '工序字典 OpMaster family_038',
  '{"intent":"operation_master_lookup","module":"production_master_data","sourceFamilyId":"family_038","params":{"optional":["companyScope","opCode","opDescription"]},"guard":{"valid":true,"source":"20260712010000_erp_sql_inventory_operation_capabilities"}}'::jsonb,
  $sql$SELECT TOP 100
  om.Company AS [公司],
  om.OpCode AS [工序编码],
  om.OpDesc AS [工序名称]
FROM Erp.OpMaster om
WHERE (@companyScope IS NULL OR om.Company = @companyScope)
  AND (@opCode IS NULL OR om.OpCode = @opCode)
  AND (@opDescription IS NULL OR om.OpDesc LIKE CONCAT('%', @opDescription, '%'))
ORDER BY om.Company, om.OpCode$sql$,
  '{}'::jsonb,
  '{"companyScope":{"type":"string"},"opCode":{"type":"string"},"opDescription":{"type":"string"}}'::jsonb,
  '["Erp.OpMaster"]'::jsonb,
  '["Company","OpCode","OpDesc"]'::jsonb,
  '[]'::jsonb,
  'verified_erp',
  'family_038',
  '[]'::jsonb,
  '["工序字典"]'::jsonb,
  '[]'::jsonb,
  TRUE, TRUE, 'approved', 'system:migration', CURRENT_TIMESTAMP,
  'Approved OpMaster read-only dictionary. The unverified OpMaster.Void field is intentionally excluded.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("source_family_id", "intent") WHERE "source_family_id" IS NOT NULL DO UPDATE SET
  "sql_template" = excluded."sql_template",
  "query_plan_json" = excluded."query_plan_json",
  "optional_params" = excluded."optional_params",
  "tables" = excluded."tables",
  "fields" = excluded."fields",
  "joins" = excluded."joins",
  "source_type" = excluded."source_type",
  "guard_passed" = TRUE,
  "approved" = TRUE,
  "approval_status" = 'approved',
  "approved_by" = excluded."approved_by",
  "approved_at" = COALESCE("erp_agent"."erp_query_templates"."approved_at", CURRENT_TIMESTAMP),
  "notes" = excluded."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "erp_agent"."erp_sql_governed_assets" (
  "asset_key", "asset_type", "version", "status", "owner_role", "approval_status", "use_level",
  "effective_from", "definition_json", "evidence_json", "updated_at"
) VALUES
  ('capability.operation.labor_reporting', 'capability', '2026-07-12.operation.v1', 'approved', 'production_owner', 'approved', 'production_exact', CURRENT_TIMESTAMP,
   '{"families":["family_092"],"tables":["Erp.LaborDtl"],"companyPolicy":"LaborDtl.Company","limitPolicy":"TOP 100"}'::jsonb,
   '["20260710030000_erp_golden_family_fast_paths","real ERP readonly compile/execution"]'::jsonb, CURRENT_TIMESTAMP),
  ('capability.operation.resource_group', 'capability', '2026-07-12.operation.v1', 'approved', 'production_owner', 'approved', 'production_exact', CURRENT_TIMESTAMP,
   '{"families":["family_014","family_092"],"tables":["Erp.LaborDtl","Erp.JCDept"],"join":"LaborDtl.Company + JCDept -> JCDept.Company + JCDept","forbiddenTables":["Erp.QiMoJob","Erp.ResourceGroup"],"limitPolicy":"TOP 100"}'::jsonb,
   '["20260710030000_erp_golden_family_fast_paths","real ERP readonly compile/execution"]'::jsonb, CURRENT_TIMESTAMP),
  ('capability.operation.master_data', 'capability', '2026-07-12.operation.v1', 'approved', 'production_owner', 'approved', 'production_exact', CURRENT_TIMESTAMP,
   '{"families":["family_038"],"tables":["Erp.OpMaster"],"fields":["Company","OpCode","OpDesc"],"forbiddenFields":["Void"],"limitPolicy":"TOP 100"}'::jsonb,
   '["schema metadata","real ERP readonly compile/execution"]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("asset_key") DO UPDATE SET
  "version" = excluded."version",
  "status" = excluded."status",
  "approval_status" = excluded."approval_status",
  "use_level" = excluded."use_level",
  "definition_json" = excluded."definition_json",
  "evidence_json" = excluded."evidence_json",
  "updated_at" = CURRENT_TIMESTAMP;
