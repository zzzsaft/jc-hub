CREATE TABLE IF NOT EXISTS "agent"."erp_schema_tables" (
  "id" BIGSERIAL PRIMARY KEY,
  "schema_name" VARCHAR(80) NOT NULL,
  "table_name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "table_label" TEXT,
  "system_code" VARCHAR(80),
  "table_type" VARCHAR(80),
  "data_table_id" VARCHAR(120),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_schema_tables_schema_table_key"
  ON "agent"."erp_schema_tables"("schema_name", "table_name");

CREATE INDEX IF NOT EXISTS "erp_schema_tables_schema_table_idx"
  ON "agent"."erp_schema_tables"("schema_name", "table_name");

CREATE INDEX IF NOT EXISTS "erp_schema_tables_table_name_idx"
  ON "agent"."erp_schema_tables"("table_name");

CREATE TABLE IF NOT EXISTS "agent"."erp_schema_fields" (
  "id" BIGSERIAL PRIMARY KEY,
  "schema_name" VARCHAR(80) NOT NULL,
  "table_name" VARCHAR(160) NOT NULL,
  "field_name" VARCHAR(160) NOT NULL,
  "db_field_name" VARCHAR(160),
  "field_label" TEXT,
  "description" TEXT,
  "data_type" VARCHAR(120),
  "required" BOOLEAN NOT NULL DEFAULT FALSE,
  "read_only" BOOLEAN NOT NULL DEFAULT FALSE,
  "use_db_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "tooltip_text" TEXT,
  "is_description_field" BOOLEAN NOT NULL DEFAULT FALSE,
  "like_data_field_name" VARCHAR(160),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_schema_fields_schema_table_field_key"
  ON "agent"."erp_schema_fields"("schema_name", "table_name", "field_name");

CREATE INDEX IF NOT EXISTS "erp_schema_fields_schema_table_idx"
  ON "agent"."erp_schema_fields"("schema_name", "table_name");

CREATE INDEX IF NOT EXISTS "erp_schema_fields_table_name_idx"
  ON "agent"."erp_schema_fields"("table_name");

CREATE INDEX IF NOT EXISTS "erp_schema_fields_field_name_idx"
  ON "agent"."erp_schema_fields"("field_name");

CREATE INDEX IF NOT EXISTS "erp_schema_fields_db_field_name_idx"
  ON "agent"."erp_schema_fields"("db_field_name");
