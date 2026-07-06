-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "agent";

-- CreateTable
CREATE TABLE "agent"."agent_sessions" (
    "id" BIGSERIAL NOT NULL,
    "agent_type" VARCHAR(100) NOT NULL DEFAULT 'generalAgent',
    "title" TEXT,
    "owner_user_id" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "metadata_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."agent_messages" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "content" TEXT,
    "content_jsonb" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."agent_runs" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "agent_type" VARCHAR(100) NOT NULL,
    "intent" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'running',
    "planner_jsonb" JSONB NOT NULL DEFAULT '{}',
    "context_summary_jsonb" JSONB NOT NULL DEFAULT '{}',
    "error_jsonb" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."agent_tool_calls" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "step_id" VARCHAR(100) NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "args_jsonb" JSONB NOT NULL DEFAULT '{}',
    "result_jsonb" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'running',
    "error_jsonb" JSONB,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."agent_generated_configs" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "session_id" BIGINT NOT NULL,
    "title" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "config_jsonb" JSONB NOT NULL DEFAULT '{}',
    "validation_jsonb" JSONB NOT NULL DEFAULT '{}',
    "share_token" TEXT,
    "share_token_expires_at" TIMESTAMP(3),
    "share_token_revoked_at" TIMESTAMP(3),
    "owner_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_generated_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."llm_call_logs" (
    "id" BIGSERIAL NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "purpose" VARCHAR(100) NOT NULL,
    "input_jsonb" JSONB NOT NULL,
    "output_jsonb" JSONB,
    "error" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "latency_ms" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_call_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."documents" (
    "id" BIGSERIAL NOT NULL,
    "file_name" TEXT,
    "file_hash" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "source" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'uploaded',
    "dictionary_dirty" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."document_blocks" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT NOT NULL,
    "blocks_json" JSONB NOT NULL,
    "parser_version" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."extraction_results" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT NOT NULL,
    "extraction_json" JSONB NOT NULL,
    "normalized_extraction_json" JSONB,
    "dictionary_proposals" JSONB,
    "warnings" JSONB,
    "llm_plan_json" JSONB,
    "llm_model" VARCHAR(100),
    "prompt_version" VARCHAR(100),
    "dictionary_version" BIGINT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extraction_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_term_types" (
    "id" BIGSERIAL NOT NULL,
    "term_type" VARCHAR(100) NOT NULL,
    "display_name" TEXT NOT NULL,
    "kind" VARCHAR(50) NOT NULL DEFAULT 'value',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_term_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_terms" (
    "id" BIGSERIAL NOT NULL,
    "term_type" VARCHAR(100) NOT NULL,
    "canonical_value" TEXT NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_terms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_sessions_agent_type_idx" ON "agent"."agent_sessions"("agent_type");
CREATE INDEX "agent_sessions_owner_user_id_idx" ON "agent"."agent_sessions"("owner_user_id");
CREATE INDEX "agent_sessions_status_idx" ON "agent"."agent_sessions"("status");
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent"."agent_messages"("session_id", "created_at");
CREATE INDEX "agent_messages_role_idx" ON "agent"."agent_messages"("role");
CREATE INDEX "agent_runs_session_id_created_at_idx" ON "agent"."agent_runs"("session_id", "created_at");
CREATE INDEX "agent_runs_agent_type_idx" ON "agent"."agent_runs"("agent_type");
CREATE INDEX "agent_runs_status_idx" ON "agent"."agent_runs"("status");
CREATE INDEX "agent_tool_calls_run_id_step_id_idx" ON "agent"."agent_tool_calls"("run_id", "step_id");
CREATE INDEX "agent_tool_calls_tool_name_idx" ON "agent"."agent_tool_calls"("tool_name");
CREATE INDEX "agent_tool_calls_status_idx" ON "agent"."agent_tool_calls"("status");
CREATE UNIQUE INDEX "agent_generated_configs_share_token_key" ON "agent"."agent_generated_configs"("share_token");
CREATE INDEX "agent_generated_configs_run_id_idx" ON "agent"."agent_generated_configs"("run_id");
CREATE INDEX "agent_generated_configs_session_id_idx" ON "agent"."agent_generated_configs"("session_id");
CREATE INDEX "agent_generated_configs_owner_user_id_idx" ON "agent"."agent_generated_configs"("owner_user_id");
CREATE INDEX "agent_generated_configs_status_idx" ON "agent"."agent_generated_configs"("status");
CREATE INDEX "agent_generated_configs_share_token_expires_at_idx" ON "agent"."agent_generated_configs"("share_token_expires_at");
CREATE INDEX "llm_call_logs_provider_idx" ON "agent"."llm_call_logs"("provider");
CREATE INDEX "llm_call_logs_model_idx" ON "agent"."llm_call_logs"("model");
CREATE INDEX "llm_call_logs_purpose_idx" ON "agent"."llm_call_logs"("purpose");
CREATE INDEX "llm_call_logs_status_idx" ON "agent"."llm_call_logs"("status");
CREATE UNIQUE INDEX "documents_file_hash_key" ON "agent"."documents"("file_hash");
CREATE INDEX "documents_status_idx" ON "agent"."documents"("status");
CREATE INDEX "documents_created_at_idx" ON "agent"."documents"("created_at");
CREATE UNIQUE INDEX "document_blocks_document_id_key" ON "agent"."document_blocks"("document_id");
CREATE INDEX "extraction_results_document_id_created_at_idx" ON "agent"."extraction_results"("document_id", "created_at");
CREATE INDEX "extraction_results_status_idx" ON "agent"."extraction_results"("status");
CREATE UNIQUE INDEX "dictionary_term_types_term_type_key" ON "agent"."dictionary_term_types"("term_type");
CREATE INDEX "dictionary_term_types_kind_idx" ON "agent"."dictionary_term_types"("kind");
CREATE INDEX "dictionary_term_types_is_active_idx" ON "agent"."dictionary_term_types"("is_active");
CREATE INDEX "dictionary_terms_term_type_idx" ON "agent"."dictionary_terms"("term_type");
CREATE INDEX "dictionary_terms_is_active_idx" ON "agent"."dictionary_terms"("is_active");
CREATE UNIQUE INDEX "dictionary_terms_term_type_canonical_value_key" ON "agent"."dictionary_terms"("term_type", "canonical_value");

CREATE TABLE "agent"."document_duplicates" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT NOT NULL,
    "duplicate_document_id" BIGINT NOT NULL,
    "duplicate_type" VARCHAR(60) NOT NULL DEFAULT 'file_hash',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_duplicates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_candidates" (
    "id" BIGSERIAL NOT NULL,
    "term_type" VARCHAR(100) NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "canonical_value" TEXT,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "occurrence_count" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(80),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_candidate_occurrences" (
    "id" BIGSERIAL NOT NULL,
    "candidate_id" BIGINT NOT NULL,
    "document_id" BIGINT,
    "extraction_id" BIGINT,
    "field_path" TEXT,
    "raw_value" TEXT NOT NULL,
    "context_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dictionary_candidate_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_suggestions" (
    "id" BIGSERIAL NOT NULL,
    "term_type" VARCHAR(100) NOT NULL,
    "candidate_id" BIGINT,
    "suggested_value" TEXT NOT NULL,
    "suggestion_type" VARCHAR(60) NOT NULL DEFAULT 'create',
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_splits" (
    "id" BIGSERIAL NOT NULL,
    "term_type" VARCHAR(100) NOT NULL,
    "source_value" TEXT NOT NULL,
    "parts_json" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_splits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."concept_resolver_entries" (
    "id" BIGSERIAL NOT NULL,
    "concept_type" VARCHAR(100) NOT NULL,
    "source_value" TEXT NOT NULL,
    "resolved_value" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "resolver_version" VARCHAR(80),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "concept_resolver_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."dictionary_health_report" (
    "id" BIGSERIAL NOT NULL,
    "report_type" VARCHAR(80) NOT NULL DEFAULT 'dictionary',
    "status" VARCHAR(40) NOT NULL DEFAULT 'created',
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    "findings_json" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dictionary_health_report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."contract_archives" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT,
    "archive_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "product_bindings" JSONB NOT NULL DEFAULT '[]',
    "archive_json" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_archives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent"."background_jobs" (
    "id" BIGSERIAL NOT NULL,
    "job_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "result_json" JSONB,
    "error_json" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_duplicates_document_id_duplicate_document_id_duplicate_type_key" ON "agent"."document_duplicates"("document_id", "duplicate_document_id", "duplicate_type");
CREATE INDEX "document_duplicates_document_id_idx" ON "agent"."document_duplicates"("document_id");
CREATE INDEX "document_duplicates_duplicate_document_id_idx" ON "agent"."document_duplicates"("duplicate_document_id");
CREATE UNIQUE INDEX "dictionary_candidates_term_type_raw_value_key" ON "agent"."dictionary_candidates"("term_type", "raw_value");
CREATE INDEX "dictionary_candidates_term_type_status_idx" ON "agent"."dictionary_candidates"("term_type", "status");
CREATE INDEX "dictionary_candidates_status_score_idx" ON "agent"."dictionary_candidates"("status", "score");
CREATE INDEX "dictionary_candidate_occurrences_candidate_id_idx" ON "agent"."dictionary_candidate_occurrences"("candidate_id");
CREATE INDEX "dictionary_candidate_occurrences_document_id_idx" ON "agent"."dictionary_candidate_occurrences"("document_id");
CREATE INDEX "dictionary_candidate_occurrences_extraction_id_idx" ON "agent"."dictionary_candidate_occurrences"("extraction_id");
CREATE INDEX "dictionary_suggestions_term_type_status_idx" ON "agent"."dictionary_suggestions"("term_type", "status");
CREATE INDEX "dictionary_suggestions_candidate_id_idx" ON "agent"."dictionary_suggestions"("candidate_id");
CREATE UNIQUE INDEX "dictionary_splits_term_type_source_value_key" ON "agent"."dictionary_splits"("term_type", "source_value");
CREATE INDEX "dictionary_splits_term_type_status_idx" ON "agent"."dictionary_splits"("term_type", "status");
CREATE UNIQUE INDEX "concept_resolver_entries_concept_type_source_value_key" ON "agent"."concept_resolver_entries"("concept_type", "source_value");
CREATE INDEX "concept_resolver_entries_concept_type_status_idx" ON "agent"."concept_resolver_entries"("concept_type", "status");
CREATE INDEX "dictionary_health_report_report_type_created_at_idx" ON "agent"."dictionary_health_report"("report_type", "created_at");
CREATE INDEX "dictionary_health_report_status_idx" ON "agent"."dictionary_health_report"("status");
CREATE UNIQUE INDEX "contract_archives_archive_key_key" ON "agent"."contract_archives"("archive_key");
CREATE INDEX "contract_archives_document_id_idx" ON "agent"."contract_archives"("document_id");
CREATE INDEX "contract_archives_status_updated_at_idx" ON "agent"."contract_archives"("status", "updated_at");
CREATE INDEX "background_jobs_job_type_status_idx" ON "agent"."background_jobs"("job_type", "status");
CREATE INDEX "background_jobs_status_priority_run_after_idx" ON "agent"."background_jobs"("status", "priority", "run_after");
