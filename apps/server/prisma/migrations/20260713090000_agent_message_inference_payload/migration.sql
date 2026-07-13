ALTER TABLE "agent"."agent_messages"
ADD COLUMN IF NOT EXISTS "inference_jsonb" JSONB;
