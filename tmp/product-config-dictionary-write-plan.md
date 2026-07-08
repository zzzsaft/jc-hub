# 前 5 份候选字典入库预案

状态：预案，不执行写库。必须在用户明确“允许写库”后才可执行。

## 将写入/更新的表

- `dictionary_candidates`: review 状态、reviewed_by、reviewed_at、proposed_canonical_value。
- `dictionary_terms`: create_value 时新增标准值。
- `dictionary_aliases`: approve_as_alias 时新增/更新 alias。
- `dictionary_splits`: split 动作记录拆分方案。
- `dictionary_versions`: governance service bump 版本审计。
- `documents.dictionary_dirty`: governance service 标记受影响文档。

不写：`extraction_results`、`document_blocks`、`background_jobs`、archive 表。

## 候选动作

| candidateId | action | targetTable | termType | rawValue | payload |
| ---: | --- | --- | --- | --- | --- |
| 3 | approve_as_alias | dictionary_aliases | deckle_type | 外堵挂钩式 | external_hook_deckle |
| 7 | approve_as_alias | dictionary_aliases | flow_channel_type | 衣架式 | coat_hanger_manifold |
| 9 | approve_as_alias | dictionary_aliases | heating_method | 不锈钢加热棒 | heating_rod |
| 11 | approve_as_alias | dictionary_aliases | wiring_method | 带护罩全封闭接线 | fully_enclosed_guarded_wiring |
| 17 | approve_as_alias | dictionary_aliases | product_material | B（2311A） | 1.2311_Forged |
| 28 | split | dictionary_splits | feed_inlet_method | 中央方口进料**按客户要求的进料口尺寸*** | feed_inlet_method=中央方口进料; feed_inlet_size=按客户要求 |
| 47 | approve_as_alias | dictionary_aliases | upper_lip_adjustment_method | 手动推式微调（微调处配不锈钢保护板） | upper_manual_push_fine_adjustment_with_protection |
| 49 | approve_as_alias | dictionary_aliases | product_material | A（1.2714） | 1.2714_Forged |
| 679 | split | dictionary_splits | die_mounting_method | 45°斜挤出安装（中心距700mm） | die_mounting_method=45°斜挤出安装; mounting_center_distance=700mm |
| 218 | create_value | dictionary_terms | plastic_material | WPC | WPC |
| 219 | split | dictionary_splits | upper_lip_adjustment_method | 上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°） | upper_lip_adjustment_method=减力推拉式机械微调; lower_lip_adjustment_method=可更换或固定 |
| 220 | approve_as_alias | dictionary_aliases | product_material | 3Cr13钢材 | 3Cr13_Forged |
| 683 | split | dictionary_splits | product_material | 特殊 3Cr13钢材 | qualifier=特殊; product_material=3Cr13钢材 |
| 3856 | create_value | dictionary_terms | application | 自由发泡板 | 自由发泡板 |
| 3857 | split | dictionary_splits | product_material | 其他 3Cr13钢材 | qualifier=其他; product_material=3Cr13钢材 |
| 106 | approve_as_alias | dictionary_aliases | metering_pump_model | GD-E45 | GD-E45 |
| 107 | approve_as_alias | dictionary_aliases | heating_method | 加热棒 | heating_rod |
| 5 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 13 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 20 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 24 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 29 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 33 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 34 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 36 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 40 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 42 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 44 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 45 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 46 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 253 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 270 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 271 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 274 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 306 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 315 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 397 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |
| 396 | reject | dictionary_candidates | - | - | noise/duplicate/non-enum value |

## 回滚/审计

1. 写库前导出目标 candidate、term、alias、split、当前 dictionary version 快照。
2. 回滚 candidate：按快照恢复 status/proposed/reviewed 字段。
3. 回滚新增 term/alias/split：删除本次 `reviewedBy/source=candidate_review_codex_doc4_9` 或 metadata.candidateId 命中的新增行。
4. `dictionary_versions` 作为审计流水保留，不硬删。

## 明确不处理

- document 9 的漏抽不更新 `extraction_results`；只把已有真实候选 106/107 纳入字典预案。