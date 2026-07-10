# ERP Data Gateway API v1

ERP Data Gateway 是客服、知识库、销售、财务、生产、库存、采购等业务 Agent 访问 ERP SQL 能力的公共边界。业务 Agent 只能调用这个边界或 `agentRuntime` 封装后的同等能力，不得直接调用任意 SQL generator、repository 或 executor。

## Request

```json
{
  "actor": "identity-user-id",
  "purpose": "business_question",
  "scope": {
    "companies": ["JCC"],
    "modules": ["inventory"],
    "departments": ["D01"],
    "businessUnits": ["BU01"],
    "customerNumbers": ["10001"]
  },
  "mode": "exact",
  "execution": "agent",
  "question": "查询物料 A123 的现存量",
  "maxRows": 100,
  "deadlineMs": 30000,
  "cursor": null
}
```

字段要求：

| 字段 | 说明 |
| --- | --- |
| `actor` | 服务端 identity 用户，不能来自 prompt 或客户端 context 扩权。 |
| `purpose` | 查询用途，进入审计和预算。 |
| `scope` | Company、模块、部门、事业部、客户范围；未知或不可注入时 fail closed。 |
| `mode` | `exact`、`estimate`、`dry_run`。财务 strict 只有 approved metric/template 才能 `exact`。 |
| `execution` | `template`、`metric`、`agent`，由服务端按授权收敛，不允许任意 SQL。 |
| `maxRows` | 默认和上限由服务端配置；禁止默认全量导出。 |
| `deadlineMs` | 贯穿 runtime、LLM、guard、executor。 |
| `cursor` | 下一页游标，必须签名并绑定 actor/scope/snapshot/sort。 |

## Response

```json
{
  "status": "success",
  "semanticStatus": "exact",
  "confidence": 0.98,
  "evidence": ["template:family_050", "schemaSnapshot:erp-20260710-001"],
  "warnings": [],
  "traceId": "uuid",
  "dataAsOf": "2026-07-10T09:00:00.000Z",
  "schemaAsOf": "erp-20260710-001",
  "metricVersion": "inventory_on_hand_qty@2026-07-10.assets.v1",
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "signed-cursor",
    "sort": ["PartNum ASC", "WarehouseCode ASC", "id ASC"],
    "snapshotId": "erp-20260710-001",
    "cursorSignature": "hmac-sha256"
  },
  "rows": []
}
```

`status` 稳定枚举：`success`、`no_result`、`blocked`、`failed`、`cancelled`、`overloaded`。

`semanticStatus` 稳定枚举：`exact`、`estimate`、`semantic_mismatch`。`estimate` 必须返回“此数据不准确，仅供参考”，不得用于财务报表、对账、审计、付款或结算。`semantic_mismatch` 和 schema guard 失败时，用户响应里的 SQL 必须为空。

SQL 只允许调试权限可见；普通业务响应不返回可复制 SQL。内部审计保存 rendered/final SQL hash、受控原文策略和脱敏绑定参数。

业务 Agent 不传入最终授权范围。Gateway 或 `agentRuntime` 必须先按服务端 identity 解析 `erp_agent.erp_sql_access_policies`，再把归一化 scope 传给 ERP SQL 执行链；客户端、prompt、LLM 输出和业务 Agent 参数只能缩小查询条件，不能扩大 Company/module/row/sensitive 范围。生产环境 env policy fallback 只有 `ERP_SQL_ACCESS_POLICY_FALLBACK_MODE=emergency` 时可用，并应进入 trace/audit reason。

## 分页

列表接口必须返回 `pageInfo`，不能只有 `maxRows/truncated`。

- 稳定排序必须包含业务排序字段和最终唯一键。
- `endCursor` 使用 HMAC-SHA256 签名，绑定 `actor`、`purpose`、`scope`、`snapshotId`、`sort`、最后一行 key 和过期时间。
- 下一页必须重新校验 actor 权限和同一数据快照语义；scope 变更或 snapshot 过期时拒绝继续翻页。
- 默认不提供全量导出；导出必须走单独审批、预算和审计。

## 数据新鲜度

响应必须包含：

- `dataAsOf`：来自真实执行、源系统元数据或刷新注册表；不能用当前时间伪造。
- `schemaAsOf`：schema snapshot id。
- `metricVersion`：执行 metric/template 的版本；无 metric 时可为空但必须在 evidence 说明。
- 必要时返回 `sourceAsOf` / `refreshStatus`。

`exact`、`estimate`、`no_result` 都遵守同一字段契约。schema snapshot 过期、未知字段或覆盖率不足按生产策略 fail closed。

## 公共资产边界

公共资产统一登记在 `erp_agent.erp_sql_governed_assets`：

- `approval_status=approved` 才能作为 exact 生产依据。
- `draft` 只能用于只读验证、评审和 estimate 证据。
- `blocked` 不得执行，只能返回阻断原因和验收条件。

Schema snapshot 登记在 `erp_agent.erp_schema_snapshots`。成本价格登记在 `erp_agent.erp_llm_cost_price_versions`，价格必须配置化、版本化，并注明币种和生效日期。
