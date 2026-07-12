# Task 7 Implementer Report

## Audit

- Reused `src/lib/concurrencyLimiter.ts`; it already provides bounded queues, abort removal, overload metrics, and 429-capable errors.
- LLM (`LLM_CONCURRENCY_LIMIT` / `LLM_MAX_QUEUE`) and ERP HTTP (`ERP_QUERY_CONCURRENCY` / `ERP_QUERY_MAX_QUEUE`) limiters already existed and remained independent.
- Added only the missing Agent Runtime pool, stable public overload mapping, readiness split, and UI feedback.
- The planned test files did not exist; created them in the brief's nearest existing test directories.

## TDD evidence

- RED: `node --test --import tsx apps/server/test/erpSqlAgent/concurrencyLimiter.test.ts apps/server/test/agentRuntime/agentRuntimeHttp.test.ts` failed because Agent Runtime limiter/error exports did not exist.
- GREEN: five submissions at limit 2/max queue 1 produce max active 2, one queued completion, and two stable retryable 429 rejections. The HTTP test verifies the overload payload and then calls the real `/health` endpoint, which remains 200.

## Implementation

- Agent Runtime now has `AGENT_RUNTIME_CONCURRENCY_LIMIT` (default 2) and `AGENT_RUNTIME_MAX_QUEUE` (default 8), independent from LLM and ERP HTTP pools.
- `/agentRuntime/run` returns `{ code: "AGENT_OVERLOADED", retryable: true }` with 429; streaming returns the same fields in its SSE error event.
- `/health` stays a liveness endpoint. `/ready` separately returns 503 while a dependency pool is saturated and queued.
- No `uncaughtException`/`unhandledRejection` swallowing was added. Existing request/route boundaries contain individual failures; failed started runs continue to be finalized in `AgentRuntimeService`.
- The web hook caps ordinary UI submissions at two active runs and shows “查询排队中/服务繁忙”.

## Verification

- `node --test --import tsx apps/server/test/erpSqlAgent/concurrencyLimiter.test.ts apps/server/test/agentRuntime/agentRuntimeHttp.test.ts apps/server/test/agentRuntime/requestAbort.test.ts apps/server/test/productConfigAgent/erpSqlQueryClient.test.ts` — 13/13 passed.
- `npm run build:server` — passed.
- `npm run build:web` — passed; Vite emitted the existing large-chunk warning.
- Browser smoke was attempted against the local Vite page on port 5174, but the available browser blocked localhost with `ERR_BLOCKED_BY_CLIENT`; no visual assertion is claimed.

## Deliberately unchanged

- `SqlExecutorService` was not changed because ERP execution already enters the existing bounded `ErpSqlQueryClient` pool; wrapping it again would duplicate the same dependency limit.
- No new dependency and no process-global exception swallowing.
