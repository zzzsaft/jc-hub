# ERP SQL 复合经营查询诊断绕过设计

## 背景

前端验收的五条复合经营问题中，四条在 `finance.composite_decision` 能力路由阶段以 `missing_dimension_bridge` 拒答；已支持的销售增长、库存、未交付问题进入任务图后，又因 SQL Guard 将 `earliest_amount`、`latest_amount` 计算列别名误判为 ERP 物理字段而失败。

本次目标不是取消 ERP 查询治理，而是提供默认关闭、显式启用的诊断通道，使未发布的复合能力可以继续暴露下一层真实缺口，并修复计算列别名的误判。

## 方案

### 1. 临时能力绕过开关

新增服务端环境变量 `ERP_SQL_DIAGNOSTIC_BYPASS_COMPOSITE_CAPABILITY`，仅当值为 `true` 时生效。

- 仅针对路由锁定为 `finance.composite_decision` 且原因为能力尚未发布的请求。
- 跳过该能力的 `unsupported` 发布状态，让请求继续进入已有 Planner、Composer、Runtime Guard 和 Executor。
- 不承诺请求一定执行成功；缺失指标、维度桥、语义覆盖或 SQL 校验应继续以真实原因失败。
- 默认关闭；关闭时行为与当前生产逻辑完全一致。
- 不修改黄金问题集的正式 `expectedOutcome`，诊断绕过不代表能力已发布。

### 2. 计算列别名识别

SQL Guard 校验字段时，应将当前查询层可见的派生列识别为 `derived`，不向 ERP schema metadata 查询这些名字。物理表字段仍按当前逻辑逐项验证。

首个回归场景覆盖销售增长 SQL 中的：

- `earliest_amount`
- `latest_amount`
- `sales_growth_rate`

修复应作用于通用 SQL 解析/字段血缘位置，不为这三个名字建立硬编码白名单。

### 3. 始终保留的限制

诊断模式不得绕过：

- ERP 模块和用户权限检查；
- Company 范围隔离；
- 只允许只读 `SELECT`；
- 物理表与物理字段 schema 校验；
- SQL Runtime Guard 和语义校验；
- `TOP`、最大行数、超时、并发和查询数量限制；
- 审计、trace 和工具调用记录。

## 数据流

1. 前端按现有方式提交问题。
2. Router 仍选择 `finance.composite_decision`。
3. 开关关闭时，保持现有 `unsupported/clarify` 响应。
4. 开关开启时，仅忽略该能力的未发布状态，后续 Planner 和所有安全校验照常运行。
5. 销售增长任务生成子查询计算列后，SQL Guard 识别其派生来源，只校验底层 ERP 物理字段。
6. 查询成功则继续库存和未交付步骤；失败则返回实际失败层和原因。

## 错误处理与可观测性

- 诊断绕过生效时向 warnings/trace 添加稳定标记 `diagnostic_composite_capability_bypass`。
- 任何后续失败保持原 reason code，不包装成成功或精确答案。
- 开关值缺失或不是 `true` 时视为关闭。
- 不自动清理或修改既有失败会话与运行记录。

## 测试与验收

### 自动化测试

1. 开关关闭：`finance.composite_decision` 仍按当前逻辑拒答。
2. 开关开启：同一请求不再以 `capability_route_mismatch` 或能力未发布状态提前结束，并包含诊断 warning。
3. 销售增长 SQL：`earliest_amount`、`latest_amount` 不再触发物理字段不存在错误。
4. 真实不存在的 ERP 字段仍被 SQL Guard 拒绝。
5. 既有 ERP SQL Agent 回归测试全部通过。

### 前端验收

使用开关启动功能分支后端，重新执行五条复合经营问题：

- 第三条应完成销售、库存、未交付任务图，或暴露别名修复后的下一层真实失败。
- 其余四条不得再因能力发布状态提前拒答；若指标或维度桥仍不完整，应显示对应真实失败原因。

## 非目标

- 不发布 `finance.composite_decision` 为正式可执行能力。
- 不补齐销售、成本、毛利、回款的跨域指标模型。
- 不关闭 SQL Guard、权限、Company 隔离或运行时限制。
- 不将诊断模式生成的结果自动标记为 `exact`。
