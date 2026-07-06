CREATE TABLE "agent"."user_preferences" (
    "id" BIGSERIAL NOT NULL,
    "owner_user_id" VARCHAR(120) NOT NULL,
    "preference_key" VARCHAR(200) NOT NULL,
    "value_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_preferences_owner_user_id_preference_key_key"
    ON "agent"."user_preferences"("owner_user_id", "preference_key");

CREATE INDEX "user_preferences_owner_user_id_idx"
    ON "agent"."user_preferences"("owner_user_id");
