# ProductConfigAgent Candidate Top100 Audit

## 范围

- 查询时间：2026-07-08。
- 数据源：远程 `production_config_agent.dictionary_candidates` 和 `dictionary_candidate_occurrences`，只读查询。
- termtype candidate：当前 pending 和历史所有 status 查询均为 0 条。
- value/term candidate：按 occurrence 聚合 top100，原始聚合结果保存在 `docs/operations/product-config-candidate-top100.json`。

## Token 估算

按样本文档 `document_blocks.blocks_json` 估算读取配置表所需 token：

| 样本数 | min | median | avg | max |
| --- | ---: | ---: | ---: | ---: |
| 30 | 3,128 | 10,876 | 12,110 | 26,563 |

估算方法：中文字符按 1 token，英文/数字连续片段按 1 token。用于比较配置表读取成本，不等同于模型 tokenizer 精确计费。

## 高频归因

top100 value candidate occurrence 粗分类：

| 归因 | occurrence | 说明 |
| --- | ---: | --- |
| normalization | 3,687 | 包装文本、空表单、MFI 测试条件、`其他：` 前缀、图纸模板等应在归一化前清理。 |
| dictionary | 3,533 | 真实缺字典值或别名，例如 `电线电缆`、`PVDF`、`PEVA`、`UHMWPE`、部分应用类型。 |
| extraction | 60 | 少量字段语义错位，例如 value-like field name，需要后续抽取提示或人工治理。 |

top termType by occurrence：

| termType | occurrence |
| --- | ---: |
| application | 2,590 |
| plastic_material | 1,136 |
| hydraulic_valve_type | 664 |
| product_material | 519 |
| connection_drawing_status | 405 |
| die_mounting_method | 323 |
| wiring_method | 175 |
| lip_adjustment_method | 148 |
| sensor_source | 132 |
| surface_plating_type | 132 |
| flow_channel_type | 132 |
| extruder_orientation | 130 |
| three_roll_feed_method | 120 |
| pump_heating_method | 117 |
| deckle_type | 88 |

## 已处理的 normalization 问题

- `plastic_material=at`、`10min at 230°C`、MFI 测试条件：过滤，不再入 candidate。
- `应用于“电线电缆”领域`：清理为 `电线电缆` 再做字典匹配。
- `电磁阀液压站`：清理为 `电磁阀` 再做字典匹配。
- `需方客户提供图纸　提供图纸日期...图纸接收人签名...`：清理为 `需方客户提供图纸` 再做字典匹配。
- `国产，按需方提供图纸`：清理为 `国产` 再做字典匹配。
- `45°斜挤出安装（微调朝下）`：清理括号说明后再做字典匹配。
- `其他：不电镀`、`其他：SUS431不锈钢`：去掉 `其他/其它` 前缀后再处理。
- `heating_phase=单`：清理为 `单相` 再做字典匹配。

## 入库验证

- 单测验证 candidate refresh 入库口不会收集 `plastic_material=at` 和 `10min at 230°C`。
- 单测验证 normalization 清理包装文本后能命中已有 alias，不产生新的 candidate。
- 只读 dry-run 对 top20 样本文档重新 normalization，watched 高频旧 candidate 未再生成。

命令：

```bash
node --test --import tsx apps/server/test/productConfigAgent/extractionNormalization.test.ts apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts
npm run build:server
```

## 结论

- 当前可验证的 termtype candidate 列表为空；本轮无法对 top100 termtype 做逐项修复。
- 高频 value candidate 中，normalization 和字典缺值各占主要部分；本轮只把稳定的 normalization 噪声收掉。
- `电线电缆`、`PVDF`、`PEVA`、`UHMWPE`、`文具片` 等真实业务值应走字典治理，不应硬编码进 normalization。
