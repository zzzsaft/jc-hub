# Golden Set Evidence Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace abstract Golden Set frozen-evidence cards with readable two-column tables and read-only checkbox states for Excel options.

**Architecture:** Add a pure front-end evidence adapter that selects a parser by `evidence_id` and produces a small shared display model. Keep the sealed evidence untouched, render each parsed section in `ChineseEvidenceCard`, and retain the raw evidence disclosure as the lossless fallback.

**Tech Stack:** React, TypeScript, CSS, Node test runner with `tsx`; no new dependency.

## Global Constraints

- Only the front-end derived display changes; frozen evidence, evidence hash, API payloads, drafts, submissions, A/B isolation, and validation rules remain unchanged.
- Tables have exactly two columns on desktop; coordinates, BOM status, and trace details stay below the primary value.
- Checked boxes mean selected and empty boxes mean unselected; do not render `[SEL]`, `[ ]`, or the text “未选” in the structured view.
- At widths below 900px, each table row stacks vertically and must not create horizontal scrolling or single-character Chinese wrapping at 360px, 390px, or 430px.
- Raw evidence remains available in the existing disclosure for every section and is the fallback for malformed or unknown input.
- Do not add dependencies or change the Excel parser, v2 sealed packet, database, ERP lookup, or archive flow.

---

## File Map

- Modify `apps/web/src/pages/quoteAgent/goldenSet/fullReview/types.ts`: define the evidence-section display contract.
- Modify `apps/web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts`: parse block, package-candidate, and ERP-candidate evidence into the display contract.
- Modify `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx`: render tables, read-only checkboxes, unresolved states, and fallbacks.
- Modify `apps/web/src/pages/quoteAgent/goldenSet/fullReview/styles.css`: add table and responsive stacked-row styling.
- Modify `apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts`: verify all pure evidence mappings and safe fallback behavior.
- Modify `docs/frontend/product-config-golden-set-annotation.md`: document the structured evidence UI and checkbox semantics.
- Modify `docs/operations/codex-implementation-log.md`: record scope and verification at the top of “实现记录”.

### Task 1: Pure evidence display adapter

**Files:**
- Modify: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/types.ts`
- Modify: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts`
- Test: `apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts`

**Interfaces:**
- Consumes: `FrozenEvidence = { evidence_id: string; content: string }`.
- Produces: `toEvidenceSections(evidence: FrozenEvidence[]): EvidenceSection[]`.
- Produces types:

```ts
export type EvidenceChoice = { label: string; selected: boolean };
export type EvidenceDisplayRow = {
  label: string;
  source: string | null;
  value: string | null;
  detail: string | null;
  choices: EvidenceChoice[];
};
export type EvidenceSection = {
  evidenceId: string;
  title: string;
  leftHeading: string;
  rightHeading: string;
  rows: EvidenceDisplayRow[];
  fallbackMessage: string | null;
};
```

- [ ] **Step 1: Write failing mapping tests**

Add these focused tests after the existing Chinese-card test:

```ts
import { addConfigurationField, reconcilePackageAnnotation, removeConfigurationField, toChineseEvidenceCards, toEvidenceSections, validateForSubmit } from "../../../web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts";

test("maps structured Excel options to checked and empty choices", () => {
  const [section] = toEvidenceSections([{
    evidence_id: "block:914",
    content: [
      "说明:",
      "[SEL] 表示该选项被选中。",
      "Sheet：配置表",
      "Row 12:",
      "[A12] 模唇调节",
      "[B12] [SEL] 自动",
      "[ ] 手动",
      'option_set: {"options":[{"selected":true,"value":"自动"},{"selected":false,"value":"手动"}],"field":"模唇调节"}',
    ].join("\n"),
  }]);
  assert.equal(section.title, "配置选项");
  assert.deepEqual(section.rows[0], {
    label: "模唇调节", source: "原表 B12", value: null, detail: null,
    choices: [{ label: "自动", selected: true }, { label: "手动", selected: false }],
  });
  assert.doesNotMatch(JSON.stringify(section), /\[SEL\]|未选/u);
});

test("falls back to option marks when option_set is absent", () => {
  const [section] = toEvidenceSections([{
    evidence_id: "block:915",
    content: "Row 27:\n[A27] 阻流棒\n[B27] [SEL] 有\n[ ] 无",
  }]);
  assert.deepEqual(section.rows[0].choices, [
    { label: "有", selected: true },
    { label: "无", selected: false },
  ]);
});

test("maps package and ERP candidates into two-column sections", () => {
  const sections = toEvidenceSections([
    { evidence_id: "package-candidates:914", content: JSON.stringify([{ source: "title", value: "热成型片材模头" }]) },
    { evidence_id: "erp-candidates:914", content: JSON.stringify({ status: "candidates", reason: null, candidates: [{ company: "JC", part_num: "M-1028", product_name: "热成型片材模头", has_bom: true }] }) },
  ]);
  assert.deepEqual(sections[0].rows[0], { label: "配置单标题", source: null, value: "热成型片材模头", detail: null, choices: [] });
  assert.deepEqual(sections[1].rows[0], { label: "JC / M-1028", source: null, value: "热成型片材模头", detail: "有 BOM", choices: [] });
});

test("keeps malformed evidence available through a safe fallback", () => {
  const sections = toEvidenceSections([
    { evidence_id: "package-candidates:914", content: "{" },
    { evidence_id: "erp-candidates:914", content: JSON.stringify({ status: "unresolved", reason: "lookup_timeout", candidates: [] }) },
  ]);
  assert.equal(sections[0].fallbackMessage, "暂时无法结构化展示，请查看原始证据。");
  assert.equal(sections[1].rows[0].value, "ERP 查询超时，暂未取得候选");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
```

Expected: FAIL because `toEvidenceSections` and the new display types do not exist.

- [ ] **Step 3: Add the display types and minimal parser**

Append the types above to `types.ts`, import `FrozenEvidence` and `EvidenceSection` in `utils.ts`, then add this adapter. Keep helpers private to `utils.ts`:

```ts
const evidenceFallback = "暂时无法结构化展示，请查看原始证据。";

export function toEvidenceSections(evidence: FrozenEvidence[]): EvidenceSection[] {
  return evidence.map((item) => {
    try {
      if (item.evidence_id.startsWith("block:")) return parseBlockEvidence(item);
      if (item.evidence_id.startsWith("package-candidates:")) return parsePackageEvidence(item);
      if (item.evidence_id.startsWith("erp-candidates:")) return parseErpEvidence(item);
    } catch {
      return fallbackSection(item);
    }
    return fallbackSection(item);
  });
}

function fallbackSection(item: FrozenEvidence): EvidenceSection {
  return { evidenceId: item.evidence_id, title: "其他证据", leftHeading: "证据", rightHeading: "内容", rows: [], fallbackMessage: evidenceFallback };
}

function parsePackageEvidence(item: FrozenEvidence): EvidenceSection {
  const input = JSON.parse(item.content);
  if (!Array.isArray(input)) throw new Error("invalid package candidates");
  const names: Record<string, string> = { title: "配置单标题", item: "产品项", field: "配置字段" };
  const rows = input.flatMap((candidate) => isRecord(candidate) && typeof candidate.value === "string" ? [{
    label: names[String(candidate.source)] ?? String(candidate.source ?? "候选来源"), source: null,
    value: candidate.value, detail: null, choices: [],
  }] : []);
  return { evidenceId: item.evidence_id, title: "产品候选", leftHeading: "来源", rightHeading: "产品名称", rows, fallbackMessage: rows.length ? null : evidenceFallback };
}

function parseErpEvidence(item: FrozenEvidence): EvidenceSection {
  const input = JSON.parse(item.content);
  if (!isRecord(input) || !Array.isArray(input.candidates)) throw new Error("invalid ERP candidates");
  const reasons: Record<string, string> = {
    lookup_timeout: "ERP 查询超时，暂未取得候选",
    lookup_error: "ERP 查询失败，暂未取得候选",
    circuit_open: "ERP 查询已暂停，暂未取得候选",
    no_candidates: "没有找到 ERP 候选",
  };
  const rows = input.candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const company = String(candidate.company ?? "").trim();
    const partNum = String(candidate.part_num ?? "").trim();
    if (!company && !partNum) return [];
    return [{
      label: [company, partNum].filter(Boolean).join(" / "), source: null,
      value: String(candidate.product_name ?? candidate.erp_product_name ?? "未提供产品名称"),
      detail: typeof candidate.has_bom === "boolean" ? `${candidate.has_bom ? "有" : "无"} BOM` : null,
      choices: [],
    }];
  });
  if (!rows.length) rows.push({ label: "查询状态", source: null, value: reasons[String(input.reason)] ?? "暂未取得 ERP 候选", detail: null, choices: [] });
  return { evidenceId: item.evidence_id, title: "ERP 候选", leftHeading: "公司 / 物料号", rightHeading: "产品信息", rows, fallbackMessage: null };
}
```

Implement `parseBlockEvidence` by isolating each `Row` block, preferring its `option_set`, and only then falling back to visible option marks:

```ts
function parseBlockEvidence(item: FrozenEvidence): EvidenceSection {
  const rows: EvidenceDisplayRow[] = [];
  const rowBlocks = item.content.split(/^Row \d+:\s*$/gmu).slice(1);
  for (const block of rowBlocks) {
    const cells = [...block.matchAll(/^\[([A-Z]+\d+)\]\s*(.*)$/gmu)].map((match) => ({ coordinate: match[1], text: match[2].trim() }));
    const optionLine = block.split(/\r?\n/u).find((line) => line.startsWith("option_set: "));
    if (optionLine) {
      const optionSet = JSON.parse(optionLine.slice("option_set: ".length));
      if (isRecord(optionSet) && Array.isArray(optionSet.options)) {
        const choices = optionSet.options.flatMap((option) => isRecord(option) && typeof option.value === "string" && typeof option.selected === "boolean" ? [{ label: option.value, selected: option.selected }] : []);
        const valueCell = cells.at(-1);
        const fieldCell = cells.at(-2) ?? valueCell;
        if (choices.length && fieldCell && valueCell) {
          rows.push({ label: typeof optionSet.field === "string" ? optionSet.field : stripOptionMarks(fieldCell.text), source: `原表 ${valueCell.coordinate}`, value: null, detail: null, choices });
          continue;
        }
      }
    }
    const marked = [...block.matchAll(/\[(SEL| )\]\s*([^\n\[]+)/gu)];
    if (marked.length && cells.length) {
      const valueCell = cells.at(-1)!;
      const fieldCell = cells.find((cell) => !/\[(?:SEL| )\]/u.test(cell.text)) ?? valueCell;
      rows.push({ label: stripOptionMarks(fieldCell.text), source: `原表 ${valueCell.coordinate}`, value: null, detail: null, choices: marked.map((match) => ({ label: match[2].trim(), selected: match[1] === "SEL" })) });
      continue;
    }
    const [field, ...values] = cells;
    const value = values.map((cell) => cell.text).filter(Boolean).join("；");
    if (field?.text && value) rows.push({ label: field.text, source: `原表 ${values[0]?.coordinate ?? field.coordinate}`, value, detail: null, choices: [] });
  }
  return { evidenceId: item.evidence_id, title: "配置选项", leftHeading: "配置项", rightHeading: "可选内容", rows, fallbackMessage: rows.length ? null : evidenceFallback };
}

function stripOptionMarks(value: string) {
  return value.replace(/\[(?:SEL| )\]\s*/gu, "").trim();
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Node command. Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add apps/web/src/pages/quoteAgent/goldenSet/fullReview/types.ts apps/web/src/pages/quoteAgent/goldenSet/fullReview/utils.ts apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
git commit -m "feat: parse golden set evidence for tables"
```

### Task 2: Structured evidence renderer and responsive layout

**Files:**
- Modify: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx`
- Modify: `apps/web/src/pages/quoteAgent/goldenSet/fullReview/styles.css`

**Interfaces:**
- Consumes: `toEvidenceSections(evidence): EvidenceSection[]` from Task 1.
- Preserves: existing `ChineseEvidenceCard({ evidence }: { evidence: FrozenEvidence[] })` props and the raw-evidence disclosure.

- [ ] **Step 1: Add a source-level failing renderer guard**

Add a Node test that reads `ChineseEvidenceCard.tsx` and locks the required semantics without introducing a rendering-test dependency:

```ts
import fs from "node:fs";

test("structured evidence renderer uses tables and read-only checkboxes", () => {
  const source = fs.readFileSync("apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx", "utf8");
  assert.match(source, /<table/u);
  assert.match(source, /type="checkbox"/u);
  assert.match(source, /checked=\{choice\.selected\}/u);
  assert.match(source, /disabled/u);
  assert.match(source, /查看原始证据/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 1 command. Expected: FAIL because the component has no table or checkbox renderer.

- [ ] **Step 3: Replace the card list with semantic tables**

Use this complete component structure:

```tsx
import { toEvidenceSections } from "../utils";
import type { FrozenEvidence } from "../types";

export function ChineseEvidenceCard({ evidence }: { evidence: FrozenEvidence[] }) {
  const sections = toEvidenceSections(evidence);
  return <aside className="full-review-evidence" aria-label="冻结证据">
    <h2>冻结证据</h2><p className="full-review-help">只根据以下脱敏内容判断。</p>
    <div className="full-review-evidence-sections">{sections.map((section) => <section className="full-review-evidence-section" key={section.evidenceId}>
      <div className="full-review-evidence-heading"><h3>{section.title}</h3><span>{section.rows.length ? `${section.rows.length} 条` : ""}</span></div>
      {section.rows.length > 0 && <table className="full-review-evidence-table">
        <thead><tr><th scope="col">{section.leftHeading}</th><th scope="col">{section.rightHeading}</th></tr></thead>
        <tbody>{section.rows.map((row, index) => <tr key={`${row.label}-${index}`}>
          <th scope="row"><strong>{row.label}</strong>{row.source && <small>{row.source}</small>}</th>
          <td>{row.choices.length > 0 ? <div className="full-review-evidence-choices">{row.choices.map((choice) => <label key={choice.label}><input type="checkbox" checked={choice.selected} disabled />{choice.label}</label>)}</div> : <><strong>{row.value}</strong>{row.detail && <small>{row.detail}</small>}</>}</td>
        </tr>)}</tbody>
      </table>}
      {section.fallbackMessage && <p className="full-review-evidence-fallback">{section.fallbackMessage}</p>}
    </section>)}</div>
    <details className="full-review-original-evidence"><summary>查看原始证据</summary>{evidence.map((item) => <section key={item.evidence_id}><b>{item.evidence_id}</b><pre>{item.content}</pre></section>)}</details>
  </aside>;
}
```

- [ ] **Step 4: Add desktop and narrow-screen CSS**

Append focused rules to `styles.css`; do not reformat unrelated minified rules:

```css
.full-review-evidence-sections{display:grid;gap:20px}.full-review-evidence-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:7px}.full-review-evidence-heading h3{margin:0;font-size:15px}.full-review-evidence-heading span,.full-review-evidence-table small{color:#66727e}.full-review-evidence-table{width:100%;border-collapse:collapse;table-layout:fixed}.full-review-evidence-table th,.full-review-evidence-table td{padding:10px 12px;border-bottom:1px solid #dfe4e8;text-align:left;vertical-align:top}.full-review-evidence-table thead th{color:#66727e;font-weight:600}.full-review-evidence-table th:first-child{width:42%}.full-review-evidence-table tbody th strong,.full-review-evidence-table td>strong{display:block;word-break:keep-all;overflow-wrap:normal}.full-review-evidence-table small{display:block;margin-top:3px;font-size:12px;font-weight:400}.full-review-evidence-choices{display:flex;flex-wrap:wrap;gap:8px 18px}.full-review-evidence-choices label{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#17212b}.full-review-evidence-choices input{width:18px;min-height:18px;margin:0;accent-color:#1769aa;opacity:1}.full-review-evidence-fallback{margin:0;color:#66727e}
@media(max-width:900px){.full-review-evidence-table thead{display:none}.full-review-evidence-table,.full-review-evidence-table tbody,.full-review-evidence-table tr,.full-review-evidence-table th,.full-review-evidence-table td{display:block;width:100%}.full-review-evidence-table tr{padding:10px 0;border-bottom:1px solid #dfe4e8}.full-review-evidence-table th,.full-review-evidence-table td{padding:2px 0;border:0}.full-review-evidence-table tbody th{color:#66727e}.full-review-evidence-table tbody th strong{font-weight:500}}
```

- [ ] **Step 5: Run focused tests and web build**

```bash
node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
npm run build:web
```

Expected: all focused tests PASS; Vite build exits 0.

- [ ] **Step 6: Commit the renderer**

```bash
git add apps/web/src/pages/quoteAgent/goldenSet/fullReview/components/ChineseEvidenceCard.tsx apps/web/src/pages/quoteAgent/goldenSet/fullReview/styles.css apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
git commit -m "feat: render golden set evidence tables"
```

### Task 3: Browser verification and documentation

**Files:**
- Modify: `docs/frontend/product-config-golden-set-annotation.md`
- Modify: `docs/operations/codex-implementation-log.md`

**Interfaces:**
- Verifies the complete `/agent/golden-set/full-review` behavior.
- Does not modify application contracts.

- [ ] **Step 1: Start the existing web application and open the real route**

Run the repository's existing development commands needed for the page. Use the Browser skill to open `/agent/golden-set/full-review` with the existing authenticated session. If backend data is unavailable, report that limitation and use the existing route's reachable states; do not invent API fixtures in production code.

Expected: the route loads without a React error and preserves the existing annotation form and raw-evidence disclosure.

- [ ] **Step 2: Verify desktop and phone widths**

Check desktop plus 360px, 390px, and 430px widths. At every width verify:

```text
- Excel, product, and ERP groups use two-column semantics on desktop.
- Checked and empty boxes are visibly distinct and are not editable.
- Structured view contains no literal [SEL], [ ], or “未选”.
- Chinese labels do not wrap one character per line.
- Narrow rows stack vertically without horizontal overflow.
- Raw evidence remains expandable.
- The fixed action bar does not cover the evidence or form controls.
```

Capture screenshots for evidence in the task handoff; screenshots are verification artifacts and are not added to the repository.

- [ ] **Step 3: Update front-end documentation**

Add this paragraph after the opening v2 description in `docs/frontend/product-config-golden-set-annotation.md`:

```md
冻结证据按来源分为配置选项、产品候选和 ERP 候选三组，并使用两列表格展示。Excel 选项使用只读复选框：框内打勾表示原表已选，空框表示原表未选；结构化视图不要求标注员理解 `[SEL]`、`[ ]` 或 `option_set`。单元格坐标和 BOM 状态作为次要追溯信息显示，原始冻结内容仍保留在“查看原始证据”折叠区。900px 以下表格行改为纵向布局，避免手机端中文被窄列压缩。
```

- [ ] **Step 4: Add the implementation log entry**

At the top of the “实现记录” section in `docs/operations/codex-implementation-log.md`, add a dated entry containing:

```md
### 2026-07-13：Golden Set 冻结证据表格化

- 实现：v2 全文盲审将 Excel 配置、产品候选和 ERP 候选映射为两列表格；Excel 选项使用只读勾选框/空框表达原始选择状态，原始 evidence 保持折叠可追溯。
- 边界：仅修改前端派生展示，不修改 sealed packet、evidence hash、API、草稿/提交结构、ERP 查询或归档流程。
- 验证：Golden Set UI 映射专项测试、`npm run build:web`，以及桌面、360px、390px、430px 浏览器检查通过。
```

If browser verification is blocked, replace “浏览器检查通过” with the exact unverified state rather than claiming success.

- [ ] **Step 5: Run final verification**

```bash
node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts
npm run build:web
git diff --check
git status --short
```

Expected: tests PASS, build exits 0, `git diff --check` has no output, and status lists only the intended files plus the pre-existing `.superpowers/brainstorm/` visualization directory.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/frontend/product-config-golden-set-annotation.md docs/operations/codex-implementation-log.md
git commit -m "docs: describe golden set evidence tables"
```
