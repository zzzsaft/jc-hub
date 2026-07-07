CREATE TABLE IF NOT EXISTS "agent"."express_request_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "original_url" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "ip" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT,
  "request_body" JSONB,
  "response_body" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "express_request_logs_created_at_idx" ON "agent"."express_request_logs"("created_at");
CREATE INDEX IF NOT EXISTS "express_request_logs_method_path_idx" ON "agent"."express_request_logs"("method", "path");
CREATE INDEX IF NOT EXISTS "express_request_logs_status_code_idx" ON "agent"."express_request_logs"("status_code");
CREATE INDEX IF NOT EXISTS "express_request_logs_user_id_idx" ON "agent"."express_request_logs"("user_id");

CREATE TABLE IF NOT EXISTS "agent"."axios_request_logs" (
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

CREATE INDEX IF NOT EXISTS "axios_request_logs_created_at_idx" ON "agent"."axios_request_logs"("created_at");
CREATE INDEX IF NOT EXISTS "axios_request_logs_method_url_idx" ON "agent"."axios_request_logs"("method", "url");
CREATE INDEX IF NOT EXISTS "axios_request_logs_status_code_idx" ON "agent"."axios_request_logs"("status_code");

CREATE TABLE IF NOT EXISTS "agent"."xft_integration_configs" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "host" TEXT NOT NULL,
  "appid" TEXT NOT NULL,
  "app_secret" TEXT NOT NULL,
  "enterprise_id" TEXT NOT NULL,
  "default_user_id" TEXT NOT NULL DEFAULT 'U0000',
  "default_platform_user_id" TEXT NOT NULL DEFAULT 'AUTO0001',
  "data_collection_name" TEXT NOT NULL,
  "import_type" TEXT NOT NULL DEFAULT 'ADD',
  "salary_period" TEXT NOT NULL,
  "work_hours_field_key" TEXT NOT NULL,
  "is_check_empty" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "agent"."users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "wecom_user_id" TEXT,
  "employee_no" TEXT,
  "username" TEXT,
  "password_hash" TEXT,
  "name" TEXT NOT NULL,
  "name_initials" TEXT,
  "avatar" TEXT,
  "gender" TEXT,
  "qr_code" TEXT,
  "mobile" TEXT,
  "email" TEXT,
  "biz_mail" TEXT,
  "address" TEXT,
  "department" JSONB,
  "department_order" JSONB,
  "position" TEXT,
  "is_leader_in_dept" JSONB,
  "direct_leader" JSONB,
  "telephone" TEXT,
  "alias" TEXT,
  "extattr" JSONB,
  "wecom_status" INTEGER,
  "external_profile" JSONB,
  "external_position" TEXT,
  "open_userid" TEXT,
  "main_department" INTEGER,
  "team_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "agent"."users"("username");

CREATE TABLE IF NOT EXISTS "agent"."roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "roles_code_key" ON "agent"."roles"("code");

CREATE TABLE IF NOT EXISTS "agent"."user_roles" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId")
);

ALTER TABLE "agent"."user_roles"
  ADD CONSTRAINT "user_roles_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "agent"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent"."user_roles"
  ADD CONSTRAINT "user_roles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "agent"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "agent"."wecom_departments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL,
  "department_id" INTEGER NOT NULL,
  "name" TEXT,
  "name_en" TEXT,
  "department_leader" JSONB,
  "parent_id" INTEGER NOT NULL,
  "order_value" BIGINT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "wecom_departments_client_id_department_id_key"
  ON "agent"."wecom_departments"("client_id", "department_id");
CREATE INDEX IF NOT EXISTS "wecom_departments_client_id_parent_id_idx"
  ON "agent"."wecom_departments"("client_id", "parent_id");

CREATE TABLE IF NOT EXISTS "agent"."wecom_user_departments" (
  "client_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "department_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wecom_user_departments_pkey" PRIMARY KEY ("client_id", "user_id", "department_id")
);

ALTER TABLE "agent"."wecom_user_departments"
  ADD CONSTRAINT "wecom_user_departments_client_id_department_id_fkey"
  FOREIGN KEY ("client_id", "department_id")
  REFERENCES "agent"."wecom_departments"("client_id", "department_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "wecom_user_departments_client_id_department_id_idx"
  ON "agent"."wecom_user_departments"("client_id", "department_id");
CREATE INDEX IF NOT EXISTS "wecom_user_departments_user_id_idx"
  ON "agent"."wecom_user_departments"("user_id");
