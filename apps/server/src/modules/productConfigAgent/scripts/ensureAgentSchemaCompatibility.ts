import { prisma } from "../../../lib/prisma.js";

const statements = [
  `create schema if not exists production_config_agent`,
  `create table if not exists agent.agent_sessions (id bigserial primary key, agent_type varchar(100) not null default 'generalAgent', title text, owner_user_id text, status varchar(50) not null default 'active', metadata_jsonb jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists agent.agent_messages (id bigserial primary key, session_id bigint not null, role varchar(50) not null, content text, content_jsonb jsonb, created_at timestamp not null default now())`,
  `create table if not exists agent.agent_runs (id bigserial primary key, session_id bigint not null, agent_type varchar(100) not null, intent varchar(100), status varchar(50) not null default 'running', planner_jsonb jsonb not null default '{}'::jsonb, context_summary_jsonb jsonb not null default '{}'::jsonb, error_jsonb jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists agent.agent_tool_calls (id bigserial primary key, run_id bigint not null, step_id varchar(100) not null, tool_name varchar(100) not null, args_jsonb jsonb not null default '{}'::jsonb, result_jsonb jsonb, status varchar(50) not null default 'running', error_jsonb jsonb, duration_ms integer, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists agent.agent_generated_configs (id bigserial primary key, run_id bigint not null, session_id bigint not null, title text, status varchar(50) not null default 'draft', config_jsonb jsonb not null default '{}'::jsonb, validation_jsonb jsonb not null default '{}'::jsonb, share_token text unique, share_token_expires_at timestamp, share_token_revoked_at timestamp, owner_user_id text, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists agent.llm_call_logs (id bigserial primary key, provider varchar(50) not null, model varchar(100) not null, purpose varchar(100) not null, input_jsonb jsonb not null, output_jsonb jsonb, error text, status varchar(30) not null default 'pending', latency_ms integer, started_at timestamp not null, completed_at timestamp, created_at timestamp not null default now())`,
  `create table if not exists production_config_agent.dictionary_suggestions (id bigserial primary key, term_type varchar(100) not null, candidate_id bigint, suggested_value text not null, suggestion_type varchar(60) not null default 'create', status varchar(40) not null default 'pending', score double precision not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists production_config_agent.dictionary_splits (id bigserial primary key, term_type varchar(100) not null, source_value text not null, parts_json jsonb not null default '[]'::jsonb, status varchar(40) not null default 'pending', metadata jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists production_config_agent.concept_resolver_entries (id bigserial primary key, concept_type varchar(100) not null, source_value text not null, resolved_value text, confidence numeric(5,3), status varchar(40) not null default 'pending', resolver_version varchar(50), metadata jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists production_config_agent.dictionary_health_report (id bigserial primary key, report_type varchar(80) not null default 'dictionary', status varchar(40) not null default 'created', summary_json jsonb not null default '{}'::jsonb, findings_json jsonb not null default '[]'::jsonb, created_by text, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists production_config_agent.master_data_products (id bigserial primary key, source varchar(80) not null default 'manual', external_id text, model text, name text, details_json jsonb not null default '{}'::jsonb, normalized_model text, normalized_attributes_json jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `create table if not exists production_config_agent.background_jobs (id bigserial primary key, job_type varchar(100) not null, status varchar(40) not null default 'queued', priority integer not null default 0, payload_json jsonb not null default '{}'::jsonb, result_json jsonb, error_json jsonb, progress double precision not null default 0, attempts integer not null default 0, max_attempts integer not null default 3, locked_by text, locked_at timestamp, run_after timestamp not null default now(), started_at timestamp, completed_at timestamp, created_at timestamp not null default now(), updated_at timestamp not null default now())`,
  `alter table production_config_agent.document_duplicates add column if not exists duplicate_type varchar(60) not null default 'legacy'`,
  `alter table production_config_agent.document_duplicates add column if not exists confidence double precision not null default 1`,
  `alter table production_config_agent.document_duplicates add column if not exists metadata jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.dictionary_change_logs add column if not exists version_key text not null default 'default'`,
  `alter table production_config_agent.dictionary_change_logs add column if not exists entity_id text`,
  `alter table production_config_agent.dictionary_change_logs add column if not exists before_json jsonb`,
  `alter table production_config_agent.dictionary_change_logs add column if not exists after_json jsonb`,
  `update production_config_agent.dictionary_change_logs set before_json = before_jsonb where before_json is null and before_jsonb is not null`,
  `update production_config_agent.dictionary_change_logs set after_json = after_jsonb where after_json is null and after_jsonb is not null`,
  `alter table production_config_agent.dictionary_change_logs add column if not exists created_by text`,
  `alter table production_config_agent.split_resolutions add column if not exists resolution_json jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.split_resolutions add column if not exists status varchar(40) not null default 'pending'`,
  `alter table production_config_agent.split_resolutions add column if not exists metadata jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.concept_resolver_runs add column if not exists input_json jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.concept_resolver_runs add column if not exists result_json jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.concept_resolver_runs add column if not exists error_json jsonb`,
  `alter table production_config_agent.concept_resolver_runs add column if not exists started_at timestamp not null default now()`,
  `alter table production_config_agent.concept_pattern_reviews add column if not exists metadata jsonb not null default '{}'::jsonb`,
  `alter table production_config_agent.concept_pattern_reviews add column if not exists note text`,
];

for (const statement of statements) {
  console.log("Applying:", statement);
  await prisma.$executeRawUnsafe(statement);
}

await prisma.$disconnect();
