CREATE TABLE IF NOT EXISTS "agent"."dictionary_aliases" (
  "id" BIGSERIAL PRIMARY KEY,
  "term_id" BIGINT NOT NULL,
  "term_type" VARCHAR(100) NOT NULL,
  "alias_value" TEXT NOT NULL,
  "normalized_alias" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMP,
  "risk_level" VARCHAR(30) NOT NULL DEFAULT 'normal',
  "baseline_trust_tier" VARCHAR(30) NOT NULL DEFAULT 'provisional',
  "baseline_risk_labels" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_aliases_term_type_normalized_alias_key"
  ON "agent"."dictionary_aliases"("term_type", "normalized_alias");
CREATE INDEX IF NOT EXISTS "dictionary_aliases_term_id_idx" ON "agent"."dictionary_aliases"("term_id");
CREATE INDEX IF NOT EXISTS "dictionary_aliases_match_idx"
  ON "agent"."dictionary_aliases"("term_type", "normalized_alias", "is_active");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_term_type_aliases" (
  "id" BIGSERIAL PRIMARY KEY,
  "term_type" VARCHAR(100) NOT NULL,
  "alias_value" TEXT NOT NULL,
  "normalized_alias" TEXT NOT NULL,
  "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMP,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_term_type_aliases_term_type_normalized_alias_key"
  ON "agent"."dictionary_term_type_aliases"("term_type", "normalized_alias");
CREATE INDEX IF NOT EXISTS "dictionary_term_type_aliases_match_idx"
  ON "agent"."dictionary_term_type_aliases"("normalized_alias", "is_active");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_unit_aliases" (
  "id" BIGSERIAL PRIMARY KEY,
  "canonical_unit" TEXT NOT NULL,
  "display_unit" TEXT,
  "alias_value" TEXT NOT NULL,
  "normalized_alias" TEXT NOT NULL UNIQUE,
  "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMP,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "dictionary_unit_aliases_canonical_unit_idx"
  ON "agent"."dictionary_unit_aliases"("canonical_unit");
CREATE INDEX IF NOT EXISTS "dictionary_unit_aliases_match_idx"
  ON "agent"."dictionary_unit_aliases"("normalized_alias", "is_active");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_unit_candidates" (
  "id" BIGSERIAL PRIMARY KEY,
  "raw_unit" TEXT NOT NULL UNIQUE,
  "normalized_unit" TEXT NOT NULL,
  "canonical_unit" TEXT,
  "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "occurrence_count" INTEGER NOT NULL DEFAULT 0,
  "source" VARCHAR(80),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "dictionary_unit_candidates_status_score_idx"
  ON "agent"."dictionary_unit_candidates"("status", "score");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_versions" (
  "id" BIGSERIAL PRIMARY KEY,
  "version_key" VARCHAR(100) NOT NULL UNIQUE,
  "version_value" BIGINT NOT NULL DEFAULT 1,
  "description" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "dictionary_versions_version_key_idx"
  ON "agent"."dictionary_versions"("version_key");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_change_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "version_key" VARCHAR(100) NOT NULL DEFAULT 'default',
  "version_value" BIGINT NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" TEXT,
  "before_json" JSONB,
  "after_json" JSONB,
  "created_by" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "dictionary_change_logs_version_idx"
  ON "agent"."dictionary_change_logs"("version_key", "version_value");
CREATE INDEX IF NOT EXISTS "dictionary_change_logs_entity_idx"
  ON "agent"."dictionary_change_logs"("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_qualifiers" (
  "id" BIGSERIAL PRIMARY KEY,
  "qualifier_type" VARCHAR(100) NOT NULL,
  "qualifier_value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_qualifiers_type_normalized_key"
  ON "agent"."dictionary_qualifiers"("qualifier_type", "normalized_value");
CREATE INDEX IF NOT EXISTS "dictionary_qualifiers_type_active_idx"
  ON "agent"."dictionary_qualifiers"("qualifier_type", "is_active");

CREATE TABLE IF NOT EXISTS "agent"."dictionary_value_split_suggestions" (
  "id" BIGSERIAL PRIMARY KEY,
  "term_type" VARCHAR(100) NOT NULL,
  "source_value" TEXT NOT NULL,
  "parts_json" JSONB NOT NULL DEFAULT '[]',
  "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_value_split_suggestions_term_source_key"
  ON "agent"."dictionary_value_split_suggestions"("term_type", "source_value");
CREATE INDEX IF NOT EXISTS "dictionary_value_split_suggestions_term_status_idx"
  ON "agent"."dictionary_value_split_suggestions"("term_type", "status");

CREATE TABLE IF NOT EXISTS "agent"."split_resolutions" (
  "id" BIGSERIAL PRIMARY KEY,
  "term_type" VARCHAR(100) NOT NULL,
  "source_value" TEXT NOT NULL,
  "resolution_json" JSONB NOT NULL DEFAULT '{}',
  "status" VARCHAR(40) NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "split_resolutions_term_source_key"
  ON "agent"."split_resolutions"("term_type", "source_value");
CREATE INDEX IF NOT EXISTS "split_resolutions_term_status_idx"
  ON "agent"."split_resolutions"("term_type", "status");
