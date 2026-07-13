-- Keep permission-scoped result rows separate from protected audit/message JSON.
ALTER TABLE "agent"."agent_messages"
  ADD COLUMN IF NOT EXISTS "display_jsonb" JSONB;
