CREATE SCHEMA IF NOT EXISTS "erp_agent";
CREATE SCHEMA IF NOT EXISTS "production_config_agent";

ALTER TABLE IF EXISTS "agent"."documents" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."document_blocks" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."extraction_results" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_term_types" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_terms" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."document_duplicates" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_candidates" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_candidate_occurrences" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_suggestions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_splits" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_aliases" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_term_type_aliases" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_unit_aliases" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_unit_candidates" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_versions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_change_logs" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_qualifiers" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_value_split_suggestions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."split_resolutions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."concept_resolver_entries" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."concept_resolver_runs" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."concept_pattern_reviews" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."dictionary_health_report" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."contract_archives" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."contract_archive_items" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."contract_archive_item_products" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."archive_feature_backfill_candidates" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."archive_feature_backfill_logs" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."archive_search_effect_snapshots" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."archive_feature_batch_decisions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."contract_archive_versions" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."master_data_products" SET SCHEMA "production_config_agent";
ALTER TABLE IF EXISTS "agent"."background_jobs" SET SCHEMA "production_config_agent";

ALTER TABLE IF EXISTS "agent"."erp_schema_tables" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."erp_schema_fields" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."erp_sql_traces" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."sql_template_parse_run" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."sql_template_report_file" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."sql_template_dataset" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."erp_query_templates" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."erp_sql_reference_family" SET SCHEMA "erp_agent";
ALTER TABLE IF EXISTS "agent"."business_metric_catalog" SET SCHEMA "erp_agent";

CREATE TABLE IF NOT EXISTS "erp_agent"."erp_sql_traces" (
  "id" BIGSERIAL PRIMARY KEY,
  "trace_id" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'running',
  "plan_json" JSONB,
  "generation_json" JSONB,
  "sql_text" TEXT,
  "guard_json" JSONB,
  "execution_json" JSONB,
  "row_count" INTEGER,
  "elapsed_ms" INTEGER,
  "error_message" TEXT,
  "warnings_json" JSONB,
  "assumptions_json" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_sql_traces_trace_id_key"
  ON "erp_agent"."erp_sql_traces"("trace_id");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_status_idx"
  ON "erp_agent"."erp_sql_traces"("status");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_created_at_idx"
  ON "erp_agent"."erp_sql_traces"("created_at");

CREATE OR REPLACE VIEW "agent"."documents" AS SELECT * FROM "production_config_agent"."documents";
CREATE OR REPLACE VIEW "agent"."document_blocks" AS SELECT * FROM "production_config_agent"."document_blocks";
CREATE OR REPLACE VIEW "agent"."extraction_results" AS SELECT * FROM "production_config_agent"."extraction_results";
CREATE OR REPLACE VIEW "agent"."dictionary_term_types" AS SELECT * FROM "production_config_agent"."dictionary_term_types";
CREATE OR REPLACE VIEW "agent"."dictionary_terms" AS SELECT * FROM "production_config_agent"."dictionary_terms";
CREATE OR REPLACE VIEW "agent"."document_duplicates" AS SELECT * FROM "production_config_agent"."document_duplicates";
CREATE OR REPLACE VIEW "agent"."dictionary_candidates" AS SELECT * FROM "production_config_agent"."dictionary_candidates";
CREATE OR REPLACE VIEW "agent"."dictionary_candidate_occurrences" AS SELECT * FROM "production_config_agent"."dictionary_candidate_occurrences";
CREATE OR REPLACE VIEW "agent"."dictionary_suggestions" AS SELECT * FROM "production_config_agent"."dictionary_suggestions";
CREATE OR REPLACE VIEW "agent"."dictionary_splits" AS SELECT * FROM "production_config_agent"."dictionary_splits";
CREATE OR REPLACE VIEW "agent"."dictionary_aliases" AS SELECT * FROM "production_config_agent"."dictionary_aliases";
CREATE OR REPLACE VIEW "agent"."dictionary_term_type_aliases" AS SELECT * FROM "production_config_agent"."dictionary_term_type_aliases";
CREATE OR REPLACE VIEW "agent"."dictionary_unit_aliases" AS SELECT * FROM "production_config_agent"."dictionary_unit_aliases";
CREATE OR REPLACE VIEW "agent"."dictionary_unit_candidates" AS SELECT * FROM "production_config_agent"."dictionary_unit_candidates";
CREATE OR REPLACE VIEW "agent"."dictionary_versions" AS SELECT * FROM "production_config_agent"."dictionary_versions";
CREATE OR REPLACE VIEW "agent"."dictionary_change_logs" AS SELECT * FROM "production_config_agent"."dictionary_change_logs";
CREATE OR REPLACE VIEW "agent"."dictionary_qualifiers" AS SELECT * FROM "production_config_agent"."dictionary_qualifiers";
CREATE OR REPLACE VIEW "agent"."dictionary_value_split_suggestions" AS SELECT * FROM "production_config_agent"."dictionary_value_split_suggestions";
CREATE OR REPLACE VIEW "agent"."split_resolutions" AS SELECT * FROM "production_config_agent"."split_resolutions";
CREATE OR REPLACE VIEW "agent"."concept_resolver_entries" AS SELECT * FROM "production_config_agent"."concept_resolver_entries";
CREATE OR REPLACE VIEW "agent"."concept_resolver_runs" AS SELECT * FROM "production_config_agent"."concept_resolver_runs";
CREATE OR REPLACE VIEW "agent"."concept_pattern_reviews" AS SELECT * FROM "production_config_agent"."concept_pattern_reviews";
CREATE OR REPLACE VIEW "agent"."dictionary_health_report" AS SELECT * FROM "production_config_agent"."dictionary_health_report";
CREATE OR REPLACE VIEW "agent"."contract_archives" AS SELECT * FROM "production_config_agent"."contract_archives";
CREATE OR REPLACE VIEW "agent"."contract_archive_items" AS SELECT * FROM "production_config_agent"."contract_archive_items";
CREATE OR REPLACE VIEW "agent"."contract_archive_item_products" AS SELECT * FROM "production_config_agent"."contract_archive_item_products";
CREATE OR REPLACE VIEW "agent"."archive_feature_backfill_candidates" AS SELECT * FROM "production_config_agent"."archive_feature_backfill_candidates";
CREATE OR REPLACE VIEW "agent"."archive_feature_backfill_logs" AS SELECT * FROM "production_config_agent"."archive_feature_backfill_logs";
CREATE OR REPLACE VIEW "agent"."archive_search_effect_snapshots" AS SELECT * FROM "production_config_agent"."archive_search_effect_snapshots";
CREATE OR REPLACE VIEW "agent"."archive_feature_batch_decisions" AS SELECT * FROM "production_config_agent"."archive_feature_batch_decisions";
CREATE OR REPLACE VIEW "agent"."contract_archive_versions" AS SELECT * FROM "production_config_agent"."contract_archive_versions";
CREATE OR REPLACE VIEW "agent"."master_data_products" AS SELECT * FROM "production_config_agent"."master_data_products";
CREATE OR REPLACE VIEW "agent"."background_jobs" AS SELECT * FROM "production_config_agent"."background_jobs";

CREATE OR REPLACE VIEW "agent"."erp_schema_tables" AS SELECT * FROM "erp_agent"."erp_schema_tables";
CREATE OR REPLACE VIEW "agent"."erp_schema_fields" AS SELECT * FROM "erp_agent"."erp_schema_fields";
CREATE OR REPLACE VIEW "agent"."erp_sql_traces" AS SELECT * FROM "erp_agent"."erp_sql_traces";
CREATE OR REPLACE VIEW "agent"."sql_template_parse_run" AS SELECT * FROM "erp_agent"."sql_template_parse_run";
CREATE OR REPLACE VIEW "agent"."sql_template_report_file" AS SELECT * FROM "erp_agent"."sql_template_report_file";
CREATE OR REPLACE VIEW "agent"."sql_template_dataset" AS SELECT * FROM "erp_agent"."sql_template_dataset";
CREATE OR REPLACE VIEW "agent"."erp_query_templates" AS SELECT * FROM "erp_agent"."erp_query_templates";
CREATE OR REPLACE VIEW "agent"."erp_sql_reference_family" AS SELECT * FROM "erp_agent"."erp_sql_reference_family";
CREATE OR REPLACE VIEW "agent"."business_metric_catalog" AS SELECT * FROM "erp_agent"."business_metric_catalog";
