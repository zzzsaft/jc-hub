# ERP SQL 复合计划诊断路由覆盖设计

## 背景

启用 `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY=true` 后，五条复合经营问题仍全部在 SQL 生成前返回 `capability_route_mismatch`。现有开关只改变 `finance.composite_decision` 的 capability decision；如果 Router 先锁定为普通能力，工作流会继续服从错误锁定并提前结束，Planner 已识别出的复合计划无法进入后续受控查询链路。

## 目标

在诊断模式下，仅当 Planner 已输出可识别的复合分析计划时，允许该计划覆盖错误的 Router capability：

- `product_sales_inventory_backlog_trend` 继续走现有 `complex.product_sales_inventory_backlog` 三步任务图；
- 其他 `mode=decision_support` 且包含多个不同指标的经营分析计划走 `finance.composite_decision` 诊断通道；
- warnings/trace 保留稳定标记 `diagnostic_composite_capability_bypass`。

该行为只用于暴露下一个真实的数据、指标、维度桥或 SQL 校验缺口，不代表正式发布复合能力。

## 判定与数据流

1. Router、SQL intent 和 Planner 按现有顺序执行。
2. 工作流以 Planner 的结构化 `analysisPlan` 判断是否为复合计划：已识别的任务图场景，或 `mode=decision_support` 且 `metrics + requiredMetrics` 去重后至少两个指标。普通 strict/estimate 多指标计划不因此改道。
3. 仅当环境变量精确为 `true` 且计划为复合计划时，忽略错误的普通 Router capability 锁定。
4. 已识别的库存复合场景直接进入现有任务图；其他复合计划以 `finance.composite_decision` 重新执行现有 capability decision。
5. 后续 Composer、模板选择、SQL Guard、Runtime Guard 和 Executor 保持原样；下游不满足条件时返回其原始失败原因。

## 保持不变的边界

- 未开启诊断开关时完全保持现有 fail-closed 行为。
- 普通单指标问题不能覆盖 Router capability。
- Router 给出未知 capability 时仍拒绝，不以诊断模式放行。
- Planner 明确要求澄清、缺必填槽位时仍澄清。
- 不绕过用户模块权限、Company scope、只读 SELECT、物理 schema、Runtime Guard、TOP、行数、查询数量、超时、并发和审计。
- 不修改 Golden 正式 capability 发布状态或预期结果。

## 测试与验收

采用 TDD：

1. 新增失败测试，证明诊断开关开启时，错误锁定的普通 capability 不再阻挡库存复合任务图。
2. 新增失败测试，证明错误锁定的普通 capability 会被多指标经营计划覆盖为 `finance.composite_decision`，并带诊断 warning。
3. 保留单指标 route mismatch、未知 capability、开关关闭和非精确 `true` 的拒绝测试。
4. 运行 ERP SQL Agent 目标回归和 `build:server`。
5. 使用应用内网页重新提交五条复合问题，记录页面回答、warning、SQL 和结果行；不得把下游失败包装成成功。

## 非目标

- 不无条件关闭所有 `capability_route_mismatch`。
- 不为五条中文问句编写关键词或硬编码路由。
- 不在本次补齐毛利、成本、回款等尚未批准的数据模型。
- 不新增 Agent 角色、RAG 或知识库分析链路。
