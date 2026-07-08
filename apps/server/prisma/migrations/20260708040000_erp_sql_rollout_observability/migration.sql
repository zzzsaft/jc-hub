ALTER TABLE IF EXISTS "erp_agent"."erp_sql_traces"
  ADD COLUMN IF NOT EXISTS "session_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "run_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "rollout_mode" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "erp_sql_traces_session_created_at_idx"
  ON "erp_agent"."erp_sql_traces"("session_id", "created_at");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_rollout_mode_idx"
  ON "erp_agent"."erp_sql_traces"("rollout_mode");
