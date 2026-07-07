ALTER TABLE "agent"."contract_archive_items"
  ADD COLUMN IF NOT EXISTS "confirmed_fields_json" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "unresolved_fields_json" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "agent_readiness_json" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "searchable_text" TEXT,
  ADD COLUMN IF NOT EXISTS "config_signature" TEXT,
  ADD COLUMN IF NOT EXISTS "similarity_features_json" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "contract_archive_items_config_signature_idx"
  ON "agent"."contract_archive_items"("config_signature");
