# Task 2 Review

## Verdict: FAIL

## Blockers

1. **Capability resolution skips the gate for nearly every real module.** `resolveUniqueCapability` returns `undefined` as soon as a module has more than one registry entry (`apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:1016-1035`). Task 1's registry has multiple candidates for sales, inventory, production, and finance (`apps/server/src/modules/erpSqlAgent/capabilities/registry.ts:40-54`), so missing metric/dimension/filter/time/comparison coverage in those modules proceeds to template/generator/executor instead of returning `unsupported`. This violates the core requirement that missing published coverage must not be skipped merely because candidates are ambiguous. The only workflow test uses quotation, which happens to have exactly one registry candidate (`apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts:533-569`), so it cannot detect this defect.

2. **Commit `b3622934` is not self-contained and its required test cannot run from the commit.** The workflow imports `AnalysisPlanContextService.js` and `resultColumnMetadata.js`, but neither file exists in the commit (`apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:5-6`). In a detached worktree at `b3622934` (with the repository's node_modules linked), the named test fails immediately with `ERR_MODULE_NOT_FOUND` for `AnalysisPlanContextService.js`; `resultColumnMetadata.ts` is likewise absent from the commit tree. The implementer verification only succeeds because untracked workspace files satisfy those imports.

## Important

1. **Resolution is module-uniqueness based, not AnalysisPlan-requirement based.** Even after the early uniqueness check, executable candidates are pre-filtered to only those already covering all requirements (`erpSqlToolchain.workflow.ts:1028-1034`). Therefore a uniquely relevant executable capability with one missing requirement is removed and the decision service never gets the chance to emit `unsupported` plus `missingCoverage`. Candidate selection must identify the intended capability from plan requirements/registry identity while still passing missing requirements to `CapabilityDecisionService`; lack of coverage is an outcome, not a reason to skip decision.

2. **The commit contains large unrelated shared behavior changes without their dependencies.** Besides the Task 2 gate, it adds conversation inheritance, result-column metadata, template semantic fallback, template suppression for structured plans, and many planner/test changes (589 changed lines total). Examples are `erpSqlToolchain.workflow.ts:155, 185, 255-473, 985` and `toolchain.tools.ts:395-425`. These exceed Task 2 scope and depend on shared uncommitted work. They materially alter template routing and multi-turn/output metadata, making Task 2 impossible to review or land independently.

3. **Stable clarify output is only produced when a capability was resolved.** The legacy clarification branch at `erpSqlToolchain.workflow.ts:216-229` returns no `outcome`, `capabilityCode`, `reasonCode`, or `missingCoverage`. Since candidate ambiguity commonly makes `resolveUniqueCapability` return `undefined`, explicit planner clarification can take this branch and violate the stable response contract. It does stop before SQL paths, but response metadata is incomplete.

4. **Coverage tests are insufficient.** There are no direct decision-service tests for metrics, dimensions, filters, time semantics, comparisons, explicit ambiguity, or missing coverage under multiple registry candidates. The sole unsupported test also uses `(result as any)` for the new fields (`mastraErpSqlAgent.test.ts:560-561`), avoiding compile-time verification of the response type.

## Minor

1. `runDecideSqlCapabilityTool` is only a plain exported function, not a Mastra `createTool` with input/output schemas like adjacent tools (`apps/server/src/ai/mastra/tools/erpSql/toolchain.tools.ts:371-377`). If the intended “tool mapping” contract requires capability decision visibility/tracing as a tool, that mapping is incomplete. The workflow output schema itself does contain all four decision fields, and the runtime handler preserves the complete result in `context`, artifact, and `contentJsonb`.

2. Unsupported decisions use the generic failure message path because `messageContent` has no handling for capability `reasonCode`; callers receive stable machine fields but a misleading “精确 SQL 校验” user message (`erpSqlToolchain.workflow.ts:1038+`).

## Positive evidence

- Authorization ordering is correct for capability disclosure: access scope is required before workflow work, module authorization occurs at `erpSqlToolchain.workflow.ts:179`, and capability decision/details occur at lines 187-213. The gate is before template lookup at line 237 and all generator/executor paths.
- `CapabilityDecisionService` itself correctly returns `clarify` only when `clarificationCandidates` is non-empty and otherwise converts missing coverage/non-executable status to `unsupported` (`CapabilityDecisionService.ts:14-35`).
- The tested quotation unsupported path returns empty SQL and zero template/generator/executor calls.
- Existing finance guard code remains present, and the current dirty-worktree suite includes finance regression coverage; no direct weakening attributable solely to the gate was observed.

## Verification evidence

- Dirty workspace: `node --import tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts` — 63 passed, 0 failed. This result includes untracked/shared files and therefore does not validate the commit in isolation.
- Detached `b3622934`: same test — failed before test collection with `ERR_MODULE_NOT_FOUND` for `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.js`.
- `git cat-file -e` confirms both `AnalysisPlanContextService.ts` and `resultColumnMetadata.ts` are absent from `b3622934`.
