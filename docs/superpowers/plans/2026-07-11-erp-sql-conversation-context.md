# ERP SQL Conversation Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded multi-turn history, rolling semantic summaries, safe plan snapshots, YTD comparison semantics, and explicit time-aware result labels.

**Architecture:** Agent Runtime builds a safe conversation context from the latest six messages, an older semantic summary, and the last validated plan. The planner consumes this context, while the compiler and metadata mapper use typed time windows; audit-redacted JSON is never reused as executable context.

**Tech Stack:** TypeScript, Prisma, Zod, Vitest, Mastra workflow.

## Global Constraints

- Preserve existing ERP SQL Guard, access policy, approved metric, and approved dimension boundaries.
- Do not send raw result rows or complete SQL to the planning LLM.
- Do not add question-specific SQL branches.
- “今年” means year-to-date; year-over-year means the matching prior-year interval.

---

### Task 1: Safe conversation context

**Files:**
- Modify: `apps/server/src/ai/agentRuntime/service.ts`
- Modify: `apps/server/src/ai/agentRuntime/types.ts`
- Test: `apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`

**Interfaces:**
- Produces: `conversationContext` containing `recentMessages`, `semanticSummary`, and validated `analysisPlan`.

- [ ] Write a failing test proving the runtime supplies at most six recent messages and excludes rows and SQL.
- [ ] Run `npm test -- apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` and confirm the new assertion fails.
- [ ] Read recent session messages and the last successful context, sanitize them into the bounded context, and keep audit serialization separate from runtime input.
- [ ] Run the focused test and confirm it passes.

### Task 2: Planner history and rolling summary

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts`
- Modify: `apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts`
- Modify: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Consumes: bounded `conversationContext`.
- Produces: validated `AnalysisPlan` and updated `semanticSummary` with source message ids and version.

- [ ] Write failing tests for the third-turn June refinement, a redacted malformed rule target, and context older than six messages.
- [ ] Run the focused Mastra test and confirm all three assertions fail for the intended reasons.
- [ ] Add Zod validation at the context boundary, pass recent dialogue and semantic summary to the planning request, merge only validated fields, and incrementally update the summary.
- [ ] Run the focused test and confirm it passes without `value.replace` errors.

### Task 3: YTD windows and time-aware labels

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/types/SqlPlannerTypes.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/agent/resultColumnMetadata.ts`
- Test: `apps/server/test/erpSqlAgent/metricComposer.test.ts`
- Test: `apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`

**Interfaces:**
- Produces: half-open YTD/current-month windows and column labels derived from the resolved window.

- [ ] Write failing tests asserting “今年” ends tomorrow at midnight, prior-year comparison ends at the matching prior-year date, and June labels name both years/months.
- [ ] Run the two focused test files and confirm the assertions fail.
- [ ] Compile YTD and matching prior-year windows and pass resolved period labels into `buildResultColumns`.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Regression, documentation, and deployment verification

**Files:**
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/architecture/erp-sql-finance-metrics.md`
- Modify: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Consumes: completed runtime, planner, compiler, and metadata behavior.
- Produces: documented compatibility and deployment evidence.

- [ ] Run the complete ERP SQL test suite and confirm all tests pass.
- [ ] Run `npm run build:server`, `npm run build:web`, `npm run prisma:validate`, and `git diff --check`.
- [ ] Restart or reload the server and run the three-turn browser regression in one session.
- [ ] Confirm dynamic labels identify current and prior periods and no template without declared coverage executes.
- [ ] Update API, architecture, and implementation-log documentation with the verified behavior and remaining risks.
