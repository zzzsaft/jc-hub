CREATE TABLE IF NOT EXISTS "agent"."erp_sql_traces" (
  "id" BIGSERIAL PRIMARY KEY,
  "trace_id" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'running',
  "plan_json" JSONB,
  "generation_json" JSONB,
  "sql_text" TEXT,
  "guard_json" JSONB,
  "execution_json" JSONB,
  "row_count" INTEGER,
  "elapsed_ms" INTEGER,
  "error_message" TEXT,
  "warnings_json" JSONB,
  "assumptions_json" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "erp_sql_traces_trace_id_key"
  ON "agent"."erp_sql_traces"("trace_id");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_status_idx"
  ON "agent"."erp_sql_traces"("status");

CREATE INDEX IF NOT EXISTS "erp_sql_traces_created_at_idx"
  ON "agent"."erp_sql_traces"("created_at");
