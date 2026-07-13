# Agent Route Dual Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Agent selection confidence from ERP capability confidence and return visible, targeted clarification when a query plan is incomplete.

**Architecture:** Extend the existing LLM route schema in `AgentRouteClassifier` without adding another router. Agent confidence gates Agent selection; ERP capability confidence gates capability locking. Existing ERP Planner remains responsible for missing query slots and all Guard/permission checks remain unchanged.

**Tech Stack:** TypeScript, Zod, Node test runner, Prisma-backed Agent runtime, React/Vite acceptance UI.

## Global Constraints

- Every request, including fast paths and existing ERP sessions, must use LLM structured classification.
- No question-specific or keyword routing rules.
- Preserve SQL Guard, permissions, approved capability registry, and template coverage checks.
- Legacy `confidence` responses remain parseable during rollout.
- Five specified Golden Questions must produce visible terminal UI output.

---

### Task 1: Dual-confidence classifier contract

**Files:**
- Modify: `apps/server/src/ai/agentRuntime/AgentRouteClassifier.ts`
- Modify: `apps/server/src/ai/agentRuntime/types.ts`
- Modify: `apps/server/src/ai/agentRuntime/router.ts`
- Test: `apps/server/test/agentRuntime/agentRouteClassifier.test.ts`

**Interfaces:**
- Produces: `AgentRouteClassification.agentConfidence`, `capabilityConfidence`, and compatible `confidence`.
- Produces: `capability_confidence_below_threshold` for a clear ERP Agent with uncertain capability.

- [ ] Add failing tests for independent Agent/capability thresholds, targeted capability clarification, and legacy fallback.
- [ ] Run `node --test --import tsx apps/server/test/agentRuntime/agentRouteClassifier.test.ts` and confirm the new assertions fail.
- [ ] Extend the Zod schema and prompt, normalize legacy values, and apply the two gates in order.
- [ ] Propagate both confidence values into the runtime route decision and audit payload.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit only classifier, runtime types, router, and focused tests.

### Task 2: Slot-aware clarification and regression

**Files:**
- Modify only if required by a failing test: `apps/server/src/modules/erpSqlAgent/capabilities/CapabilityDecisionService.ts`
- Modify only if required by a failing test: `apps/server/src/ai/mastra/workflows/erpSqlToolchain.workflow.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`
- Update: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Consumes: locked capability from Task 1.
- Produces: Planner clarification that preserves known metric/dimension slots and asks only for missing time.

- [ ] Add a failing test for “采购金额按供应商统计” that asserts metric `purchase_amount`, dimension `supplier`, missing time, and visible targeted clarification.
- [ ] Add a same-session continuation test for “最近一个月” that preserves the prior metric/dimension and continues planning.
- [ ] Run the focused ERP tests and confirm failures are caused by missing slot-aware behavior.
- [ ] Implement the smallest Planner/workflow change needed; do not alter route thresholds or add phrase matching.
- [ ] Run focused tests, full `npm test`, `npm run build:server`, and `npm run build:web`.
- [ ] Record the implementation and verification in the operations log, then commit.

### Task 3: Real webpage Golden acceptance

**Files:**
- Create: `docs/operations/2026-07-13-agent-route-confidence-golden-acceptance.md`

**Interfaces:**
- Consumes: running backend on 2030 and frontend on 2035.
- Produces: privacy-safe outcome records with trace ID, route, capability, path, and visible terminal state.

- [ ] Restart backend and frontend from this worktree.
- [ ] Submit the five specified Golden Questions in the real chat page, including the same-session “最近一个月” follow-up.
- [ ] Fail acceptance on blank assistant text, detail-only output, infinite loading, timeout, or swallowed `run: null` response.
- [ ] Save only privacy-safe summaries and trace IDs in the report.
- [ ] Re-run full tests/builds and `git diff --check` before completion.
- [ ] Commit the acceptance report and final operations log update.
