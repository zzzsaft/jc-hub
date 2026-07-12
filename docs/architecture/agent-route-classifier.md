# Agent 统一 LLM 路由分类

Agent Runtime 的 agent/domain 路由只有一个裁决点：`AgentRouteClassifier`。每次请求
都调用分类器，包括显式 Agent 页面、已有 session follow-up 和可缓存的短请求。旧
`router.ts` 仅是异步分类器适配器；ERP domain/handler/service 不再用关键词拒绝或放行。

分类输入包含当前 message、最近对话或压缩 context、显式 UI 的 preferred agent、
可用 Agent 列表，以及 capability registry 的 code/status/module 摘要。严格输出为：

```json
{
  "agentType": "mastraErpSqlAgent|productConfigAgent|quoteAgent|generalAgent",
  "isErpDataQuestion": true,
  "capabilityCode": "sales.open_shipping",
  "confidence": 0.95,
  "needsClarification": false,
  "reasonCode": "erp_open_shipping"
}
```

ERP 分类必须同时给出 `isErpDataQuestion=true` 和 capability code。LLM 不可用、JSON
无效或 schema 不合格时统一返回 `route_classifier_unavailable` clarification，不做
关键词 fallback。显式 UI agent 只是 preference；分类到其他 domain 时 Runtime 返回
切换确认，不执行 UI 指定 handler。路由后原有权限、SQL Guard 和 capability Guard 不变。

缓存 key 由规范化 message、完整 context canonical JSON 的 SHA-256 和 preferred agent
组成，TTL/size 分别由 `AGENT_ROUTE_CACHE_TTL_MS`、`AGENT_ROUTE_CACHE_SIZE` 配置；不同
context 不共享结果。缓存仅减少同输入短 prompt 调用，不提供确定性 fast path。
