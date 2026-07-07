CREATE TABLE IF NOT EXISTS "erp_agent"."sql_dataset_reference_index" (
  "id" BIGSERIAL PRIMARY KEY,
  "dataset_id" BIGINT NOT NULL UNIQUE REFERENCES "erp_agent"."sql_template_dataset"("id") ON DELETE CASCADE,
  "sql_hash" VARCHAR(64) NOT NULL,
  "family_id" VARCHAR(40) NOT NULL DEFAULT 'unclassified',
  "module" VARCHAR(80),
  "intent" VARCHAR(120),
  "report_name" TEXT,
  "dataset_name" TEXT,
  "question_text" TEXT NOT NULL DEFAULT '',
  "sql_text" TEXT NOT NULL DEFAULT '',
  "tables" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "metrics" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "params" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risk_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "keywords" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "summary" TEXT NOT NULL DEFAULT '',
  "business_description" TEXT NOT NULL DEFAULT '',
  "time_scope" TEXT NOT NULL DEFAULT '',
  "business_scenario" TEXT NOT NULL DEFAULT '',
  "is_finance" BOOLEAN NOT NULL DEFAULT FALSE,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "normalized_sql_preview" TEXT NOT NULL DEFAULT '',
  "embedding_text" TEXT,
  "embedding_vector_json" JSONB,
  "embedding_model" TEXT,
  "embedding_updated_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_family_id_idx"
  ON "erp_agent"."sql_dataset_reference_index"("family_id");

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_module_intent_idx"
  ON "erp_agent"."sql_dataset_reference_index"("module", "intent");

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_dataset_id_idx"
  ON "erp_agent"."sql_dataset_reference_index"("dataset_id");

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_sql_hash_idx"
  ON "erp_agent"."sql_dataset_reference_index"("sql_hash");

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_is_finance_idx"
  ON "erp_agent"."sql_dataset_reference_index"("is_finance");

CREATE INDEX IF NOT EXISTS "sql_dataset_reference_index_verified_idx"
  ON "erp_agent"."sql_dataset_reference_index"("verified");
