# JDY Workflow API

这些接口封装简道云流程操作 API，供后端或前端后续接入。

所有 `/integration/jdy/workflow/*` 接口都要求当前系统登录态；非管理员只能使用自己登录态中的 `wecomUserId` 作为 `username`，实例结束和激活要求当前用户有 `admin` 角色。

## 查询

### 查询待办

`GET /integration/jdy/workflow/tasks?username=...&limit=...&taskId=...`

代理 JDY：

- `POST /api/v6/workflow/task/list`

### 查询抄送

`GET /integration/jdy/workflow/cc?username=...&skip=...&limit=...&readStatus=all|read|unread`

代理 JDY：

- `POST /api/v1/workflow/cc/list`

## 待办操作

以下接口都会记录到 `integration.jdy_flow_operation_logs`，成功后会 best-effort 同步流程实例信息和流程日志。

### 提交

`POST /integration/jdy/workflow/tasks/:taskId/approve`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "comment": "同意"
}
```

### 回退

`POST /integration/jdy/workflow/tasks/:taskId/rollback`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "flowId": 1,
  "backType": 1,
  "comment": "回退"
}
```

### 转交

`POST /integration/jdy/workflow/tasks/:taskId/transfer`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "transferUsername": "xiaojian",
  "comment": "转交处理"
}
```

### 加签

`POST /integration/jdy/workflow/tasks/:taskId/add-sign`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "addSignType": 1,
  "addSignUsernames": ["xiaojian"],
  "comment": "请加签"
}
```

`addSignType`：`0` 前加签、`1` 后加签、`2` 并加签。

### 撤回

`POST /integration/jdy/workflow/tasks/:taskId/revoke`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "comment": "撤回原因"
}
```

### 否决

`POST /integration/jdy/workflow/tasks/:taskId/reject`

```json
{
  "username": "xiaoyun",
  "instanceId": "data_id",
  "comment": "不同意"
}
```

## 实例操作

### 结束流程实例

`POST /integration/jdy/workflow/instances/:instanceId/close`

需要 `admin` 角色。

### 激活流程实例

`POST /integration/jdy/workflow/instances/:instanceId/activate`

需要 `admin` 角色。

```json
{
  "flowId": 1
}
```

## 错误

- 请求参数缺失：`400`
- 未登录：`401`
- 非管理员调用实例结束/激活：`403`
- JDY 返回 `status=failure` 或调用失败：`502`

JDY 原始响应会保存在 `response_json`；网络或服务异常会保存在 `error_message`。

## 暂存

当前官方流程接口列表中没有“流程待办暂存”接口；仓库现有“暂存”是本地报价/配置草稿能力，不在本批 JDY 流程操作范围内。
