CREATE SCHEMA IF NOT EXISTS "integration";

CREATE TABLE IF NOT EXISTS "integration"."jdy_apps" (
  "app_id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "raw" JSONB,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "integration"."jdy_forms" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "raw" JSONB,
  "has_data" BOOLEAN NOT NULL DEFAULT FALSE,
  "in_use" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_data_at" TIMESTAMP(3),
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_data_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "integration"."jdy_fields" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "widget_id" TEXT NOT NULL,
  "name" TEXT,
  "label" TEXT,
  "type" TEXT,
  "raw" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "integration"."jdy_records" (
  "id" BIGSERIAL NOT NULL PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "data_id" TEXT NOT NULL,
  "title" TEXT,
  "search_text" TEXT,
  "op" TEXT,
  "raw_data" JSONB NOT NULL,
  "jdy_created_at" TIMESTAMP(3),
  "last_jdy_updated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "jdy_forms_app_id_entry_id_key"
  ON "integration"."jdy_forms"("app_id", "entry_id");
CREATE INDEX IF NOT EXISTS "jdy_forms_app_id_idx" ON "integration"."jdy_forms"("app_id");
CREATE INDEX IF NOT EXISTS "jdy_forms_in_use_idx" ON "integration"."jdy_forms"("in_use");
CREATE INDEX IF NOT EXISTS "jdy_forms_last_data_at_idx" ON "integration"."jdy_forms"("last_data_at");
CREATE INDEX IF NOT EXISTS "jdy_forms_last_data_synced_at_idx" ON "integration"."jdy_forms"("last_data_synced_at");

CREATE UNIQUE INDEX IF NOT EXISTS "jdy_fields_app_id_entry_id_widget_id_key"
  ON "integration"."jdy_fields"("app_id", "entry_id", "widget_id");
CREATE INDEX IF NOT EXISTS "jdy_fields_app_id_entry_id_idx" ON "integration"."jdy_fields"("app_id", "entry_id");

CREATE UNIQUE INDEX IF NOT EXISTS "jdy_records_app_id_entry_id_data_id_key"
  ON "integration"."jdy_records"("app_id", "entry_id", "data_id");
CREATE INDEX IF NOT EXISTS "jdy_records_app_id_entry_id_idx" ON "integration"."jdy_records"("app_id", "entry_id");
CREATE INDEX IF NOT EXISTS "jdy_records_entry_id_updated_at_idx" ON "integration"."jdy_records"("entry_id", "updated_at");
CREATE INDEX IF NOT EXISTS "jdy_records_entry_id_last_jdy_updated_at_idx"
  ON "integration"."jdy_records"("entry_id", "last_jdy_updated_at");
