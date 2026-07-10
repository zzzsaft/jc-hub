# ERP SQL Agent Runtime Guard Contract

ERP SQL Agent 的用户响应通过 Agent Runtime 返回。所有 approved template、approved metric composer、rule generator 和 LLM fallback 候选在返回或执行前都必须经过生产 `SqlRuntimeGuardService`。

## Result semantics

响应可包含 `semanticStatus`：

- `exact`：候选来源覆盖问题或 `analysisPlan` 要求的 family/metric，且最终 SQL 通过当前 schema guard。这里的 exact 表示 runtime 语义和 schema 精确匹配；财务结论是否可作正式口径仍取决于 approved metric/template 证据。
- `estimate`：候选 family/metric 与问题语义匹配，最终 SQL 也通过当前 schema guard，但 approved 指标覆盖、拼接证据或置信度不足。响应必须包含“可能不准、仅供参考、可补充口径”的免责声明；不得用于财务报表、对账、审计、付款或结算。
- `semantic_mismatch`：候选 family/metric 与问题或 `analysisPlan` 不一致。响应固定 `success=false`、`sql=""`，查询 executor 不得被调用。

`semanticStatus=estimate` 不能覆盖 semantic mismatch。低置信度只允许降低“匹配语义的结果”，不能把库存问题命中的销售模板、成本问题命中的发货 family 等错误来源包装成估算结果。

## Guard and rollback behavior

Runtime guard 按以下顺序处理候选：

1. 对模板参数做类型校验和 SQL literal 转义；应用授权 Company/模块作用域。
2. 对最终渲染 SQL 使用当前 schema metadata 做完整 `SqlGuardService` 校验。历史 `guard_passed` 只作为模板审批前置条件，不能替代本次校验；dry-run 同样执行校验。
3. 根据问题、`QueryPlan`、`analysisPlan.requiredMetrics/metrics` 和候选 references 校验 expected/actual family 与 metric。
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

客户端只在 `success=true` 且 `sql` 非空时展示可复制 SQL。`estimate` 必须同时展示 disclaimer；`semantic_mismatch` 和 schema guard 失败应展示软兜底文案，提示结果可能不准并允许用户补充业务口径，不应只显示“无法处理”。
