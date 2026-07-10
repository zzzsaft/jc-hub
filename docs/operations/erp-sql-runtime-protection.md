# ERP SQL Runtime Deadline、容量保护与回滚

## 运行边界

`POST /agentRuntime/run` 将客户端断连与 `ERP_SQL_AGENT_TOTAL_DEADLINE_MS` 合并成同一 `AbortSignal`。信号贯穿 Agent Runtime、ERP SQL handler、Mastra workflow、intent/analysis、schema/reference、guard/repair、template/generated executor 和 ERP HTTP client。排队 limiter 会在 abort 时立即移除任务；已经进入不支持硬取消的 Prisma 查询不会冒充已取消，而是作为有界共享 reference 工作继续收尾并单独计数。

ERP SQL Agent 专属本地配置文件为 `.env.erp-agent`，示例见 `.env.erp-agent.example`。加载顺序为 `.env` -> 非生产 `.env.dev` -> `.env.erp-agent`，但启动前已有的 `process.env` 永远最高优先级，专属文件不会覆盖部署注入值。生产应由 secret/config manager 注入，不依赖提交真实 `.env` 文件。

ERP HTTP 使用独立于 Prisma 的进程内池：`ERP_QUERY_CONCURRENCY` 控制 active，`ERP_QUERY_MAX_QUEUE` 控制 queued。LLM、Prisma/ERP SQL DB、schema guard 也分别使用 `LLM_MAX_QUEUE`、`ERP_SQL_DB_MAX_QUEUE`、`ERP_SQL_GUARD_MAX_QUEUE` 有界队列。队列满时立即抛出 429/软降级；Agent 不重试、不继续积压。多副本部署时上限按“每进程”计算，生产总并发约等于副本数乘以配置值。

## 观测

`GET /health` 返回：

- `erpSql.queryPool.active/queued/started/completed/aborted/overloaded`
- `erpSql.llm.active/queued/started/completed/aborted/overloaded`
- `erpSql.db.active/queued/started/completed/aborted/overloaded`
- `erpSql.guard.active/queued/started/completed/aborted/overloaded`
- `erpSql.auditDb.active/queued/started/completed/aborted/overloaded`
- `erpSql.detachedReferenceWork.active/total/settled`

LLM call log 的 `output_jsonb.metrics.lifecycle_status` 使用 `not_sent`、`queued`、`request_sent`、`first_token_slow`、`stream_slow`、`aborted`。`stream_slow` 按 inter-chunk gap/last progress 记录，不只按总耗时粗判；metrics 包含 `inter_chunk_gap_ms` 和 `max_inter_chunk_gap_ms`。阶段 deadline 使用 `guard/repair_slow`、`erp_query_slow` 或 `aborted`；Agent run error JSON 同时记录 `code` 和 `lifecycleStatus`。ERP client 的 `onLifecycle` 可观测 `not_sent -> queued -> request_sent` 以及 timeout/abort 终态。

建议初始 SLO/告警线：

- Agent 总耗时：p95 < 30s、p99 < 60s；总 deadline 比例 < 0.5%。
- LLM：首 token p95 < 5s，stream 完成 p95 < 30s。
- ERP HTTP：排队等待 p95 < 1s，查询 p95 < 3s，`erp_query_slow` < 0.5%，`overloaded / started` < 1%。
- Guard/repair：p95 < 2s，`guard/repair_slow` < 0.5%。
- 取消：排队任务应在 250ms 内从 queued 移除；客户端断连后不再发送 ERP 请求。
- Reference 隔离：`detachedReferenceWork.active` 应在数据库超时窗口内回到 0；持续不归零或 `total-settled` 增长即告警。

## 回滚与降级顺序

1. 全局保持 `ERP_SQL_AGENT_EXECUTE_GENERATED_SQL=false`，立即停掉 generated SQL 真执行。
2. 设置 `ERP_SQL_AGENT_EXECUTE_APPROVED_TEMPLATES=false`，独立停掉所有 approved template 真执行。
3. 只影响局部时，设置 `ERP_SQL_DISABLED_FAMILIES=family_...` 或 `ERP_SQL_DISABLED_TEMPLATE_IDS=...`；逗号分隔，可组合使用。
4. ERP 后端承压时先降低 `ERP_QUERY_CONCURRENCY`，并保持有限 `ERP_QUERY_MAX_QUEUE`；不要用扩大队列掩盖下游变慢。
5. 修改环境变量后按现有部署方式滚动重启。确认 `/health` 的 active/queued 下降、overloaded 不再增长，再逐项恢复。

开关只改变执行资格，不绕过权限、参数校验、SQL guard、审计或数据范围。恢复 family/template 前，应先用 dry-run/golden 验证命中语义和 guard，再开放真执行。
