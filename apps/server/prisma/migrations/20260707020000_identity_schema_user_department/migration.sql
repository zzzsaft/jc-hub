CREATE SCHEMA IF NOT EXISTS "identity";

DO $$
BEGIN
  IF to_regclass('"agent"."users"') IS NOT NULL THEN
    ALTER TABLE "agent"."users" SET SCHEMA "identity";
  END IF;

  IF to_regclass('"agent"."roles"') IS NOT NULL THEN
    ALTER TABLE "agent"."roles" SET SCHEMA "identity";
  END IF;

  IF to_regclass('"agent"."user_roles"') IS NOT NULL THEN
    ALTER TABLE "agent"."user_roles" SET SCHEMA "identity";
  END IF;

  IF to_regclass('"agent"."wecom_departments"') IS NOT NULL THEN
    ALTER TABLE "agent"."wecom_departments" SET SCHEMA "identity";
  END IF;

  IF to_regclass('"agent"."wecom_user_departments"') IS NOT NULL THEN
    ALTER TABLE "agent"."wecom_user_departments" SET SCHEMA "identity";
  END IF;
END $$;
