CREATE SCHEMA IF NOT EXISTS "integration";

CREATE TABLE IF NOT EXISTS "integration"."jdy_crm_customers" (
  "data_id" TEXT NOT NULL PRIMARY KEY,
  "customer_name" TEXT NOT NULL,
  "short_name" TEXT,
  "customer_code" TEXT,
  "raw_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "jdy_crm_customers_customer_name_idx"
  ON "integration"."jdy_crm_customers"("customer_name");
CREATE INDEX IF NOT EXISTS "jdy_crm_customers_short_name_idx"
  ON "integration"."jdy_crm_customers"("short_name");
CREATE INDEX IF NOT EXISTS "jdy_crm_customers_customer_code_idx"
  ON "integration"."jdy_crm_customers"("customer_code");
