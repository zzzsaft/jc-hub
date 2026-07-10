CREATE TABLE IF NOT EXISTS "erp_agent"."erp_sql_access_policies" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" VARCHAR(120),
  "role_id" VARCHAR(120),
  "environment" VARCHAR(30) NOT NULL DEFAULT 'production',
  "rollout_mode" VARCHAR(50) NOT NULL DEFAULT 'production',
  "companies_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "modules_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "departments_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "business_units_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "customer_numbers_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sensitive_finance" BOOLEAN NOT NULL DEFAULT false,
  "sensitive_customer" BOOLEAN NOT NULL DEFAULT false,
  "sensitive_employee" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "created_by" VARCHAR(120),
  "updated_by" VARCHAR(120),
  "approved_by" VARCHAR(120),
  "effective_from" TIMESTAMP(6),
  "expires_at" TIMESTAMP(6),
  "archived_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "erp_sql_access_policies_subject_check" CHECK (
    ("user_id" IS NOT NULL AND "role_id" IS NULL) OR
    ("user_id" IS NULL AND "role_id" IS NOT NULL)
  ),
  CONSTRAINT "erp_sql_access_policies_company_array_check" CHECK (jsonb_typeof("companies_json") = 'array'),
  CONSTRAINT "erp_sql_access_policies_module_array_check" CHECK (jsonb_typeof("modules_json") = 'array')
);

CREATE INDEX IF NOT EXISTS "erp_sql_access_policies_user_env_enabled_idx"
  ON "erp_agent"."erp_sql_access_policies"("user_id", "environment", "enabled");

CREATE INDEX IF NOT EXISTS "erp_sql_access_policies_role_env_enabled_idx"
  ON "erp_agent"."erp_sql_access_policies"("role_id", "environment", "enabled");

CREATE INDEX IF NOT EXISTS "erp_sql_access_policies_archived_at_idx"
  ON "erp_agent"."erp_sql_access_policies"("archived_at");

CREATE TABLE IF NOT EXISTS "erp_agent"."erp_sql_access_policy_audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "policy_id" BIGINT,
  "action" VARCHAR(40) NOT NULL,
  "actor_user_id" VARCHAR(120),
  "reason" TEXT,
  "before_json" JSONB,
  "after_json" JSONB,
  "ip" VARCHAR(80),
  "user_agent" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "erp_sql_access_policy_audit_policy_created_idx"
  ON "erp_agent"."erp_sql_access_policy_audit_logs"("policy_id", "created_at");

CREATE INDEX IF NOT EXISTS "erp_sql_access_policy_audit_actor_created_idx"
  ON "erp_agent"."erp_sql_access_policy_audit_logs"("actor_user_id", "created_at");

INSERT INTO "identity"."permissions" ("id", "code", "resource", "action", "name", "description")
VALUES
  ('agent.erp-sql.access-policy:view', 'agent.erp-sql.access-policy:view', 'agent.erp-sql.access-policy', 'view', '查看 ERP SQL 数据范围策略', '允许查看 ERP SQL Agent 数据范围 policy 与审计日志'),
  ('agent.erp-sql.access-policy:manage', 'agent.erp-sql.access-policy:manage', 'agent.erp-sql.access-policy', 'manage', '管理 ERP SQL 数据范围策略', '允许创建、更新、启停和归档 ERP SQL Agent 数据范围 policy')
ON CONFLICT ("code") DO UPDATE SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
