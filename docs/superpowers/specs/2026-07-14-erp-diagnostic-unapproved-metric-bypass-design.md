# ERP SQL 诊断模式未批准指标绕过设计

## 背景

复合计划诊断路由已能让结构化复合问题继续进入现有查询流水线，但 Metric Repository 只读取 `status='approved'` 的指标，`MetricComposerService` 又拒绝 `definition_json.enabled=false`。因此涉及草稿毛利指标的问题会停在 approved metric 阶段，无法继续暴露维度桥、文档预聚合或 SQL Guard 的下一层真实缺口。

本次目标是在现有诊断开关下临时绕过指标审批状态，而不是发布这些指标，也不是允许 LLM 自由生成财务 SQL。

## 方案

继续复用 `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY`，仅当值精确为 `true` 且当前请求已通过复合计划判定时启用未批准指标诊断模式。

- Atomic metric 查询可读取 `approved` 和 `draft` 定义。
- `draft` 或 `definition_json.enabled=false` 仅在该诊断模式下可以进入 Composer。
- 只有数据库中已经存在、`kind='atomic_metric'` 且具备可解析定义的指标可以使用。
- 实际使用未批准或 disabled 指标时，warnings/trace 写入稳定标记 `diagnostic_unapproved_metric_bypass`。
- 结果统一降级为 `estimate`，不得标记为 `exact`。
- 默认关闭；关闭时 Repository 和 Composer 的行为与当前生产逻辑完全一致。

## 仍然保留的结构校验

审批绕过不代表指标定义可信。以下缺口继续 fail-closed：

- 指标在目录中完全不存在；
- `kind` 不是 `atomic_metric`；
- 缺少 `requiredTables`、金额/数值/比例表达式或时间字段；
- 缺少维度表达式、维度 join、共享 grain 或 join keys；
- finance 明细金额存在一对多重复风险但缺少 `documentPreaggregationKeys`；
- 缺少 status field、status predicate 或 SQL 未应用定义中的状态条件；
- schema metadata、Runtime Guard 或访问范围校验失败。

当前 `gross_margin_amount` 与 `gross_margin_rate` 虽有草稿定义，但因 `PartTran → OrderDtl` 文档级预聚合桥仍未审核且缺少安全键，预计会在结构校验阶段继续被阻断。本次不伪造或猜测这些键。

## 数据流

1. Router 和 Planner 仍按现有流程生成结构化复合计划。
2. 复合能力诊断判定通过后，Atomic metric lookup 使用诊断查询模式读取 requested metric codes 对应的 approved/draft 定义。
3. Composer 仅对本次诊断候选跳过 approval status 与 `enabled=false` 阻断，其他结构校验保持不变。
4. SQL 继续经过 finance module 权限、Company scope、SQL Guard、Runtime Guard 和 executor。
5. 若 SQL 执行成功，结果带 `diagnostic_unapproved_metric_bypass` 并标记 `estimate`；若失败，返回下一个真实结构缺口。

## 安全与可观测性

- 不绕过 finance 模块权限；非 finance scope 在 SQL/Composer 前拒绝。
- 不允许任意 LLM SQL 代替缺失 metric definition。
- 不绕过只读 SELECT、Company、物理表/字段、状态 predicate、TOP、行数、查询数量、超时、并发和审计。
- warning 只在实际使用非 approved 或 disabled 定义时出现；全部指标原本 approved/enabled 时不记录该 warning。
- trace/reference 应能区分正式 approved metric 与诊断 metric，避免审计误认为指标已发布。

## 测试与验收

采用 TDD：

1. 默认关闭、`false`、`1`、`TRUE` 时，draft/disabled 指标仍不可见或被拒绝。
2. 精确 `true` 且复合计划成立时，可读取并尝试组合结构完整的 draft/disabled atomic metric。
3. 实际使用未批准定义时输出 `diagnostic_unapproved_metric_bypass`，并将结果降级为 `estimate`。
4. 不存在定义、非 atomic、缺维度桥、缺文档预聚合键和错误状态 predicate 仍被阻断。
5. 普通单指标、strict、未知 capability、clarification 和无 finance 权限请求继续 fail-closed。
6. 运行 ERP SQL Agent 目标回归、server/web build，并重新从网页提交五条问题，记录审批绕过后的下一真实结果或失败。

## 非目标

- 不把 draft/disabled 指标改写为 approved/enabled。
- 不修改数据库业务数据或 Golden 正式预期。
- 不关闭指标结构、SQL、权限或运行时安全校验。
- 不补造 `PartTran → OrderDtl`、回款或其他尚未验证的业务关联。
- 不保证四条财务复合问题在本次变更后立即产生业务答案。
