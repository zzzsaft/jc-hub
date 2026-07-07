CREATE TABLE IF NOT EXISTS "agent"."sql_template_parse_run" (
  "id" BIGSERIAL PRIMARY KEY,
  "root_dir" TEXT NOT NULL,
  "extensions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dry_run" BOOLEAN NOT NULL DEFAULT FALSE,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "dataset_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "errors_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" VARCHAR(30) NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(6)
);

CREATE INDEX IF NOT EXISTS "sql_template_parse_run_status_idx"
  ON "agent"."sql_template_parse_run"("status");

CREATE INDEX IF NOT EXISTS "sql_template_parse_run_started_at_idx"
  ON "agent"."sql_template_parse_run"("started_at");

CREATE TABLE IF NOT EXISTS "agent"."sql_template_report_file" (
  "id" BIGSERIAL PRIMARY KEY,
  "parse_run_id" BIGINT NOT NULL REFERENCES "agent"."sql_template_parse_run"("id"),
  "file_path" TEXT NOT NULL,
  "relative_path" TEXT NOT NULL,
  "extension" VARCHAR(20) NOT NULL,
  "file_hash" VARCHAR(64) NOT NULL,
  "file_size" BIGINT NOT NULL,
  "report_name" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "sql_template_report_file_hash_path_key"
  ON "agent"."sql_template_report_file"("file_hash", "relative_path");

CREATE INDEX IF NOT EXISTS "sql_template_report_file_parse_run_id_idx"
  ON "agent"."sql_template_report_file"("parse_run_id");

CREATE INDEX IF NOT EXISTS "sql_template_report_file_file_hash_idx"
  ON "agent"."sql_template_report_file"("file_hash");

CREATE TABLE IF NOT EXISTS "agent"."sql_template_dataset" (
  "id" BIGSERIAL PRIMARY KEY,
  "parse_run_id" BIGINT NOT NULL REFERENCES "agent"."sql_template_parse_run"("id"),
  "report_file_id" BIGINT NOT NULL REFERENCES "agent"."sql_template_report_file"("id"),
  "dataset_name" TEXT,
  "dataset_type" VARCHAR(40) NOT NULL DEFAULT 'query',
  "connection_name" TEXT,
  "raw_sql" TEXT NOT NULL,
  "sql_hash" VARCHAR(64) NOT NULL,
  "dynamic_params" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risk_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "sql_template_dataset_file_sql_name_type_key"
  ON "agent"."sql_template_dataset"("report_file_id", "sql_hash", "dataset_name", "dataset_type");

CREATE INDEX IF NOT EXISTS "sql_template_dataset_parse_run_id_idx"
  ON "agent"."sql_template_dataset"("parse_run_id");

CREATE INDEX IF NOT EXISTS "sql_template_dataset_sql_hash_idx"
  ON "agent"."sql_template_dataset"("sql_hash");

CREATE TABLE IF NOT EXISTS "agent"."erp_query_templates" (
  "id" BIGSERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "intent" VARCHAR(120) NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "question_pattern" TEXT,
  "normalized_question" TEXT,
  "query_plan_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sql_template" TEXT NOT NULL,
  "required_params" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "optional_params" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tables" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "joins" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source_type" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "source_dataset_id" BIGINT REFERENCES "agent"."sql_template_dataset"("id"),
  "source_report_name" TEXT,
  "source_sql_hash" VARCHAR(64),
  "guard_passed" BOOLEAN NOT NULL DEFAULT FALSE,
  "approved" BOOLEAN NOT NULL DEFAULT FALSE,
  "approval_status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(6),
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "last_used_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "erp_query_templates_intent_module_idx"
  ON "agent"."erp_query_templates"("intent", "module");

CREATE INDEX IF NOT EXISTS "erp_query_templates_approval_status_idx"
  ON "agent"."erp_query_templates"("approval_status");

CREATE INDEX IF NOT EXISTS "erp_query_templates_guard_passed_approved_idx"
  ON "agent"."erp_query_templates"("guard_passed", "approved");

CREATE INDEX IF NOT EXISTS "erp_query_templates_source_dataset_id_idx"
  ON "agent"."erp_query_templates"("source_dataset_id");

CREATE INDEX IF NOT EXISTS "erp_query_templates_source_sql_hash_idx"
  ON "agent"."erp_query_templates"("source_sql_hash");
