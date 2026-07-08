\set ON_ERROR_STOP on

-- Run with:
-- psql "$DATABASE_URL" \
--   -v app_reader=jc_hub_reader \
--   -v app_reader_password='change-me' \
--   -v hr_reader=jc_hub_hr_performance_reader \
--   -v hr_reader_password='change-me' \
--   -f docs/operations/hr-performance-postgres-access.sql

CREATE SCHEMA IF NOT EXISTS "hr_performance_agent";
REVOKE ALL ON SCHEMA "hr_performance_agent" FROM PUBLIC;

SELECT current_database() AS database_name \gset

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_reader', :'app_reader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_reader') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_reader', :'app_reader_password') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'hr_reader', :'hr_reader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'hr_reader') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'hr_reader', :'hr_reader_password') \gexec

GRANT CONNECT ON DATABASE :"database_name" TO :"app_reader", :"hr_reader";

GRANT USAGE ON SCHEMA "agent", "erp_agent", "production_config_agent", "identity", "integration" TO :"app_reader";
GRANT SELECT ON ALL TABLES IN SCHEMA "agent", "erp_agent", "production_config_agent", "identity", "integration" TO :"app_reader";
ALTER DEFAULT PRIVILEGES IN SCHEMA "agent", "erp_agent", "production_config_agent", "identity", "integration"
  GRANT SELECT ON TABLES TO :"app_reader";

REVOKE ALL ON SCHEMA "hr_performance_agent" FROM :"app_reader";
REVOKE ALL ON ALL TABLES IN SCHEMA "hr_performance_agent" FROM :"app_reader";

GRANT USAGE ON SCHEMA "hr_performance_agent" TO :"hr_reader";
GRANT SELECT ON ALL TABLES IN SCHEMA "hr_performance_agent" TO :"hr_reader";
ALTER DEFAULT PRIVILEGES IN SCHEMA "hr_performance_agent"
  GRANT SELECT ON TABLES TO :"hr_reader";
