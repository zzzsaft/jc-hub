# Codex Document 30-100 Write Plan

Business LLM tokens: 0. No pending_llm_upload job, no worker, no business LLM API.

## Scope

- Selected non-duplicate documents: 71 (30-100).
- Skipped duplicates: 0.
- Approx Codex blocks tokens: 398058.

## Candidate Governance

| documentId | candidateId | type | termType | rawValue | evidence | action | canonical/split |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| 33 | 3865 | value | deckle_type | 内堵式 （单边150mm  ） | blocks_cell | split | split deckle_type=internal_deckle; deckle_single_side_width=150mm |
| 34 | 3866 | value | flat_extrusion_mounting_method | 配模头支架 | fileName/blocks_cell | create-value | canonicalValue=with_die_stand |
| 46 | 3867 | value | deckle_type | 外堵式（单边200mm） | blocks_cell | split | split deckle_type=external_standard_deckle; deckle_single_side_width=200mm |
| 47 | 737 | value | die_mounting_method | 下挤出 / 45°斜挤出安装 / 45°挤出微调朝下 | blocks_cell | split | split into existing die_mounting_method terms |
| 51 | 479 | value | heating_phase | 空 | blocks_cell | reject | reject_noise placeholder blank phase |
| 56 | 3868 | value | feed_inlet_method | 中央圆口进料,下模底面 | blocks_cell | split | split feed_inlet_method=center_round_feed; feed_inlet_position=下模底面 |
| 58 | 3869 | value | application | 自动拉丝膜 | blocks_cell | create-value | canonicalValue=automatic_drawn_film |
| 59 | 3870 | value | lip_adjustment_method | 其他 模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构 | blocks_cell | split | split lip_adjustment_method=推拉式弹性微调结构; lip_structure=上下模整体结构 |
| 60 | 3871 | value | lip_adjustment_method | 上、下模唇均采用全推式弹性微调 | blocks_cell | approve-as-alias | canonicalValue=manual_push_fine_adjustment |
| 62 | 3872 | value | lip_adjustment_method | 模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构 | blocks_cell | split | split lip_adjustment_method=推拉式弹性微调结构; lip_structure=上下模整体结构 |
| 63 | 3873 | value | plastic_material | WPC | blocks_cell | approve-as-alias | canonicalValue=WPC |
| 63 | 3874 | value | application | 仿结皮发泡板模头 | blocks_cell | approve-as-alias | canonicalValue=仿结皮发泡板 |
| 66 | 731 | value | product_material | [SEL] 1.2714钢 | blocks_cell | reject | reject extraction/normalization artifact; selected marker is not value |
| 66 | 733 | value | manual_requirement | [SEL] 英文 | blocks_cell | reject | reject extraction/normalization artifact; selected marker is not value |
| 69 | 3875 | value | application | 中空板材 | blocks_cell | approve-as-alias | canonicalValue=hollow_board |
| 73 | 2903 | value | application | 小机原料uv | blocks_cell | split | split plastic_material=UV; reject application noise |
| 76 | 3876 | value | feedblock_structure | 其他 ，圆口 | blocks_cell | approve-as-alias | canonicalValue=round_inlet |
| 85 | 3877 | value | lip_adjustment_method | 其他 | blocks_cell | approve-as-alias | canonicalValue=other |
| 96 | 811 | value | connection_drawing_status | 其它（未明确勾选） | blocks_cell | reject | reject_noise unselected/unclear option |

## Term Type Alias Governance Before Refresh

| raw field | target termType | action | reason |
| --- | --- | --- | --- |
| 产量 | capacity | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 产品主体加热方式 | heating_method | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 联接尺寸图纸提供情况 | connection_drawing_status | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 应用 | application | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 紧固件（螺丝） | fastener_type | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 备注 | marking_requirement_note | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 使用区域 | usage_market | mark_as_document_info | suppress refresh-time unknown_field candidates |
| 出口使用 | usage_market | mark_as_document_info | suppress refresh-time unknown_field candidates |
| 出口使用国家 | country | mark_as_document_info | suppress refresh-time unknown_field candidates |
| 模具编号 | product_number | mark_as_document_info | suppress refresh-time unknown_field candidates |
| 最大产量 | capacity | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 最小产量 | capacity | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 最大转速 | rotation_speed | add_termtype_alias | suppress refresh-time unknown_field candidates |
| 最小转速 | rotation_speed | add_termtype_alias | suppress refresh-time unknown_field candidates |

## Manual Correction

Create new `extraction_results` with `llmModel=codex-manual-correction`, `promptVersion=codex-manual-blocks-20260708`, `llmPlanJson.businessLlmCalled=false`, `llmPlanJson.source=codex_manual_blocks_read`; do not update old extraction rows.

- document_info correction candidates: 30, 31, 32, 33, 34, 35, 36, 37, 40, 45, 48, 49, 55, 56, 57, 59, 61, 62, 63, 64, 65, 66, 68, 69, 71, 73, 76, 79, 85, 86, 87, 93, 95, 97, 98, 100.
- item identity/quantity correction candidates: 35, 36, 37, 40, 66, 67, 69, 70, 73, 89, 93, 94, 95.
- Evidence sources: blocks_cell when line samples contain explicit fields; fileName only for merged/combined product or accessory numbers absent from body; codex_inference only for item name completion from filename.

## Archive Refresh

- Run existing `runDictionaryDirtyRefresh` for: 30, 31, 32, 33, 34, 35, 36, 37, 40, 44, 45, 46, 47, 48, 49, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 73, 76, 79, 82, 84, 85, 86, 87, 89, 93, 94, 95, 96, 97, 98, 99, 100.
- Run existing `archiveDocument` for document 97 after manual correction because it currently has no archive and readiness is `canArchive=true`.

## Tables To Write

- `production_config_agent.dictionary_term_type_aliases`
- `production_config_agent.dictionary_terms`
- `production_config_agent.dictionary_aliases`
- `production_config_agent.dictionary_splits`
- `production_config_agent.dictionary_candidates`
- `production_config_agent.dictionary_candidate_occurrences`
- `production_config_agent.dictionary_versions`
- `production_config_agent.dictionary_change_logs`
- `production_config_agent.extraction_results` for manual correction rows only
- `production_config_agent.documents` for `dictionary_dirty` status changes
- `production_config_agent.contract_archives`
- `production_config_agent.contract_archive_items`
- `production_config_agent.contract_archive_item_products`
- `production_config_agent.contract_archive_versions`

## Rollback / Audit

- Before write, snapshot target candidates, candidate occurrences, target terms/aliases/splits, term type aliases, documents, latest extraction ids, archives/items/item_products, dictionary version.
- Dictionary rollback: restore candidate statuses/review fields; delete terms/aliases/splits/term-type aliases created by `codex_doc30_100_governance_20260708`; keep change logs as audit.
- Manual correction rollback: mark new correction extraction superseded or restore archive to previous extractionResultId from snapshot; do not hard-delete unless explicitly requested.
- Post-write checks: duplicate archive count, unique index, dirty docs, dirty archives, pending candidates, refreshed extractionResultIds, archive item counts, manual correction ids, business LLM tokens = 0.

## Validation Before/After

- Required code checks after any code change: `npm run prisma:validate`, `npm run build:server`, `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`, `npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`.
- No new code change is planned before this write; existing createExtraction truncation already covers production field lengths.
