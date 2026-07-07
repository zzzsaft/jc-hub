DROP INDEX IF EXISTS "agent"."documents_file_hash_key";
CREATE INDEX IF NOT EXISTS "documents_file_hash_idx" ON "agent"."documents"("file_hash");

CREATE TABLE IF NOT EXISTS "agent"."concept_resolver_runs" (
  "id" BIGSERIAL PRIMARY KEY,
  "status" VARCHAR(40) NOT NULL DEFAULT 'running',
  "mode" VARCHAR(40) NOT NULL DEFAULT 'dry_run',
  "input_json" JSONB NOT NULL DEFAULT '{}',
  "result_json" JSONB NOT NULL DEFAULT '{}',
  "error_json" JSONB,
  "started_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "concept_resolver_runs_status_created_at_idx"
  ON "agent"."concept_resolver_runs"("status", "created_at");

CREATE TABLE IF NOT EXISTS "agent"."concept_pattern_reviews" (
  "id" BIGSERIAL PRIMARY KEY,
  "pattern_key" TEXT NOT NULL UNIQUE,
  "concept_type" VARCHAR(100) NOT NULL,
  "source_value" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "reviewed_by" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "concept_pattern_reviews_concept_type_status_idx"
  ON "agent"."concept_pattern_reviews"("concept_type", "status");

CREATE TABLE IF NOT EXISTS "agent"."contract_archive_items" (
  "id" BIGSERIAL PRIMARY KEY,
  "archive_id" BIGINT NOT NULL,
  "extraction_result_id" BIGINT,
  "item_index" INTEGER NOT NULL,
  "item_name" TEXT,
  "item_quantity" TEXT,
  "product_type_hint" TEXT,
  "fields_json" JSONB NOT NULL DEFAULT '{}',
  "warnings_json" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "contract_archive_items_archive_id_item_index_key"
  ON "agent"."contract_archive_items"("archive_id", "item_index");
CREATE INDEX IF NOT EXISTS "contract_archive_items_archive_id_idx"
  ON "agent"."contract_archive_items"("archive_id");
CREATE INDEX IF NOT EXISTS "contract_archive_items_extraction_result_id_idx"
  ON "agent"."contract_archive_items"("extraction_result_id");

CREATE TABLE IF NOT EXISTS "agent"."contract_archive_item_products" (
  "id" BIGSERIAL PRIMARY KEY,
  "archive_id" BIGINT NOT NULL,
  "archive_item_id" BIGINT NOT NULL,
  "product_number" TEXT NOT NULL,
  "role" VARCHAR(50) NOT NULL DEFAULT 'unknown',
  "quantity" TEXT,
  "binding_source" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "confidence" DOUBLE PRECISION,
  "erp_product_id" TEXT,
  "erp_parent_product_number" TEXT,
  "erp_match_status" VARCHAR(50) NOT NULL DEFAULT 'unmatched',
  "evidence_json" JSONB,
  "note" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "contract_archive_item_products_archive_item_id_product_number_key"
  ON "agent"."contract_archive_item_products"("archive_item_id", "product_number");
CREATE INDEX IF NOT EXISTS "contract_archive_item_products_archive_id_idx"
  ON "agent"."contract_archive_item_products"("archive_id");
CREATE INDEX IF NOT EXISTS "contract_archive_item_products_archive_item_id_idx"
  ON "agent"."contract_archive_item_products"("archive_item_id");
CREATE INDEX IF NOT EXISTS "contract_archive_item_products_product_number_idx"
  ON "agent"."contract_archive_item_products"("product_number");

CREATE TABLE IF NOT EXISTS "agent"."contract_archive_versions" (
  "id" BIGSERIAL PRIMARY KEY,
  "archive_id" BIGINT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot_json" JSONB NOT NULL,
  "change_summary_json" JSONB NOT NULL DEFAULT '[]',
  "edited_by" TEXT,
  "edit_reason" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "contract_archive_versions_archive_id_version_key"
  ON "agent"."contract_archive_versions"("archive_id", "version");
CREATE INDEX IF NOT EXISTS "contract_archive_versions_archive_id_created_at_idx"
  ON "agent"."contract_archive_versions"("archive_id", "created_at");
