# Task 2 Final Review

## Verdict: FAIL

## Blocking findings

1. **The final commit is still not self-contained, and the required verification fails at exact commit `7ec24615`.** In a fresh detached worktree containing only `7ec24615` (with the repository's existing `node_modules` linked), the named target command completed with **64 passed / 9 failed out of 73**, not the implementer-reported 72/72. The required `npm run build:server` also exited 2. The committed workflow/tool changes call shared behavior that remains only in the dirty main workspace: notably `runAnalyzeSqlQuestionTool` calls `AnalysisPlannerService.plan` with five arguments while the committed service accepts only one or two (`TS2554`). The target tests also expect uncommitted planner behavior and uncommitted runtime `displayJsonb` mapping. Consequently the green report was produced with dirty-workspace dependencies, and this range cannot be reviewed or landed independently.

2. **The required published-unsupported production-path regression itself fails in the detached target.** `unsupported capability never reaches template or generator` returns no `outcome` at the assertion point instead of `unsupported`. The empty-module and ambiguous real-decision regressions pass, but the core quotation test from the brief does not. This independently blocks Task 2 even before considering the other seven target-suite regressions.

## Focused gate review

- The previous empty-module bypass is fixed in production code: after authorization and analysis planning, an empty candidate set returns `success=false`, `outcome=unsupported`, `capabilityCode=unresolved`, `reasonCode=capability_unresolved`, and empty SQL before template/generator/executor. Its real-decision regression passed in the detached checkout.
- Multi-candidate ties remain fail-closed and the real-decision ambiguous workflow regression passed.
- Missing coverage is still evaluated by `CapabilityDecisionService` without pre-filtering, and direct tests cover metrics, dimensions, filters, time semantics, comparisons, best-match gaps, tie handling, and explicit clarification.
- Authorization remains before capability disclosure.
- Old successful SQL-path tests now install a test-only `resolveAndDecide => execute` stub. That is not a production workflow bypass, and default fixtures now carry non-empty module context. However, those tests intentionally do not exercise the real policy gate, so only the three `realCapabilityDecision` workflow tests validate production resolution; one of those three currently fails as noted above.

## Regression of previous review findings

- Fixed in source: empty/unresolved modules, multi-candidate bypass, missing-coverage pre-filtering, tie fail-closed behavior, stable clarify fields, and capability-specific unsupported wording.
- Not fixed in deliverable: independent checkout/self-containment and the required target-suite/build verification.

## Verification evidence

Commands ran in temporary detached worktree `/tmp/jc-hub-task2-final.kDOGLC` at exact commit `7ec24615`:

- `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts` — **64 passed, 9 failed**.
- Focused real-gate pattern (`unsupported`, `ambiguous`, `unresolved`) — **2 passed, 1 failed**; quotation unsupported failed because `outcome` was `undefined`.
- `npm run build:server` — **failed**, including `toolchain.tools.ts(368,56): TS2554 Expected 1-2 arguments, but got 5`; two additional ProductConfig implicit-any errors are outside this Task 2 range but still make the required repository build red.
- `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts` — **38 passed, 0 failed**.
- `git diff --check 8c7de39f..7ec24615` — passed.

## Non-blocking risks

- Most of the 1,019-line net change is shared conversation-context, template-routing, and result-display prerequisite work outside the narrow capability gate. Even after the missing dependencies are committed, those behaviors deserve their own scoped regression review.
- `CapabilityDecisionService.unresolved()` uses capability value `ambiguous` even for `capability_not_published`; the workflow separately uses `unresolved` for an empty candidate set. Machine consumers must currently distinguish these cases via both capability and reason code.

No source files or commits were modified during review; only this requested report was added.
