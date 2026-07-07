ALTER TABLE "agent"."contract_archives"
  ADD COLUMN IF NOT EXISTS "extraction_result_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "dirty_reason" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "dirty_source_run_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "dirty_dictionary_version" BIGINT,
  ADD COLUMN IF NOT EXISTS "dirty_normalization_rule_version" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "dirty_resolver_version" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "product_number" TEXT,
  ADD COLUMN IF NOT EXISTS "contract_number" TEXT,
  ADD COLUMN IF NOT EXISTS "order_number" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "order_date" DATE,
  ADD COLUMN IF NOT EXISTS "delivery_date" DATE,
  ADD COLUMN IF NOT EXISTS "doc_info_json" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "agent"."contract_archives"
  ALTER COLUMN "status" SET DEFAULT 'archived';

ALTER TABLE "agent"."contract_archive_items"
  ADD COLUMN IF NOT EXISTS "document_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "product_type_raw_value" TEXT,
  ADD COLUMN IF NOT EXISTS "product_type_display_name" TEXT,
  ADD COLUMN IF NOT EXISTS "source_product_number" TEXT,
  ADD COLUMN IF NOT EXISTS "product_number_status" VARCHAR(50) NOT NULL DEFAULT 'missing';

ALTER TABLE "agent"."contract_archive_items"
  ALTER COLUMN "fields_json" SET DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "contract_archives_extraction_result_id_idx"
  ON "agent"."contract_archives"("extraction_result_id");
CREATE INDEX IF NOT EXISTS "contract_archives_product_number_idx"
  ON "agent"."contract_archives"("product_number");
CREATE INDEX IF NOT EXISTS "contract_archives_customer_id_idx"
  ON "agent"."contract_archives"("customer_id");
CREATE INDEX IF NOT EXISTS "contract_archives_contract_number_idx"
  ON "agent"."contract_archives"("contract_number");
CREATE INDEX IF NOT EXISTS "contract_archives_order_number_idx"
  ON "agent"."contract_archives"("order_number");

CREATE INDEX IF NOT EXISTS "contract_archive_items_document_id_idx"
  ON "agent"."contract_archive_items"("document_id");
CREATE INDEX IF NOT EXISTS "contract_archive_items_source_product_number_idx"
  ON "agent"."contract_archive_items"("source_product_number");
CREATE INDEX IF NOT EXISTS "contract_archive_items_product_type_hint_idx"
  ON "agent"."contract_archive_items"("product_type_hint");
CREATE INDEX IF NOT EXISTS "contract_archive_items_product_number_status_idx"
  ON "agent"."contract_archive_items"("product_number_status");
