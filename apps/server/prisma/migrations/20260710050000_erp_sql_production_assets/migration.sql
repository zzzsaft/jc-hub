CREATE TABLE IF NOT EXISTS "erp_agent"."erp_sql_governed_assets" (
  "id" BIGSERIAL PRIMARY KEY,
  "asset_key" VARCHAR(160) NOT NULL,
  "asset_type" VARCHAR(60) NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "owner_role" VARCHAR(120) NOT NULL,
  "approval_status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "use_level" VARCHAR(60) NOT NULL DEFAULT 'validation_only',
  "effective_from" TIMESTAMP(6),
  "effective_to" TIMESTAMP(6),
  "definition_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "evidence_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_sql_governed_assets_asset_key_key"
  ON "erp_agent"."erp_sql_governed_assets"("asset_key");

CREATE INDEX IF NOT EXISTS "erp_sql_governed_assets_type_status_idx"
  ON "erp_agent"."erp_sql_governed_assets"("asset_type", "approval_status", "use_level");

CREATE TABLE IF NOT EXISTS "erp_agent"."erp_schema_snapshots" (
  "id" BIGSERIAL PRIMARY KEY,
  "snapshot_id" VARCHAR(120) NOT NULL,
  "captured_at" TIMESTAMP(6) NOT NULL,
  "erp_version" VARCHAR(120),
  "coverage_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "source_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "expires_at" TIMESTAMP(6),
  "drift_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_schema_snapshots_snapshot_id_key"
  ON "erp_agent"."erp_schema_snapshots"("snapshot_id");

CREATE INDEX IF NOT EXISTS "erp_schema_snapshots_status_expires_idx"
  ON "erp_agent"."erp_schema_snapshots"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "erp_agent"."erp_llm_cost_price_versions" (
  "id" BIGSERIAL PRIMARY KEY,
  "price_version" VARCHAR(120) NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "currency" VARCHAR(12) NOT NULL,
  "effective_from" TIMESTAMP(6) NOT NULL,
  "effective_to" TIMESTAMP(6),
  "prompt_per_1k" NUMERIC(18,8) NOT NULL DEFAULT 0,
  "completion_per_1k" NUMERIC(18,8) NOT NULL DEFAULT 0,
  "reasoning_per_1k" NUMERIC(18,8) NOT NULL DEFAULT 0,
  "cached_prompt_per_1k" NUMERIC(18,8) NOT NULL DEFAULT 0,
  "source" VARCHAR(160) NOT NULL DEFAULT 'config',
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_llm_cost_price_versions_provider_model_version_key"
  ON "erp_agent"."erp_llm_cost_price_versions"("provider", "model", "price_version");

ALTER TABLE IF EXISTS "erp_agent"."erp_sql_traces"
  ADD COLUMN IF NOT EXISTS "schema_snapshot_id" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "data_as_of" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "metric_version" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "page_info_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "cost_json" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "erp_sql_traces_schema_snapshot_id_idx"
  ON "erp_agent"."erp_sql_traces"("schema_snapshot_id");

INSERT INTO "erp_agent"."erp_sql_governed_assets" (
  "asset_key", "asset_type", "version", "status", "owner_role", "approval_status", "use_level", "effective_from",
  "definition_json", "evidence_json", "updated_at"
) VALUES
  ('quotation.family_008_080', 'template_family', '2026-07-10.assets.v1', 'blocked', 'sales_ops_owner', 'blocked', 'blocked', CURRENT_TIMESTAMP,
   '{"families":["family_008","family_080"],"signals":["配置清单","配置内容","外部库记录","产品购销合同"],"tables":["JCJDY.dbo.ProductQuotation","JCJDY.dbo.ProductQuotationDetail"],"blockReason":"JCJDY tenant/Company scope field is not proven"}'::jsonb,
   '["runtime semantic family evidence","post-change readonly schema/compile required"]'::jsonb, CURRENT_TIMESTAMP),
  ('inventory.exclusive_stock_safety_aging', 'template_family', '2026-07-10.assets.v1', 'draft', 'warehouse_owner', 'draft', 'decision_support', CURRENT_TIMESTAMP,
   '{"ordinaryFamilies":["family_027","family_050"],"safetyAgingFamily":"family_089","draftPolicies":["fifo_age","transfer","return","excluded_warehouses"]}'::jsonb,
   '["20260710030000_erp_golden_family_fast_paths"]'::jsonb, CURRENT_TIMESTAMP),
  ('job_material.family_076_086', 'template_family', '2026-07-10.assets.v1', 'draft', 'production_owner', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"families":["family_076","family_086"],"verifiedTables":["Erp.JobMtl","Erp.JobHead","Erp.JobAsmbl"],"conflictFamilies":["family_031","family_006"]}'::jsonb,
   '["JobMtl readonly compile required for approval"]'::jsonb, CURRENT_TIMESTAMP),
  ('labor.family_014_092', 'template_family', '2026-07-10.assets.v1', 'draft', 'production_owner', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"families":["family_014","family_092"],"allowedTables":["Erp.LaborDtl","Erp.JCDept"],"forbiddenTables":["Erp.QiMoJob","Erp.ResourceGroup"],"forbiddenFields":["Erp.OpMaster.Void"]}'::jsonb,
   '["20260710030000_erp_golden_family_fast_paths"]'::jsonb, CURRENT_TIMESTAMP),
  ('finance.metric_catalog_scope', 'metric', '2026-07-10.assets.v1', 'draft', 'finance_owner', 'draft', 'decision_support', CURRENT_TIMESTAMP,
   '{"requiredMetadata":["metricVersion","ownerRole","approvalStatus","effectiveFrom","effectiveTo","grain","dimensions","currency","taxPolicy","refundPolicy"],"estimateDisclaimer":"此数据不准确，仅供参考"}'::jsonb,
   '["docs/architecture/erp-sql-finance-metrics.md"]'::jsonb, CURRENT_TIMESTAMP),
  ('schema.snapshot_binding', 'schema_snapshot', '2026-07-10.assets.v1', 'draft', 'erp_dba', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"requiredFields":["snapshotId","capturedAt","erpVersion","coverage","source","status"],"expiredPolicy":"fail_closed","unknownFieldPolicy":"fail_closed"}'::jsonb,
   '["erp_schema_tables","erp_schema_fields"]'::jsonb, CURRENT_TIMESTAMP),
  ('api.erp_data_gateway.v1', 'api_contract', 'v1', 'draft', 'platform_owner', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"directSqlGeneratorAccess":false,"requiredRequest":["actor","purpose","scope","mode","execution","maxRows","deadlineMs"],"requiredResponse":["status","confidence","evidence","warnings","traceId","dataAsOf","schemaAsOf","metricVersion","pageInfo"]}'::jsonb,
   '["docs/api/erp-data-gateway.md"]'::jsonb, CURRENT_TIMESTAMP),
  ('pagination.cursor_v1', 'api_contract', 'v1', 'draft', 'platform_owner', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"cursorSignature":"hmac-sha256","nextPagePolicy":"recheck_actor_scope_against_same_snapshot","exportPolicy":"no_default_full_export"}'::jsonb,
   '["docs/api/erp-data-gateway.md"]'::jsonb, CURRENT_TIMESTAMP),
  ('freshness.response_contract', 'api_contract', 'v1', 'draft', 'platform_owner', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"fields":["dataAsOf","schemaAsOf","metricVersion","sourceAsOf","refreshStatus"],"forbiddenSource":"current_time_placeholder","appliesTo":["exact","estimate","no_result"]}'::jsonb,
   '["docs/api/erp-data-gateway.md"]'::jsonb, CURRENT_TIMESTAMP),
  ('audit.rendered_sql_hash', 'policy', '2026-07-10.assets.v1', 'approved', 'security_owner', 'approved', 'production_exact', CURRENT_TIMESTAMP,
   '{"sqlHash":"rendered_or_final_sql_sha256","bindingParams":"name_type_value_hash","invalidPublicSql":"","terminalStatuses":["success","failed","cancelled","overloaded","audit_degraded"]}'::jsonb,
   '["SqlTraceService","erp-sql-audit-data-protection"]'::jsonb, CURRENT_TIMESTAMP),
  ('security.fail_closed_policy', 'policy', '2026-07-10.assets.v1', 'approved', 'security_owner', 'approved', 'production_exact', CURRENT_TIMESTAMP,
   '{"promptCannotExpandScope":true,"failClosedCases":["cross_user","cross_company","cross_department","cross_customer","sensitive_alias_rename","mixed_dbo_jcjdy"]}'::jsonb,
   '["ErpSqlAccessPolicyService","erp-sql-access-control"]'::jsonb, CURRENT_TIMESTAMP),
  ('cost.llm_budget_v1', 'cost_price', '2026-07-10.CNY.v1', 'draft', 'platform_finops', 'draft', 'validation_only', CURRENT_TIMESTAMP,
   '{"currency":"CNY","requiredUsage":["promptTokens","completionTokens","reasoningTokens","cachedTokens","callCount","provider","model","estimatedCost"],"notSentCost":0,"budgetThresholds":[0.7,0.9,1],"priceSource":"configuration_version_not_hardcoded"}'::jsonb,
   '["docs/operations/erp-sql-runtime-protection.md"]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("asset_key") DO UPDATE SET
  "asset_type" = excluded."asset_type",
  "version" = excluded."version",
  "status" = excluded."status",
  "owner_role" = excluded."owner_role",
  "approval_status" = excluded."approval_status",
  "use_level" = excluded."use_level",
  "definition_json" = excluded."definition_json",
  "evidence_json" = excluded."evidence_json",
  "updated_at" = CURRENT_TIMESTAMP;
