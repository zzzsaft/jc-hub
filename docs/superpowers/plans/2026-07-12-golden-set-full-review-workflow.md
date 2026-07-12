# Golden Set Full-Review Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, mobile-first A/B blind-review workflow that creates one-pass full-document gold and safely gates automated archive admission for 30,000 production configuration documents.

**Architecture:** Keep `/Users/zzzsaft/.codex/worktrees/6054/jc-hub/tmp/product-config-golden-set-v1` immutable. A new v2 sidecar snapshot joins the same 400 document IDs with frozen, redacted document-block evidence, existing package/ERP candidates, and a precomputed 280/120 split. A typed annotation store and merge service produce A/B export files, a guarded adjudication package, and an admission policy; the frontend renders that v2 contract without exposing predictions or the other annotator's answer.

**Tech Stack:** TypeScript ESM, Express, Zod, node:test, React 19, Vite, CSS, existing Axios client and Browser plugin.

## Global Constraints

- Do not modify or regenerate the sealed v1 packets, predictions, manifest, or artifact hashes.
- Use `Company + PartNum` as the only ERP identity key.
- Keep every configuration field and final decision linked to frozen evidence IDs.
- Store only redacted evidence; do not add customer, contact, phone, address, price, filename, or file path to a review packet.
- Do not start workers, run LLM calls, write ERP, or write production archives as part of Golden Set review.
- Do not add dependencies.
- Test at 360px, 390px, and 430px; bottom actions must respect `env(safe-area-inset-bottom)`.
- Never auto-archive a record that is ambiguous, unresolved, lacks required evidence, or is outside a validated rule cohort.

---

## File Structure

- `apps/server/src/modules/productConfigAgent/goldenSet/fullReview.model.ts`: v2 packet, A/B annotation, field correction, admission and merge Zod schemas.
- `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewSnapshot.ts`: pure construction, redaction, deterministic 280/120 split, and packet seal verification.
- `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewStore.ts`: atomic local sidecar persistence, revision checks, and per-slot exports.
- `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewMerge.ts`: validates four exports against the v2 seal, emits differences, and permits only explicit adjudication.
- `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewAdmission.ts`: pure admission gate that returns `auto_archive`, `quarantine`, or `reject` with reason codes.
- `apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetFullReviewV2.ts`: read-only v2 snapshot builder with progress output.
- `apps/server/src/modules/productConfigAgent/routes/handlers/goldenSetFullReviewHandlers.ts`: typed HTTP handlers.
- `apps/server/src/modules/productConfigAgent/routes/productConfigAgent.routes.ts`: v2 routes; v1 routes remain unchanged.
- `apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`: model, split, merge, seal, admission, and store regression tests.
- `apps/web/src/pages/quoteAgent/goldenSet/fullReview/{types.ts,service.ts,utils.ts}`: typed client contract, API calls and Chinese task-card mapping.
- `apps/web/src/pages/quoteAgent/goldenSet/fullReview/hooks/useFullReviewState.ts`: loading, debounced draft persistence, validation and submit state.
- `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/{ReviewHeader,ChineseEvidenceCard,AdmissionDecisionForm,PackageItemsForm,ConfigFieldsForm,ErpIdentityForm,MobileActionBar}.tsx`: one-responsibility UI components.
- `apps/web/src/pages/quoteAgent/goldenSet/fullReview/FullReviewWorkbenchPage.tsx`: composition-only route entry.
- `apps/web/src/pages/quoteAgent/goldenSet/fullReview/styles.css`: desktop and mobile styles, including fixed action bar.
- `apps/web/src/app/AppRoutes.tsx`: add the v2 review route without replacing the legacy v1 route.
- `docs/api/product-config-golden-set-annotation.md` and `docs/frontend/product-config-golden-set-annotation.md`: v2 contract and operator workflow.

### Task 1: Define the immutable v2 review contract

**Files:**
- Create: `apps/server/src/modules/productConfigAgent/goldenSet/fullReview.model.ts`
- Test: `apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

**Consumes:** sealed v1 sample IDs and existing `PackageGold` / `ErpGold` types from `goldenSet/model.ts`.

**Produces:** `FullReviewPacket`, `FullReviewAnnotation`, `AdmissionDecision`, `validateFullReviewAnnotation`, and `validateFullReviewPacket` for the snapshot, store, routes and UI.

- [ ] **Step 1: Write failing schema tests**

```ts
test("full review requires evidence-backed configuration and blocks unsafe auto archive", () => {
  const result = validateFullReviewAnnotation({
    admission: { decision: "auto_archive", reason_codes: [], notes: null },
    package: { evidence_sufficiency: "sufficient", items: [] },
    configuration_fields: [{ field_key: "width", value: "1200", unit: "mm", item_id: "item-1", evidence_refs: [] }],
    erp: { decision: "unique_match", acceptable_identities: [] },
  });
  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /evidence_refs|auto_archive|unique_match/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: FAIL because `fullReview.model.ts` and `validateFullReviewAnnotation` do not exist.

- [ ] **Step 3: Implement only the typed contract and validation**

```ts
export type AdmissionDecision = "auto_archive" | "quarantine" | "reject";
export type FullReviewAnnotation = {
  admission: { decision: AdmissionDecision; reason_codes: string[]; notes: string | null };
  package: PackageGold;
  configuration_fields: Array<{
    field_key: string; value: string | null; unit: string | null;
    option: string | null; item_id: string | null; evidence_refs: string[];
  }>;
  erp: ErpGold;
};
```

Implement Zod refinements: `auto_archive` requires sufficient package evidence, at least one package item, no unresolved configuration field, and one unique ERP identity for each sellable item; `quarantine` and `reject` require at least one reason code; all fields require frozen evidence references.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: PASS with schema failures reported only for intentionally invalid fixtures.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/productConfigAgent/goldenSet/fullReview.model.ts apps/server/test/productConfigAgent/goldenSetFullReview.test.ts
git commit -m "feat: define full Golden Set review contract"
```

### Task 2: Build and seal a read-only v2 snapshot of all 400 documents

**Files:**
- Create: `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewSnapshot.ts`
- Create: `apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetFullReviewV2.ts`
- Modify: `apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

**Consumes:** v1 package and ERP packets under `/Users/zzzsaft/.codex/worktrees/6054/jc-hub/tmp/product-config-golden-set-v1`, document-block evidence, and `FullReviewPacket`.

**Produces:** `tmp/product-config-golden-set-v2-full-review/{packets.json,manifest.json,artifact-seal.json}` with exactly 400 document IDs and a fixed split.

- [ ] **Step 1: Write failing deterministic split and redaction tests**

```ts
test("snapshot keeps 400 unique document IDs, a 280/120 split and no sensitive keys", () => {
  const snapshot = buildFullReviewSnapshot(v1Packets, documentBlocks, "full-review-v2-2026-07-12");
  assert.equal(snapshot.packets.length, 400);
  assert.equal(snapshot.packets.filter((p) => p.cohort === "calibration").length, 280);
  assert.equal(snapshot.packets.filter((p) => p.cohort === "acceptance").length, 120);
  assert.equal(JSON.stringify(snapshot).match(/customer|phone|address|price|file_name/i), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: FAIL because `buildFullReviewSnapshot` does not exist.

- [ ] **Step 3: Implement the snapshot builder and CLI**

```ts
export function cohortFor(documentId: string, seed: string): "calibration" | "acceptance" {
  return sha256Text(`${seed}:${documentId}`).slice(0, 8) < "b3333333" ? "calibration" : "acceptance";
}

console.log(`stage=document_blocks processed=${processed}/${documentIds.length} success=${packets.length} failed=${failures.length}`);
```

The script reads only v1 IDs, loads only those `documentBlock` records, redacts them before writing, retains package and ERP candidate evidence as references rather than predictions, writes hashes and byte sizes for every emitted artifact, and exits non-zero unless there are exactly 400 unique documents, 280 calibration documents and 120 acceptance documents.

- [ ] **Step 4: Run the focused tests and dry-run builder**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts && tsx apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetFullReviewV2.ts --out-dir=tmp/product-config-golden-set-v2-full-review`

Expected: tests PASS; builder prints progress and finishes with `stage=done documents=400 calibration=280 acceptance=120`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/productConfigAgent/goldenSet/fullReviewSnapshot.ts apps/server/src/modules/productConfigAgent/scripts/buildGoldenSetFullReviewV2.ts apps/server/test/productConfigAgent/goldenSetFullReview.test.ts
git commit -m "feat: build sealed full-review Golden Set snapshot"
```

### Task 3: Add guarded A/B persistence, exports, merge and adjudication

**Files:**
- Create: `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewStore.ts`
- Create: `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewMerge.ts`
- Modify: `apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

**Consumes:** v2 sealed snapshot, `FullReviewAnnotation`, A/B slot identity, and submitted revision.

**Produces:** four immutable export files (`annotator-a-package.json`, `annotator-b-package.json`, `annotator-a-erp.json`, `annotator-b-erp.json`), a difference report and an adjudicated full-review result.

- [ ] **Step 1: Write failing merge tests**

```ts
test("merge rejects a foreign sample, a seal mismatch and an implicit auto archive", () => {
  assert.throws(() => mergeFullReviewExports({ baselineDir, aPackage, bPackage, aErp, bErp: foreignSample }), /unexpected sample/);
  assert.throws(() => mergeFullReviewExports({ baselineDir: changedSealDir, aPackage, bPackage, aErp, bErp }), /hash drift/);
  assert.equal(mergeFullReviewExports({ baselineDir, aPackage, bPackage, aErp, bErp }).differences.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: FAIL because `mergeFullReviewExports` does not exist.

- [ ] **Step 3: Implement atomic store and merge rules**

```ts
type StoredReview = {
  revision: number;
  drafts: Record<string, FullReviewAnnotation>;
  submitted: Record<string, FullReviewAnnotation>;
  adjudications: Record<string, FullReviewAnnotation>;
  audit: Array<{ at: string; action: "draft" | "submit" | "adjudicate"; user_id: string; document_id: string; revision: number }>;
};
```

Validate on every draft and submit, reject stale revisions and second submission, write with temporary-file rename, and create exports solely from submitted data. The merge must compare every document ID, cohort, schema version, evidence hash and slot; it may auto-resolve only byte-identical A/B annotations. Every difference stays pending until an admin supplies a schema-valid adjudication. The merge must never choose an `auto_archive` answer by itself.

- [ ] **Step 4: Run focused tests**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: PASS, including stale-revision, invalid annotation, foreign sample, seal drift, A/B difference and explicit-adjudication cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/productConfigAgent/goldenSet/fullReviewStore.ts apps/server/src/modules/productConfigAgent/goldenSet/fullReviewMerge.ts apps/server/test/productConfigAgent/goldenSetFullReview.test.ts
git commit -m "feat: add guarded Golden Set A/B merge flow"
```

### Task 4: Expose typed full-review API and admission gate

**Files:**
- Create: `apps/server/src/modules/productConfigAgent/goldenSet/fullReviewAdmission.ts`
- Create: `apps/server/src/modules/productConfigAgent/routes/handlers/goldenSetFullReviewHandlers.ts`
- Modify: `apps/server/src/modules/productConfigAgent/routes/productConfigAgent.routes.ts`
- Modify: `apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

**Consumes:** validated A/B store, v2 snapshot, admin/token route wrappers.

**Produces:** `/productConfigAgent/golden-set-v2/tasks`, draft/submit, exports, adjudication and admission-preview endpoints.

- [ ] **Step 1: Write failing admission tests**

```ts
test("admission quarantines ambiguity and permits only validated acceptance cohorts", () => {
  assert.deepEqual(decideAdmission(ambiguousIdentity, { cohort: "acceptance", thresholdsPassed: true }), {
    decision: "quarantine", reason_codes: ["erp_ambiguous"],
  });
  assert.equal(decideAdmission(validGold, { cohort: "acceptance", thresholdsPassed: true }).decision, "auto_archive");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts`

Expected: FAIL because `decideAdmission` and v2 routes do not exist.

- [ ] **Step 3: Implement explicit route and policy contracts**

```ts
{ path: "/productConfigAgent/golden-set-v2/tasks", method: "get", action: withProductConfigAgentToken(fullReviewTasks) },
{ path: "/productConfigAgent/golden-set-v2/tasks/:documentId/submit", method: "post", action: withProductConfigAgentToken(submitFullReviewTask) },
{ path: "/productConfigAgent/golden-set-v2/adjudications", method: "get", action: withProductConfigAgentAdmin(fullReviewAdjudications) },
{ path: "/productConfigAgent/golden-set-v2/export", method: "get", action: withProductConfigAgentAdmin(exportFullReviewAnnotations) },
```

Return only the caller’s draft/submission and redacted evidence. `decideAdmission` returns `quarantine` for any non-unique ERP decision, missing required field evidence, rejected document, failed acceptance threshold or unvalidated cohort. The admission endpoint is preview-only; it must not write archives.

- [ ] **Step 4: Run server build and focused tests**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReview.test.ts && npm run build:server`

Expected: PASS and TypeScript exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/productConfigAgent/goldenSet/fullReviewAdmission.ts apps/server/src/modules/productConfigAgent/routes/handlers/goldenSetFullReviewHandlers.ts apps/server/src/modules/productConfigAgent/routes/productConfigAgent.routes.ts apps/server/test/productConfigAgent/goldenSetFullReview.test.ts
git commit -m "feat: expose Golden Set full-review admission API"
```

### Task 5: Build pure frontend mapping and state before UI rendering

**Files:**
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/types.ts`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/service.ts`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/hooks/useFullReviewState.ts`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/utils.test.ts`

**Consumes:** v2 API DTO and existing `apiClient`.

**Produces:** `toChineseEvidenceCards`, `validateForSubmit`, and `useFullReviewState` consumed by all UI components.

- [ ] **Step 1: Write failing pure-function tests**

```ts
it("maps frozen English evidence to Chinese cards without exposing predictions", () => {
  const cards = toChineseEvidenceCards({ source: { document_id: "914", product_name: "Flat die" }, prediction: { hidden: true } } as never);
  expect(cards).toContainEqual({ label: "产品名称", value: "Flat die", originalKey: "product_name" });
  expect(JSON.stringify(cards)).not.toContain("prediction");
});

it("blocks auto archive when a field has no evidence", () => {
  expect(validateForSubmit(autoArchiveWithoutEvidence).errors).toContain("关键配置必须关联证据");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace apps/web -- src/pages/quoteAgent/goldenSet/fullReview/utils.test.ts`

Expected: FAIL because the web workspace has no test runner; add no dependency. Move these pure tests into the root node:test suite as `apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts` instead.

- [ ] **Step 3: Implement types, service, mapping and hook**

```ts
export const fullReviewService = {
  next: () => apiClient.get("/productConfigAgent/golden-set-v2/tasks/next").then((r) => r.data as FullReviewTask),
  draft: (task: FullReviewTask, annotation: FullReviewAnnotation) => apiClient.put(`/productConfigAgent/golden-set-v2/tasks/${task.document_id}/draft`, { revision: task.revision, annotation }).then((r) => r.data),
  submit: (task: FullReviewTask, annotation: FullReviewAnnotation) => apiClient.post(`/productConfigAgent/golden-set-v2/tasks/${task.document_id}/submit`, { revision: task.revision, annotation }).then((r) => r.data),
};
```

The hook uses one 1200ms debounced draft timer, updates revision only from the server response, preserves edits on a failed save, and exposes `saveState`, `errors`, `submit`, `skip`, and typed update functions rather than `any`.

- [ ] **Step 4: Run mapping tests and web build**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts && npm run build:web`

Expected: PASS and TypeScript exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/quoteAgent/goldenSet/fullReview apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
git commit -m "feat: add Golden Set full-review client state"
```

### Task 6: Implement desktop and mobile full-review workbench

**Files:**
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ReviewHeader.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/AdmissionDecisionForm.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/PackageItemsForm.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ConfigFieldsForm.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ErpIdentityForm.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/MobileActionBar.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/FullReviewWorkbenchPage.tsx`
- Create: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/styles.css`
- Modify: `apps/web/src/app/AppRoutes.tsx`

**Consumes:** `useFullReviewState` and component props defined in Task 5.

**Produces:** `/agent/golden-set/full-review` usable in the 20-task pilot.

- [ ] **Step 1: Add a compile-time failing route import**

```tsx
const FullReviewWorkbenchPage = lazy(() => import("@/pages/quoteAgent/goldenSet/fullReview/FullReviewWorkbenchPage"));
<Route path="golden-set/full-review" element={<FullReviewWorkbenchPage />} />
```

- [ ] **Step 2: Run web build to verify it fails**

Run: `npm run build:web`

Expected: FAIL because `FullReviewWorkbenchPage` does not exist.

- [ ] **Step 3: Implement minimal component contracts and responsive CSS**

```tsx
export function MobileActionBar({ saveState, onSkip, onSubmit }: {
  saveState: "saved" | "saving" | "failed"; onSkip(): void; onSubmit(): void;
}) {
  return <footer className="full-review-actions" aria-label="标注操作">
    <span aria-live="polite">{saveState === "saving" ? "正在保存" : saveState === "saved" ? "已保存" : "保存失败"}</span>
    <button type="button" onClick={onSkip}>稍后处理</button>
    <button type="button" onClick={onSubmit}>保存并下一条</button>
  </footer>;
}
```

```css
.full-review-actions { position: sticky; bottom: 0; padding: 12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
@media (max-width: 900px) { .full-review-layout { grid-template-columns: 1fr; } .full-review-original-evidence { display: none; } }
```

The evidence component has a Chinese summary and a closed-by-default `<details>` original-evidence section. The package form supports add/remove item and relationship fields. The ERP form only changes `annotation.erp`; it must never mutate the package object. The admission form requires a reason code for quarantine/reject. Buttons have 40px minimum height and all inputs use `box-sizing: border-box`.

- [ ] **Step 4: Run lint and web build**

Run: `npm run lint:web && npm run build:web`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/quoteAgent/goldenSet/fullReview apps/web/src/app/AppRoutes.tsx
git commit -m "feat: add mobile full-review workbench"
```

### Task 7: Verify browser workflow, document operations, and freeze pilot criteria

**Files:**
- Modify: `docs/api/product-config-golden-set-annotation.md`
- Modify: `docs/frontend/product-config-golden-set-annotation.md`
- Modify: `docs/operations/codex-implementation-log.md`

**Consumes:** complete API, v2 sealed snapshot and workbench.

**Produces:** an operator-ready 20-task pilot procedure and documented promotion boundary.

- [ ] **Step 1: Document exact API and operator contract**

Add routes, request/response DTOs, slot separation, file export names, seal verification, 20-task pilot acceptance checks, 280/120 cohort policy, and the explicit rule that only acceptance-gated `auto_archive` records may enter the archive pipeline. State that `quarantine` and `reject` are automatic final outcomes, not silent archive writes.

- [ ] **Step 2: Run full verification commands**

Run: `node --test --import tsx apps/server/test/productConfigAgent/goldenSet.test.ts apps/server/test/productConfigAgent/goldenSetFullReview.test.ts apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts && npm run build:server && npm run lint:web && npm run build:web`

Expected: all commands exit 0.

- [ ] **Step 3: Execute A/B browser simulation and screenshots**

Use the Browser plugin with two local authenticated slots. Complete one `auto_archive`, one `quarantine`, and one `reject` task; verify the opposite slot cannot see the submitted answer; verify an admin sees only submitted A/B tasks in adjudication. Capture desktop plus 360px, 390px, and 430px screenshots, checking no horizontal overflow, hidden drawer residue, obstructed input, or covered action bar.

- [ ] **Step 4: Record pilot freeze condition**

Record that the 20-task pilot may proceed to the remaining 380 only when both annotators complete all tasks, every export validates against the seal, all disagreements have a clear reason-code path, and the 120 acceptance documents remain untouched by rule/prompt changes.

- [ ] **Step 5: Commit**

```bash
git add docs/api/product-config-golden-set-annotation.md docs/frontend/product-config-golden-set-annotation.md docs/operations/codex-implementation-log.md
git commit -m "docs: define Golden Set full-review operations"
```

## Self-Review

- Spec coverage: Tasks 1-4 cover the immutable all-layer contract, one-pass A/B storage, merge, adjudication, 280/120 separation and archive gate. Tasks 5-6 cover Chinese evidence, mobile interaction, product package, ERP, configuration and admission forms. Task 7 covers screenshots, API/frontend documentation and pilot freeze.
- Placeholder scan: no deferred implementation or unspecified validation remains; the only runtime prerequisite is read-only access to the 400 existing document blocks, which Task 2 verifies and reports as a counted failure instead of filling from another source.
- Type consistency: `FullReviewAnnotation` is defined in Task 1, persisted in Task 3, served in Task 4, consumed in Task 5 and rendered in Task 6. `AdmissionDecision` is defined in Task 1 and evaluated in Task 4.
