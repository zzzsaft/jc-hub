# Auth Permissions

权限表放在 `identity` schema，复用现有 `identity.users / roles / user_roles`。

## 数据表

- `identity.permissions`：权限定义，`code` 使用 `resource:action`，例如 `admin.purchase.apply:view`。
- `identity.role_permissions`：角色授权。
- `identity.user_permission_overrides`：单个用户例外，`effect` 为 `allow` 或 `deny`。

## 判定规则

- `admin` 角色默认拥有全部启用权限。
- 普通用户权限 = 角色权限 + 用户 allow - 用户 deny。
- 用户 `deny` 优先于角色 `allow`。

## ERP SQL Agent 权限

ERP SQL 查询复用同一权限表和角色/用户 override 规则。迁移 `20260710040000_erp_sql_access_permissions` 新增：

| 权限码 | 用途 |
| --- | --- |
| `agent.erp-sql:query` | 发起 ERP SQL 查询。仅有此权限仍不能查询，必须同时存在服务端数据范围。 |
| `agent.erp-sql.sensitive.finance:view` | 查看未脱敏财务金额。 |
| `agent.erp-sql.sensitive.customer:view` | 查看未脱敏客户信息。 |
| `agent.erp-sql.sensitive.employee:view` | 查看未脱敏员工、工时和报工信息。 |

`admin` 仍按现有规则拥有已启用权限，但不会绕过 ERP 数据范围配置。具体接口和范围契约见 [ERP SQL 访问控制](erp-sql-access-control.md)。

## 接口

`GET /auth/me`

返回当前用户信息，新增：

```json
{
  "roles": ["admin"],
  "capabilities": {},
  "permissions": ["admin.employees:view"]
}
```

`GET /auth/admin/users`

拥有 `admin.employees:view` 的用户查看员工资料列表。查询类接口必须分页。

Query:

- `keyword`：可选，匹配姓名、账号、员工号、企微 ID、ERP ID、手机或邮箱。
- `page`：页码，默认 `1`。
- `pageSize`：每页数量，默认 `30`，最大 `100`。

Response:

```json
{
  "items": [],
  "total": 838,
  "page": 1,
  "pageSize": 30
}
```

`GET /auth/admin/permissions`

需要 `admin.permissions:view`，返回所有权限定义。

`GET /auth/admin/roles`

需要 `admin.permissions:view`，返回角色及其权限码。

`PATCH /auth/admin/roles/:id/permissions`

需要 `admin.permissions:update`。

Body:

```json
{ "permissions": ["admin.employees:view"] }
```

`GET /auth/admin/accounts/:id/permission-overrides`

需要 `admin.permissions:view`。

`PATCH /auth/admin/accounts/:id/permission-overrides`

需要 `admin.permissions:update`。

Body:

```json
{
  "overrides": [
    { "permissionCode": "admin.purchase.apply:view", "effect": "deny" }
  ]
}
```
