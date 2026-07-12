# ERP SQL Agent Runtime Guard Contract

## Structured analysis compiler

聚合、分组、排行和周期比较问题先解析为 `analysisPlan`，字段包括 approved metric、维度、时间范围、比较周期（`year_over_year` / `month_over_month`）、排序、TopN 与 `businessScope`。SQL 由 approved atomic metric 的 `definition_json` 和已批准维度表达式组合；问句本身不再触发专用 SQL 分支。

模板快路径只处理没有结构化分析计划的简单查询。现有模板资产尚未声明 metric/dimension/time/comparison 覆盖元数据，因此不能抢占结构化计划；后续只有在模板资产补齐并通过覆盖校验后才能恢复对应快路径。

产品类别维度代码为 `product_category`，approved `order_amount` / `open_order_amount` 映射到 `OrderDtl.ProdCode -> ProdGrup.Description`。例如“按产品类别，上个月销售额最高，和去年同比”编译为上一个自然月与去年同期两个受控时间桶，并输出当前值、比较值、差额和变化率。

同一 Agent Runtime session 的后续问题可以继承上一轮 `analysisPlan`。继承内容在 `contextInheritance` 中记录来源 trace 和字段；用户明确陈述的类别合并关系写入 `dimensionRules`，标记 `source=user_statement`、`trust=user_asserted`，SQL 必须先通过 ERP `ProdGrup` 主数据 CTE 验证全部成员存在，再参与聚合。规则说明与验证结论作为 technical 列及回答口径返回，并进入受保护 trace assumptions。

每个结果字段同时返回 `columns[]` 展示元数据：`key`、`label`、`dataType`（`text|money|percent|date|integer`）、`format`、`role`（`dimension|metric|technical`）和 `inlineVisible`。技术口径列统一 `inlineVisible=false`，只在详情展示。兼容旧响应时服务端用执行字段及最终 SQL SELECT alias 补齐元数据，前端不得生成“数据列 N”标题或维护业务字段白名单。

结构化结果同时返回由已验证 `analysisPlan` 构建的 `scope`：`capability`、`metrics`、`dimensions`、`filters`、`timeRange`、`comparison`、`templateCoverage`。该技术范围只在结果详情和审计中展示，narrator 必须接收同一份 scope。若结果包含某个筛选维度列，则每个非空值必须与 `scope.filters` 严格匹配；不匹配时返回 `semantic_mismatch`、清空 rows，且不调用 narrator。结果未返回对应维度列时由 SQL Runtime Guard 的 required dimension/filter coverage 负责阻断，本层不推测列含义。

同一会话向分析 Planner 提供最近 6 条用户/助手消息及更早轮次的滚动语义摘要。摘要只包含指标、维度、时间、比较、筛选、排序和已确认业务规则，不包含原始结果行或完整 SQL。执行计划使用前必须通过类型校验，审计脱敏对象不得作为 SQL 编译输入。“今年”默认按年初至当前日计算，同比为去年年初至去年同日；明确月份按当年自然月及去年同月计算。比较列 `label` 必须显示实际年份、月份或截止日期。

ERP SQL Agent 的用户响应通过 Agent Runtime 返回。所有 approved template、approved metric composer、rule generator 和 LLM fallback 候选在返回或执行前都必须经过生产 `SqlRuntimeGuardService`。

## Result semantics

响应可包含 `semanticStatus`：

- `exact`：候选来源覆盖问题或 `analysisPlan` 要求的 family/metric，且最终 SQL 通过当前 schema guard。这里的 exact 表示 runtime 语义和 schema 精确匹配；财务结论是否可作正式口径仍取决于 approved metric/template 证据。
- `estimate`：候选 family/metric 与问题语义匹配，最终 SQL 也通过当前 schema guard，但 approved 指标覆盖、拼接证据或置信度不足。响应必须包含“可能不准、仅供参考、可补充口径”的免责声明；不得用于财务报表、对账、审计、付款或结算。
- `semantic_mismatch`：候选 family/metric 与问题或 `analysisPlan` 不一致。响应固定 `success=false`、`sql=""`，查询 executor 不得被调用。

`semanticStatus=estimate` 不能覆盖 semantic mismatch。低置信度只允许降低“匹配语义的结果”，不能把库存问题命中的销售模板、成本问题命中的发货 family 等错误来源包装成估算结果。

开发环境例外：`NODE_ENV !== "production"` 且服务端授权 scope 标记为 `devFullAccess` 时，semantic mismatch 不再清空结构合法的 SQL，而是降级为 `estimate` 并追加 `DEV_SEMANTIC_MISMATCH_EXECUTED` warning。该例外只用于调试链路和人工核对，不适用于生产、财务正式口径或自动化结论。

## Guard and rollback behavior

Runtime guard 按以下顺序处理候选：

1. 对模板参数做类型校验和 SQL literal 转义；应用授权 Company/模块作用域。
2. 对最终渲染 SQL 使用当前 schema metadata 做完整 `SqlGuardService` 校验。历史 `guard_passed` 只作为模板审批前置条件，不能替代本次校验；dry-run 同样执行校验。
3. 根据问题、`QueryPlan`、`analysisPlan.requiredMetrics/metrics` 和候选 references 校验 expected/actual family 与 metric。retrieval dataset/family reference 只能作为 expected/context evidence；LLM/rule 的 actual family 必须来自最终 SQL 的真实表/字段/聚合/过滤或 approved metric，template actual family 只能来自当前 approved template 身份。
4. 两类校验都通过后才允许 executor 调用。

任一 schema guard 无效、LLM schema repair 后仍无效或 semantic mismatch 时，runtime 回滚为无可执行 SQL：

```json
{
  "success": false,
  "sql": "",
  "semanticStatus": "semantic_mismatch",
  "rows": [],
  "rowCount": 0,
  "error": "semantic_mismatch: ..."
}
```

schema guard 失败时 `semanticStatus` 可保留已判定的 `exact`/`estimate`，但同样必须 `sql=""`、executor 调用为 0。内部 trace 可保存受保护的 candidate SQL/hash、expected/actual family、expected/actual metric 和 guard errors；这些内部字段不得回传为用户可复制 SQL。

## Client behavior

## Runtime stream

`POST /agentRuntime/run/stream` 使用与 `POST /agentRuntime/run` 相同的认证和请求 body，响应为 SSE。事件依次为：

Agent Runtime、LLM 和 ERP HTTP 查询使用互相独立的有界队列。Agent 队列满时同步接口返回 HTTP 429，SSE 接口返回 `error` 事件；两者都包含 `{ "code": "AGENT_OVERLOADED", "retryable": true }`。`GET /health` 只表示进程存活并始终独立于单请求失败；`GET /ready` 在依赖队列饱和时返回 503。Agent 队列由 `AGENT_RUNTIME_CONCURRENCY_LIMIT` 和 `AGENT_RUNTIME_MAX_QUEUE` 配置。

- `run-start`：`session`、`run`；
- `tool-start`：`runId`、`stepId`、`toolName`；
- `tool-finish`：上述标识、`status` 和 `durationMs`；
- `complete`：与原同步接口相同的 Agent Runtime 结果；
- `error`：不可恢复错误的安全错误文案。

实时工具事件不携带工具参数、SQL、查询行或内部错误细节；这些数据仍只通过最终权限保护后的结果返回。

失败的 SQL Trace 在 `audit_json.diagnostic` 写入安全诊断包：`failureStage`、`failureCode`、`retryable`、`recommendedActions` 与仅含错误类别/哈希的 `safeEvidence`。该包用于指导重试、补充口径、申请权限或审批指标，不包含原始 SQL、参数、结果行或原始异常文本。

查询成功时，最终会话响应会在受当前用户 ERP SQL 权限校验后合并有限的展示结果（`fields`、`rows`、`rowCount`、`truncated`）。展示行独立保存于 Agent 消息的 `display_jsonb`，不进入 `content_jsonb`、工具审计或 SQL Trace；读取历史会话时会重新执行当前权限校验。既有的已脱敏会话没有可恢复的行值，需要重新执行查询。

客户端只在 `success=true` 且 `sql` 非空时展示可复制 SQL。`estimate` 必须同时展示 disclaimer；`semantic_mismatch` 和 schema guard 失败应展示软兜底文案，提示结果可能不准并允许用户补充业务口径，不应只显示“无法处理”。

Approved template 对外返回的 `sql` 必须是本次渲染、应用 scope、并通过 runtime guard 的最终 SQL；guard 失败、schema/repair failure、semantic mismatch、超时或过载均返回 `sql=""`。内部 candidate SQL 仅允许以 hash/受保护摘要进入 trace。
# Golden capability release report

Golden 网页验收以 case 中的 `expectedOutcome` 为准，并只读取响应中的结构化
`outcome`、`capabilityCode`、`reasonCode`、`scope`、`semanticStatus` 和 `traceId`。
报告分类固定为 `execute_pass`、`clarify_pass`、`unsupported_pass`、
`semantic_fail`、`routing_fail`、`guard_fail`、`transport_fail`。返回表格但
`scope.filters` 缺少 case 声明的必需筛选时必须记为 `semantic_fail`，不得从
`message` 或其他自然语言文案推断成功。

真实网页回归默认并发 2，最多 4。带占位实体的问题必须先通过同一 HTTP/网页
契约执行临近交货单等发现查询，再把结构化结果中的订单、工单、物料等实体替换
到后续问题；脚本内直接调用 workflow 只用于 SQL 生成诊断，不能作为网页验收。

可执行入口为：

```bash
npm run erp-sql-agent:golden-http -- \
  --base-url=http://127.0.0.1:3000 \
  --token="$TOKEN" \
  --concurrency=2 \
  --out=tmp/golden-http-acceptance.json
```

该 driver 调用页面相同的 `/agentRuntime/run/stream` SSE 契约，先顺序执行发现链，
再并发执行 contract case，并在执行期间轮询 `/health`。输出保留 outcome、capability、
reason、scope、semantic status 与 trace，不持久化结果行或已发现的实体值。

Execute 响应另含结构化 `executionPath`：`template|composer|rule|llm|estimate`。
报告不接受缺失 path 的 execute；`template` path 必须在 `scope.templateCoverage`
提供至少一个 family，且每个 family 都在 case 的 `allowedTemplateFamilies` 内。
`composer` 可不使用模板，但 metrics、dimensions、filters 和 time scope 仍须完整覆盖
contract。HTTP driver 根据所选 case 的 required filter 与已知 dummy/placeholder 计算
发现前置条件；供应商、采购单、销售订单、工单、物料、客户、仓库、资源群组等
需要替换却未发现，或替换后仍有 `88888`、`ABC123`、`J12345`、`RG01`、`某某`
等 dummy 时，停止 golden workers 并将 discovery failure 作为非零发布门禁。
