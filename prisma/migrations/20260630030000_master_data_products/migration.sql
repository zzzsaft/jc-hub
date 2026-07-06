CREATE TABLE IF NOT EXISTS "agent"."master_data_products" (
  "id" BIGSERIAL PRIMARY KEY,
  "source" VARCHAR(100) NOT NULL,
  "external_id" VARCHAR(120) NOT NULL,
  "model" TEXT,
  "name" TEXT,
  "details_json" JSONB NOT NULL DEFAULT '{}',
  "normalized_model" TEXT,
  "normalized_attributes_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "master_data_products_source_external_id_key"
  ON "agent"."master_data_products"("source", "external_id");
CREATE INDEX IF NOT EXISTS "master_data_products_source_model_idx"
  ON "agent"."master_data_products"("source", "model");
CREATE INDEX IF NOT EXISTS "master_data_products_source_normalized_model_idx"
  ON "agent"."master_data_products"("source", "normalized_model");
