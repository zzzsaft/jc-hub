# ERP SQL Multiturn Command and Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ERP SQL follow-ups use the prior six dialogue rounds, preserve prior query slots when users issue corrections, show suppliers by name without merging duplicate identities, and render visible result headers in Chinese.

**Architecture:** Store an encrypted inference-only message payload beside the existing redacted audit message, then build a 12-message context after session ownership is checked. Pass that context and the last validated plan to the analysis LLM, which returns a full structured plan that still passes the existing capability, metric, permission, compiler, and Runtime Guard boundaries. Extend approved metric metadata so supplier grouping retains VendorNum as a hidden identity while displaying Vendor.Name, and keep stable response keys separate from Chinese labels.

**Tech Stack:** TypeScript, Node.js test runner, Prisma/PostgreSQL JSONB migrations, Zod, AES-256-GCM, React/Ant Design result tables.

## Global Constraints

- Recent context means the previous 6 user/assistant rounds, at most 12 messages, in chronological order; the current user message is supplied separately.
- Raw inference text must not enter normal message responses, titles, traces, tool audit payloads, logs, or result artifacts.
- Old sessions containing only hash placeholders fall back to the last validated `analysisPlan` and semantic summary.
- LLM output remains JSON `analysisPlan`; arbitrary SQL, Shell, and system-command execution remain forbidden.
- Supplier identity remains VendorNum internally; visible supplier values use Vendor.Name, with “未命名供应商” for missing names.
- Stable English column keys remain compatible; all visible column labels are Chinese.
- Do not add a dependency or refactor unrelated Agent runtimes.

---

## File Structure

- `apps/server/src/ai/agentRuntime/conversationPayload.ts`: encrypt/decrypt inference-only message text and assemble a bounded recent conversation.
- `apps/server/src/ai/agentRuntime/service.ts`: persist inference payloads and request 12 historical messages after ownership checks.
- `apps/server/prisma/schema.prisma`: add the private JSON payload column to `AgentMessage`.
- `apps/server/prisma/migrations/20260713090000_agent_message_inference_payload/migration.sql`: add the nullable JSONB column.
- `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts`: send prior plan plus six dialogue rounds to the LLM and accept a validated full merged plan for correction commands.
- `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.ts`: attach auditable inheritance metadata to a validated merged plan.
- `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`: support hidden per-dimension identity expressions while exposing display expressions.
- `apps/server/prisma/migrations/20260713091000_purchase_supplier_name_dimension/migration.sql`: update approved `purchase_amount` supplier metadata.
- `apps/server/src/modules/erpSqlAgent/agent/resultColumnMetadata.ts`: provide Chinese labels and a Chinese-only fallback.
- Existing focused test files receive regression cases; no new test framework is introduced.

---

### Task 1: Persist private inference text and build six dialogue rounds

**Files:**
- Create: `apps/server/src/ai/agentRuntime/conversationPayload.ts`
- Create: `apps/server/prisma/migrations/20260713090000_agent_message_inference_payload/migration.sql`
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/ai/agentRuntime/service.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `apps/server/test/agentRuntime/conversationPayload.test.ts`

**Interfaces:**
- Produces: `encryptConversationText(text: string): EncryptedPayload | undefined`.
- Produces: `decryptConversationText(value: unknown): string | undefined`.
- Produces: `buildRecentConversation(messages: ConversationStoredMessage[]): AgentRuntimeConversationMessage[]`.
- Consumes: existing `encryptJsonWithSecret` / `decryptJsonWithSecret`; uses `AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET`, falling back to `ERP_QUERY_CRYPTO_SECRET` for compatibility.

- [ ] **Step 1: Write failing encryption and six-round tests**

```ts
test("ERP conversation payload is reversible but not plaintext", () => {
  process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = "test-context-secret";
  const encrypted = encryptConversationText("不要供应商编号，要供应商名称");
  assert(encrypted);
  assert.doesNotMatch(JSON.stringify(encrypted), /供应商名称/u);
  assert.equal(decryptConversationText(encrypted), "不要供应商编号，要供应商名称");
});

test("recent conversation keeps six complete rounds in chronological order", () => {
  process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = "test-context-secret";
  const messages = Array.from({ length: 14 }, (_, index) => ({
    id: BigInt(index + 1),
    role: index % 2 === 0 ? "user" : "assistant",
    content: `[protected ERP message ${index + 1}]`,
    inferenceJsonb: encryptConversationText(`message-${index + 1}`),
  }));
  assert.deepEqual(
    buildRecentConversation(messages.slice(-12)).map((item) => item.content),
    Array.from({ length: 12 }, (_, index) => `message-${index + 3}`),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --import tsx apps/server/test/agentRuntime/conversationPayload.test.ts`

Expected: FAIL because `conversationPayload.ts` and its exports do not exist.

- [ ] **Step 3: Add the nullable private payload column**

```prisma
model AgentMessage {
  // existing fields
  inferenceJsonb Json? @map("inference_jsonb")
}
```

```sql
ALTER TABLE "agent"."agent_messages"
ADD COLUMN IF NOT EXISTS "inference_jsonb" JSONB;
```

- [ ] **Step 4: Implement encryption and bounded context assembly**

```ts
const secret = () => process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET ?? process.env.ERP_QUERY_CRYPTO_SECRET;

export function encryptConversationText(text: string) {
  const value = secret();
  return value ? encryptJsonWithSecret({ text }, value, "AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET") : undefined;
}

export function decryptConversationText(value: unknown): string | undefined {
  if (!isEncryptedPayload(value) || !secret()) return undefined;
  try {
    return decryptJsonWithSecret<{ text: string }>(value, secret(), "AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET").text;
  } catch {
    return undefined;
  }
}

export function buildRecentConversation(messages: ConversationStoredMessage[]) {
  return messages.slice(-12).flatMap((message) => {
    const content = decryptConversationText(message.inferenceJsonb)
      ?? (message.content && !message.content.startsWith("[protected ERP message") ? message.content : undefined);
    return content ? [{ id: String(message.id), role: message.role, content: content.slice(0, 2000) }] : [];
  });
}
```

- [ ] **Step 5: Persist and retrieve the inference payload only inside Agent Runtime**

Update `createMessage()` to set `inferenceJsonb` only for `erpSqlAgent` / `mastraErpSqlAgent` messages, while leaving `content` and `contentJsonb` protected exactly as today. Update `getConversationContext()` to fetch `take: 13`, reverse the newest 12 messages through `buildRecentConversation()`, and report whether an older message exists. Do not add `inferenceJsonb` to `mapMessage()`.

```ts
const inferenceJsonb = isErpAgent(agentType) && params.content
  ? encryptConversationText(params.content)
  : undefined;
// prisma.agentMessage.create({ data: { ..., inferenceJsonb: toJson(inferenceJsonb) } })
```

- [ ] **Step 6: Document the context secret**

Add `AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET=""` to `.env.example`. In `README.md`, document AES-256-GCM use, the `ERP_QUERY_CRYPTO_SECRET` compatibility fallback, and the recommendation to configure a distinct secret before production rollout.

- [ ] **Step 7: Run tests and Prisma validation**

Run: `node --test --import tsx apps/server/test/agentRuntime/conversationPayload.test.ts apps/server/test/erpSqlAgent/auditDataProtection.test.ts`

Expected: PASS; plaintext is recoverable only from the private encrypted payload and remains absent from mapped audit messages.

Run: `npm run prisma:validate`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .env.example README.md apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260713090000_agent_message_inference_payload/migration.sql apps/server/src/ai/agentRuntime/conversationPayload.ts apps/server/src/ai/agentRuntime/service.ts apps/server/test/agentRuntime/conversationPayload.test.ts
git commit -m "fix(agent-runtime): preserve six encrypted dialogue rounds"
```

---

### Task 2: Let the analysis LLM return an executable merged correction plan

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.ts`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`
- Test: `apps/server/test/agentRuntime/agentRouteClassifier.test.ts`

**Interfaces:**
- Consumes: `AnalysisPlan previousPlan`, `AnalysisConversationContext` containing at most 12 prior messages.
- Produces: `mergeLlmPlanFromContext(question, previous, current, sourceTraceId): AnalysisPlannerResult`.
- Preserves: all existing capability decision and Runtime Guard calls after planning.

- [ ] **Step 1: Write failing prompt and three-turn correction tests**

```ts
test("analysis planner gives the LLM six rounds and the validated previous plan", async () => {
  let captured: any;
  const previousPurchasePlan = {
    mode: "strict" as const,
    grain: ["supplier"],
    metrics: ["purchase_amount"],
    requiredMetrics: ["purchase_amount"],
    filters: [],
    dimensions: ["supplier"],
    orderBy: [{ metric: "purchase_amount", direction: "DESC" as const }],
    timeRange: { kind: "relative" as const, days: 30 },
  };
  const twelveDialogueMessages = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `历史消息${index + 1}`,
  }));
  const planner = new AnalysisPlannerService(async (request) => {
    captured = request.input;
    return JSON.stringify({
      mode: "strict", grain: ["supplier"], metrics: ["purchase_amount"],
      filters: [], dimensions: ["supplier"],
      orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 30 },
    });
  });
  const result = await planner.plan(
    "请不要用supplier编号，需要查询具体供应商名称",
    undefined,
    previousPurchasePlan,
    "trace-purchase",
    { recentMessages: twelveDialogueMessages, semanticSummary: "指标:purchase_amount；维度:supplier；时间:最近30天" },
    "purchase.supplier_amount_summary",
  );
  assert.deepEqual(captured.previousPlan.timeRange, { kind: "relative", days: 30 });
  assert.equal(captured.conversation.recentMessages.length, 12);
  assert.deepEqual(result.analysisPlan?.timeRange, { kind: "relative", days: 30 });
  assert.deepEqual(result.analysisPlan?.metrics, ["purchase_amount"]);
  assert.deepEqual(result.analysisPlan?.dimensions, ["supplier"]);
});
```

Add a workflow regression that runs the three user messages in order and asserts the third result does not contain `slot:timeRange` and retains `contextInheritance.sourceTraceId`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts --test-name-pattern="six rounds|supplier.*correction"`

Expected: FAIL because the LLM input omits `previousPlan` and correction-only text falls back to a fresh plan.

- [ ] **Step 3: Add a validated merged-plan helper**

```ts
export function mergeLlmPlanFromContext(
  question: string,
  previous: AnalysisPlan,
  current: AnalysisPlan,
  sourceTraceId?: string,
): AnalysisPlannerResult {
  const analysisPlan: AnalysisPlan = {
    ...previous,
    ...current,
    route: "complex_composed",
    grain: current.dimensions,
    requiredMetrics: current.requiredMetrics?.length ? current.requiredMetrics : current.metrics,
    contextInheritance: {
      ...(sourceTraceId ? { sourceTraceId } : {}),
      inheritedFields: inheritedFieldNames(previous, current),
    },
  };
  return { analysisPlan, clarificationQuestions: [], warnings: [] };
}
```

`inheritedFieldNames()` must compare `metrics`, `dimensions`, `timeRange`, `comparison`, `dimensionFilters`, `orderBy`, `limit`, and `businessScope`, returning the fields whose current value equals the previous value.

- [ ] **Step 4: Pass prior plan and require a complete merged JSON plan**

Change `planWithLlm()` to accept `previousPlan`. Include the sanitized plan in both requester `input` and the final user JSON. Amend the system prompt with: “For a follow-up or correction, output the complete merged plan. Preserve every prior field that the newest user statement does not explicitly replace.” Continue parsing through `LlmAnalysisPlanSchema`; never accept SQL or tool names.

- [ ] **Step 5: Use the merged plan for correction-only follow-ups**

In the `previousPlan` branch, retain deterministic handling for explicit time/comparison/category rules. When contextual LLM planning returns a valid full plan and there is no deterministic structured extension, return `mergeLlmPlanFromContext(...)`. This makes representation, sorting, and filter corrections executable without deleting the previous time range.

- [ ] **Step 6: Run planner, route, and workflow regressions**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/agentRuntime/agentRouteClassifier.test.ts`

Expected: PASS; the correction remains on `purchase.supplier_amount_summary`, retains 30 days, and produces a complete validated plan.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlannerService.ts apps/server/src/modules/erpSqlAgent/planner/service/AnalysisPlanContextService.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/agentRuntime/agentRouteClassifier.test.ts
git commit -m "fix(erp-sql): execute corrections against prior query plan"
```

---

### Task 3: Group suppliers by hidden identity and display names

**Files:**
- Create: `apps/server/prisma/migrations/20260713091000_purchase_supplier_name_dimension/migration.sql`
- Modify: `apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts`
- Modify: `apps/server/test/erpSqlAgent/metricComposer.test.ts`

**Interfaces:**
- Extends atomic metric JSON with optional `dimensionKeyExpressions: Record<string, string>`.
- Keeps `dimensionExpressions.supplier` as the visible expression.
- Does not expose hidden keys from the outer SELECT.

- [ ] **Step 1: Change the supplier composer test first**

```ts
test("metric composer groups purchase suppliers by identity and displays supplier name", async () => {
  const result = await new MetricComposerService(guard).compose({
    question: "最近一个月采购金额按供应商名称统计",
    analysisPlan: {
      mode: "strict", grain: ["supplier"], metrics: ["purchase_amount"],
      filters: [], dimensions: ["supplier"],
      orderBy: [{ metric: "purchase_amount", direction: "DESC" }],
      timeRange: { kind: "relative", days: 30 },
    },
    metrics: [purchaseMetric()],
    financeMode: "strict",
  });
  const sql = result.ok ? result.generation.sql : "";
  assert.equal(result.ok, true);
  assert.match(sql, /JOIN Erp\.Vendor Vendor/);
  assert.match(sql, /Vendor\.Name.*AS \[supplier\]/);
  assert.match(sql, /POHeader\.VendorNum.*AS \[__supplierKey\]/);
  assert.match(sql, /GROUP BY[\s\S]*POHeader\.VendorNum[\s\S]*Vendor\.Name/u);
  assert.doesNotMatch(sql, /SELECT TOP[\s\S]*\[__supplierKey\]/u);
});
```

Modify the existing `purchaseMetric()` fixture before the RED run so it declares the desired metadata contract but the production composer still lacks hidden-key support:

```ts
dimensionExpressions: {
  product: "PODetail.PartNum",
  order: "POHeader.PONum",
  supplier: "COALESCE(NULLIF(LTRIM(RTRIM(Vendor.Name)), N''), N'未命名供应商')",
},
dimensionKeyExpressions: { supplier: "POHeader.VendorNum" },
dimensionJoinSql: {
  supplier: ["JOIN Erp.Vendor Vendor ON Vendor.Company = POHeader.Company AND Vendor.VendorNum = POHeader.VendorNum"],
},
```

- [ ] **Step 2: Run the composer test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/metricComposer.test.ts --test-name-pattern="supplier identity"`

Expected: FAIL because the composer has no `dimensionKeyExpressions` support and the fixture still exposes VendorNum as `supplier`.

- [ ] **Step 3: Add hidden identity expressions to metric CTEs**

Extend `AtomicMetricDefinition` with `dimensionKeyExpressions?: Record<string, string>`. In `buildMetricCte()`, add hidden selections and grouping expressions:

```ts
const dimensionKeySelects = plan.dimensions.flatMap((dimension) => {
  const expression = definition.dimensionKeyExpressions?.[dimension];
  return expression ? [`${expression} AS [__${dimension}Key]`] : [];
});
const dimensionKeyGroups = plan.dimensions.flatMap((dimension) => {
  const expression = definition.dimensionKeyExpressions?.[dimension];
  return expression ? [expression] : [];
});
```

Include these only inside each metric CTE. The outer SELECT continues to emit the visible `[supplier]` and omits `[__supplierKey]`.

- [ ] **Step 4: Add the approved metric migration**

Update only approved atomic `purchase_amount` definitions. Merge these JSON fragments without removing existing fields:

```json
{
  "dimensionExpressions": {
    "supplier": "COALESCE(NULLIF(LTRIM(RTRIM(Vendor.Name)), N''), N'未命名供应商')"
  },
  "dimensionKeyExpressions": {
    "supplier": "POHeader.VendorNum"
  },
  "dimensionJoinSql": {
    "supplier": [
      "JOIN Erp.Vendor Vendor ON Vendor.Company = POHeader.Company AND Vendor.VendorNum = POHeader.VendorNum"
    ]
  }
}
```

- [ ] **Step 5: Run composer regressions**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/metricComposer.test.ts`

Expected: PASS; existing customer/product/category dimension SQL remains unchanged, and supplier output uses a name with a hidden identity.

- [ ] **Step 6: Commit**

```bash
git add apps/server/prisma/migrations/20260713091000_purchase_supplier_name_dimension/migration.sql apps/server/src/modules/erpSqlAgent/planner/service/MetricComposerService.ts apps/server/test/erpSqlAgent/metricComposer.test.ts
git commit -m "fix(erp-sql): display supplier names in purchase summaries"
```

---

### Task 4: Guarantee Chinese visible table headers

**Files:**
- Modify: `apps/server/src/modules/erpSqlAgent/agent/resultColumnMetadata.ts`
- Modify: `apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`

**Interfaces:**
- Preserves: `ErpSqlResultColumn.key` and front-end sorting/data lookup.
- Produces: Chinese `label` for every visible column.

- [ ] **Step 1: Write failing label tests**

```ts
test("purchase supplier result columns use Chinese visible labels", () => {
  const columns = buildResultColumns(["supplier", "purchase_amount", "period", "unknown_metric"]);
  assert.deepEqual(columns.map((column) => column.key), ["supplier", "purchase_amount", "period", "unknown_metric"]);
  assert.deepEqual(columns.map((column) => column.label), ["供应商名称", "采购金额", "统计期间", "业务字段"]);
  assert(columns.filter((column) => column.inlineVisible).every((column) => !/[A-Za-z]/u.test(column.label)));
});
```

- [ ] **Step 2: Run the metadata test and verify RED**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`

Expected: FAIL because supplier and purchase amount currently fall through to English-derived labels.

- [ ] **Step 3: Add explicit Chinese aliases and a Chinese-only fallback**

```ts
const approvedAliases: Record<string, string> = {
  order_amount: "销售订单金额",
  purchase_amount: "采购金额",
  product_category: "产品类别",
  supplier: "供应商名称",
  customer: "客户名称",
  company: "公司",
  period: "统计期间",
};
return approvedAliases[value.toLowerCase()] ?? "业务字段";
```

Keep suffix handling so comparison/change/rate columns become Chinese combinations such as “采购金额（比较期）”“采购金额差额”“采购金额变化率”. Existing Chinese aliases remain unchanged.

- [ ] **Step 4: Run metadata and front-end build verification**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts`

Expected: PASS.

Run: `npm run build:web`

Expected: PASS; the existing `AgentResultTable` continues using `column.label` without key changes. No new front-end component test is needed because this task does not change the component and the server metadata test exercises the changed behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/erpSqlAgent/agent/resultColumnMetadata.ts apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts
git commit -m "fix(erp-sql): localize visible result headers"
```

---

### Task 5: Update contracts and verify the complete flow

**Files:**
- Modify: `docs/api/erp-sql-agent.md`
- Modify: `docs/operations/codex-implementation-log.md`
- Test: `apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

**Interfaces:**
- Documents the already implemented six-round context, structured correction command, supplier identity/display split, and Chinese-label contract.

- [ ] **Step 1: Add the final workflow assertion before documentation**

Extend the three-turn regression to assert:

```ts
assert.equal(third.outcome, "execute");
assert.equal(third.capabilityCode, "purchase.supplier_amount_summary");
assert.deepEqual((third.analysisPlan as AnalysisPlan).timeRange, { kind: "relative", days: 30 });
assert.deepEqual(third.columns.filter((column) => column.inlineVisible).map((column) => column.label), ["公司", "供应商名称", "采购金额"]);
assert(third.columns.filter((column) => column.inlineVisible).every((column) => !/[A-Za-z]/u.test(column.label)));
```

- [ ] **Step 2: Run the workflow test and correct only integration gaps**

Run: `node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts --test-name-pattern="supplier.*correction"`

Expected: PASS. If a failure appears, change only the boundary wiring that prevents the already-tested context, plan, composer, or metadata behavior from reaching the output.

- [ ] **Step 3: Update API and implementation documentation**

In `docs/api/erp-sql-agent.md`, replace “最近 6 条消息” with “最近 6 轮、最多 12 条消息”, document encrypted inference-only storage, full merged `analysisPlan` corrections, hidden supplier identity, and Chinese `columns[].label`.

At the top of `docs/operations/codex-implementation-log.md`, add the observed three-turn failure, the two root causes, affected modules, migration names, security boundary, and exact verification commands.

- [ ] **Step 4: Run complete affected verification**

Run: `node --test --import tsx apps/server/test/agentRuntime/conversationPayload.test.ts apps/server/test/agentRuntime/agentRouteClassifier.test.ts apps/server/test/erpSqlAgent/auditDataProtection.test.ts apps/server/test/erpSqlAgent/resultColumnMetadata.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`

Expected: PASS with zero failed tests.

Run: `npm run prisma:validate`

Expected: PASS.

Run: `npm run build:server`

Expected: PASS.

Run: `npm run build:web`

Expected: PASS.

- [ ] **Step 5: Review the final diff for scope and secrets**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only files named in this plan are changed. Search the diff to confirm no real secret, ERP row, supplier name, or raw production conversation was committed.

- [ ] **Step 6: Commit**

```bash
git add docs/api/erp-sql-agent.md docs/operations/codex-implementation-log.md apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts
git commit -m "docs: record ERP multiturn correction contract"
```
