# ERP SQL Agent Runtime Guard Contract

ERP SQL Agent 的用户响应通过 Agent Runtime 返回。所有 approved template、approved metric composer、rule generator 和 LLM fallback 候选在返回或执行前都必须经过生产 `SqlRuntimeGuardService`。

## Result semantics

响应可包含 `semanticStatus`：

- `exact`：候选来源覆盖问题或 `analysisPlan` 要求的 family/metric，且最终 SQL 通过当前 schema guard。这里的 exact 表示 runtime 语义和 schema 精确匹配；财务结论是否可作正式口径仍取决于 approved metric/template 证据。
- `estimate`：候选 family/metric 与问题语义匹配，最终 SQL 也通过当前 schema guard，但 approved 指标覆盖、拼接证据或置信度不足。响应必须包含“可能不准、仅供参考、可补充口径”的免责声明；不得用于财务报表、对账、审计、付款或结算。
- `semantic_mismatch`：候选 family/metric 与问题或 `analysisPlan` 不一致。响应固定 `success=false`、`sql=""`，查询 executor 不得被调用。

`semanticStatus=estimate` 不能覆盖 semantic mismatch。低置信度只允许降低“匹配语义的结果”，不能把库存问题命中的销售模板、成本问题命中的发货 family 等错误来源包装成估算结果。

开发环境例外：`NODE_ENV !== "production"` 且服务端授权 scope 标记为 `devFullAccess` 时，semantic mismatch 不再清空结构合法的 SQL，而是降级为 `estimate` 并追加 `DEV_SEMANTIC_MISMATCH_EXECUTED` warning。该例外只用于调试链路和人工核对，不适用于生产、财务正式口径或自动化结论。

## Guard and rollback behavior

Runtime guard 按以下顺序处理候选：

1. 对模板参数做类型校验和 SQL literal 转义；应用授权 Company/模块作用域。
2. 对最终渲染 SQL 使用当前 schema metadata 做完整 `SqlGuardService` 校验。历史 `guard_passed` 只作为模板审批前置条件，不能替代本次校验；dry-run 同样执行校验。
3. 根据问题、`QueryPlan`、`analysisPlan.requiredMetrics/metrics` 和候选 references 校验 expected/actual family 与 metric。retrieval dataset/family reference 只能作为 expected/context evidence；LLM/rule 的 actual family 必须来自最终 SQL 的真实表/字段/聚合/过滤或 approved metric，template actual family 只能来自当前 approved template 身份。
4. 两类校验都通过后才允许 executor 调用。

任一 schema guard 无效、LLM schema repair 后仍无效或 semantic mismatch 时，runtime 回滚为无可执行 SQL：

```json
{
  "success": false,
  "sql": "",
  "semanticStatus": "semantic_mismatch",
  "rows": [],
  "rowCount": 0,
  "error": "semantic_mismatch: ..."
}
```

schema guard 失败时 `semanticStatus` 可保留已判定的 `exact`/`estimate`，但同样必须 `sql=""`、executor 调用为 0。内部 trace 可保存受保护的 candidate SQL/hash、expected/actual family、expected/actual metric 和 guard errors；这些内部字段不得回传为用户可复制 SQL。

## Client behavior

## Runtime stream

`POST /agentRuntime/run/stream` 使用与 `POST /agentRuntime/run` 相同的认证和请求 body，响应为 SSE。事件依次为：

- `run-start`：`session`、`run`；
- `tool-start`：`runId`、`stepId`、`toolName`；
- `tool-finish`：上述标识、`status` 和 `durationMs`；
- `complete`：与原同步接口相同的 Agent Runtime 结果；
- `error`：不可恢复错误的安全错误文案。

实时工具事件不携带工具参数、SQL、查询行或内部错误细节；这些数据仍只通过最终权限保护后的结果返回。

客户端只在 `success=true` 且 `sql` 非空时展示可复制 SQL。`estimate` 必须同时展示 disclaimer；`semantic_mismatch` 和 schema guard 失败应展示软兜底文案，提示结果可能不准并允许用户补充业务口径，不应只显示“无法处理”。

Approved template 对外返回的 `sql` 必须是本次渲染、应用 scope、并通过 runtime guard 的最终 SQL；guard 失败、schema/repair failure、semantic mismatch、超时或过载均返回 `sql=""`。内部 candidate SQL 仅允许以 hash/受保护摘要进入 trace。
