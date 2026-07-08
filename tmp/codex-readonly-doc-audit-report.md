# ProductConfigAgent 前 5 份非重复文档只读审计

约束执行：只读 dry-run；未调用业务 LLM、DeepSeek、InferAI、XH、OpenAI API；未调用 `requestInferAiChatJson`、`routedChatClient`、`extractDocument`；未创建 `pending_llm_upload` job；未运行 worker；未写生产库。

数据源：`production_config_agent.documents`、`document_blocks`、最新 `extraction_results`、`dictionary_candidates`、`dictionary_candidate_occurrences`、相关字典表。去重沿用现有口径：`document_duplicates` + `file_hash` + blocks 文本 content hash；本次前 5 份未跳过重复件。

Token 估算：按中文/混排文本约 `chars / 1.8` 估算，不是业务 LLM 消耗。

| documentId | blocks 阅读 tokens | 对比材料 tokens | 合计估算 |
| --- | ---: | ---: | ---: |
| 4 | 5,073 | 31,309 | 36,382 |
| 6 | 1,561 | 20,283 | 21,844 |
| 7 | 5,148 | 34,528 | 39,676 |
| 8 | 7,053 | 56,375 | 63,428 |
| 9 | 1,728 | 1,573 | 3,301 |
| 合计 | 20,563 | 144,068 | 164,631 |

## document 4

文件：`生产明细（231411）2023-06-10-1900mmCPE流延膜手动模头.xls`

A. Codex 理解：合同号 `20230530-01`，采购订单 `CG202305000441`，产品/模头编号 `231411`，客户ID `30019`，下单 `2023-06-10`，交货 `2023-07-28`。1 个 item：`模头/flat_die`，CPE 流延缠绕膜，厚度 `0.01-0.1mm`，模头有效宽度 `1900-1500mm`，外堵挂钩式，模唇调节范围 `0.8mm`，上模唇手动推式微调，下模整体结构，无阻流棒，衣架式流道，不锈钢加热棒，模体 9 区，侧板/模唇无加热，`380V/50Hz/三相`，全封闭接线，5m，热电偶孔 9，B(2311A)，镀铬，进料口中央方口且尺寸按客户要求，连接器无，中英文说明书。

B. 对比：document_info 基本正确，但缺客户ID、下单/交货日期。item 抽取覆盖较全。主要问题：`上模唇调节方式/下模唇调节方式` 被 normalized 改成同名 `唇调节方式` 且 termType 未命中，qualifier 丢失；`侧板加热配置/模唇加热配置` 都落到泛化 `heating_config`，部位 qualifier 不稳定；`进料口方式` normalized 字段名变成 `方式`；大量 number/text valueKind 字段产生候选噪声或重复候选。

C/D. candidates：

| candidateId | type | termType | rawValue | current DB result | Codex judgment | recommendedAction | confidence | reason |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 3 | value | deckle_type | 外堵挂钩式 | approved / external_hook_deckle | yes，真实值 | add_term_alias | 0.90 | B13 选中外堵挂钩式 |
| 5 | value | choker_bar_config | 无 | approved | no，boolean 值噪声 | reject_noise | 0.85 | B23 选中无，valueKind 应直接处理 |
| 7 | value | flow_channel_type | 衣架式 | approved / coat_hanger_manifold | yes，真实值 | add_term_alias | 0.90 | B25 选中衣架式 |
| 9 | value | heating_method | 不锈钢加热棒 | approved / heating_rod | yes，真实 alias | add_term_alias | 0.90 | B26 选中 |
| 11 | value | wiring_method | 带护罩全封闭接线 | approved | yes，真实 alias | add_term_alias | 0.90 | B31 选中 |
| 13 | value | power_cable_length | 5m | approved | no，数值单位 | reject_noise | 0.90 | B32 选中 5m |
| 15 | value | body_connector | 方形 | approved | yes，但应保留“芯”语义 | add_term_alias | 0.70 | B33 为方形芯 |
| 17 | value | product_material | B（2311A） | approved / 1.2311_Forged | yes，材料 alias | add_term_alias | 0.90 | B38 选中 |
| 18 | value | surface_plating_type | 镀铬 | approved / chrome_plating | yes，真实 alias | add_term_alias | 0.90 | B42 选中 |
| 20 | value | channel_plating_thickness | 0.02-0.04mm | approved | no，数值范围 | reject_noise | 0.90 | B43 厚度范围 |
| 22 | value | channel_plating_hardness | Rockwellc60-65 | approved | yes，硬度标准值 | create_term | 0.75 | B44 选中 |
| 24 | value | external_plating_thickness | 0.01—0.02mm | approved | no，数值范围 | reject_noise | 0.90 | B45 厚度范围 |
| 26 | value | die_mounting_method | 下挤出 | approved / downward_extrusion | yes，真实 alias | add_term_alias | 0.90 | B46 选中 |
| 28 | value | feed_inlet_method | 中央方口进料**按客户要求的进料口尺寸*** | approved split | yes，但复合值 | split_value | 0.95 | B53 同时含方式和尺寸要求 |
| 29 | term_type | connector_config | 没有 | approved | no，boolean 值噪声 | reject_noise | 0.85 | B56 选中没有 |
| 31 | value/term_type | plastic_material | CPE流延缠绕膜 | approved split | yes，但复合材料+应用 | split_value | 0.90 | B9 CPE + 缠绕膜 |
| 33 | term_type | product_effective_thickness | 0.01-0.1mm | approved | no，数值范围 | reject_noise | 0.90 | B11 厚度 |
| 34 | value | die_effective_width | 1900-1500mm | approved | no，数值范围 | reject_noise | 0.85 | B12 宽度范围 |
| 36 | value | lip_thickness_adjustment_range | 0.8mm | done_36 | no，重复数值候选 | reject_noise | 0.95 | 与 46/45 重复 |
| 38 | value | heating_voltage | 380 V / 50 Hz / 三相 | approved | yes，但复合字段 | split_value | 0.95 | B29 电压/频率/相 |
| 40 | term_type | thermocouple_hole | 9 | approved | no，数量值 | reject_noise | 0.85 | B35 分区 9 |
| 42 | term_type | wear_parts_config | 按公司标准配置... | approved | no，自由文本配置 | reject_noise | 0.70 | 应作为 text 字段，不入 enum 字典 |
| 44 | value/term_type | channel_plating_hardness | Rockwellc60-65 | done_44 | no，重复候选 | reject_noise | 0.95 | merged_to_approved_candidate:22 |
| 45 | value/term_type | lip_thickness_adjustment_range | 0.8mm | done_45 | no，重复/迁移候选 | reject_noise | 0.95 | merged_to_approved_candidate:36 |
| 46 | term_type | lip_thickness_adjustment_range | 0.8mm | approved | no，数值单位 | reject_noise | 0.90 | B14 范围值 |
| 395 | value/term_type | side_plates | 没有 | approved moved | no，应是侧板加热配置 qualifier | move_to_other_termtype | 0.90 | B27 两侧板没有 |
| 396 | value/term_type | heating_voltage | 380 V / 50 Hz / 三相 | done_396 | no，重复复合候选 | reject_noise | 0.90 | 已与 38 合并 |
| 397 | value/term_type | feed_inlet_method | 进料口方式 | rejected | no，字段名当值 | reject_noise | 0.95 | evidence 实际值是中央方口进料 |
| 398 | value/term_type | upper_lip_adjustment_method | 模唇厚度调节范围（0.8mm） | approved moved | no，字段归属错误 | move_to_other_termtype | 0.95 | 应为 lip_thickness_adjustment_range |
| 399 | value/term_type | die_heating_zone_lip | 没有 | approved moved | no，应是模唇加热分区/配置 boolean | move_to_other_termtype | 0.90 | B27 模唇没有 |

## document 6

文件：`配件生产明细表-（2023-380-E）-07-05-JC-90-E计量泵.xlsx`

A. Codex 理解：合同号 `20230630`，产品编号 `2023-380-E`，客户ID `70833`，出口越南，下单 `2023-07-11`，交货 `2023-08-10`。1 个 item：计量泵，型号 `JC-90-E`，数量 `2套`，泵体序列号 `2023080958、2023080959`，PET片材，排量 `600kg以下/每小时`，转速 `10-70` 可调/每小时，配置仅泵体，`220V/50Hz/单相`，泵体加热棒，专用接线盒封闭接线，12.9 高强度，材料标准，无连接器，说明书英文。

B. 对比：document_info 完全漏抽。item 主字段基本抽到。错误点：压力传感器“国产/进口”均未选中，raw extraction 仍输出 selected=false 字段，normalized 虽未建候选但保留噪声字段；排量、转速 split 后同时保留原字段，后续应避免重复候选；`泵体加热方式` 应使用 pump/泵体 qualifier。

C/D. candidates：

| candidateId | type | termType | rawValue | current DB result | Codex judgment | recommendedAction | confidence | reason |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 53 | term_type/value | plastic_material | PET片材 | approved / PET | yes，但“片材”是应用/形态 | split_value | 0.85 | B8 原料 PET片材 |
| 54 | value/term_type | wiring_method | 专用接线盒封闭接线 | approved | yes，真实 alias | add_term_alias | 0.90 | B13 接线方式 |
| 253 | value/term_type | plastic_material | PET片材 | auto_resolved | no，重复候选 | reject_noise | 0.90 | 与 53 重复 |
| 271 | value/term_type | heating_voltage | 220V | approved / 220 | no，数值电压 | reject_noise | 0.85 | B11 电压 |
| 274 | value/term_type | wiring_method | 专用接线盒封闭接线 | auto_resolved | no，重复候选 | reject_noise | 0.90 | 与 54 重复 |
| 276 | value/term_type | metering_pump_options | 泵体 | auto_resolved / pump_body | yes，真实选项 alias | add_term_alias | 0.90 | B10 选中泵体 |
| 306 | value/term_type | plastic_material | PET片材 | done_306 | no，重复候选 | reject_noise | 0.95 | merged duplicate |
| 315 | value/term_type | plastic_material | PET片材 | done_315 | no，重复候选 | reject_noise | 0.95 | merged duplicate |

## document 7

文件：`模头生产明细表（181120-E）2018-8-2-905mmPET片材模头.xls`

A. Codex 理解：合同号 `7180711`，产品编号 `181120-E`，客户ID `40213`，出口俄罗斯，下单 `2018-08-02`，交货 `2018-09-22`。1 个 flat_die：PET片材，产量 `500-600KG/每小时`，制品宽 `400-760mm`，厚 `0.2-1.5mm`，模头宽 `905mm`，外堵式且挂钩外堵单边 180mm，模唇范围 `2.0mm`，上模唇手动推式微调并带不锈钢保护板，下模整体结构，无阻流棒，衣架式，模体 5 区，侧板/模唇有加热，模唇加热棒，`250V/50Hz/单相`，侧板接插件插头，热电偶孔/玻璃测温孔各 5，A(1.2714)，45°斜挤出安装中心距 700mm，进料口中央方口，尺寸需方提供，互配原产品 `161048`。

B. 对比：document_info 抽到产品/合同号，但 order_number 空值不应保留；客户ID和日期漏抽。item 抽取覆盖较全。问题：PET片材和产量未拆好，normalized plastic_material 仍含产量；上/下模唇 qualifier 丢失；`进料口尺寸` normalized 成泛化 `尺寸` 且 termType 未命中；`45°斜挤出安装（中心距700mm）` 应拆安装方式+中心距 qualifier。

C/D. candidates：

| candidateId | type | termType | rawValue | current DB result | Codex judgment | recommendedAction | confidence | reason |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 47 | term_type/value | upper_lip_adjustment_method | 手动推式微调（微调处配不锈钢保护板） | approved | yes，真实上模唇方式 alias | add_term_alias | 0.90 | B18 选中 |
| 49 | term_type/value | product_material | A（1.2714） | approved / 1.2714_Forged | yes，材料 alias | add_term_alias | 0.90 | B39 选中 |
| 270 | value/term_type | flow_channel_type | 衣架式 | done_270 / proposed external_standard_deckle | no，历史错误/重复 | reject_noise | 0.85 | 衣架式是流道，不是 deckle |
| 679 | value/term_type | die_mounting_method | 45°斜挤出安装（中心距700mm） | pending | yes，但复合值 | split_value | 0.95 | B46 安装方式 + 中心距 |

## document 8

文件：`模头生产明细表（181541-E）2018-11-1-1050mmWPC自由发泡板模头和2层AB分配器.xls`

A. Codex 理解：合同号 `7181011`，产品编号 `181541-E`，客户ID `40215`，出口巴基斯坦，下单 `2018-11-01`，交货 `2018-12-11`。至少 3 个 item：1) `1050mm WPC自由发泡板模头/flat_die`，制品宽 920mm、厚 2-25mm、模头宽 1050mm，下模唇 3 套且范围 1-2/2-4/4-7mm，上模唇减力推拉式机械微调，下模唇固定可更换，有 90°阻流棒，衣架式，模体 5 区，侧板/模唇有加热，`230V/50Hz/单相`，3Cr13，平挤出，中央方口进料，尺寸供方设计。2) 2 层 AB 分配器，1 套，WPC，A7%/B93%，加热棒，230V/50Hz，产量 600-800KG/H，特殊 3Cr13。3) 3 层 ABA 分配器，2 套，LDPE/LLDPE，15/70/15%，220V/50Hz，5KW，350KG/H，1.2714钢。

B. 对比：多 item 路由基本正确，是本批最复杂但整体可用。问题：document_info 漏客户ID/日期，order_number 空值不应保留；item1 plastic_material normalized 仍混入“自由发泡板模头/产量”；`90°阻流棒` 被 number_unit 归一化成 `90 ℃`，单位错；上/下模唇 qualifier 丢失；feedblock 的 `产品主体加热方式=加热棒` termType 未命中，应是 heating_method + feedblock/product_body qualifier；`特殊/其他 3Cr13钢材` 应拆 qualifier + 材料标准值。

C/D. candidates：

| candidateId | type | termType | rawValue | current DB result | Codex judgment | recommendedAction | confidence | reason |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 218 | value/term_type | plastic_material | WPC | approved | yes，真实材料 | create_term | 0.90 | B8 / 分配器原料 |
| 219 | value/term_type | upper_lip_adjustment_method | 上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°） | approved | yes，但复合上下模唇描述 | split_value | 0.85 | B17 同时含上/下模唇 |
| 220 | value/term_type | product_material | 3Cr13钢材 | approved / 3Cr13_Forged | yes，材料 alias | add_term_alias | 0.90 | B78 |
| 680 | value/term_type | plastic_material | 自由发泡板模头 | auto_resolved | no，不是材料 | move_to_other_termtype | 0.90 | 应为 application/product description |
| 681 | term_type | plastic_material | （产量600-800KG | auto_resolved | no，产量碎片 | move_to_other_termtype | 0.95 | 应为 capacity |
| 682 | value/term_type | product_material | 其他 3Cr13钢材 | done_682 | no，重复且含 qualifier | use_qualifier | 0.85 | 其他=选择 qualifier，材料=3Cr13 |
| 683 | value/term_type | product_material | 特殊 3Cr13钢材 | pending | yes，但应拆 qualifier | use_qualifier | 0.90 | 分配器产品材质 |
| 2924 | value | application | 自由发泡板模头、产量600800kg、每小时 | done_2924 | no，复合过宽 | split_value | 0.90 | 应拆 application + capacity |
| 3239 | value | application | 自由发泡板 | done_3239 | yes，真实应用 | create_term | 0.80 | WPC 自由发泡板 |
| 3856 | value | application | 自由发泡板 | pending | yes，真实应用但与 3239 重复 | create_term | 0.80 | 若未有标准值，创建；否则合并 |
| 3857 | value | product_material | 其他 3Cr13钢材 | pending | yes，但应拆 qualifier | use_qualifier | 0.90 | item1 材质“其他 3Cr13钢材” |

## document 9

文件：`配件生产明细表：（2018-231-E）2018-05-29-GD-E45计量泵（泵体）.xls`

A. Codex 理解：合同号 `7180518`，配件/产品编号 `2018-231-E`，客户ID `40211`，出口印度，下单 `2018-05-29`，交货 `2018-06-29`。1 个 item：计量泵泵体，型号 `GD-E45`，数量 `壹套`，泵体序列号 `2018060174`，产量 150kg/h，原料 PP，排量 `46.3 cm3/rev`，转速 `10-130` 转/分钟，配置泵体，`220V/50Hz`，功率 `5.5-7.5KW`，加热棒，12.9 高强度，标准材质，热电偶孔按需方定做，压力传感器孔按客户要求但“不配打/配打”未选，连接器没有，说明书中英文。

B. 对比：最终 extraction/normalized 只保留 `数量=壹套`，document_info 为空。漏抽严重：合同号、配件编号、客户、国家、日期、型号、序列号、原料、排量、转速、配置、泵体电压/功率/加热/材料、说明书均漏。现有候选 55/106/107 与当前最新 normalized 不一致，像是历史候选或刷新后残留。

C/D. candidates：

| candidateId | type | termType | rawValue | current DB result | Codex judgment | recommendedAction | confidence | reason |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 55 | term_type/value | connector_heating_method | 不锈钢加热圈 | approved | no，本 item 连接器配置为没有 | normalization_rule_fix | 0.85 | B19 连接器没有，B20 不应参与有效配置 |
| 106 | value/term_type | metering_pump_model | GD-E45 | auto_resolved | yes，真实型号，但最新抽取漏掉 | extraction_prompt_issue | 0.95 | B7 型号 GD-E45 |
| 107 | value/term_type | heating_method | 加热棒 | auto_resolved | yes，真实泵体加热方式，但最新抽取漏掉 | extraction_prompt_issue | 0.90 | B13 选中加热棒 |

## 总体建议

1. 先修 extraction 漏抽：document 9 是首要样本，当前最新结果几乎不可用。
2. 修 normalization：不要把 `上模唇/下模唇/侧板/模唇/泵体/分配器主体` 抹成泛化字段；这些应进入 qualifier。
3. 降噪：number、number_unit、boolean、free text 字段不应持续生成 dictionary candidate，重复/merged 候选应隐藏在审核主列表之外。
4. 复合值规则：塑料材料 + 应用 + 产量、安装方式 + 中心距、电压 + 频率 + 相、材质选择 qualifier + 材料标准值，都应在 normalization 规则层拆分。
