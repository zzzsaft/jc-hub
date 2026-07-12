# Task 5 Reviewer Report

## Verdict: FAIL

Commit reviewed: `e2450b4f` (`72a206ccc43323c4fd8a0f1a7bf52416442ac4d1..e2450b4f`)

The validated-plan scope contract is present on the executed-result path, the same scope value is passed to narration, and mismatch responses suppress rows/narration with a stable `semantic_mismatch` status. However, the committed web code does not compile, and the range matcher broadens string identifiers through unconditional integer normalization.

## Findings

### [P1] Web build fails on the new drawer callback contract

- `apps/web/src/pages/agent/components/AgentResultDrawer.tsx:37-39`
- `apps/web/src/pages/agent/components/AgentResultPanel.tsx:18-20`

`AgentResultDrawer` declares `onCopySql`, `onExportJson`, and `onExportCsv` as callbacks requiring an `AgentSqlResult`, then passes them directly to `AgentResultPanel`, whose props are zero-argument callbacks. TypeScript correctly rejects all three assignments (`TS2322`). This is a Task 5 committed file and prevents the required web build from succeeding. Wrap the handlers (`() => onCopySql(result)`, etc.) or align the shared callback types.

### [P1] Integer normalization enlarges scope for string business identifiers

- `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:1046-1053`
- `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:1063-1065`

`normalizeScopeValue` converts every digit-only value through `BigInt`, regardless of dimension and regardless of whether both values originated as strings. Consequently product/customer/job codes such as requested `"00123"` and returned `"123"` normalize to the same value and the out-of-scope row is accepted. The probe also confirms `"+123" === "123"` and `"000" === 0` under this matcher. Numeric/string compatibility must be constrained to cases known to represent numeric dimensions or to a typed DB numeric value versus its canonical textual form; string-to-string identifier comparison must preserve leading zeros/sign syntax.

### [P2] Scope assertion can replace an executor failure with semantic mismatch

- `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:649-668`
- `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts:670-678`

The range assertion runs before checking `parsedExecution.data.valid` / execution success. If an executor returns a valid schema containing failure state plus diagnostic/partial rows that do not match a filter, the workflow reports `semantic_mismatch` and hides the executor's real error. Apply the result-range assertion only to the corresponding successful/observable result path; preserve executor failure semantics otherwise.

## Contract review

- Scope fields are complete and stable: `capability`, `metrics`, `dimensions`, `filters`, optional `timeRange`, optional `comparison`, and `templateCoverage`.
- Scope values come from the analyzed plan plus the resolved capability and actually accepted template family. There is no narrator inference.
- The response and narrator receive the same scope value on the executed-result path.
- Successful executed and generated-SQL-observation paths expose scope. Unsupported and clarification paths omit it, which is reasonable because they do not establish an executable validated result contract.
- Template coverage is empty for non-template generation and contains only the accepted template family for template execution.
- Assertion skips absent result columns and null cells, then checks all non-null rows when an alias is present. Mismatch suppresses rows/row count via `formatOutput` defaults, skips narration, and returns stable `semantic_mismatch`.
- Frontend rendering is generic and detail-only; it does not hard-code ERP business result columns. The types retain generic `columns[]` compatibility. The callback compile failure above still blocks acceptance.

## Independent verification

Executed from a detached worktree at exactly `e2450b4f`:

- `node --test --import tsx apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts` — PASS, 82/82.
- `npm run build:web` — FAIL with three `TS2322` errors at `AgentResultDrawer.tsx:37-39`.
- `npm run build:server` — FAIL at `apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetEvidenceSnapshot.ts:13` (`TS7006` twice). This file is unchanged by `e2450b4f`, so the server build failure is pre-existing/out of Task 5 scope, but the required independent build is not green.
- `git diff 72a206ccc43323c4fd8a0f1a7bf52416442ac4d1 e2450b4f --check` — PASS.
- Boundary probe — `"00123"` and `"123"` both normalize to `"123"`; confirms the scope-expansion finding.

