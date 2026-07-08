# Codex Document 101-200 Write Plan

Constraints honored so far: readonly production DB, no business LLM, no DeepSeek/InferAI/XH/OpenAI API, no `requestInferAiChatJson`, no `routedChatClient`, no `extractDocument`, no `pending_llm_upload`, no worker. Business LLM tokens: 0.

Scope choice: user title says document 101-200; embedded "30-100" line is treated as stale copy from the previous round.

## Readonly Results

- Selected non-duplicate documents: 100 (`101-200`).
- Skipped duplicates: 0.
- Approx Codex blocks tokens: 420481.
- Existing pending candidates in selected docs: 23.
- Dirty/missing archive docs needing refresh or archive build: `103,104,105,107,108,109,110,111,112,114,115,116,117,120,121,123,124,126,128,133,134,138,142,145,146,148,154,155,160,163,166,168,172,175,179,180,182,190,191,195,199,200`.
- Core document_info missing/weak docs needing Codex manual correction from blocks/fileName: `103,104,107,109,110,111,112,114,116,127,128,129,131,132,133,134,135,138,142,144,145,146,148,149,153,154,158,159,161,162,167,187,190,197`.

## Candidate Governance

| documentId | candidateId | type | termType | rawValue | evidence | action | canonical/split |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| 105 | 3878 | value | application | 中空搭接板 | blocks/fileName: `1000mmPC中空搭接板模头` | approve-as-alias | `application=hollow_board` |
| 106 | 3458 | value | application | “应用于软质透明桌布” | fileName | create-value | `application=软质透明桌布` |
| 106 | 4292 | value | application | 流延膜（软质透明桌布） | fileName | split | `application=流延膜`; `application=软质透明桌布` |
| 106 | 4293 | value | lip_adjustment_method | 上模手动推式微调；下模整体结构 | blocks option context | split | `lip_adjustment_method=upper_manual_push_fine_adjustment`; `lip_structure=lower_integral_structure` |
| 106 | 4294 | value | feed_inlet_method | 其他形状或不同位置进料，侧面圆口进料 | blocks qualifier `进料口` | split | `feed_inlet_method=other_feed_shape_or_position`; `feed_inlet_method=center_round_feed`; `feed_inlet_position=侧面` |
| 107 | 2895 | value | plastic_material | 左右的eva | source raw `5%左右的EVA` | approve-as-alias | `plastic_material=EVA` |
| 110 | 3879 | value | lip_adjustment_method | 上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定（90°） | blocks selected option | split | `lip_adjustment_method=force_reduction_push_pull_mechanism`; `lip_adjustment_method=removable_fixed_lip` |
| 117 | 3880 | value | lip_adjustment_method | 全推式弹性微调 | blocks cell `上、下模唇均采用全推式弹性微调` | approve-as-alias | `lip_adjustment_method=manual_push_fine_adjustment` |
| 120 | 477 | value | transmission_system_config | 调速电机 | filename/body transmission config | approve-as-alias | `transmission_system_config=variable_frequency_motor` |
| 147 | 1892 | value | thickness_gauge_operation_mode | 双阀 | fileName/option set: hydraulic station valve, not thickness gauge | move-to-term-type/create-value | `hydraulic_valve_type=double_valve` |
| 150 | 445 | value | wiring_method | 过滤器全封闭接线，并配置安全防护罩壳 | blocks cell B16 | approve-as-alias | `wiring_method=fully_enclosed_guarded_wiring` |
| 150 | 1893 | value | product_material | 过滤器材质 | blocks field name; actual value is H13 material text | reject | extraction error/noise |
| 156 | 1467 | value | plastic_material | ＣPP | source raw full-width CPP | approve-as-alias | `plastic_material=CPP` |
| 163 | 1428 | value | connection_drawing_status | 需方客户提供图纸（4个连接器+4个法兰） | blocks selected option | split | `connection_drawing_status=customer_provided`; `connector_quantity=4`; `flange_quantity=4` |
| 164 | 1487 | value | heating_method | 特殊：用航空插头转接 | blocks selected special option | split | `heating_method=other`; `wiring_method=aviation_plug_adapter` |
| 170 | 449 | value | hydraulic_valve_type | 排气双阀 | fileName/remarks hydraulic station valve | create-value | `hydraulic_valve_type=exhaust_double_valve` |
| 179 | 3881 | value | heating_method | 不锈钢加热棒（内加热...） | blocks selected option | approve-as-alias | `heating_method=heating_rod` |
| 182 | 2883 | value | application | 高分子免漆板材 | blocks B9 `PVC高分子免漆板材` | create-value | `application=高分子免漆板材` |
| 190 | 757 | value | precision_grade | 按光学级别标准 | blocks remark | create-value | `precision_grade=optical_grade` |
| 190 | 3882 | value | feed_inlet_method | 进料口与170019互配使用 | remark compatibility, not feed method | reject | extraction error; keep as note only |
| 192 | 3883 | value | application | 超高分子量锂离子电池隔离膜 | source `PE超高分子量...锂离子电池隔离膜` | split | `application=超高分子`; `application=锂离子电池隔离膜` |
| 195 | 3884 | value | feed_inlet_method | 中央方口进料 (与160969) | blocks/fileName context | split | `feed_inlet_method=center_square_feed`; compatibility note `160969` |
| 199 | 3885 | value | feed_inlet_method | 中央方口进料（与9859互配使用） | blocks/fileName context | split | `feed_inlet_method=center_square_feed`; compatibility note `9859` |

## Refresh-Time Dictionary Hygiene

Before dirty refresh, upsert only existing/obvious aliases to suppress regenerated `unknown_field` noise:

| raw field/unit | target | action |
| --- | --- | --- |
| 出口国家 | `country` | add_termtype_alias |
| 国内使用 | `usage_market` | add_termtype_alias |
| 产品编号 | `product_number` | add_termtype_alias |
| 模头编号 | `product_number` | add_termtype_alias |
| 客户特别备注 | `customer_notes` | add_termtype_alias |
| 型号 | `product_model` | add_termtype_alias if termType exists, otherwise leave pending |
| set | `套` | add_unit_alias if absent |
| piece | `件` | add_unit_alias if absent |

## Manual Correction

Create new `extraction_results`, never update old rows:

- `llmModel = "codex-manual-correction"`
- `promptVersion = "codex-manual-blocks-20260708"` (<= 50 chars)
- `llmPlanJson.businessLlmCalled = false`
- `llmPlanJson.source = "codex_manual_blocks_read"`
- warnings include `basedOnExtractionResultId` and evidence source.

Manual docs: `103,104,107,109,110,111,112,114,116,127,128,129,131,132,133,134,135,138,142,144,145,146,148,149,153,154,158,159,161,162,167,187,190,197`.

Evidence policy:

- blocks_cell wins when正文 has `合同编号/模具编号/客户ID/国家/日期`.
- fileName allowed for merged document-level product/accessory numbers, with source recorded as `fileName`.
- codex_inference only for item identity completion from filename when body lacks identity.
- item quantity normalized to `1/2/null`, not `1套/2套/共（ ）件`.

## Archive Refresh

- Run existing `runDictionaryDirtyRefresh` for dirty/missing archive docs: `103,104,105,107,108,109,110,111,112,114,115,116,117,120,121,123,124,126,128,133,134,138,142,145,146,148,154,155,160,163,166,168,172,175,179,180,182,190,191,195,199,200`.
- Build/refresh archive for itemCount=0 docs after correction/refresh: `115,121,123,126,133,134,142,180`.

## Tables To Write

- `production_config_agent.dictionary_term_type_aliases`
- `production_config_agent.dictionary_unit_aliases`
- `production_config_agent.dictionary_terms`
- `production_config_agent.dictionary_aliases`
- `production_config_agent.dictionary_splits`
- `production_config_agent.dictionary_candidates`
- `production_config_agent.dictionary_candidate_occurrences`
- `production_config_agent.dictionary_versions`
- `production_config_agent.dictionary_change_logs`
- `production_config_agent.extraction_results` for manual correction rows only
- `production_config_agent.documents` for `dictionary_dirty` changes
- `production_config_agent.contract_archives`
- `production_config_agent.contract_archive_items`
- `production_config_agent.contract_archive_item_products`
- `production_config_agent.contract_archive_versions`

Do not write `document_blocks`, `background_jobs`, or `pending_llm_upload`.

## Rollback / Audit

- Snapshot before write: target candidates, occurrences, target term/alias/split rows, term type aliases, unit aliases, documents, latest extraction ids, archives/items/item_products, dictionary version.
- Candidate rollback: restore statuses/review fields and delete aliases/terms/splits created by `codex_doc101_200_governance_20260708`; keep change logs as audit.
- Manual correction rollback: restore archive to previous `extractionResultId` from snapshot and mark new correction rows superseded if needed; no hard delete without explicit request.
- Post-write checks: duplicate archive count, unique index presence, dirty docs, dirty archives, pending candidates, refreshed extractionResultIds, archive item counts, manual correction extractionResultIds, business LLM tokens = 0.
