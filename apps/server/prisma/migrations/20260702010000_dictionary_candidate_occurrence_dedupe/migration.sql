ALTER TABLE "agent"."dictionary_candidate_occurrences"
  ADD COLUMN IF NOT EXISTS "item_index" INTEGER,
  ADD COLUMN IF NOT EXISTS "raw_value_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "occurrence_hash" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_candidate_occurrences_occurrence_hash_key"
  ON "agent"."dictionary_candidate_occurrences"("occurrence_hash");
