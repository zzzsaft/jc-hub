# Task 6 Implementer Report

## Result

- Centralized ERP routing vocabulary in `capabilities/registry.ts` and exported `matchesErpSqlCapabilityVocabulary`.
- Reused that matcher from the ERP agent domain while preserving the existing obvious non-ERP exclusions.
- Routed ERP capability questions to `mastraErpSqlAgent`, including unsupported capabilities; authorization and handler access checks were unchanged.
- Added representative routing coverage and a contract-derived subset for the 26 previously misrouted golden questions.
- Review fix: ERP capability queries now take precedence over the generic quote route, while create/generate/submit/edit quote actions remain with `quoteAgent` and ProductConfig retains its precedence.

## TDD evidence

- RED: `node --test --import tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` failed 4 routing tests because requests still selected `erpSqlAgent` or were not recognized as ERP.
- GREEN: `node --test --import tsx $(rg --files apps/server/test/agentRuntime -g '*.test.ts') apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` passed 16/16.
- Regression: capability registry and ProductConfig Agent routing suites passed 23/23 together with the handler suite.
- Build: `npm run build:server` passed.
- Hygiene: `git diff --check` passed.

## Review correction

- RED reproduced `查报价合同中的产品明细` being intercepted by `quoteAgent`.
- Added query regressions for quotation contracts, contract configuration data, and profit reports; added negative coverage for generate/create/submit/edit quote actions and exact `generalAgent` assertions for weather/general prompts.
- Fixed precedence with reusable query/action intent predicates combined with the centralized ERP capability matcher; no golden sentence is special-cased.

## Scope

Changed only the Task 6 router, ERP agent domain, capability registry, routing test, and this report. Existing progress, review/brief files, and `node_modules` were not staged.
