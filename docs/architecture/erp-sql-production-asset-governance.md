# ERP SQL 生产资产治理模型

ERP SQL Agent 的模板、指标、schema snapshot、API 契约、安全策略、成本价格统一使用 governed asset 模型，避免每类资产各自发明 `version/status/owner/approval` 字段。

## 核心字段

| 字段 | 说明 |
| --- | --- |
| `asset_key` | 稳定唯一键，例如 `finance.metric_catalog_scope`。 |
| `asset_type` | `template_family`、`metric`、`schema_snapshot`、`api_contract`、`policy`、`cost_price`。 |
| `version` | 资产定义版本；成本价格版本必须包含币种和生效日期。 |
| `status` | 执行状态：`approved`、`draft`、`blocked` 等。 |
| `owner_role` | 审批负责人类型，不写具体个人隐私。 |
| `approval_status` | 审批状态；只有 `approved` 可作为 exact 生产依据。 |
| `use_level` | `production_exact`、`decision_support`、`validation_only`、`blocked`。 |
| `effective_from/to` | 生效期。 |
| `definition_json` | 口径、字段、策略、阻断原因。 |
| `evidence_json` | 代码、文档、只读验证、golden 或对账证据引用。 |

## 执行规则

- `approval_status=approved` 且 `use_level=production_exact`：可作为 exact SQL 依据，仍需 runtime schema guard、semantic guard、access policy 和审计。
- `draft`：只能用于只读验证、评审、estimate 证据或阻断解释，不得宣称精确。
- `blocked`：不得执行；响应只能给出阻断原因、负责人类型、输入材料和验收条件。

## 与 P0 保护层的关系

该模型只登记资产事实，不替代 P0 线程的 runtime guard、权限范围、审计、容量和配置保护。执行链继续以现有 `SqlRuntimeGuardService`、`ErpSqlAccessPolicyService`、`SqlTraceService` 和查询容量池为准。

Schema snapshot、分页、新鲜度和成本预算先以 additive migration 和契约形式落地；真实执行绑定需在各 executor/API 接入时读取这些资产，并按过期或未知字段 fail closed。
