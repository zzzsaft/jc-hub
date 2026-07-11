# ProductConfigAgent product type v1.1 字典写入

执行日期：2026-07-10。

## 写入范围

- 合并并停用旧 canonical：`风刀`、`换网器支架`、`手动流延模头`、`模头`、`PP医用熔喷模头`、`喷丝板组件`、`传动系统`、`连接器`。
- 保留并统一到：`air_knife`、`filter`、`flat_die`、`spinneret_plate`、`drive_system`、`connector`。
- 创建高证据产品族：`layer_multiplier`，显示名“倍增器”，alias 为“两级倍增器”。
- 经人工确认后创建：`cutting_machine`（切割机）、`vacuum_box`（真空箱）、`defoaming_system`（离心脱泡系统）、`dryer`（吸干机）。
- 停用错误归属 `air_knife` 的 alias：`vacuum box`、`vacuum chamber`、`吸附箱`、`吸风罩`、`真空箱`、`负压箱`；未自动创建 `vacuum_box`。
- 上述真空箱 alias 随后已迁移并重新激活到 `vacuum_box`。
- 标记 409 份后段 unknown 文档为 `dictionaryDirty=true`，但未运行 refresh、normalization、worker 或 LLM。

## 审计与验证

- 字典版本从本次主事务递增至 `1520`，随后 air_knife 描述修正递增至 `1521`，候选确认写入后为 `1522`。
- active `product_type` 为 29 个。
- 写后校验确认：目标 canonical active、旧 source canonical inactive 且名称 alias 已归属目标、6 个错误 alias inactive、后台任务计数为 0。
- 详细 approval、回滚快照、remaining 和验证报告位于 `tmp/product-config-dictionary-v11-apply/`。
