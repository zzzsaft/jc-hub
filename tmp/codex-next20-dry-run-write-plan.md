# Codex Next 20 Dry-Run Report And Write Plan

Generated: 2026-07-08

Scope: document 10-29, selected by ascending `documents.id` after document 9. No duplicate document was selected by `document_duplicates`, `file_hash`, or blocks content hash logic.

Constraints honored so far: no business LLM, no DeepSeek/InferAI/XH/OpenAI API, no `requestInferAiChatJson`, no `routedChatClient`, no `extractDocument`, no `pending_llm_upload`, no worker. Production DB access used `/Users/zzzsaft/Documents/jc-hub/.env` in read-only audit/dry-run scripts.

## Token Summary

Business LLM tokens: 0.

Approx Codex blocks reading tokens: 105846.

Per document approx blocks tokens:

| documentId | approxBlocksTokens |
| --- | ---: |
| 10 | 4225 |
| 11 | 1836 |
| 12 | 1837 |
| 13 | 1837 |
| 14 | 6969 |
| 15 | 6961 |
| 16 | 5417 |
| 17 | 6087 |
| 18 | 6000 |
| 19 | 6001 |
| 20 | 6977 |
| 21 | 6052 |
| 22 | 6037 |
| 23 | 6973 |
| 24 | 6005 |
| 25 | 6092 |
| 26 | 2231 |
| 27 | 6349 |
| 28 | 5990 |
| 29 | 5970 |

## Dry-Run Files

- `tmp/codex-next20-readonly-audit-data.json`: production read-only source snapshot.
- `tmp/codex-next20-readonly-audit-report.md`: raw normalized snapshot report.
- `tmp/codex-next20-normalization-dry-run.json`: local normalization before/after against latest extraction results.

## Document Processing Summary

| documentId | extractionResultId | Codex understanding summary | extraction comparison |
| --- | ---: | --- | --- |
| 10 | 14317 | Product `2018-371-E & 2018-372-E & 2018-373-E`, contract `7180822`; 3 metering pump items `GD-E56/GD-E56/GD-E70`, quantities `1/1/1`, pump body, reducer/drive, heating and material configs. | Existing extraction mostly usable; empty `order_number` should be suppressed; pending transmission aliases remain. |
| 11 | 14316 | Product `190282-E-200`, contract `7190110`; connector `1`, 3-layer feedblock `2`; mark note. | Quantity normalized to numeric; no pending candidate. |
| 12 | 14313 | Product `191225-E-200`, contract `7190110`; connector quantity is blank placeholder, feedblock quantity `2`. | Fixed deterministic bug: `共（ ）件` becomes `null`, not text. |
| 13 | 14314 | Product `2019-281-E-200`, contract `7190620`; connector placeholder quantity, feedblock quantity `2`; mark note. | Same placeholder quantity fix as doc 12. |
| 14 | 14315 | Product `190128-E`, contract `7190104`; EVA solar film flat die `1`, 3-layer ABC feedblock `1`, extra 3-layer feedblock `2`; layer/part configs retained. | No pending candidate; existing candidate statuses already resolved. |
| 15 | 14334 | Product `190282-E`, contract `7190110`; 2400mm soft opaque PVC sheet flat die `1`, 2-layer feedblock `1`, 3-layer feedblock `2`. | Application candidate `软质不透明板材` needs governance; otherwise normalized route is acceptable. |
| 16 | 14318 | Blocks contain customer `40218`, country Macedonia, contract `7181109`, product `190465-E`, order date `2019-04-07`, delivery date `2019-05-22`; item is 1150mm rigid opaque PVC sheet flat die `1`. | Latest extraction has empty document_info: extraction漏抽, needs manual correction extraction result if archive doc info must be fixed. |
| 17 | 14319 | Product `190666-E`, contract `7190321`; rigid transparent PVC sheet flat die `1`, 3-layer feedblock `2`. | Application candidate `硬质透明片材` needs governance. |
| 18 | 14320 | Product `190893-E`, contract `7190527`; PVC preservative film flat die `1`, 3-layer feedblock `2`; quality note. | No pending candidate. |
| 19 | 14321 | Product `191074-E`, contract `7190816`; LLDPE stretch film flat die `1`, 3-layer feedblock `2`. | `order_number=unknown` should be suppressed on next normalization; application alias `拉伸膜` pending. |
| 20 | 14323 | PC optical-grade thin sheet flat die `1`, 5-layer feedblock `1`, 3-layer feedblock `2`; strict quality note. | Product/contract doc_info mostly absent in latest normalized result; candidate `光学级薄片` should be split or reviewed. |
| 21 | 14322 | PVC skin-foam/anti-skinning foamed board flat die `1`, 3-layer feedblock `2`. | Pending candidate none; placeholder heating phase candidate already shared as candidate 703 from other docs. |
| 22 | 14324 | PVC preservative film flat die `1`, 3-layer feedblock `2`. | No pending candidate. |
| 23 | 14336 | Product `191472-E`, contract `7191022`; 950mm PP/PS sheet flat die `1`, 3-layer PP/PS feedblock `1`, connector `1`, 3-layer LDPE/LLDPE feedblock `2`. | Application candidates `防静电片材` and `导电、防静电` need governance; multi-item routing otherwise usable. |
| 24 | 14327 | PVC imitation skin-foam board flat die, 3-layer feedblock `2`. | Item 1 name/quantity missing in normalized result although filename/blocks imply flat die; mark as extraction issue/manual correction candidate if archive exactness required. |
| 25 | 14332 | 2250mm PVC free foaming board flat die `1`, connector `1`, 3-layer feedblock `2`. | No pending candidate. |
| 26 | 14325 | Product `2020-381-E-300`, contract `7200910`, country Poland; 3-layer feedblock `1`, 3-layer feedblock `2`. | Candidate 703 `（未明确）` is heating phase placeholder/noise and should be rejected. |
| 27 | 14333 | Product `200142-E`, contract `7191127`; 1380mm PVC/UPVC wave board flat die `1`, 3-layer feedblock `1`. | No pending candidate. |
| 28 | 14326 | Product `202064-E`, contract `7200218`; 2200mm PC hollow board flat die `1`, 3-layer feedblock `2`. | No pending candidate. |
| 29 | 14328 | Blocks contain product `203131-E`, customer `40232`, contract `7201016`, order date `2020-10-16`, delivery date `2020-12-10`; 1200mm APET/PETG sheet flat die `1`, 3-layer feedblock `2`. | Latest extraction document_info only has notes: extraction漏抽, needs manual correction extraction result if archive doc info must be fixed. |

## Normalization Fix Implemented

- `item_quantity` now normalizes Arabic quantities with units, Chinese quantities such as `壹套` and `十二件`, and empty placeholders such as `共（          ）件`.
- Empty placeholders become `null`, avoiding search/archive pollution.
- Verified by `extractionNormalization.test.ts`.

Validation passed:

- `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`
- `npm run build:server`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`

## Pending Candidate Decisions

| documentId | candidateId | type | termType | rawValue | evidence from blocks/json | current DB result | judgment | recommendedAction | confidence | reason |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 497 | value | transmission_system_config | 变频电机 | `传动系统配置`: selected value appears with reducer and universal drive shaft | pending, 6 occurrences | should exist | create_term | high | Real transmission config, not noise. Canonical suggestion: `variable_frequency_motor`. |
| 10 | 498 | value | transmission_system_brand | 莱克斯诺 | `传动系统品牌`: `莱克斯诺` | pending, 9 occurrences | should exist | add_term_alias | high | Brand alias for existing Rexnord/Rexnord Changzhou term. Canonical suggestion: `rexnord_changzhou`. |
| 10 | 3858 | value | transmission_system_config | 减速箱 | selected option `[SEL] 减速箱` in pump rows | pending, 3 occurrences | should exist | create_term | high | Real reducer/gearbox config. Canonical suggestion: `gearbox`. |
| 15 | 3859 | value | application | 软质不透明板材 | `PVC软质不透明板材模头（产量400-500KG/每小时）` | pending | should exist | create_term | medium-high | Application phrase is real; consistent with existing rigid opaque sheet pattern. Canonical suggestion: `soft_opaque_sheet`. |
| 17 | 3860 | value | application | 硬质透明片材 | `PVC硬质透明片材模头（产量350KG/每小时）` | pending | should exist | create_term | high | Real application. Canonical suggestion: `rigid_transparent_sheet`. |
| 19 | 3861 | value | application | 拉伸膜 | `LLDPE 拉伸膜模头` | pending, includes doc 43 occurrence | should exist | add_term_alias | high | Existing application term `drawn_film`; raw Chinese should be alias. |
| 20 | 3862 | value | application | 光学级薄片 | `PC光学级薄片模头` | pending | uncertain/composite | split_value | medium | Better as optical-grade qualifier/application + thin sheet/sheet value than one opaque alias. |
| 23 | 3863 | value | application | 防静电片材 | `PP PS导电/防静电片材模头` | pending | uncertain/composite | split_value | medium | Contains antistatic + sheet; avoid making composite alias unless business wants exact combined application. |
| 23 | 3864 | value | application | 导电、防静电 | `PP PS导电/防静电` | pending | should exist | add_term_alias | high | Existing combined term `conductive_antistatic` should get this alias. |
| 26 | 703 | value | heating_phase | （未明确） | blank heating phase placeholder `(      相 )` | pending, 5 occurrences | should not exist | reject_noise | high | Placeholder, not a dictionary value. |

## Production Write Plan, Not Yet Executed

Tables to write after explicit approval:

- `production_config_agent.dictionary_terms`: create terms for candidate 497, 3858, 3859, 3860 if not existing.
- `production_config_agent.dictionary_aliases`: add aliases for candidate 498, 3861, 3864 and for created terms where governance creates alias rows.
- `production_config_agent.dictionary_splits`: create/update split rows for candidate 3862 and 3863.
- `production_config_agent.dictionary_candidates`: update statuses/review metadata for candidate 497, 498, 3858, 3859, 3860, 3861, 3862, 3863, 3864, 703.
- `production_config_agent.dictionary_versions` and `dictionary_change_logs`: governance audit/version bump.
- `production_config_agent.documents`: affected documents may be marked `dictionary_dirty` by governance.

Optional manual extraction correction, separate approval line:

- `production_config_agent.extraction_results`: create manual correction rows for document 16, 24, and 29 if approved. Document 16/29 need document_info from blocks; document 24 needs item 1 name/quantity from blocks/filename evidence.
- `production_config_agent.contract_archives`, `contract_archive_items`, archive version/change tables: refreshed by existing archive refresh after manual correction.

Rollback/audit:

- Before write, export snapshot of candidate rows, target term rows, alias rows, split rows, dictionary version, affected documents, and archive rows.
- For dictionary rollback: restore candidate status/proposed/evidence/review fields from snapshot; delete rows created with reviewedBy/source `codex_next20_dictionary_governance_20260708`; restore previous split rows from snapshot; keep version/change log rows as immutable audit.
- For optional manual extraction rollback: restore archive to previous extractionResultId/archiveJson/docInfo/item rows from snapshot; mark manual extraction result superseded rather than hard-delete unless user requests deletion.

Post-write checks required:

- Query candidate statuses and target term/alias/split rows.
- Rerun local normalization dry-run for document 10-29.
- Run dictionary dirty refresh for affected documents.
- Refresh archive for document 10-29 and any candidate occurrence affected documents outside this batch.
- Check `contract_archives` duplicate document_id count is 0.
- Check partial unique index `contract_archives_document_id_unique_not_null` exists.
- Check archive search does not return dirty duplicate archives.

## Current Stop Point

No production write has been executed for this batch yet. The next step requires explicit user approval of the write plan.
