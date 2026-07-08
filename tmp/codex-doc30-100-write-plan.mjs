import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync("tmp/codex-doc30-100-readonly-audit-data.json", "utf8"));
const dry = JSON.parse(fs.readFileSync("tmp/codex-doc30-100-normalization-dry-run.json", "utf8"));

const candidateActions = [
  action(3865, "split", "value", "deckle_type", "内堵式 （单边150mm  ）", "blocks_cell", "split deckle_type=internal_deckle; deckle_single_side_width=150mm"),
  action(3866, "create-value", "value", "flat_extrusion_mounting_method", "配模头支架", "fileName/blocks_cell", "canonicalValue=with_die_stand"),
  action(3867, "split", "value", "deckle_type", "外堵式（单边200mm）", "blocks_cell", "split deckle_type=external_standard_deckle; deckle_single_side_width=200mm"),
  action(737, "split", "value", "die_mounting_method", "下挤出 / 45°斜挤出安装 / 45°挤出微调朝下", "blocks_cell", "split into existing die_mounting_method terms"),
  action(479, "reject", "value", "heating_phase", "空", "blocks_cell", "reject_noise placeholder blank phase"),
  action(3868, "split", "value", "feed_inlet_method", "中央圆口进料,下模底面", "blocks_cell", "split feed_inlet_method=center_round_feed; feed_inlet_position=下模底面"),
  action(3869, "create-value", "value", "application", "自动拉丝膜", "blocks_cell", "canonicalValue=automatic_drawn_film"),
  action(3870, "split", "value", "lip_adjustment_method", "其他 模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构", "blocks_cell", "split lip_adjustment_method=推拉式弹性微调结构; lip_structure=上下模整体结构"),
  action(3871, "approve-as-alias", "value", "lip_adjustment_method", "上、下模唇均采用全推式弹性微调", "blocks_cell", "canonicalValue=manual_push_fine_adjustment"),
  action(3872, "split", "value", "lip_adjustment_method", "模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构", "blocks_cell", "split lip_adjustment_method=推拉式弹性微调结构; lip_structure=上下模整体结构"),
  action(3873, "approve-as-alias", "value", "plastic_material", "WPC", "blocks_cell", "canonicalValue=WPC"),
  action(3874, "approve-as-alias", "value", "application", "仿结皮发泡板模头", "blocks_cell", "canonicalValue=仿结皮发泡板"),
  action(731, "reject", "value", "product_material", "[SEL] 1.2714钢", "blocks_cell", "reject extraction/normalization artifact; selected marker is not value"),
  action(733, "reject", "value", "manual_requirement", "[SEL] 英文", "blocks_cell", "reject extraction/normalization artifact; selected marker is not value"),
  action(3875, "approve-as-alias", "value", "application", "中空板材", "blocks_cell", "canonicalValue=hollow_board"),
  action(2903, "split", "value", "application", "小机原料uv", "blocks_cell", "split plastic_material=UV; reject application noise"),
  action(3876, "approve-as-alias", "value", "feedblock_structure", "其他 ，圆口", "blocks_cell", "canonicalValue=round_inlet"),
  action(3877, "approve-as-alias", "value", "lip_adjustment_method", "其他", "blocks_cell", "canonicalValue=other"),
  action(811, "reject", "value", "connection_drawing_status", "其它（未明确勾选）", "blocks_cell", "reject_noise unselected/unclear option"),
];

const termTypeAliasActions = [
  ["产量", "capacity", "add_termtype_alias"],
  ["产品主体加热方式", "heating_method", "add_termtype_alias"],
  ["联接尺寸图纸提供情况", "connection_drawing_status", "add_termtype_alias"],
  ["应用", "application", "add_termtype_alias"],
  ["紧固件（螺丝）", "fastener_type", "add_termtype_alias"],
  ["备注", "marking_requirement_note", "add_termtype_alias"],
  ["使用区域", "usage_market", "mark_as_document_info"],
  ["出口使用", "usage_market", "mark_as_document_info"],
  ["出口使用国家", "country", "mark_as_document_info"],
  ["模具编号", "product_number", "mark_as_document_info"],
  ["最大产量", "capacity", "add_termtype_alias"],
  ["最小产量", "capacity", "add_termtype_alias"],
  ["最大转速", "rotation_speed", "add_termtype_alias"],
  ["最小转速", "rotation_speed", "add_termtype_alias"],
];

const dirtyDocs = audit.selected
  .filter((doc) => doc.archive.dirtyReason || !doc.archive.id || doc.archive.itemCount === 0)
  .map((doc) => doc.document.id);
const manualDocs = audit.selected
  .filter((doc) => {
    const info = doc.normalizedSummary.documentInfo ?? {};
    const after = dry.results.find((item) => item.documentId === doc.document.id)?.after?.documentInfo ?? {};
    return dirtyDocs.includes(doc.document.id) && (!hasCoreDocInfo(info) || !hasCoreDocInfo(after));
  })
  .map((doc) => doc.document.id);
const identityDocs = [...new Set(
  audit.selected.flatMap((doc) =>
    doc.normalizedSummary.items
      .filter((item) => item.itemName == null || item.quantity == null || /共（/.test(String(item.quantity)) || /[壹贰叁肆伍陆柒捌玖]/.test(String(item.quantity)))
      .map(() => doc.document.id),
  ),
)].filter((id) => dirtyDocs.includes(id) || id === 97);
const refreshDocs = [...new Set([...dirtyDocs, ...manualDocs, ...identityDocs])].sort((a, b) => a - b);

const totalTokens = audit.selected.reduce((sum, doc) => sum + doc.approxBlocksTokens, 0);

const md = [
  "# Codex Document 30-100 Write Plan",
  "",
  "Business LLM tokens: 0. No pending_llm_upload job, no worker, no business LLM API.",
  "",
  "## Scope",
  "",
  `- Selected non-duplicate documents: ${audit.selected.length} (${audit.selected[0].document.id}-${audit.selected.at(-1).document.id}).`,
  `- Skipped duplicates: ${audit.skipped.length}.`,
  `- Approx Codex blocks tokens: ${totalTokens}.`,
  "",
  "## Candidate Governance",
  "",
  "| documentId | candidateId | type | termType | rawValue | evidence | action | canonical/split |",
  "| --- | ---: | --- | --- | --- | --- | --- | --- |",
  ...candidateActions.map((item) => {
    const doc = audit.selected.find((value) => value.candidates.some((candidate) => candidate.id === item.candidateId));
    return `| ${doc?.document.id ?? ""} | ${item.candidateId} | ${item.candidateType} | ${item.termType} | ${escapeCell(item.rawValue)} | ${item.evidence} | ${item.action} | ${escapeCell(item.detail)} |`;
  }),
  "",
  "## Term Type Alias Governance Before Refresh",
  "",
  "| raw field | target termType | action | reason |",
  "| --- | --- | --- | --- |",
  ...termTypeAliasActions.map(([raw, target, act]) => `| ${escapeCell(raw)} | ${target} | ${act} | suppress refresh-time unknown_field candidates |`),
  "",
  "## Manual Correction",
  "",
  "Create new `extraction_results` with `llmModel=codex-manual-correction`, `promptVersion=codex-manual-blocks-20260708`, `llmPlanJson.businessLlmCalled=false`, `llmPlanJson.source=codex_manual_blocks_read`; do not update old extraction rows.",
  "",
  `- document_info correction candidates: ${manualDocs.join(", ") || "none"}.`,
  `- item identity/quantity correction candidates: ${identityDocs.join(", ") || "none"}.`,
  "- Evidence sources: blocks_cell when line samples contain explicit fields; fileName only for merged/combined product or accessory numbers absent from body; codex_inference only for item name completion from filename.",
  "",
  "## Archive Refresh",
  "",
  `- Run existing \`runDictionaryDirtyRefresh\` for: ${refreshDocs.join(", ")}.`,
  "- Run existing `archiveDocument` for document 97 after manual correction because it currently has no archive and readiness is `canArchive=true`.",
  "",
  "## Tables To Write",
  "",
  "- `production_config_agent.dictionary_term_type_aliases`",
  "- `production_config_agent.dictionary_terms`",
  "- `production_config_agent.dictionary_aliases`",
  "- `production_config_agent.dictionary_splits`",
  "- `production_config_agent.dictionary_candidates`",
  "- `production_config_agent.dictionary_candidate_occurrences`",
  "- `production_config_agent.dictionary_versions`",
  "- `production_config_agent.dictionary_change_logs`",
  "- `production_config_agent.extraction_results` for manual correction rows only",
  "- `production_config_agent.documents` for `dictionary_dirty` status changes",
  "- `production_config_agent.contract_archives`",
  "- `production_config_agent.contract_archive_items`",
  "- `production_config_agent.contract_archive_item_products`",
  "- `production_config_agent.contract_archive_versions`",
  "",
  "## Rollback / Audit",
  "",
  "- Before write, snapshot target candidates, candidate occurrences, target terms/aliases/splits, term type aliases, documents, latest extraction ids, archives/items/item_products, dictionary version.",
  "- Dictionary rollback: restore candidate statuses/review fields; delete terms/aliases/splits/term-type aliases created by `codex_doc30_100_governance_20260708`; keep change logs as audit.",
  "- Manual correction rollback: mark new correction extraction superseded or restore archive to previous extractionResultId from snapshot; do not hard-delete unless explicitly requested.",
  "- Post-write checks: duplicate archive count, unique index, dirty docs, dirty archives, pending candidates, refreshed extractionResultIds, archive item counts, manual correction ids, business LLM tokens = 0.",
  "",
  "## Validation Before/After",
  "",
  "- Required code checks after any code change: `npm run prisma:validate`, `npm run build:server`, `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`, `npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`.",
  "- No new code change is planned before this write; existing createExtraction truncation already covers production field lengths.",
  "",
].join("\n");

fs.writeFileSync("tmp/codex-doc30-100-write-plan.md", md);
console.log(JSON.stringify({ out: "tmp/codex-doc30-100-write-plan.md", dirtyDocs, manualDocs, identityDocs, refreshDocs, candidateCount: candidateActions.length, termTypeAliasCount: termTypeAliasActions.length, approxBlocksTokens: totalTokens }, null, 2));

function action(candidateId, action, candidateType, termType, rawValue, evidence, detail) {
  return { candidateId, action, candidateType, termType, rawValue, evidence, detail };
}

function hasCoreDocInfo(info) {
  const flat = Object.fromEntries(Object.entries(info ?? {}).map(([key, value]) => [key, value?.value ?? value]));
  return Boolean(flat.product_number || flat.contract_number || flat.customer_id || flat.country || flat.order_date || flat.delivery_date);
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("\n", "<br>").replaceAll("|", "\\|");
}
