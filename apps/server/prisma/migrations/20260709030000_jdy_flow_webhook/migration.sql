CREATE SCHEMA IF NOT EXISTS "integration";

CREATE TABLE IF NOT EXISTS "integration"."jdy_flow_instances" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT ('jfi_' || md5(random()::text || clock_timestamp()::text)),
  "jdy_data_id" TEXT NOT NULL,
  "app_id" TEXT,
  "form_id" TEXT,
  "form_name" TEXT,
  "instance_url" TEXT,
  "flow_status" INTEGER,
  "flow_status_text" VARCHAR(40) NOT NULL DEFAULT 'unknown',
  "result" INTEGER,
  "submitter" JSONB,
  "modifier" JSONB,
  "deleter" JSONB,
  "submitted_at" TIMESTAMP(3),
  "updated_at_jdy" TIMESTAMP(3),
  "deleted_at_jdy" TIMESTAMP(3),
  "raw_json" JSONB NOT NULL DEFAULT '{}',
  "raw_instance_json" JSONB,
  "last_op" VARCHAR(40) NOT NULL,
  "last_op_time" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "jdy_flow_instances_jdy_data_id_key"
  ON "integration"."jdy_flow_instances"("jdy_data_id");
CREATE INDEX IF NOT EXISTS "jdy_flow_instances_flow_status_text_idx"
  ON "integration"."jdy_flow_instances"("flow_status_text");
CREATE INDEX IF NOT EXISTS "jdy_flow_instances_last_op_time_idx"
  ON "integration"."jdy_flow_instances"("last_op_time");

CREATE TABLE IF NOT EXISTS "integration"."jdy_flow_instance_events" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT ('jfie_' || md5(random()::text || clock_timestamp()::text)),
  "jdy_data_id" TEXT NOT NULL,
  "webhook_event_id" TEXT NOT NULL,
  "event_source" VARCHAR(40) NOT NULL DEFAULT 'webhook',
  "event_key" TEXT NOT NULL,
  "op" VARCHAR(40) NOT NULL,
  "op_time" TIMESTAMP(3),
  "flow_id" INTEGER,
  "flow_name" TEXT,
  "create_action" TEXT,
  "finish_action" TEXT,
  "create_time" TIMESTAMP(3),
  "finish_time" TIMESTAMP(3),
  "comment" TEXT,
  "operator_name" TEXT,
  "operator" JSONB,
  "signature" JSONB,
  "attachments" JSONB,
  "raw_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "jdy_flow_instance_events_event_key_key"
  ON "integration"."jdy_flow_instance_events"("event_key");
CREATE INDEX IF NOT EXISTS "jdy_flow_instance_events_jdy_data_id_idx"
  ON "integration"."jdy_flow_instance_events"("jdy_data_id");
CREATE INDEX IF NOT EXISTS "jdy_flow_instance_events_webhook_event_id_idx"
  ON "integration"."jdy_flow_instance_events"("webhook_event_id");
CREATE INDEX IF NOT EXISTS "jdy_flow_instance_events_event_source_idx"
  ON "integration"."jdy_flow_instance_events"("event_source");
CREATE INDEX IF NOT EXISTS "jdy_flow_instance_events_op_time_idx"
  ON "integration"."jdy_flow_instance_events"("op_time");

CREATE TABLE IF NOT EXISTS "integration"."jdy_flow_operation_logs" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT ('jfo_' || md5(random()::text || clock_timestamp()::text)),
  "action" VARCHAR(80) NOT NULL,
  "actor_user_id" TEXT,
  "jdy_username" TEXT,
  "instance_id" TEXT,
  "task_id" TEXT,
  "request_json" JSONB NOT NULL DEFAULT '{}',
  "response_json" JSONB,
  "status" VARCHAR(30) NOT NULL,
  "error_code" INTEGER,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "jdy_flow_operation_logs_action_idx"
  ON "integration"."jdy_flow_operation_logs"("action");
CREATE INDEX IF NOT EXISTS "jdy_flow_operation_logs_instance_id_idx"
  ON "integration"."jdy_flow_operation_logs"("instance_id");
CREATE INDEX IF NOT EXISTS "jdy_flow_operation_logs_task_id_idx"
  ON "integration"."jdy_flow_operation_logs"("task_id");
CREATE INDEX IF NOT EXISTS "jdy_flow_operation_logs_created_at_idx"
  ON "integration"."jdy_flow_operation_logs"("created_at");
