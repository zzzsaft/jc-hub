ALTER TABLE "identity"."users"
  ADD COLUMN IF NOT EXISTS "erp_user_id" TEXT;

UPDATE "identity"."users"
SET "id" = 'usr_' || md5("id")
WHERE "wecom_user_id" IS NOT NULL
  AND "id" = "wecom_user_id";

CREATE UNIQUE INDEX IF NOT EXISTS "users_wecom_user_id_key"
  ON "identity"."users"("wecom_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_erp_user_id_key"
  ON "identity"."users"("erp_user_id");
