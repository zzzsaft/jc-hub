# ERP SQL 审计与数据保护

ERP SQL 查询审计在生产环境强制开启；非生产环境需显式设置 `ERP_SQL_AGENT_TRACE_ENABLED=true`。`erp_sql_traces` 记录 actor、session/run/trace、服务端权限 policy/scope、模板 family、metric/version、schema snapshot version、SQL SHA-256、guard/semantic 结论、执行终态、行数、截断、耗时和错误分类。成功、失败、取消都必须形成终态；审计写失败不阻断查询，但返回 `AUDIT_DEGRADED` warning，并将可写 trace 标记为 `audit_degraded`。

为避免高并发耗尽连接池，每条 trace 的 plan、generation、execution 先在请求内合并：成功路径只执行一次 create 和一次终态 update；失败/取消在 `recordFailure` 立即合并写终态，随后 `finish` 不重复写。trace 与 LLM 日志共用独立的 `AUDIT_DB_CONCURRENCY` / `AUDIT_DB_MAX_QUEUE` 有限队列，默认 `4/100`；队列指标通过 `/health` 的 `erpSql.auditDb` 暴露。队列满时审计写失败走既有降级策略，不阻断 ERP 查询。

普通生产配置只持久化摘要：问题、SQL、参数值、ERP rows、LLM prompt/output 和 stack 不保存原文。模板审计使用实际渲染并应用权限 scope 后的 SQL hash，绑定参数只记录名称、类型和值 hash。既有 `sql_text`、`generation_json` 属受控内部字段，仅 `ERP_AUDIT_RAW_PAYLOADS_ENABLED=true` 显式开启原文；该开关不应在常规生产环境启用。

AgentMessage、AgentToolCall 和 LlmCallLog 共用 `ai/audit/dataProtection.ts`。rows 只保存数量/hash，敏感字符串保存 hash/长度，错误只保存分类、名称和脱敏消息，不保存 stack。ERP Agent 用户消息默认用 hash 占位；只有受控问题排查环境可设置 `AGENT_RUNTIME_RAW_PAYLOADS_ENABLED=true`。

ResultNarrator 默认不调用外部 DeepSeek，并返回确定性行数摘要，审计为 `externalDataSent=false`。只有同时设置 `ERP_RESULT_NARRATOR_EXTERNAL_ENABLED=true` 和 `ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED=true` 才会调用外部模型；发送内容只有行数、截断、字段类别和数值聚合，不发送真实 rows，LLM input 中记录 `external_data_sent=true` 与字段类别。

访问边界：业务用户只能通过拥有者校验读取自己的 session/run；ERP SQL 审计表和 LLM/tool-call 原始数据库访问只授予审计管理员/DBA 只读角色。审计管理员不得将 hash 当作业务数据导出；需要开启原文时应使用短时变更单、限定账号和到期回收。
