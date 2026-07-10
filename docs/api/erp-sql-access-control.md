# ERP SQL Agent 访问控制

## 查询入口

ERP SQL Agent 继续使用 `POST /agentRuntime/run`。服务端先按登录用户和 session owner 确定 agent，再为 `erpSqlAgent` / `mastraErpSqlAgent` 生成授权上下文。请求 body 的 `context`、LLM 输出和 prompt 中的 Company/scope 均不参与授权。

该入口同时绑定 HTTP `aborted`/未完成 `close` 和服务端总 deadline。取消会贯穿 runtime、workflow、LLM、reference 等待、guard、template/generated executor 与 ERP HTTP；取消的 run 状态为 `cancelled`，deadline 响应包含稳定 `code` 和 `lifecycleStatus`。ERP 查询池满时底层错误状态为 429 `ERP_QUERY_OVERLOADED`，Agent 响应按查询失败软降级，不继续无界排队。

ERP SQL 请求必须同时满足：

1. 登录用户拥有 `agent.erp-sql:query`；
2. session 的 `ownerUserId` 与登录用户一致；
3. `ERP_SQL_ACCESS_POLICY_JSON.users[identityUserId]` 存在且完整；
4. 查询模块属于允许模块；
5. SQL 能强制落入配置的 Company 和具体行范围；
6. 返回字段按敏感权限脱敏。

任一条件缺失返回 `403` 或结构化失败，错误以 `ERP_SQL_ACCESS_DENIED:` 开头，不执行 ERP 查询。

## 服务端范围配置

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

## 强制执行

- Approved template 在参数绑定后注入 `authorizedCompanies` 服务端参数，并在每个 `Erp.*` 数据源外包 Company 限制。
- Atomic/composite metric composer 在 schema guard 前注入同一范围。
- LLM/rule SQL 在 runtime guard 前注入范围；执行层再次要求服务端 scope，并拒绝无 `Erp.*` 数据源的 SQL。
- 具体部门、事业部、客户范围只在 SQL 引用可验证字段时注入；当前识别 `Department/DepartmentID/DeptCode/JCDept`、`Division/DivisionID/BusinessUnit/BusinessUnitID`、`CustNum`。配置了具体范围但 SQL 没有对应字段时 fail closed。
- SQL 中额外出现其他 Company 条件不会放宽底层 Company 派生表范围。

## 脱敏和审计

默认没有敏感字段权限时：财务金额返回 `null`；客户和员工/报工文本保留首尾字符，其余替换为 `*`。响应 warning 包含 `erp_sql_sensitive_fields_masked:<fields>`，执行结果内部 `auditReasons` / Mastra 输出 `accessAudit` 包含结构化 `code`、`category`、`message` 和 `fields`。

完整敏感字段由三项独立权限控制，不能用普通查询权限或 prompt 绕过。

## 兼容影响

- 以前仅登录即可使用 ERP SQL Agent 的调用方将被拒绝，必须先应用权限迁移、授权 `agent.erp-sql:query` 并配置用户范围。
- 本地开发的 `x-user-id` 也不会绕过 ERP SQL policy；该用户必须存在于 identity 并有权限/范围。
- 非 ERP Agent 的 `/agentRuntime/*` 行为不变。
