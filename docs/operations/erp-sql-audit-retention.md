# ERP SQL 审计留存与只读检查

建议生产留存：ERP SQL trace 180 天；LLM/tool-call 普通摘要 90 天；AgentMessage 按产品会话生命周期或 90 天；获批原文最长 7 天。若法规、合同或事故保全要求更长，以安全/法务审批为准，并使用隔离归档而非扩大业务库访问。

只读检查命令：

```bash
ERP_AUDIT_RETENTION_DAYS=90 npm run sql-agent:audit-retention
```

命令只执行 `COUNT`，输出 cutoff、各表候选数、总数和 `writesPerformed=false`，不会删除或更新数据库。真实清理由 DBA 在变更窗口按报告审批执行；应用仓库不提供自动 delete，避免误删审计证据。

访问建议：应用账号仅 INSERT/UPDATE 自身审计记录；业务 API 不提供审计列表；审计管理员使用单独只读账号；DBA 才能执行经审批的清理。排查 `AUDIT_DEGRADED` 时先检查迁移、表权限和数据库可用性，不能通过关闭 trace 消除告警。

容量建议：生产默认 `AUDIT_DB_CONCURRENCY=4`、`AUDIT_DB_MAX_QUEUE=100`。监控 `/health` 中 `erpSql.auditDb.active/queued/overloaded`；持续 queued 表示数据库写入变慢，`overloaded > 0` 表示已有日志降级。多实例部署时按“实例数 × AUDIT_DB_CONCURRENCY”核算数据库连接预算。
