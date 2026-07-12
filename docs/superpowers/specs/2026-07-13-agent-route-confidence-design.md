# Agent 路由双置信度设计

## 目标

所有请求继续先经过 LLM 结构化意图分类，不增加关键词路由。解决单一 `confidence` 同时表示 Agent 归属和 ERP 能力匹配，导致明确 ERP 问题被通用低置信度提示拦截的问题。

## 响应契约

LLM 分类结果新增两个独立字段：

- `agentConfidence`：对 `agentType` 的置信度。
- `capabilityConfidence`：对 `capabilityCode` 的置信度；非 ERP 请求可为空。

暂时兼容旧 LLM 响应中的 `confidence`：缺少新字段时，将旧值用于两个置信度，避免部署切换期间解析失败。审计数据同时保存两个值。

## 决策流程

1. LLM 使用当前问题、最近会话或压缩摘要和已注册能力列表，一次输出结构化分类。
2. `agentConfidence` 低于 Agent 阈值时，返回 Agent 归属澄清，不执行任何工具。
3. 已确定为 ERP Agent，但 `capabilityCode` 缺失、未注册或 `capabilityConfidence` 低于能力阈值时，进入 ERP 能力澄清；提示具体说明能力或业务口径不确定，不再显示“无法判断由哪个 Agent 处理”。
4. 两个置信度均达标后才锁定 `capabilityCode`，随后沿用现有 Query Plan、批准指标组合器、模板覆盖验证、SQL Guard 和权限检查。
5. 不因已有 ERP 会话、页面类型或所谓快路径跳过 LLM 分类。

## 错误与降级

- LLM 请求、JSON 解析或 Schema 校验失败：保留 `route_classifier_unavailable`，不猜测执行。
- Agent 明确但能力不明确：返回 `capability_confidence_below_threshold`，并要求补充指标、维度、时间或业务口径。
- LLM 返回未注册能力：按能力不明确处理，不执行相近能力。
- 用户补充口径后，下一轮携带当前会话上下文重新分类。

## 验证

- 明确 ERP、能力不确定：进入 ERP 定向澄清，不出现 Agent 通用提示。
- Agent 与能力都明确：正常执行并锁定批准能力。
- Agent 归属不确定：继续返回 Agent 澄清。
- 旧 `confidence` 响应：兼容解析且保持原行为。
- 非 ERP 请求：不要求 `capabilityConfidence`。
- 全量测试、Server/Web 构建和同会话网页复测通过。

## 非目标

- 不降低现有安全 Guard 或权限边界。
- 不为具体问句、业务词或 Golden Question 增加路由特判。
- 不在本次重构 ERP Planner 或能力注册表。
