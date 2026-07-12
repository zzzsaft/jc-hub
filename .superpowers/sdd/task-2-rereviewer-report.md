# Task 2 Re-review

## Verdict: FAIL

## Blocker

1. **`modules: []` still bypasses the capability gate on a reachable production path.** The workflow only calls capability resolution inside `if (capabilityCandidates.length > 0)` and otherwise continues directly toward template lookup (`apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:187-212,237-255`). This is not limited to tests or a private internal path: the production planner deliberately returns an empty module list when the extracted intent has no module/`unknown` and keyword scoring finds no positive match (`apps/server/src/modules/erpSqlAgent/planner/service/SqlPlannerService.ts:39-40,65-70,103-128`). Authorization does not close this gap: an empty list is converted to `custom`, so a caller with custom scope passes rather than failing closed (`apps/server/src/modules/erpSqlAgent/access/sqlAccess.ts:18-23`). Consequently an unclassified production request can skip capability publication/coverage checks and reach template/generator/executor. The test fixture normalizes this bypass by making its default, finance, and sales plans module-empty (`apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:1678-1726`), and multiple successful SQL-path tests run through it. Task 2 requires the capability decision before SQL paths; empty/unresolved modules must themselves fail closed (or be resolved from another trusted production signal), while any intentional test-only bypass must not exist in production workflow logic.

## Previous findings rechecked

- **Multi-candidate modules no longer bypass:** fixed. `resolveAndDecide` scores every module-matching candidate and ties return `unsupported/ambiguous` (`CapabilityDecisionService.ts:9-21,74-75`). Workflow regression coverage asserts zero template/generator/executor calls for a production-module tie (`mastraErpSqlAgent.test.ts:618-639`).
- **Missing coverage is not pre-filtered:** fixed. Candidate scoring counts matches but retains the best candidate with its gaps; `decide` then emits all missing metric/dimension/filter/time/comparison coverage (`CapabilityDecisionService.ts:23-52,55-70`). Direct tests cover all five kinds and best-match missing coverage (`mastraErpSqlAgent.test.ts:44-88`).
- **Tie fail-closed:** fixed, with direct and workflow tests (`mastraErpSqlAgent.test.ts:60-69,618-639`).
- **Stable clarify fields:** fixed. Both capability clarification and the legacy planner clarification exit return stable `outcome`, `capabilityCode`, `reasonCode`, and `missingCoverage` fields (`erpSqlToolchain.workflow.ts:195-210,213-230`); workflow test checks these without output casts (`mastraErpSqlAgent.test.ts:809-837`).
- **Unsupported wording:** fixed. Unsupported outcomes use capability-specific wording before generic SQL-validation messages (`erpSqlToolchain.workflow.ts:1019-1046`), and the ambiguous workflow test checks the rendered message (`mastraErpSqlAgent.test.ts:631-636`).
- **Test coverage:** materially improved for the decision service, tie behavior, stable clarification output, and zero SQL-path calls. It still lacks the required production-reachable empty-module fail-closed case; existing module-empty fixtures instead exercise and conceal the bypass.
- **Independent checkout/self-containment:** fixed. Both previously missing prerequisites exist in `2711431c`, and the named tests plus server build succeed in a detached worktree. `git cat-file -e` confirmed `AnalysisPlanContextService.ts` and `resultColumnMetadata.ts` are present.
- **Finance guard and authorization:** no Task 2 diff touches the guard/access implementations. Detached access-policy and SQL-guard suites pass 38/38, including fail-closed module checks and strict/estimate finance cases. The empty-module behavior above is nevertheless a capability-gate defect even though later SQL access scoping remains active.
- **Multi-turn and result metadata prerequisites:** committed and self-contained. The detached target suite passes the follow-up merge, third-turn month refinement, runtime display payload, and four dedicated result-column metadata tests. No regression was observed in these prerequisites.

## Verification evidence

All commands below ran against a temporary detached worktree at exact commit `2711431c`, with only the repository's existing `node_modules` linked:

- `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts` — **72 passed, 0 failed**.
- `npm run build:server` — **passed** (`tsc -p apps/server/tsconfig.json`, exit 0).
- `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts` — **38 passed, 0 failed**.
- `git cat-file -e 2711431c:apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.ts` — **passed**.
- `git cat-file -e 2711431c:apps/server/src/modules/erpSqlAgent/agent/resultColumnMetadata.ts` — **passed**.
- `git diff --check 8c7de39f..2711431c` — **passed**.

No source files or commits were modified during review; only this requested report was written.
