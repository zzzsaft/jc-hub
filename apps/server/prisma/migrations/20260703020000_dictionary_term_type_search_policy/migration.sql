ALTER TABLE "agent"."dictionary_term_types"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
