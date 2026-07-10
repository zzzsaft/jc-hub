# ERP SQL Agent 访问控制

## 查询入口

ERP SQL Agent 继续使用 `POST /agentRuntime/run`。服务端先按登录用户和 session owner 确定 agent，再为 `erpSqlAgent` / `mastraErpSqlAgent` 生成授权上下文。请求 body 的 `context`、LLM 输出和 prompt 中的 Company/scope 均不参与授权。

该入口同时绑定 HTTP `aborted`/未完成 `close` 和服务端总 deadline。取消会贯穿 runtime、workflow、LLM、reference 等待、guard、template/generated executor 与 ERP HTTP；取消的 run 状态为 `cancelled`，deadline 响应包含稳定 `code` 和 `lifecycleStatus`。ERP 查询池满时底层错误状态为 429 `ERP_QUERY_OVERLOADED`，Agent 响应按查询失败软降级，不继续无界排队。

ERP SQL 请求必须同时满足：

1. 登录用户拥有 `agent.erp-sql:query`；
2. session 的 `ownerUserId` 与登录用户一致；
3. 数据库中存在已启用、未过期、匹配当前环境的 access policy；
4. 查询模块属于允许模块；
5. SQL 能强制落入配置的 Company 和具体行范围；
6. 返回字段按敏感权限脱敏。

任一条件缺失返回 `403` 或结构化失败，错误以 `ERP_SQL_ACCESS_DENIED:` 开头，不执行 ERP 查询。

开发环境例外：`NODE_ENV !== "production"` 时，identity 用户 `LiangZhi`（梁之）由服务端生成 `devFullAccess` 调试 scope，可跳过本地 policy 映射、Company/部门/事业部/客户 scope 注入和敏感字段脱敏限制。该例外不能在生产生效，SQL 仍必须通过 SELECT/schema guard。

## 服务端范围配置

主配置在数据库表 `erp_agent.erp_sql_access_policies`。`ERP_SQL_ACCESS_POLICY_JSON` 仅作为 fallback：

- 非生产环境可用于本地开发兜底。
- 生产环境只有显式设置 `ERP_SQL_ACCESS_POLICY_FALLBACK_MODE=emergency` 才会读取。
- 如果数据库已存在该用户/角色的 policy 但未启用、过期或被归档，不会静默退回 env。

Policy 字段：

| 字段 | 说明 |
| --- | --- |
| `userId` / `roleId` | 必须且只能提供一个；当前查询优先匹配 user policy，再匹配 role policy。 |
| `environment` | `production` 或 `development`；生产只匹配 `production`。 |
| `companies` | 非空数组，不支持隐式全 Company。 |
| `modules` | 非空数组；可用值 `sales`、`purchase`、`production`、`inventory`、`finance`、`custom`。 |
| `departments`、`businessUnits`、`customerNumbers` | 非空数组，或显式 `"*"`。 |
| `sensitive.finance/customer/employee` | DB policy 对敏感 full 权限的上限；用户仍必须同时拥有对应敏感权限。 |
| `enabled`、`effectiveFrom`、`expiresAt`、`archivedAt` | 任一不满足均 fail closed。 |

```env
ERP_SQL_ACCESS_POLICY_JSON='{
  "users": {
    "identity-user-id": {
      "companies": ["EPIC03"],
      "modules": ["sales", "inventory"],
      "departments": ["D01"],
      "businessUnits": ["BU01"],
      "customerNumbers": [1001, 1002]
    }
  }
}'
```

- `companies`：必须是非空数组，不支持隐式全 Company。
- `modules`：必须是非空数组；可用值为 `sales`、`purchase`、`production`、`inventory`、`finance`、`custom`。
- `departments`、`businessUnits`、`customerNumbers`：必须显式给出非空数组，或显式使用 `"*"`。缺字段、空数组和无效值均拒绝查询。
- `"*"` 是管理员明确配置的全范围契约，不是默认值。生产普通用户应使用具体范围。

当前映射以 identity user id 为主键。不得从请求 body 传入、覆盖或合并该配置。

## 管理 API

管理权限与查询权限分离：

- `agent.erp-sql.access-policy:view`：查看列表、详情、审计日志。
- `agent.erp-sql.access-policy:manage`：创建、更新、启停、归档、preview。

### 列表

`GET /api/erp-sql/access-policies?page=&pageSize=&keyword=&enabled=&userId=`

返回：

```json
{
  "items": [
    {
      "id": "42",
      "userId": "identity-user-id",
      "roleId": null,
      "environment": "production",
      "rolloutMode": "production",
      "companies": ["EPIC03"],
      "modules": ["sales"],
      "departments": "*",
      "businessUnits": ["BU01"],
      "customerNumbers": "*",
      "sensitive": { "finance": false, "customer": true, "employee": false },
      "enabled": true,
      "reason": "销售只读试点",
      "createdBy": "admin-user-id",
      "updatedBy": "admin-user-id",
      "approvedBy": "security-owner",
      "effectiveFrom": "2026-07-10T00:00:00.000Z",
      "expiresAt": null,
      "archivedAt": null,
      "createdAt": "2026-07-10T00:00:00.000Z",
      "updatedAt": "2026-07-10T00:00:00.000Z"
    }
  ],
  "pageInfo": { "page": 1, "pageSize": 20, "total": 1 }
}
```

### 详情

`GET /api/erp-sql/access-policies/:id`

返回单个 policy，字段同列表 item。

### 创建

`POST /api/erp-sql/access-policies`

```json
{
  "userId": "identity-user-id",
  "environment": "production",
  "rolloutMode": "production",
  "companies": ["EPIC03"],
  "modules": ["sales", "inventory"],
  "departments": "*",
  "businessUnits": ["BU01"],
  "customerNumbers": "*",
  "sensitiveFinance": false,
  "sensitiveCustomer": true,
  "sensitiveEmployee": false,
  "enabled": false,
  "reason": "新增销售试点范围",
  "approvedBy": "security-owner",
  "effectiveFrom": "2026-07-10T00:00:00.000Z",
  "expiresAt": null
}
```

成功返回 `201` 和 policy 详情。`userId` 与 `roleId` 必须二选一；`companies/modules` 不接受 `"*"`。

### 更新

`PATCH /api/erp-sql/access-policies/:id`

请求体可传创建字段的子集；服务端按合并后的完整 policy 校验。成功返回更新后详情。

### 启停

`POST /api/erp-sql/access-policies/:id/enable`

`POST /api/erp-sql/access-policies/:id/disable`

成功返回更新后详情。禁用后查询链路立即 fail closed，不回退 env。

### 归档

`DELETE /api/erp-sql/access-policies/:id`

软归档：设置 `enabled=false` 和 `archivedAt`，保留审计。

### 试算/预览 scope

`POST /api/erp-sql/access-policies/preview-scope`

请求体同创建，不写数据库。返回归一化 scope、敏感字段上限和 subject，供前端保存前预览。

### 审计日志

`GET /api/erp-sql/access-policies/:id/audit-logs?page=&pageSize=`

返回：

```json
{
  "items": [
    {
      "id": "100",
      "policyId": "42",
      "action": "update",
      "actorUserId": "admin-user-id",
      "reason": "缩小客户范围",
      "before": { "enabled": true, "ranges": { "customerNumbers": { "wildcard": true } } },
      "after": { "enabled": true, "ranges": { "customerNumbers": { "wildcard": false, "count": 2 } } },
      "ip": "127.0.0.1",
      "userAgent": "Mozilla/5.0",
      "createdAt": "2026-07-10T00:00:00.000Z"
    }
  ],
  "pageInfo": { "page": 1, "pageSize": 20, "total": 1 }
}
```

审计只记录 subject、环境、启停、范围计数/通配状态和敏感开关，不记录真实业务查询结果或 SQL。

## 强制执行

- Approved template 在参数绑定后注入 `authorizedCompanies` 服务端参数，并在每个具备显式 scope policy 的数据源外包 Company 限制。
- Atomic/composite metric composer 在 schema guard 前注入同一范围。
- LLM/rule SQL 在 runtime guard 前注入范围；执行层再次要求服务端 scope，并拒绝无可管控数据源的 SQL。
- 当前允许的数据源 scope policy 为 `Erp.*`、`JCJDY.dbo.ProductQuotation`、`JCJDY.dbo.ProductQuotationDetail`，均使用 `Company` 字段强制范围。未知 `dbo`/`JCJDY`/混合 CROSS JOIN 来源 fail closed；如果现场确认 JCJDY 报价表没有可信 Company 字段，应通过 `ERP_SQL_DISABLED_FAMILIES=family_008,family_080` 或模板 id kill switch 禁用对应 family/template。
- 具体部门、事业部、客户范围只在 SQL 引用可验证字段时注入；当前识别 `Department/DepartmentID/DeptCode/JCDept`、`Division/DivisionID/BusinessUnit/BusinessUnitID`、`CustNum`。配置了具体范围但 SQL 没有对应字段时 fail closed。
- SQL 中额外出现其他 Company 条件不会放宽底层 Company 派生表范围。

## 脱敏和审计

默认没有敏感字段权限时：财务金额返回 `null`；客户和员工/报工文本保留首尾字符，其余替换为 `*`。响应 warning 包含 `erp_sql_sensitive_fields_masked:<fields>`，执行结果内部 `auditReasons` / Mastra 输出 `accessAudit` 包含结构化 `code`、`category`、`message` 和 `fields`。

字段分类优先按受治理 schema/approved metric 标签，当前实现的字段名兜底覆盖 `TotalRevenue`、`SalesValue`、`业务员` 等常见别名；重命名 alias 不能绕过已有敏感字段分类。

完整敏感字段由三项独立权限控制，不能用普通查询权限或 prompt 绕过。

## 兼容影响

- 以前仅登录即可使用 ERP SQL Agent 的调用方将被拒绝，必须先应用权限迁移、授权 `agent.erp-sql:query` 并配置用户范围。
- 本地开发的 `x-user-id` 也不会绕过 ERP SQL policy；该用户必须存在于 identity 并有权限/范围。
- 非 ERP Agent 的 `/agentRuntime/*` 行为不变。
