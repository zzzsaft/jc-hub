ALTER TABLE "agent"."erp_query_templates"
  ADD COLUMN IF NOT EXISTS "source_family_id" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "source_dataset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "source_report_names" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "source_sql_hashes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "erp_query_templates_source_family_intent_key"
  ON "agent"."erp_query_templates"("source_family_id", "intent")
  WHERE "source_family_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "agent"."erp_sql_reference_family" (
  "id" BIGSERIAL PRIMARY KEY,
  "family_id" VARCHAR(40) NOT NULL UNIQUE,
  "family_name" TEXT NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "intent" VARCHAR(120) NOT NULL,
  "business_description" TEXT NOT NULL,
  "core_tables" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "core_joins" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "common_params" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "representative_dataset_id" BIGINT,
  "representative_sql" TEXT,
  "sample_dataset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "report_names" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dataset_names" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risk_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recommended_use" VARCHAR(80) NOT NULL DEFAULT 'reference_retrieval',
  "is_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "erp_sql_reference_family_module_intent_idx"
  ON "agent"."erp_sql_reference_family"("module", "intent");

CREATE TABLE IF NOT EXISTS "agent"."business_metric_catalog" (
  "id" BIGSERIAL PRIMARY KEY,
  "metric_code" VARCHAR(120) NOT NULL UNIQUE,
  "metric_name" TEXT NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "family_id" VARCHAR(40) NOT NULL,
  "business_description" TEXT NOT NULL,
  "calculation_summary" TEXT NOT NULL,
  "core_tables" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "core_joins" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "params" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "representative_sql" TEXT,
  "source_report_names" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source_dataset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "business_metric_catalog_family_id_idx"
  ON "agent"."business_metric_catalog"("family_id");

CREATE INDEX IF NOT EXISTS "business_metric_catalog_status_idx"
  ON "agent"."business_metric_catalog"("status");
