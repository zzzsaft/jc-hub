# ERP SQL Golden Capability Governance — SDD Progress

- Branch: `codex/erp-sql-golden-capabilities`
- Plan: `docs/superpowers/plans/2026-07-11-erp-sql-golden-capability-governance.md`
- Baseline: `npm test` — 559 passed, 0 failed (2026-07-12)
- Workspace exception: using the existing dirty workspace because required ERP refactor changes are uncommitted; a clean worktree would omit them. Preserve unrelated ProductConfig/quote-agent changes.

## Tasks

- [x] Task 1 — Capability and Golden Contracts (`9536d39b`, review fix `8c7de39f`; final review PASS)
- [x] Task 2 — Capability Decision Before SQL Paths (through `0b77a7c3`; final review PASS)
- [x] Task 3 — Generic Entity Filters and Scope-Safe Templates (through `e0279dc6`; final review PASS)
- [x] Task 4 — Query-Plan Coverage Runtime Guard (through `72a206cc`; final review PASS)
- [ ] Task 5 — Result Scope Contract
- [ ] Task 6 — ERP Capability Routing
- [ ] Task 7 — Bounded Concurrency and Process Survival
- [ ] Task 8 — Safety Stock and Operation/Labor Assets
- [ ] Task 9 — Finance and Composite Metric Coverage
- [ ] Task 10 — Web Golden Runner and Migration Report

## Review history

- Task 1 first review FAIL: slot/filter migration gaps and over-broad execute outcomes.
- Task 1 fix review PASS: 187 cases; 91 execute / 3 clarify / 93 unsupported; requiredSlots mapping mismatch=0; 9/9 tests and server build pass.
- Task 2 final review PASS after closing ambiguous/unresolved bypasses and January previous-month YoY label boundary; 96/96 focused tests pass.
- Task 3 final review PASS: six-entity filters, approved-expression compilation, explicit persisted template filter coverage, and false-positive extraction regressions verified.
- Task 4 final review PASS: AST coverage proof blocks widened predicates, unrelated subqueries, invalid time/comparison evidence, and qualitative-filter direction errors; 126/126 tests pass.
