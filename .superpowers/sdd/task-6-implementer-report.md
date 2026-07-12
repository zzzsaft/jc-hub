# Task 6 Implementer Report

## Result

- Centralized ERP routing vocabulary in `capabilities/registry.ts` and exported `matchesErpSqlCapabilityVocabulary`.
- Reused that matcher from the ERP agent domain while preserving the existing obvious non-ERP exclusions.
- Routed ERP capability questions to `mastraErpSqlAgent`, including unsupported capabilities; authorization and handler access checks were unchanged.
- Added representative routing coverage and a contract-derived subset for the 26 previously misrouted golden questions.

## TDD evidence

- RED: `node --test --import tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` failed 4 routing tests because requests still selected `erpSqlAgent` or were not recognized as ERP.
- GREEN: `node --test --import tsx $(rg --files apps/server/test/agentRuntime -g '*.test.ts') apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` passed 16/16.
- Regression: capability registry and ProductConfig Agent routing suites passed 23/23 together with the handler suite.
- Build: `npm run build:server` passed.
- Hygiene: `git diff --check` passed.

## Scope

Changed only the Task 6 router, ERP agent domain, capability registry, routing test, and this report. Existing progress, review/brief files, and `node_modules` were not staged.
