# ProductConfigAgent Golden Set v1

## 目标与边界

阶段 3.1 在阶段 2.1 封存输入上建立可审计的人工真值工作流和质量评测基线，不修改阶段 2.1 规则，也不把现有预测复制成 gold。

固定版本：

- 报价产品包规则：`product-package-discovery-v3.0`
- ERP 身份总账：`erp-identity-ledger-v1.1`
- product type dictionary：`1522`
- Golden Set：`product-config-golden-set-v1`
- annotation schema：`product-config-golden-annotation-v1`

产品包仍表示“报价产品包 + 平级产品”，不要求唯一主产品。`product_family`、`product_subtype`、`item_role`、`model` 和 ERP `Company + PartNum` 是不同标注层；阶段 2.1 的 `item_role_compatibility` 只保留为来源字段，不冒充新的人工角色真值。

本流程只读生产 ProductConfigAgent 和 ERP 数据。禁止数据库/ERP写入、字典修改、normalization、refresh、job、worker、归档写回和业务 LLM 调用。

## 固定输入与抽样

输入目录：

- `tmp/product-config-new-product-type-review-400-v2/`
- `tmp/product-config-erp-identity-ledger-400-v1/`

生成器首先校验 400 个唯一 document、648 个 product/ledger row、无 plan 280、no-product-evidence 18，以及 ERP matched/ambiguous/unresolved `99/415/134`。阶段 2.1 TSV/JSON 的 SHA-256 必须与 ledger input snapshot 一致。

Golden Set v1 分两个独立层：

- product-package：160 份 document；包含完整预测 item 集合及空白 package gold。
- ERP identity：240 条 ledger row；matched/ambiguous/unresolved 各 80 条，包含 top-3 候选、ERP 产品编号/名称和证据字段。

package 层强制纳入全部 18 份 no-product-evidence 文档，以及 GD-E70、实际 ERP `0918`、`091001`、`P504` 高风险模式、held component、长短源文本异常和附件/备件/组件信号。其余样本按 plan、阶段 2.1 sample class、package item 数量、身份状态和固定 seed 轮转补齐。

源文本长度在固定 400 份 blocks 上计算：p10 `3082`、p90 `14683`。`short_outlier_p10` 和 `long_outlier_p90` 是真实 blocks 长度分层。模板没有可信的显式 revision 字段，因此 `planned_template_proxy` / `unplanned_legacy_template_proxy` 仅是 plan 状态代理；报告不得把它表述为已确认的新旧 Excel 模板版本。业务日期另分 `legacy_pre_2023`、`current_2023_plus` 和 `undated_import_proxy`。

## 产物

默认输出到 `tmp/product-config-golden-set-v1/`：

- `baseline-manifest.json`：规则/字典/schema版本、输入 hash、固定 sample ID、抽样 seed、长度阈值和评测阈值。
- `source-metadata.json`：400 份脱敏 blocks 结构元数据和选中 ERP 候选名称快照；不含完整 blocks、文件名、客户、联系人、地址、金额或价格。
- `annotation-schema.json`：JSON Schema 2020-12 标注契约。
- `product-package-annotation-packets.json`：package 预测与空白 gold。
- `erp-identity-annotation-packets.json`：ERP identity 预测与空白 gold。
- `sample-index.tsv`：每条样本的来源、分层和选择原因。
- `validation-report.json`：守恒、唯一性、schema/语义和源元数据覆盖报告。
- `baseline-evaluation.json`：当前预测分布以及等待人工真值的空质量指标。
- `artifact-seal.json`：上述不可变文件的 SHA-256 和字节数。
- `report.md`：当前生成/待标注/后续回填摘要。

sealed packet 不应原地编辑。标注员从 sealed packet 各复制一份工作文件，人工 gold 和 ERP 身份提升线程的新版 prediction 都不能改写 v1 seal。

## 人工标注与 adjudication

每个层次由两名标注员独立处理：

1. 复制 sealed packet，标注员 A 只填写 `annotations.annotator_a`，标注员 B 只填写 `annotations.annotator_b`。
2. 每个产品边界必须给出稳定 `gold_item_id`；若对应现有预测，填写 `matched_prediction_item_id`，新增/漏召回 item 保持为 `null`。
3. package item 分别填写名称、family、subtype、role、model、`peer_group_id`、可选父关联和证据引用。平级关系通过相同 `peer_group_id` 表示。
4. ERP 唯一身份必须同时填写 Company、PartNum、ERP product name 和证据引用。Company 不能省略。
5. 复核人比较 A/B 分歧，记录 `annotations.adjudication`；只有达成结论后才设置 `annotation_status=adjudicated` 并写入 `gold`。
6. evaluator 只消费 adjudicated gold。reviewed 或单标注结果不进入正式指标。

允许的 package 结论：

- `sufficient`：证据足以确定一个 item 集合。
- `insufficient_evidence`：正确答案是当前证据不足；可以是空 item 集合。
- `legitimate_ambiguity`：存在多个同样合理的 item 边界，当前不强行确定一个集合。
- `abstain`：标注员/复核人无法安全裁决。

允许的 ERP 结论：

- `unique_match`：唯一 `Company + PartNum`。
- `legitimate_ambiguity`：至少两个均合理的完整身份。
- `insufficient_evidence`：候选存在或不存在，但证据不足以关联。
- `abstain`：当前无法安全裁决。

`legitimate_ambiguity`、`insufficient_evidence` 和 `abstain` 都是合法正确答案，不能为了 coverage 强制改成 `unique_match`。

## 运行

首次生成需要只读 ProductConfigAgent 与 ERP 查询：

```bash
CODEX_SANDBOX_NETWORK_DISABLED=0 \
DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
npm run product-config-agent:golden-set-v1
```

如果远端 PostgreSQL 网络不可达，脚本仅在当前进程内把同一 `DATABASE_URL` 的 hostname 回退为 `10.0.0.4` 再做一次只读查询；不修改 `.env`。已有 `source-metadata.json` 时重跑直接复用 sealed snapshot，不再访问生产数据。

校验一组完整标注文件：

```bash
npm run product-config-agent:golden-set-v1 -- \
  --validate \
  --package-file=/path/to/product-package-adjudicated.json \
  --erp-file=/path/to/erp-identity-adjudicated.json
```

执行评测：

```bash
npm run product-config-agent:golden-set-evaluate -- \
  --package-file=/path/to/product-package-adjudicated.json \
  --erp-file=/path/to/erp-identity-adjudicated.json \
  --manifest=tmp/product-config-golden-set-v1/baseline-manifest.json \
  --evaluation-out=tmp/product-config-golden-set-v1/evaluation.json
```

生成器拒绝 `--apply`；发现已有 packet 含任何人工 annotation/gold 时也拒绝覆盖。

## 指标定义

### Stage 3.2 自动评测与 sealed 基线保护

`--validate` 和 `--evaluate` 都会先验证 `artifact-seal.json` 中每个 sealed artifact 的字节数和 SHA-256，再把待评测的独立 packet 按 `sample_id` 与 sealed packet 比较。样本集合、`sample_id`、`layer`、`source`、`strata`、`selection_reasons` 和 `prediction` 均不可变化；仅允许 `annotation_status`、`annotations` 和 `gold` 变化。任何增删、重复 ID、prediction 改写或 sealed artifact hash 漂移都会以 `Baseline drift` 明确拒绝。

标注 packet 在运行时用 layer-specific schema 校验，不仅输出 JSON Schema 文件。未知 annotation 状态、confidence 不在 `[0,1]`、跨层 gold、缺失必填字段、重复 item/identity ID、无效 Company + PartNum 或缺失 evidence reference 都会被拒绝。评测 JSON 只包含 sample_id、字段和错误类型的错误明细/混淆统计，不输出客户、联系人、电话、地址、价格或文件名。

package 指标还包括 item name exact/normalized accuracy、model accuracy/coverage、peer relation accuracy。package exact match 同时比较边界、name、family、subtype、role、model 与 peer relation；gold 为 `null` 的可选字段不进入该字段比较，明确标注的非空值必须一致。subtype/item-role macro-F1 的每个有 support 类别都进入平均，零命中类别 F1 为 0。

`item_name_exact_accuracy` 使用原始字符串严格比较，`item_name_normalized_accuracy` 才使用 NFKC/trim/lowercase。`abstain` 不作为 evidence sufficiency 或 ERP abstention correctness 的正确样本，也不进入这两个指标分母；报告分别给出 `excluded_abstain`。`legitimate_ambiguity` 与 `insufficient_evidence` 仍按其各自定义参与 ERP abstention correctness。未来 baseline 的 package prediction 可使用完整 item role 枚举及非空 subtype；v1 sealed prediction 仍由基线漂移检查保护。

threshold 输出按层分别报告 `insufficient_adjudicated_annotations`、`passed` 或 `failed`，总状态严格区分无 eligible layer、仅 package 达门槛、仅 ERP 达门槛、两层通过与失败。它不会把尚未达到最小人工 gold 数的另一层报告为通过。

没有 adjudicated gold 时，precision、recall、F1、accuracy、false-match 和 abstention correctness 全部为 `null`。`99/415/134` 和 full-input coverage `99/648` 只是阶段 2.1 预测分布。

package 指标：

- item boundary precision/recall/F1：由人工 `matched_prediction_item_id` 计算 TP/FP/FN。
- product family accuracy：仅对已匹配且 gold family 非空的 item。
- subtype 与 item role：accuracy、macro-F1 和 per-class support；空 gold 标签不进入该字段分母。
- package exact match：item 边界完全一致、所有已标注 family/subtype/role 一致、peer group 关系一致。
- evidence sufficiency accuracy：系统 sufficient/insufficient 与人工结论的一致率。

ERP 指标：

- top-1 precision：预测 `matched` 中，gold 为 `unique_match` 且 top-1 Company + PartNum 正确的比例。
- top-3 recall：gold `unique_match` 在前三候选中出现的比例。
- coverage：adjudicated ERP 样本中系统自动 `matched` 的比例。
- false auto-match rate：自动 `matched` 中非唯一正确身份的比例。
- abstention correctness：gold 不是 `unique_match` 时，系统没有自动 matched 的比例。

所有指标按 risk pattern、template proxy 和 plan status 分层报告。阈值只在 package 至少 120 份、ERP 至少 180 条 adjudicated gold 后启用；不足时状态为 `insufficient_adjudicated_annotations`。

## ERP 身份提升线程

ERP 身份提升线程后续可以用相同 sample ID 输出新的 prediction baseline，再与同一 adjudicated gold 比较。它不得修改本任务的阶段 2.1 ledger、匹配逻辑、sealed v1 packet 或人工 gold。若候选集合、规则或输入 hash 变化，应建立新 baseline manifest，而不是覆盖 v1。
