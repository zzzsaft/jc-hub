CREATE TABLE IF NOT EXISTS "agent"."archive_feature_backfill_candidates" (
  "id" BIGSERIAL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "archive_item_id" BIGINT NOT NULL,
  "feature_key" VARCHAR(100) NOT NULL,
  "proposed_value_json" JSONB NOT NULL,
  "proposed_value_hash" VARCHAR(64) NOT NULL,
  "source_term_type" VARCHAR(100) NOT NULL,
  "source_field_path" TEXT NOT NULL,
  "confidence" NUMERIC(5, 4) NOT NULL,
  "evidence_json" JSONB NOT NULL DEFAULT '{}',
  "risk_flags_json" JSONB NOT NULL DEFAULT '[]',
  "decision" VARCHAR(30) NOT NULL DEFAULT 'pending',
  "decision_score" NUMERIC(5, 4),
  "expected_search_gain" NUMERIC(8, 4),
  "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "archive_feature_candidates_item_feature_value_key"
  ON "agent"."archive_feature_backfill_candidates"(
    "archive_item_id",
    "feature_key",
    "proposed_value_hash"
  );

CREATE INDEX IF NOT EXISTS "archive_feature_candidates_batch_idx"
  ON "agent"."archive_feature_backfill_candidates"("batch_id");

CREATE INDEX IF NOT EXISTS "archive_feature_candidates_decision_status_idx"
  ON "agent"."archive_feature_backfill_candidates"("decision", "status");

CREATE INDEX IF NOT EXISTS "archive_feature_candidates_feature_confidence_idx"
  ON "agent"."archive_feature_backfill_candidates"("feature_key", "confidence");

CREATE TABLE IF NOT EXISTS "agent"."archive_feature_backfill_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "candidate_id" BIGINT NOT NULL,
  "archive_item_id" BIGINT NOT NULL,
  "feature_key" VARCHAR(100) NOT NULL,
  "before_similarity_features_json" JSONB NOT NULL DEFAULT '{}',
  "after_similarity_features_json" JSONB NOT NULL DEFAULT '{}',
  "applied_by" VARCHAR(100),
  "applied_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rolled_back_at" TIMESTAMP(6),
  "rollback_reason" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "archive_feature_backfill_logs_candidate_key"
  ON "agent"."archive_feature_backfill_logs"("candidate_id");

CREATE INDEX IF NOT EXISTS "archive_feature_backfill_logs_batch_idx"
  ON "agent"."archive_feature_backfill_logs"("batch_id");

CREATE INDEX IF NOT EXISTS "archive_feature_backfill_logs_item_idx"
  ON "agent"."archive_feature_backfill_logs"("archive_item_id");

CREATE TABLE IF NOT EXISTS "agent"."archive_search_effect_snapshots" (
  "id" BIGSERIAL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "phase" VARCHAR(30) NOT NULL,
  "query_text" TEXT NOT NULL,
  "query_json" JSONB NOT NULL DEFAULT '{}',
  "top_results_json" JSONB NOT NULL DEFAULT '[]',
  "metrics_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "archive_search_effect_snapshots_batch_phase_idx"
  ON "agent"."archive_search_effect_snapshots"("batch_id", "phase");

CREATE TABLE IF NOT EXISTS "agent"."archive_feature_batch_decisions" (
  "id" BIGSERIAL PRIMARY KEY,
  "batch_id" TEXT NOT NULL UNIQUE,
  "mode" VARCHAR(30) NOT NULL,
  "policy_json" JSONB NOT NULL DEFAULT '{}',
  "coverage_before_json" JSONB NOT NULL DEFAULT '{}',
  "coverage_after_json" JSONB NOT NULL DEFAULT '{}',
  "candidate_stats_json" JSONB NOT NULL DEFAULT '{}',
  "search_impact_json" JSONB NOT NULL DEFAULT '{}',
  "risk_summary_json" JSONB NOT NULL DEFAULT '{}',
  "decision_json" JSONB NOT NULL DEFAULT '{}',
  "report_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "archive_feature_batch_decisions_mode_idx"
  ON "agent"."archive_feature_batch_decisions"("mode");
