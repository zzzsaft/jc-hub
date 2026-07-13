# Task 2 Implementer Report

## Result

- Added deterministic AnalysisPlan-requirement scoring across registry candidates without pre-filtering missing coverage.
- Tied resolution now fails closed with `outcome=unsupported`, `capabilityCode=ambiguous`, and `reasonCode=capability_resolution_ambiguous`; it never reaches template/generator/executor.
- Metric, dimension, filter, time, and comparison gaps are preserved in `missingCoverage` and decided by `CapabilityDecisionService`.
- All planner clarification exits now return stable decision fields. Unsupported responses use capability-specific wording rather than SQL-validation wording.
- Authorization remains before capability disclosure; existing SQL and finance guards remain unchanged.
- Empty/unclassified planner module sets now fail closed with `capabilityCode=unresolved`, `reasonCode=capability_unresolved`, empty SQL, and no SQL-path calls.
- A unique registry capability whose status is not executable is rejected before optional LLM analysis; quotation therefore returns stable unsupported fields even when the analysis provider is unavailable.

## RED / GREEN

- RED: direct resolution tests failed because `resolveAndDecide` did not exist.
- GREEN: direct tests cover all five coverage kinds, best-match missing coverage, tied multi-candidate resolution, and explicit clarification candidates.
- Workflow tests cover quotation unsupported and ambiguous production capability resolution, asserting zero template/generator/executor calls and typed output fields without output casts.
- A production-reachable empty-module/unknown-intent workflow test first reproduced successful SQL execution, then verifies fail-closed behavior and zero template/generator/executor calls.

## Verification

- `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`
  - 72 passed, 0 failed.
- `npm run build:server`
  - Dirty shared workspace passed earlier. Final exact detached HEAD reached only two unrelated pre-existing ProductConfig implicit-any errors in `buildGoldenSetEvidenceSnapshot.ts`; no ERP SQL/Task 2 TypeScript errors remained.
- `git diff --cached --check`
  - Passed before commit.
- `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts`
  - 111 passed, 0 failed.

## Commits

- Initial implementation: `b3622934`
- Review fixes and self-contained prerequisites: `2711431c`
- Empty/unresolved capability fail-closed fix: `7ec24615`
- Contextual planner prerequisite: `c24b741d`
- Pre-analysis unpublished gate and stable result fixes: `128b93de`, `230edcb0`
- Quotation access mapping prerequisite: `3473d1e1`
- Multi-candidate decision correction: `5cb50a7e`
- Multi-turn compiler/display prerequisites: `b742d36c`
- Previous-month cross-year label fix: `0b77a7c3`

## Prerequisites Included

- `AnalysisPlanContextService.ts`
- `resultColumnMetadata.ts`
- `resultColumnMetadata.test.ts`
- `AnalysisPlannerService.ts`
- `MetricComposerService.ts` and `metricComposer.test.ts`
- `mastraRuntimeHandler.ts` and agent runtime display type
- template-module access mapping in `sqlAccess.ts`

These files were already-required shared work explicitly approved for inclusion because the committed workflow imports them. No ProductConfig/quote files were staged.

## Tool Mapping

Capability resolution remains a typed internal runner rather than a Mastra `createTool`. It is a mandatory policy gate controlled by the workflow, has no model/external side effect, and must not become an optional model-callable tool that can be skipped or invoked out of order.

## Risks / Boundaries

- Planner types still do not carry a canonical capability code. Resolution therefore scores only structured plan requirements and module coverage; exact ties are intentionally blocked.
- Synthetic SQL/finance guard fixtures now carry explicit purchase/finance/sales modules and inject a test-only published `execute` capability decision. Production workflow has no bypass for empty modules or empty candidate sets.

## Detached Verification

- Created a temporary detached worktree at exact `b742d36c`, linked only the repository dependency directory, and audited committed prerequisites with `git cat-file -e`.
- `mastraErpSqlAgent.test.ts + metricComposer.test.ts + resultColumnMetadata.test.ts`: 95 passed, 0 failed.
- Focused planner and real gate tests, including quotation unsupported: 24 passed, 0 failed.
- Temporary worktree was removed and pruned after verification.

## Acceptance Boundary Fix

- RED reproduced January 2026 `previous_month + year_over_year` labels as `2026-12 / 2025-12`.
- Standard `Date` month rollover now resolves the base period as December 2025 before applying the comparison-year offset, producing `2025-12 / 2024-12`.
- `resultColumnMetadata + Mastra + metricComposer`: 96 passed, 0 failed; `build:server` passed in the shared workspace.
