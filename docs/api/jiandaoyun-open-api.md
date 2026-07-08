# 简道云开放接口接入

## 背景

公司使用简道云作为数据录入平台，后端统一在 `apps/server/src/integration/jiandaoyun` 封装开放接口。前端不直接访问简道云；如后续页面需要使用，应优先调用业务侧组合接口，或由业务服务直接复用 `JiandaoyunClient`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `JDY_HOST` | 简道云 API Host，默认 `https://api.jiandaoyun.com`；可配置到 `/api` 或 `/api/v5`，客户端会归一化为 host。 |
| `JDY_API_KEY` | 简道云 API Key，作为 `Authorization: Bearer <key>` 发送。 |
| `JDY_WEBHOOK_TOKEN` | 简道云数据推送/消息推送 Secret，用于 webhook 签名校验。 |
| `JDY_API_TIMEOUT_MS` | 请求超时，默认 15000ms。 |

## 本地数据池

简道云本地表放在 Postgres `integration` schema 下：

| 表 | 用途 |
| --- | --- |
| `integration.jdy_apps` | 应用元数据，来自应用列表接口。 |
| `integration.jdy_forms` | 表单元数据，来自表单列表接口；包含 `last_data_synced_at`，用于记录数据同步游标。 |
| `integration.jdy_fields` | 字段元数据，来自字段接口；保留 `widget_id`、`name`、`label`、`type` 和原始 schema。 |
| `integration.jdy_records` | 有数据价值的原始记录池，按 `(app_id, entry_id, data_id)` 去重，完整数据放 `raw_data`。 |

`jdy_records` 不作为所有查询的万能表，只保留可追溯原始数据。同步策略应先同步元数据，再按表单判断是否需要拉取数据：空表、长期无更新表、无业务消费的旧表单不写入 `jdy_records`；只有近期有变更或被业务模块声明需要的表单才落 raw record。热门业务查询再单独做投影表，不在 `raw_data` 上默认建全文 JSON 索引。

## Webhook

简道云推送地址：

```text
POST /integration/jiandaoyun/webhook?timestamp=<timestamp>&nonce=<nonce>
```

该接口不走登录鉴权，必须配置 `JDY_WEBHOOK_TOKEN` 并校验 `X-JDY-Signature`。签名按官方规则计算：`sha1("{nonce}:{rawBody}:{secret}:{timestamp}")`，其中 `rawBody` 必须使用原始 JSON 字符串。响应固定返回 `success`，让简道云在 2 秒内收到 2xx；未知 `op` 也返回成功，避免官方后续扩展事件时触发失败重试。

已识别的事件：

| 类型 | `op` |
| --- | --- |
| 数据事件 | `data_create`、`data_update`、`data_remove`、`data_recover` |
| 表单事件 | `form_update` |
| 消息事件 | `form_schedule_message`、`data_create_message`、`data_update_message`、`form_widget_message`、`flow_message`、`dash_schedule_message`、`dash_alert_message` 等以 `_message` 结尾的事件 |
| 流程推送 | 官方文档说明包含流程状态变更、流程待办变更、产生抄送；当前先按原始 `op` 透传给后续业务消费 |

## 后端代理接口

所有接口均需要登录鉴权。

| 方法 | 路径 | 简道云接口 |
| --- | --- | --- |
| `GET` | `/integration/jiandaoyun/apps` | `POST /api/v5/app/list` |
| `GET` | `/integration/jiandaoyun/apps/:appId/forms` | `POST /api/v5/app/entry/list` |
| `GET` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/widgets` | `POST /api/v5/app/entry/widget/list` |
| `POST` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/list` | `POST /api/v5/app/entry/data/list` |
| `POST` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch-create` | `POST /api/v5/app/entry/data/batch_create` |
| `PATCH` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId` | `POST /api/v5/app/entry/data/update` |
| `PATCH` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch` | `POST /api/v5/app/entry/data/batch_update` |
| `DELETE` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId` | `POST /api/v5/app/entry/data/delete` |
| `DELETE` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch` | `POST /api/v5/app/entry/data/batch_delete` |
| `POST` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId/workflow/approval-comments` | `POST /api/v1/app/{app_id}/entry/{entry_id}/data/{data_id}/approval_comments` |
| `POST` | `/integration/jiandaoyun/workflow/instance/get` | `POST /api/v6/workflow/instance/get` |
| `POST` | `/integration/jiandaoyun/workflow/instance/logs` | `POST /api/v1/workflow/instance/logs` |
| `POST` | `/integration/jiandaoyun/workflow/instance/close` | `POST /api/v1/workflow/instance/close` |
| `POST` | `/integration/jiandaoyun/workflow/instance/activate` | `POST /api/v1/workflow/instance/activate` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/list` | `POST /api/v6/workflow/task/list` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/approve` | `POST /api/v1/workflow/task/approve` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/rollback` | `POST /api/v2/workflow/task/rollback` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/transfer` | `POST /api/v1/workflow/task/transfer` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/add-sign` | `POST /api/v2/workflow/task/add_sign` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/revoke` | `POST /api/v2/workflow/task/revoke` |
| `POST` | `/integration/jiandaoyun/workflow/tasks/reject` | `POST /api/v1/workflow/task/reject` |
| `POST` | `/integration/jiandaoyun/workflow/cc/list` | `POST /api/v1/workflow/cc/list` |
| `POST` | `/integration/jiandaoyun/apps/:appId/forms/:entryId/files/upload-token` | `POST /api/v5/app/entry/file/get_upload_token` |
| `POST` | `/integration/jiandaoyun/files/upload` | 上传到简道云返回的文件上传 URL |

`/integration/jiandaoyun/files/upload` 当前接收 JSON：`url`、`token`、`filename`、`fileBase64`、可选 `mime`。如果后续需要浏览器直接 multipart 上传，应在组合接口层另行设计，避免把简道云上传地址和 token 暴露给普通页面。

## 频率限制

客户端内置本进程滑动窗口限流，遵循简道云接口频率：

| 接口类别 | 限制 |
| --- | --- |
| API Key 全局 | 50 次/秒 |
| 应用、表单、字段、查询多条数据、审批意见、流程实例查询、流程日志 | 30 次/秒 |
| 新建多条、修改多条、删除多条、流程抄送列表 | 10 次/秒或 5 次/秒，按简道云接口文档配置 |
| 修改单条、删除单条、文件上传凭证、流程实例操作、流程待办操作 | 20 次/秒 |

如果后端横向部署多个实例，需要增加 Redis 或队列层做跨进程限流；当前实现只保护单进程内调用。

## 来源

- [用户应用查询接口](https://www.jiandaoyun.com/open/open_api/explorer?api_key=app.list)
- [用户表单查询接口](https://www.jiandaoyun.com/open/open_api/explorer?api_key=app.entry.list)
- [数据推送](https://hc.jiandaoyun.com/open/11500)
- [数据推送开发指南](https://hc.jiandaoyun.com/open/11507)
- [数据事件推送](https://hc.jiandaoyun.com/open/10732)
- [表单事件推送](https://hc.jiandaoyun.com/open/11501)
- [流程推送](https://hc.jiandaoyun.com/open/23345)
- [消息推送](https://hc.jiandaoyun.com/open/11497)
- [查询流程实例审批意见](https://hc.jiandaoyun.com/open/16050)
- [查询流程实例信息](https://hc.jiandaoyun.com/open/16051)
- [查询流程日志](https://hc.jiandaoyun.com/open/18793)
- [结束流程实例](https://hc.jiandaoyun.com/open/16052)
- [激活流程实例](https://hc.jiandaoyun.com/open/17366)
- [查询我的待办](https://hc.jiandaoyun.com/open/16053)
- [流程待办提交](https://hc.jiandaoyun.com/open/16054)
- [流程待办回退](https://hc.jiandaoyun.com/open/16055)
- [流程待办转交](https://hc.jiandaoyun.com/open/16056)
- [流程待办加签](https://hc.jiandaoyun.com/open/17368)
- [流程待办撤回](https://hc.jiandaoyun.com/open/17367)
- [流程待办否决](https://hc.jiandaoyun.com/open/21608)
- [查询抄送列表](https://hc.jiandaoyun.com/open/22875)
- [文件接口](https://hc.jiandaoyun.com/open/13287)
