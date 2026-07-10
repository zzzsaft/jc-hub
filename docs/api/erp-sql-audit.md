# ERP SQL 审计与响应数据边界

ERP SQL 用户响应继续返回查询状态、字段和获授权后的 rows，但不会返回候选/invalid SQL、实际参数绑定 SQL、权限 scope 注入 SQL或错误 stack。`traceId` 用于管理员关联 `erp_sql_traces`；普通用户不能据此读取审计表。

当审计持久化失败时，查询仍可完成，`warnings` 包含 `AUDIT_DEGRADED`。调用方必须展示或上报此状态，不能将其当作普通业务 warning 静默丢弃。取消和执行失败同样写入 `cancelled` / `failed` 终态及错误分类。

生产开关：

- `ERP_SQL_AGENT_TRACE_ENABLED`：非生产环境显式 `true` 开启；生产环境强制开启，不能由 `false` 关闭。
- `ERP_AUDIT_RAW_PAYLOADS_ENABLED`：默认关闭；开启后受控字段可保存原始 SQL/负载。
- `AGENT_RUNTIME_RAW_PAYLOADS_ENABLED`：默认关闭；控制 ERP AgentMessage 原文持久化。
- `ERP_RESULT_NARRATOR_EXTERNAL_ENABLED` + `ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED`：双开关；默认不外发，开启也只发送聚合/DLP 后数据。
- `ERP_SQL_SCHEMA_SNAPSHOT_VERSION`：写入 trace 的 schema snapshot/version 标识。
- `ERP_AUDIT_RETENTION_DAYS`：只读 retention 报告阈值，默认 90 天。
