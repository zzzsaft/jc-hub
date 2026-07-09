# JDY Webhook

## 数据推送

`POST /integration/jdy/webhook`

用于接收简道云数据事件推送，落库到：

- `integration.webhook_events`：原始 webhook 接收和处理状态。
- `integration.jdy_flow_instances`：按 `data._id` upsert 的当前流程实例快照。
- `integration.jdy_flow_instance_events`：推送事件日志和流程审批日志。

## 鉴权

服务端配置：

```env
JDY_WEBHOOK_SECRET=""
```

请求需带其中一种：

- Query：`/integration/jdy/webhook?token=xxx`
- Header：`x-jdy-webhook-token: xxx`

未配置 secret 或 token 不匹配时返回 `401`，不会写入 webhook 记录。

## Payload

支持简道云数据事件推送结构：

```json
{
  "op": "data_create",
  "opTime": 1783526400000,
  "data": {
    "_id": "data-id",
    "formName": "表单名称",
    "流程状态": 0
  }
}
```

`op` 支持：

- `data_create`
- `data_update`
- `data_remove`
- `data_recover`

缺少 `op` 或 `data._id` 时返回 `400`，对应 `webhook_events.status` 会更新为 `failed`，方便简道云管理员重新推送。

## 字段映射

- 实例唯一键：`data._id`
- 表单名：`formName` / `form_name` / `表单名称`
- 流程状态：`flowStatus` / `flow_status` / `flowState` / `flow_state` / `流程状态`
- 状态文本：`0=running`、`1=completed`、`2=manually_ended`，其他为 `unknown`
- 提交人：`submitter` / `creator` / `提交人`
- 修改人：`modifier` / `updater` / `修改人`
- 删除人：`deleter` / `删除人`
- 时间：`submitTime/createTime/_ctime/提交时间`、`updateTime/_utime/修改时间`、`deleteTime/删除时间`

完整 payload 会保存在 `raw_json` 中；审批节点和意见明细来自下面的流程日志接口。

## 流程接口同步

如果配置了 `JDY_API_KEY`，webhook 处理时会额外调用简道云流程接口：

- `POST /api/v6/workflow/instance/get`：查询流程实例信息，参数 `instance_id=data._id`、`tasks_type=1`
- `POST /api/v1/workflow/instance/logs`：查询流程日志，参数 `instance_id=data._id`、`types=["comment"]`

同步结果：

- 实例信息写入 `jdy_flow_instances.app_id/form_id/instance_url/result/raw_instance_json`
- 审批意见、节点、审批人、动作、附件写入 `jdy_flow_instance_events`
- 推送事件的 `event_source` 为 `webhook`
- 流程日志的 `event_source` 为 `workflow_log`

`JDY_API_KEY` 未配置时只保存推送本身和实例快照，不查询流程接口。流程接口失败时 webhook 返回失败，简道云可按失败推送机制重推。
