CREATE SCHEMA IF NOT EXISTS "integration";

CREATE TABLE IF NOT EXISTS "integration"."axios_request_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "method" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "base_url" TEXT,
  "status_code" INTEGER,
  "duration_ms" INTEGER NOT NULL,
  "request_body" JSONB,
  "response_body" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "axios_request_logs_created_at_idx" ON "integration"."axios_request_logs"("created_at");
CREATE INDEX IF NOT EXISTS "axios_request_logs_method_url_idx" ON "integration"."axios_request_logs"("method", "url");
CREATE INDEX IF NOT EXISTS "axios_request_logs_status_code_idx" ON "integration"."axios_request_logs"("status_code");

CREATE TABLE IF NOT EXISTS "integration"."webhook_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" VARCHAR(80) NOT NULL,
  "client_id" VARCHAR(120),
  "event_type" VARCHAR(120),
  "change_type" VARCHAR(120),
  "query" JSONB,
  "headers" JSONB,
  "raw_body_preview" TEXT,
  "raw_body_length" INTEGER NOT NULL DEFAULT 0,
  "raw_body_truncated" BOOLEAN NOT NULL DEFAULT FALSE,
  "payload" JSONB,
  "status" VARCHAR(30) NOT NULL DEFAULT 'received',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "webhook_events_provider_client_id_idx"
  ON "integration"."webhook_events"("provider", "client_id");
CREATE INDEX IF NOT EXISTS "webhook_events_event_type_change_type_idx"
  ON "integration"."webhook_events"("event_type", "change_type");
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx" ON "integration"."webhook_events"("status");
CREATE INDEX IF NOT EXISTS "webhook_events_created_at_idx" ON "integration"."webhook_events"("created_at");
