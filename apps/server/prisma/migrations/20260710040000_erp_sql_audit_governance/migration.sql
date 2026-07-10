ALTER TABLE IF EXISTS "erp_agent"."erp_sql_traces"
  ADD COLUMN IF NOT EXISTS "question_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "sql_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "audit_degraded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "audit_json" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "erp_sql_traces_sql_hash_idx"
  ON "erp_agent"."erp_sql_traces"("sql_hash");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_audit_degraded_created_at_idx"
  ON "erp_agent"."erp_sql_traces"("audit_degraded", "created_at");
