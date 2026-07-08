# Document 100-200 Term/TermType Fix Write Plan

Scope: production DB, `document.id = 100-200`; no business LLM, no jobs, no workers.

## Code Changes Already Prepared

- `apps/server/src/modules/productConfigAgent/normalization/index.ts`
  - supports array-shaped `fields` as raw fields.
  - skips `original=true` / `split_original_retained` trace fields from final `fields` and dictionary proposals.
- `apps/server/src/modules/productConfigAgent/normalization/rules/index.ts`
  - splits `电压及加热功率` into `heating_voltage` / `heating_frequency` / phase / `heating_power`.
  - drops raw fields whose field name indicates `未选中`.
  - keeps `适用塑料原料` composite split path.
- `apps/server/src/modules/productConfigAgent/service.ts`
  - dirty refresh prompt version suffix capped at 50 chars.

## Production DB Writes Proposed

Audit source: `tmp/codex-doc100-200-term-audit.json`.

### Tables

- `production_config_agent.dictionary_term_types`
- `production_config_agent.dictionary_term_type_aliases`
- `production_config_agent.dictionary_terms`
- `production_config_agent.dictionary_aliases`
- `production_config_agent.dictionary_versions`
- `production_config_agent.dictionary_change_logs`
- `production_config_agent.extraction_results` via existing `runDictionaryDirtyRefresh`
- `production_config_agent.dictionary_candidates`
- `production_config_agent.dictionary_candidate_occurrences`
- `production_config_agent.documents.dictionary_dirty`
- `production_config_agent.contract_archives`
- `production_config_agent.contract_archive_items`
- `production_config_agent.contract_archive_item_products`
- `production_config_agent.contract_archive_versions`

No writes to `document_blocks`, `background_jobs`, or `pending_llm_upload`.

### TermType Alias Upserts

candidateId: N/A; source = `codex_doc100_200_term_fix_20260708`.

| aliasValue | target termType | action |
| --- | --- | --- |
| 适用塑料原料 | `plastic_material` | add termType alias |
| 应用领域 | `application` | add termType alias |
| 规格型号与原产品互配 | `specification_compatible_with_original` | add termType alias |
| 规格型号与原产品相同 | `specification_identical_to_original` | add termType alias |
| 适用产量 | `capacity` | add termType alias |
| 加热电压 | `heating_voltage` | add termType alias |
| 唇开档 | `lip_gap` | add termType alias |
| 尺寸 | `dimension` | add termType alias |
| 唇调节方式 | `lip_adjustment_method` | add termType alias |
| 转速 | `rotation_speed` | add termType alias |
| 制品有效宽度 | `product_effective_width` | add termType alias |
| 模头加热分区（模体） | `heating_zone_description` | add termType alias; qualifier remains from source text |
| 型号 | `product_model` | add termType alias |
| 规格 | `product_specification` | add termType alias |
| 铰链 | `hinge_config` | add termType alias |
| 紧固件 | `screw_type` | add termType alias |
| fastener_type | `screw_type` | add termType alias for legacy normalized field |

### TermType Create/Update

candidateId: N/A.

| termType | displayName | valueKind | scope | category | action |
| --- | --- | --- | --- | --- | --- |
| `customer_notes` | 客户备注 | text | document_info | document_info | create/update |
| `customer_name` | 客户 | text | document_info | document_info | create/update |
| `product_model` | 型号 | text | item | basic | create/update |
| `hinge_config` | 铰链配置 | text | item | structure | create/update |
| `product_specification` | 规格 | text | item | basic | create/update |
| `reference_die` | 参考模头 | text | item | history | fill description/category |
| `connection_method` | 连接方式 | text | item | structure | fill description/category |
| `lip_tip_angle` | 模唇尖角 | text | item | dimension | fill description/category |
| `filter_material_heat_treatment` | 过滤器材质/热处理 | text | item | material | fill description/category |
| `hydraulic_cylinder_mounting_method` | 油缸安装方式 | text | item | hydraulic | fill description/category |
| `seal_requirement` | 密封要求 | text | item | structure | fill description/category |
| `back_pressure_valve_config` | 可更换倍压阀 | text | item | hydraulic | fill description/category |
| `temperature_hole_config` | 测温孔配置 | text | item | thermal | fill description/category |
| `plug_connection_requirement` | 接插接要求 | text | item | electrical | fill description/category |
| `lower_mold_temperature_hole_distance` | 下模测温点距内表面距离 | text | item | thermal | fill description/category |

### Value Term/Alias Upserts

candidateId: N/A.

| termType | canonicalValue | aliasValue | action |
| --- | --- | --- | --- |
| `screw_type` | `12.9高强度` | `12.9` | ensure active term and add value alias |
| `surface_roughness` | `A级（0.02-0.03μm）` | same | reactivate existing valid term if inactive |

Do not reactivate old `heating_voltage=220/230/240/400/500` or `layer_count=3` terms; those are `number_unit` / `number` and should disappear after normalization refresh.

### Refresh Documents

Run existing `productConfigAgentService.runDictionaryDirtyRefresh` for every document in `100-200`.

Reason: normalization code changed and latest extraction rows can contain legacy field shape/dictionary matches. Refresh creates new `extraction_results` and refreshes archive through existing service.

## Rollback

- Dictionary rows are audited with `dictionary_versions` / `dictionary_change_logs` using `createdBy=codex_doc100_200_term_fix_20260708`.
- Rollback dictionary:
  - deactivate aliases/terms created by this source.
  - restore `dictionary_term_types` and `dictionary_terms` from `beforeJsonb` in change logs.
- Rollback extraction/archive:
  - previous latest extraction ids and archive ids are snapshotted to `tmp/codex-doc100-200-term-fix-before.json`.
  - restore archives to previous extractionResultId or mark refreshed rows superseded only with explicit approval.

## Post-Write Checks

- dirty docs in 100-200 = 0
- dirty archives in 100-200 = 0
- pending candidates in 100-200 = 0
- unknown raw field = 0
- alias conflicts = 0
- missing raw-Chinese termType = 0
- inactive term/termType used = 0
- duplicate archives = 0
- unique index present = true
- business LLM calls/tokens = 0
