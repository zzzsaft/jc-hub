ALTER TABLE "erp_agent"."business_metric_catalog"
  ADD COLUMN IF NOT EXISTS "definition_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
