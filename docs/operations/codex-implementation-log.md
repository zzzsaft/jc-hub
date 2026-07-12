# Codex 实现记录

这个文档用于在后续使用 Codex 做功能实现、修复或重构时，简略记录实现内容。记录不需要写成完整设计文档，只保留将来回看代码时最有帮助的信息。

## 记录原则

- 每次实现完成后追加一条记录，放在“实现记录”最上方。
- 记录重点写“改了什么、为什么这样改、如何验证”，避免复制大段代码。
- 涉及数据库、接口、脚本、后台任务或兼容路径时，需要明确影响范围。
- 如果有未完成事项、风险或需要人工确认的数据，也写在记录里。
- 不要记录密钥、token、真实用户隐私数据或生产敏感数据。

## 代码规模与复用原则

- 新增或修改模块时优先复用已有 service、repository、helper、types 和测试工具，避免复制相同的解析、映射、校验、分页、排序、错误处理逻辑。
- 单个业务模块不应无限长大；当文件接近或超过 500 行时，需要主动检查是否可以按职责拆分，例如拆成 `types`、`repository`、`mapper`、`validator`、`prompt`、`workflow`、`routes` 或领域 helper。
- 路由文件只负责鉴权、参数读取和绑定 handler；复杂业务逻辑应下沉到 service/use-case，公共响应映射和参数校验应复用。
- service 文件应保持清晰职责边界；如果同时包含数据库访问、数据映射、规则计算、批处理流程和外部调用，需要拆出可复用的小模块。
- 大型脚本和一次性迁移可以适当偏长，但新增可复用逻辑仍应沉淀到 `src` 下的领域模块，脚本只做编排。
- 每次新增较大功能时，在实现记录中说明复用了哪些现有能力；如果暂时没有拆分超过 500 行的文件，需要记录原因和后续拆分点。

## 推荐格式

```md
### YYYY-MM-DD 简短标题

- 背景：为什么要做这次改动。
- 实现：主要修改了哪些模块、接口、脚本或数据结构。
- 决策：关键取舍或兼容处理。
- 验证：运行过哪些命令，结果如何。
- 后续：可选，记录未完成事项或风险。
```

## 实现记录

### 2026-07-13 Golden Set v2 配置字段增删

- 背景：新任务的 `configuration_fields=[]`，旧表单只能编辑已有项，操作者无法补齐 all-layer `auto_archive` 所需配置证据。
- 实现：新增纯函数生成任务内唯一的默认 `configuration_field_N` 并按数组 index 单行删除；`ConfigFieldsForm` 使用 index 作为仅限 UI 的渲染/更新 identity，增加“＋ 添加配置字段”和“移除配置字段”，hook 以完整数组更新 annotation 并复用现有 revisioned autosave。客户端和服务端 schema 均拒绝空/重复 field key，draft/submit 持久化复用服务端校验。ERP mapping 逻辑未改。
- 验证：UI mapping RED→GREEN；浏览器使用隔离 mock 任务验证新增、删除与 autosave，并检查 360/390/430px 触控按钮；完整测试与构建结果见 Task 9 报告。

### 2026-07-13 Golden Set v2 个人权限派位与 ERP 查询熔断

- 背景：固定用户 ID 无法支持个人账号权限治理；逐文档 ERP lookup 超时后继续发请求会累积未完成底层查询。
- 实现：新增 additive permission migration，v2 标注路由复用现有登录解析与 `permissionService`，按 `product-config-agent.golden-set.annotate-a`、`.annotate-b`、`.adjudicate` 服务端派位；A/B 双权限、零标注权限及标注/裁决任意交叉授权均 fail closed。local dev 也按 userId 从 permissionService 读取，不再接受权限 header。ERP builder 首次 lookup timeout 后打开本次构建熔断器，后续文档写入显式 `circuit_open` unresolved evidence，不再调用底层 ERP lookup。
- 决策：请求不能选择 slot 或权限；标注与裁决职责双向互斥。裁决权限独立保护差异队列、裁决提交、导出和 admission preview。熔断只针对 timeout，普通 lookup error 仍记录显式 unresolved 结果。
- 验证：`goldenSetFullReview.test.ts` 覆盖个人 A/B、双权限/零权限/裁决隔离和悬挂 Promise 单次调用；运行结果及服务端构建状态见本次 Task 8 报告。

### 2026-07-12 Golden Set v2 全文盲审操作契约

- 背景：需要把 400 文档的一次性 A/B 全文盲审从实现契约固化为可执行的 20-task pilot，并明确自动归档边界。
- 实现：补充 v2 七组路由、完整 annotation DTO、A/B 席位隔离、四份答案导出及不可覆盖 manifest/seal 校验、280 calibration / 120 acceptance 策略、浏览器验收项和 pilot 推进条件。
- 决策：只有冻结后的 acceptance 文档、显式复核完成、四导出通过 seal、双层阈值通过且门禁返回 `auto_archive`，才可进入后续 archive pipeline；`quarantine` 与 `reject` 均终止自动归档，preview 本身不写 archive。
- 验证：Golden Set 三份聚焦测试共 44/44 通过；`npm run build:server`、`npm run build:web` 通过，`npm run lint:web` 以 0 error（33 个既有 warning）通过。使用隔离的本地 v2 sidecar 和 A 席位测试身份加载真实 400 文档冻结快照，将一条 ERP 查询超时样本按“证据不足 + ERP 身份未解决”隔离保存并进入下一条；desktop/360/390/430 截图见本地 `tmp/golden-set-v2-screenshots/`。本次没有冒充 B 席位或管理员，也没有把试运行结果写入生产归档；完整 A/B 双盲和裁决仍须由真实人员按操作契约执行。

### 2026-07-11 ERP Agent 对话等待状态

- 背景：同步 Agent 请求耗时期间，用户无法判断是否仍在处理以及等待多久。
- 实现：新增 `POST /agentRuntime/run/stream` SSE 链路，服务端在 run 和每项工具开始/结束时推送安全事件，前端以真实事件更新当前工具和等待计时；未新增依赖。
- 决策：实时事件不回传工具参数、SQL、查询行或内部错误；完整权限过滤后的结果仍通过 `complete` 事件返回。
- 验证：`npm run build:server`、`npm run build:web`、`git diff --check` 通过；待有可用本地 Agent 依赖后补充 SSE 端到端事件检查。

### 2026-07-10 ERP SQL access policy 数据库主配置与管理 API

- 背景：`ERP_SQL_ACCESS_POLICY_JSON` 只能作为临时本地映射，生产需要可审计、可启停、可前端管理的数据库 policy。
- 实现：新增 migration `20260710060000_erp_sql_access_policy_db`，建立 `erp_agent.erp_sql_access_policies` 与 `erp_sql_access_policy_audit_logs`，并 seed `agent.erp-sql.access-policy:view/manage`；运行时授权改为 DB policy 优先，env 仅开发 fallback 或生产 emergency fallback；新增 `/api/erp-sql/access-policies*` 管理接口、preview 和审计日志。
- 决策：只要 DB 有匹配 policy 但未启用/过期/归档，就 fail closed，不静默回退 env；敏感 full 需要“用户敏感权限 + DB policy 开关”同时满足。
- 验证：`npm run prisma:validate`、`npx tsc -p apps/server/tsconfig.json --noEmit`、`node --test --import tsx apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts` 通过。

### 2026-07-10 ERP SQL Agent 开发权限与 semantic mismatch 调试放宽

- 背景：开发阶段需要让梁之直接验证 ERP SQL Agent 链路，避免被 policy/scope 或 semantic family 误判卡住。
- 实现：为开发环境的 `LiangZhi`/梁之生成 `devFullAccess` ERP SQL 调试 scope，跳过本地 policy/scope 阻断并给予敏感字段 full 级别；dev full-access 下 semantic mismatch 的结构合法 SQL 降级为 estimate 并保留强 warning，生产仍硬拦。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/erpSqlAccessPolicy.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`、`npm run prisma:validate`、`npx tsc -p apps/server/tsconfig.json --noEmit`、`git diff --check`。

### 2026-07-10 ERP SQL Agent P0 复核修复与专属环境配置

- 背景：P0-1～4 复核发现 retrieval reference 被当作 actual family、模板回传未渲染 SQL、scope 只覆盖 `Erp.*`、审计持久化仍可能留下原始 planner/session 信息，以及 LLM/DB/guard 队列无上限。
- 实现：新增 `.env.erp-agent.example` 和 gitignored `.env.erp-agent` 加载，process env 最高优先级；runtime semantic guard 只把最终 SQL、approved metric、当前 approved template 当 actual evidence；模板只返回通过 guard 的最终 scoped SQL；scope policy 改为显式允许 `Erp.*` 与 JCJDY 报价两表，其它 dbo/JCJDY fail closed；敏感字段兜底覆盖 `TotalRevenue`、`SalesValue`、`业务员`；LLM/DB/guard 增加 max queue 与 `/health` 指标；AgentRun/AgentSession 持久化走集中保护；production raw audit 需要 trusted 双开关；retention 增加默认 dry-run、显式 `--apply` 的批量清理机制。
- 决策：不新增依赖，不用正则替代安全门禁；scope 先用解析器做数据源 fail-closed 预检，再复用现有派生表改写。若现场确认 JCJDY 报价表没有可信 Company 字段，应保持 `family_008/family_080` 或相关 template kill switch 禁用。
- 验证：`npm test` 475/475 通过；`npx tsc -p apps/server/tsconfig.json --noEmit`、`npm run prisma:validate`、`git diff --check` 通过。未执行真实 ERP/外部 LLM golden 或 retention `--apply`。

### 2026-07-10 ERP SQL 生产资产 12 项补齐

- 背景：原生产就绪评估第 5 节仍有报价、库存、工单物料、报工、财务、schema snapshot、接口、分页、新鲜度、审计、安全、成本 12 项资产需要逐项闭环，且并行 P0 线程正在处理 runtime guard、权限、审计和容量。
- 实现：新增轻量 `erpSqlAgent/assets` registry，保留 1～12 编号状态、证据、测试和阻断项；新增 additive migration `20260710050000_erp_sql_production_assets`，建立 governed assets、schema snapshots、LLM cost price versions，并为 trace 预留 snapshot/data freshness/pageInfo/cost 字段；新增 Data Gateway v1 API 契约和生产资产验收文档。
- 决策：不覆盖 P0 线程的 guard/access/audit/config；未证明真实 ERP 字段或未获业务 owner 审批的报价、库存库龄、工单物料、报工资源、财务口径、成本价格均保持 draft/blocked，不标成 approved。
- 验证：新增 `productionAssets.test.ts` 覆盖 12 项编号、合同号 slot、相邻 family 负例、库存排他、财务 exact/estimate、snapshot fail closed、分页/新鲜度、审计、安全和成本策略；完整命令见本次交付。

### 2026-07-10 ERP SQL semantic runtime guard

- 背景：semantic family 判定仅在 golden runner 事后执行，模板分支还会伪造 `guardResult.valid=true` 并信任历史 `guard_passed`，导致错 family 或模板渲染后的失效 SQL 可能先返回/执行。
- 实现：新增生产 `SqlRuntimeGuardService`，把 golden family/metric 映射下沉为共享语义门禁；approved template、composite/atomic composer、rule、LLM fallback 在返回或执行前统一校验 expected/actual family/metric 和当前 schema。模板按参数渲染并应用访问作用域后实时 guard，dry-run 不再绕过；semantic mismatch、schema invalid、repair 失败统一对外 `sql=""`，内部 trace 保留受保护 candidate SQL/hash 与语义审计字段。语义匹配的低置信 estimate 保留执行能力并明确仅供参考。
- 契约：新增 `semanticStatus=exact|estimate|semantic_mismatch`；mismatch 与 estimate 严格分离，前者 executor 调用为 0。更新 ERP SQL API、finance metric 和 reference retrieval 文档。
- 验证：ERP SQL 全量 265 项测试通过；`npx tsc -p apps/server/tsconfig.json --noEmit`、`git diff --check` 通过。

### 2026-07-10 ERP SQL Deadline、取消、容量保护与回滚开关

- 背景：`/agentRuntime/run` 的 HTTP 断连、服务端总 deadline 与 ERP SQL 各阶段没有形成统一取消链；旧 limiter 的排队任务只能等前序释放，ERP HTTP 也没有独立队列上限，reference 软超时会留下不可见后台工作。
- 实现：新增共享 abort/deadline 与可取消有界 limiter；signal 贯穿 Agent Runtime、legacy/Mastra handler、intent/analysis、Prisma/schema/reference、guard/repair、template/generated executor 和 ERP HTTP。ERP HTTP 使用独立并发池并在队列满时稳定返回 429/Agent 软失败；`/health` 暴露 query pool 和 detached reference 指标；LLM/阶段错误记录 `not_sent`、`queued`、`request_sent`、`first_token_slow`、`stream_slow`、`guard/repair_slow`、`erp_query_slow`、`aborted`。
- 回滚：保留 generated SQL 的 `ERP_SQL_AGENT_EXECUTE_GENERATED_SQL=false`，新增 approved template 全局开关及 family/template id 局部 kill switch；补齐 README、`.env.example`、API、reference 隔离说明和独立运维/SLO 文档。
- 决策：当前 Prisma 不可靠支持单查询硬取消；已发出的 reference 查询作为有界共享 cache work 隔离并跟踪到 settle，排队与调用方等待仍立即取消。未新增队列依赖或数据库结构。触达既有 500+ 行 workflow/tool/repository 仅接入 signal、timeout 和观测，不做并发线程之外的拆分重构。
- 验证：`npx tsc -p apps/server/tsconfig.json --noEmit` 通过；deadline/断连、limiter、ERP query、reference、template kill switch、LLM repair、Mastra/legacy 定向测试通过；`git diff --check` 通过。

### 2026-07-10 ERP SQL/LLM 审计写入容量优化

- 背景：ERP SQL trace 每次查询约 5 次同步写，LLM 日志又绕过 Prisma 重查询限流，高并发时可能堆积并争抢连接池。
- 实现：trace 中间快照改为请求内合并，成功路径降为 create + terminal update 两次写，失败/取消立即写终态且 `finish` 不重复；trace 和 LLM 日志接入共享 `AUDIT_DB_CONCURRENCY` / `AUDIT_DB_MAX_QUEUE` 有限队列，并在 `/health.erpSql.auditDb` 暴露容量指标。
- 决策：复用现有并发限制器，不引入消息队列；队列满时保持查询可用并产生明确审计降级，后续只有在跨进程吞吐不足时再引入独立审计 worker。
- 验证：针对性 trace/审计测试、TypeScript `--noEmit`、Prisma validate、`git diff --check`。

### 2026-07-10 ERP SQL 权限、数据范围与敏感字段保护

- 背景：`/agentRuntime/*` 原有登录和 session owner 不能限制 ERP Company、业务模块、组织/客户行范围和敏感字段，需要在 template、metric、LLM SQL 与最终执行之间形成不可由请求或 prompt 放宽的授权闭环。
- 实现：复用 identity `permissionService` 增加 ERP SQL query 与三类敏感字段权限；新增按 identity user id 解析的 fail-closed access policy，将服务端 scope 注入 Runtime handler、模板参数、atomic/composite composer、生成/runtime guard 和 executor；每个 `Erp.*` source 强制 Company 派生表范围，具体部门/事业部/客户字段无法验证时拒绝；返回 rows 在 narrator 前按财务、客户、员工/报工分类脱敏并输出结构化 access audit。
- 决策：当前组织主数据不足，不新增猜测性的数据库映射表，先使用 `ERP_SQL_ACCESS_POLICY_JSON` 明确配置；Company 不允许隐式全量，其他行范围只有显式 `"*"` 才表示全范围。管理员不绕过数据范围。
- 影响：旧 ERP SQL 调用方必须应用 migration、授权 `agent.erp-sql:query` 并配置用户范围；非 ERP Agent Runtime 不变。真实企微部门到 ERP Department/Division、销售账号到 `CustNum` 的权威映射仍待组织/ERP 管理方提供。
- 验证：`npx tsc -p apps/server/tsconfig.json --noEmit`、`npm run prisma:validate`、`git diff --check` 通过；policy、Runtime handler、legacy service、template、session search 共 56 项 targeted tests 全通过。完整 `mastraErpSqlAgent.test.ts` 为 47/51，剩余 4 项是同工作树并行 semantic runtime guard 将旧 estimate 改为 `semantic_mismatch`、新增 `validateSqlRuntime` trace 后的既有断言未同步，不涉及本次 access policy 路径。
- 部署：已在当前 `DATABASE_URL` 执行 `prisma migrate deploy`，成功应用 `20260710040000_erp_sql_access_permissions` 和同批 additive 审计迁移；`prisma migrate status` 显示数据库已最新，四项 `agent.erp-sql*` 权限均启用。现有 `/admin/employees` 权限页动态读取权限表，迁移后无需新增 UI 即可编辑角色授权和员工 allow/deny；前端全量构建因工作树缺少 React/Vite 等 web 依赖而未完成。

### 2026-07-10 ERP SQL 强制审计、数据保护与 LLM 日志治理

- 背景：ERP SQL trace、Agent runtime 和 LLM 日志会默认保存真实问题、SQL、参数、rows 或 stack，ResultNarrator 还会向外部模型发送最多 50 行 ERP 数据，不能满足生产审计和 DLP 边界。
- 实现：新增集中式审计脱敏策略；trace 默认开启并记录 actor/session/run/权限 scope、模板/metric/schema 版本、实际 SQL hash、guard/semantic、终态、行数/截断/耗时/错误分类及 `AUDIT_DEGRADED`；模板参数改存类型和值 hash；LLM/tool-call/message 普通日志不再保存 rows、敏感 prompt/output 或 stack；ResultNarrator 默认不外发，受信任双开关开启后也只发送字段类别和聚合；新增最小 additive migration 与 retention 只读报告。
- 决策：不实现应用自动删除，避免误删审计证据；真实清理由 DBA 根据 dry-run 报告审批执行。原始负载只保留显式受控 opt-in，常规生产保持关闭。
- 验证：针对性 node tests、Prisma validate、TypeScript `--noEmit`、`git diff --check`（见本次交付结果）。

### 2026-07-10 ERP SQL 报价/库存/工单物料/报工 family 快路径修复

- 背景：四组 golden 基线分别为 quotation `14/20`、inventory `12/20`、job material/BOM `6/20`、operation/labor `6/20`；主要失败是 `family_016/031/089` 跨语义抢命中，以及缺少 `family_050/076/092` 可执行模板、`family_014/092` 使用不可靠字段。
- 实现：集中收敛 executable template boost/conflict 规则；报价配置分别强化 `family_008/080`，普通库存固定走 `family_027/050`、安全库存和库龄呆滞才走 `family_089`，工单缺料走 `family_076`、研发工单物料走 `family_086`，报工明细走 `family_092`、班组资源组字典走 `family_014`。新增 migration 落地 `family_050/076/092` 模板并替换 `family_014`，退役旧 `family_092` 资源组模板；规则 slot 补合同号、仓库、资源组、缺料和库龄天数。
- 决策：`family_089` 不扩成普通库存等价 family；golden 现有语义划分正确。报工字典使用 `LaborDtl + JCDept` 的已报工资源组，明确不使用 `QiMoJob/ResourceGroup`；真实执行发现 schema metadata 中的 `LaborDtl.ResourceDesc/EmployeeName` 不是物理 SQL 列，已从最终模板删除。`SqlTemplateRepository.ts` 是既有 500+ 行共享仓储，本次只改集中式打分表和冲突函数，不做无关拆分以免扩大风险。
- 验证：4 个新/替换模板均通过 `SqlTemplateGuardService`，并经 `/erp/query` `TOP 3` 真实执行成功；四类共 80 条真实 DB/LLM golden 最终均 `20/20`，全部走 template fast path、`guardErrors=0`。`node --test --import tsx` 定向 68 个测试、`npm run build:server`、`git diff --check` 通过。

### 2026-07-10 ERP SQL golden family 最小模板落地

- 背景：ERP SQL golden 缺 `family_008/080/049/053/059/100` approved executable template，`family_089` 缺库龄/呆滞库存口径；真实 ERP 验证后需要先落最小可执行模板。
- 实现：新增 migration upsert 8 个 approved executable templates，覆盖 JCJDY 报价/配置外部库、采购订单金额、生产入库成本明细、费用总账明细、供应商总账余额、库存库龄呆滞、订单销售成本毛利；修复 `SqlTemplateExecutionService` 对 `@param` 的执行时渲染，适配当前 `/erp/query` 代理不声明 SQL Server 标量变量的行为。
- 决策：不新增 approved metric；采购金额、费用/余额、成本聚合、库龄 FIFO、订单/发票毛利仍保留人工确认口径。`family_100` 毛利模板按 `OrderDtl.PartNum + OrderHed.OrderDate` 取 `dbo.QiMoDanJia` 月度单位成本，只作为决策支持明细。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts` 通过；使用 `env CODEX_SANDBOX_NETWORK_DISABLED=0` 应用 migration 并通过现有 `SqlTemplateExecutionService` 对模板 id 59-66 跑 `/erp/query`，每个模板 `TOP 3` 均返回真实 ERP 样本。

### 2026-07-10 更新审查修复

- 背景：审查今日/昨日更新后发现 JDY workflow 可代传 username、采购申请权限和截断提示不足、ERP SQL 财务引用混入历史 reference，以及 strict 财务降级 estimate 行为与文档不一致。
- 实现：JDY workflow 非管理员 username 限制为登录态 `wecomUserId`；采购申请路由接入权限码，查询探测第 501 行并返回截断 warning，行合并改用 Map 聚合；ERP SQL 旧 service 在有 approved metric 时只传 metric reference；Mastra 财务文档改为说明缺 approved 口径时降级 estimate 并提示数据可能有误；删除误入版本库的 `tmp/erp-sql-golden-20260709-batched.jsonl`。
- 决策：保留用户要求的财务 strict 展示数据行为，不恢复硬阻断；采购申请暂不做完整前端分页，只先避免静默漏数。
- 验证：`npm run build:server`、`git diff --check`、`node --test --import tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts`、`node --test --import tsx apps/server/test/purchaseApply/purchaseApplyService.test.ts` 通过；`npm test` 剩余 1 个真实库用例因沙盒/网络无法连接 `hz.jc-times.com:5433`。

### 2026-07-10 ERP SQL finance metric reference 收敛

- 背景：`finance_cost_margin` 剩余失败里，费用统计、供应商余额、采购金额等严格财务题会检索到生产成本/回款延迟等无关 approved metric，污染 fallback prompt 并形成 misleading `semantic_mismatch`。
- 实现：finance approved metric 候选按 family 词面设最小门槛，`family_049` 只吃采购金额/采购中心类，`family_053` 只吃费用/余额类，`family_059` 只吃成本类，`family_100` 只吃毛利/销售金额类；reference tool 再做同样兜底过滤；golden metric 等价补充 `purchase_amount -> family_049`、毛利/销售额 metric -> `family_100`。
- 决策：不新增未审批费用/余额/采购金额 metric；没有正确 approved metric/template 时保持 `blocked_missing_metric`，不让 LLM 猜财务 SQL。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/goldenSqlGeneration.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts`、`npm run build:server` 通过；“查供应商某某当前余额”“查采购中心管理看板金额”不再带无关成本/回款 metric，快速阻断为缺 approved metric；“哪些订单成本异常偏高”仍走 atomic metric composer 并生成 ok。

### 2026-07-10 ERP SQL 生产并发保护

- 背景：生产并发不能让外部 LLM、schema guard、reference 大查询和轻量模板/schema/log 写入互相挤占，避免高峰下把轻量查询拖慢。
- 实现：API 启动时按 `LLM_CONCURRENCY_LIMIT`、`ERP_SQL_DB_CONCURRENCY`、`ERP_SQL_GUARD_CONCURRENCY` 配置三层限流；approved SQL template rows 增加 60s 进程内 TTL cache，模板写操作后清缓存；补充 `.env.example` 和 README 环境变量说明。
- 决策：不上 Redis/队列框架；先用进程内缓存和已有 limiter，生产多副本共享缓存等有真实压力指标后再加。
- 验证：`npm run build:server` 通过；`node --test --import tsx` 分别运行 `mastraErpSqlAgent.test.ts`、`sqlDatasetReferenceSearch.test.ts`、`goldenSqlGenerationConcurrency.test.ts`、`llmSqlGenerator.test.ts` 均通过。

### 2026-07-10 ERP SQL golden semantic_mismatch 收敛

- 背景：全量外部 LLM golden 186 题中 `semantic_mismatch` 97 条，主要集中在库存、生产工序、工单物料、报工/工序字典、报价配置和财务成本毛利；其中一批是 SQL 已生成但 fallback/rule 没有 reference family，另一批是 `family_016`/`family_031`/`family_062` approved 模板跨业务抢命中。
- 实现：golden semantic 判定允许无 reference 的 fallback/rule SQL 按当前 businessType 接受对应 expected family；atomic 成本指标等价接受 `family_059`；模板候选增加报价/配置、财务、BOM/ECO、报工、工序字典、资源组等跨域冲突门槛，避免 016/031/062 抢非本业务问题。
- 决策：不把有明确错误 reference 的 fallback SQL 强行判 ok；报价配置和财务费用/余额仍需要正确 approved reference/template/metric 后再放行。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/goldenSqlGeneration.test.ts`、`npm run build:server` 通过；静态重分类原 97 条中 57 条可由 semantic 接受规则消除；目标样例“查合同号 HT20260001 的产品报价”不再命中 template 4；“查研发工单料费和加工费”转 ok；“物料 ABC123 的 BOM 有哪些子件”命中 family_006 template；`finance_cost_margin` 20 条复跑为 3 ok、17 个真实 no_sql/schema_guard/semantic 剩余。

### 2026-07-10 ERP SQL golden no_sql 软阻断与 atomic guard 修复

- 背景：全量外部 LLM golden 186 题中 13 条 `no_sql`，混有 atomic metric guard 误拦、严格财务无 approved 口径仍走慢 LLM fallback、以及缺维度表达式后继续生成无效 SQL。
- 实现：rule generator 固定输出 `TOP`；finance guard 复用 approved metric `definition_json` 判断金额/状态/时间口径；workflow 在严格财务无 approved metric/template 或 atomic composer 明确缺维度时直接 `blocked_missing_metric`，不再返回 invalid SQL。
- 决策：不新增未审批财务模板/指标；费用统计、供应商余额、事业部/销售员维度仍需要人工补 approved metric/template/维度表达式后才能生成精确 SQL。
- 验证：`npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` 通过；重跑原 13 条 no_sql 子集后 3 条转 `ok`，2 条转 `semantic_mismatch` 且 SQL 通过 schema guard，8 条为合理无 SQL 软阻断/反问。

### 2026-07-10 ERP SQL golden 速度计时拆分

- 背景：全量 speed JSONL 中 `find_sql_template` 外层 wall-clock 约 13s，但直接调用只有几十到百毫秒，主要是 Prisma 全局 DB limiter 排队造成误报。
- 实现：`findSqlTemplate` 输出 `db_query/scoring_sort` 分段计时并在 golden summary 展示；Prisma 全局 limiter 放行 LLM 日志、approved template 和 schema metadata 轻量读写，保留 `$queryRaw` 等重查询限流；reference lookup 默认软超时从 5000ms 降到 2500ms；LLM 日志 finish/progress 等待实际落库，避免脚本退出留下 pending。
- 决策：不改语义规则、不改模板/指标评分、不新增依赖；fallback generator 早停只复用现有 AbortSignal 和 LLM log metrics 观察，暂不加新生成策略。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts apps/server/test/erpSqlAgent/goldenSqlGenerationConcurrency.test.ts`、`npm run build:server` 通过；真实 DB/LLM `--per-type --llm-concurrency=8 --db-concurrency=2 --guard-concurrency=2` 子集 9 题 avg 12.9s、p50 4.6s、p95 31.8s。

### 2026-07-10 ERP SQL golden timeout 收敛

- 背景：全量外部 LLM golden 中 `查 OpMaster 工序资料`、`产品配置合同号 HT20260002 对应什么配置` 在 `generate_sql` 阶段触发 120s `case_timeout`。
- 实现：模板评分为 `family_038` 工序字典和 `family_080` 产品配置合同问法补最小 boost，使已有 approved template 快路径优先命中；fallback generator 在 `AbortSignal` 已取消时不再吞掉 LLM abort 去跑 rule fallback，LLM repair 前也检查取消；报价/产品配置外部库没有 approved executable schema 时直接阻断，避免 LLM 猜外部表。
- 决策：不新增模板、不改 DB、不重构 workflow；继续复用现有 `llm_call_logs` stream metrics 和 golden `toolTimings` 观察。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/fallbackSqlGenerator.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`、`npm run build:server` 通过；真实 DB/LLM 下 `查 OpMaster 工序资料` 从 120009ms timeout 变为 5149ms template 快路径，`产品配置合同号 HT20260002 对应什么配置` 从 119992ms timeout 变为 5319ms 软阻断且 `generate_sql` 1ms；operation_master 小子集 7 条无 runtime_error，quotation config 小子集无 runtime_error，漏网的“报价单里某合同的配置内容”从 47900ms LLM fallback 变为 2971ms 软阻断。

### 2026-07-10 ERP SQL 发货通知模板语义修复

- 背景：`sales_order_shipping` 中“发货通知里订单 40003 的明细”命中 approved template 快路径但被 `family_016` 销售订单明细模板抢分，golden 报 `semantic_mismatch`。
- 实现：在模板评分冲突规则中要求发货通知/待发/欠发类问题只能匹配含 `OrderRel`、`OpenRelease`、`OurReqQty` 或发货语义的模板；新增真实模板评分回归测试。
- 验证：目标两条 golden 均命中 templateId 5 / `family_037` 且 schema guard 无错误；`sales_order_shipping` 20 条 golden 全部 ok。

### 2026-07-10 ERP SQL reference 检索耗时优化

- 背景：`sales_order_shipping` fallback 题的 `find_sql_reference` 曾耗时 7-14s，需要区分 DB、embedding、Node scoring 和 cache，并避免 reference 检索拖死后续 SQL fallback。
- 实现：`SqlTemplateRepository` 为 dataset/family/metric reference lookup 增加 cache hit/miss、DB query、embedding query、scoring/sort、total/soft timeout 分段计时；默认未启用 `ERP_SQL_REFERENCE_QUERY_EMBEDDING` 时不再查询 `embedding_vector_json`；reference lookup 增加默认 5000ms 软超时，online query embedding 增加默认 1200ms 超时；golden runner 的 `find_sql_reference` summary 输出分段计时。
- 决策：不改 reference scoring 语义、不新增索引和依赖；DB 诊断证明慢点主要是默认路径搬运 600 行 embedding JSON，而不是 Node 内存排序。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts`、`npm run build:server` 通过；真实 DB/LLM 下 `查销售订单 20001 的产品明细` reference 从诊断前约 3.50s 降到 0.41s，用户点名的 4 个销售 reference 轻量诊断为 0.39-0.49s。

### 2026-07-10 ERP SQL 销售高频模板快路径

- 背景：`sales_order_shipping` golden 高频销售订单/发货通知问题大量落到 fallback，慢点集中在 `find_sql_reference` 和 `generate_sql`，且 LLM 曾猜出不存在的 `OrderRel.DueDate`、`OrderDtl.OurShipQty`。
- 实现：新增 migration `20260710010000_sales_order_shipping_templates`，按现有 family_016/family_037 模板 SQL upsert 两个 approved/guard_passed executable template；模板只使用已在代码和 metric 中验证的 `OrderHed + OrderDtl`、`OrderRel.ReqDate`、`OrderRel.OurReqQty` 等字段。运行时在现有 `scoreTemplate` 中给销售订单明细和发货通知/待发货问法加 family boost，并在 Mastra/legacy slot helper 中规则补齐订单号、客户名、待发货开关。
- 决策：不新增独立 sales agent，不绕过 `SqlTemplateExecutionService`；共享真实库尚未应用本 migration，`prisma migrate deploy` 会应用所有 pending migrations，自动审批拒绝后未继续写库。
- 验证：`npx tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts apps/server/test/erpSqlAgent/goldenSqlGeneration.test.ts apps/server/test/erpSqlAgent/sqlTemplates.test.ts` 60 项通过；`npm run build:server`、`npm run prisma:validate` 通过。真实 DB/LLM 下未应用 migration 的 `sales_order_shipping` golden 为 17/20 通过、3 个 `semantic_mismatch`，失败题仍显示 `template candidates=0/selected=none`，证明剩余瓶颈是真实库缺少 sales approved templates。
- 后续：需要人工明确批准只应用 `20260710010000_sales_order_shipping_templates` 到共享 DB 后复跑 golden；不要用整库 `prisma migrate deploy` 顺手应用其它 pending migrations。

### 2026-07-09 ERP SQL golden family_062 快路径

- 背景：`purchase_delivery` golden 没有 executable template 候选，供应商未到货等问题落到慢 LLM fallback；`sales_order_shipping` 已用 approved open shipping atomic metric 生成有效 SQL，但 golden 语义仍要求 `family_037`。
- 实现：新增迁移 `20260709060000_purchase_delivery_template` 写入并审批 `family_062` 单 SELECT/TOP 模板，覆盖 POHeader/PODetail/PORel/RcvDtl/Vendor/PurAgent、打开采购单/打开行/审批/未收齐过滤；运行时模板评分只给 `family_062` 增加采购到货和日期问法 boost；模板执行服务补齐 omitted optional 参数默认绑定，避免真实执行时缺少 optional 参数；golden semantic 判定允许 `family_037` 由 approved `open_shipping_amount/open_shipping_qty` metric 等价通过；DeepSeek thinking 参数改为请求体顶层字段，确保 intent/analysis 默认关闭思考，只有 fallback SQL generator 显式启用。
- 验证：`npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplates.test.ts apps/server/test/erpSqlAgent/goldenSqlGeneration.test.ts`、`node --test --import tsx apps/server/test/llm/deepseekClient.test.ts` 通过；真实 DB/LLM 下 `purchase_delivery` 20 条 golden 全部 `template_fast_path_selected`，销售待发货 atomic metric 不再 `semantic_mismatch`，库存、工单和复合题指定样例保持通过；开启 `--llm-call-log --llm-progress` 复测供应商未到货样例，总耗时约 4.6s，intent/analysis 最新日志无 `reasoning_length/reasoning_chunk_count`。
- 后续：family_062 当前仍是明细口径，按供应商汇总类问法先返回可汇总明细；日期范围来自 intent slot 时可继续细化 from/to 映射。

### 2026-07-09 ERP SQL reference 热路径优化

- 背景：fallback golden 中 `find_sql_reference` 首查仍耗时约 25-38s，主要卡在 dataset reference 全量拉取和在线 query embedding。
- 实现：reference 查询改为 metric/dataset/family 并行；repository 增加 10 分钟、最多 200 条的进程内 promise cache；dataset reference 有 module 时在 SQL 层粗过滤并限 600 行；在线 query embedding 默认关闭，仅 `ERP_SQL_REFERENCE_QUERY_EMBEDDING=1` 时启用；DeepSeek stream metrics 增加 `reasoning_chunk_count/reasoning_length`，区分 thinking-only 与正文输出慢。
- 验证：`npm run build:server`、`npx tsx --test apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts` 通过；真实 DB 直测供应商未到货 reference 首查约 3.7s，同进程第二次缓存命中 0ms。

### 2026-07-09 ERP SQL LLM fallback 可观测与取消

- 背景：高并发 golden case timeout 后底层 LLM/workflow 仍可能继续跑，且 DeepSeek stream 结束前看不到排队、首 chunk、持续输出和完成状态。
- 实现：复用 `llm_call_logs.output_jsonb.metrics` 记录 queued/started/stream_open/first_chunk_ms/first_content_ms/chunk_count/last_chunk_ms/finish_reason/content_length/latencyMs；DeepSeek 请求接入 `AbortSignal`，LLM limiter 入队后会在发请求前检查 abort；ERP SQL workflow 将 signal 传到 intent、analysis plan 和 fallback SQL generate；golden runner case timeout 会 abort，并新增 `--llm-call-log`、`--llm-progress` 方便实测观察。
- 决策：不新增表结构和依赖；stdout/stderr 只输出脱敏 lifecycle metrics，完整 prompt/output 仍只在原 DB log 内；当前取消边界是 LLM 请求和 workflow step 之间，Prisma 查询、guard、模板检索不能被 AbortSignal 硬中断。
- 验证：`npm run build:server` 通过；`npx tsx --test apps/server/test/erpSqlAgent/goldenSqlGenerationConcurrency.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts` 11 条通过；`npm test -- ...` 的项目包装器会跑全套，当前仍有既有 `sqlDatasetReferenceSearch` 2 条失败（dataset references 0 vs 期望 2/10）。
- 实测：`CODEX_SANDBOX_NETWORK_DISABLED=0` 下外部 DeepSeek + 真实 DB 跑 4 个指定问题，低并发没有 120s 超时；供应商采购未到货 fallback 约 76.9s，适度并发约 66.8s，主要耗时在 `find_sql_reference` 约 30s 和 `generate_sql` 约 19-32s；库存和复合题走模板/atomic metric 快路径，约 3-11s；订单待发货走 atomic metric 快路径但 golden 期望仍是 `family_037`，结果为 semantic_mismatch。

### 2026-07-09 ERP SQL golden 快路径诊断

- 背景：高并发 golden 中 purchase_delivery、sales_order_shipping、inventory_material、production_task_progress 出现成批 timeout，需要区分“没有快路径”和“快路径命中但结果/判定有问题”。
- 实现：`erp-sql-agent:golden-sql` 结果新增 `fastPathDiagnosis` 和 `toolTimings`，记录 template/metric/fallback 分支命中、tool 耗时、候选数、reference 数、生成来源；timeout 时也保留已开始但未完成的 step。
- 验证：运行 `npm run build:server` 通过；外部 LLM/DB 复测采购到货、销售待发、库存、生产进度和复合决策样例，能分别识别 `no_template_fast_path_then_llm_fallback`、`metric_fast_path_selected`、`template_fast_path_selected`。

### 2026-07-09 Approved metric catalog 字段审计

- 背景：approved metric 曾出现产品维度引用不存在字段的问题，需要系统性核查 catalog 定义，避免 golden SQL 继续被错误指标授权。
- 实现：扩展 `erp-sql-agent:audit-approved-metrics` 为只读 dry-run 审计，扫描 approved metric 的 `definition_json`、core/required tables、join、维度/金额/时间/status 表达式中的 `Table.Field`，通过 schema metadata 校验表字段；invalid 项才检索 SQL reference 候选证据，并输出 JSON/Markdown 报告。
- 决策：不写数据库、不自动修复 approved metric；不把 `representative_sql` 当 catalog 契约扫描，避免历史样例 SQL 噪声。
- 验证：运行 `npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/approvedMetricAudit.test.ts`、`CODEX_SANDBOX_NETWORK_DISABLED=0 npm run erp-sql-agent:audit-approved-metrics -- --out=tmp/approved-metric-audit.json --md-out=tmp/approved-metric-audit.md` 通过；当前 19 条 approved metric 未发现 missing table/field。

### 2026-07-09 ERP SQL atomic metric 客户名过滤桥接

- 背景：named customer 趋势 golden 强制走 approved atomic composer 后，旧 `CustNum` 客户维度不能安全按客户名过滤，导致 `blocked_missing_metric`。
- 实现：新增幂等迁移，将销售/毛利/成本/发货/工单/发票回款类 approved atomic metric 的 customer 维度桥接到 `Customer.Name/CustID`，缺少 `Customer` join 的旧定义按 `OrderHed -> Customer` 或 `InvcHead -> Customer` 补齐；workflow 测试 fake metric 同步使用 customer bridge。
- 决策：不改 composer 主逻辑，不新增通用 bridge DSL；仍保留纯 `CustNum` 维度在 named customer 过滤时被阻断。
- 验证：运行 `node --test --import tsx --test-name-pattern "named customer trend with customer bridge|customer product year-over-year|customer name filters" apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts`、`node --test --import tsx apps/server/test/erpSqlAgent/metricComposer.test.ts` 通过；完整组合测试仍有既有 `short-circuits strict finance when required metrics are missing` 断言失败，和本次 customer bridge 路径无关。

### 2026-07-09 移除 InferAIChat LLM 中转

- 背景：ERP SQL/golden 测试和后续 LLM 调用统一使用官方 DeepSeek，不再经过 InferAIChat 中转或依赖 `ANTHROPIC_AUTH_TOKEN`。
- 实现：删除 InferAIChat 客户端和导出，`routedChatClient` 仅保留 DeepSeek/XH 路由，ProductConfigAgent 脚本默认模型改为 `deepseek-v4-flash`，相关架构文档同步。
- 验证：运行 `rg -n "InferAi|InferAI|inferaichat|inferai|ANTHROPIC_AUTH_TOKEN|INFERAI" apps/server/src apps/server/test package.json docs` 无结果；`npm run build:server` 和 ERP SQL 相关 71 条测试通过。

### 2026-07-09 ERP Golden SQL 分层并发 Runner

- 背景：golden question 批量测试用 workflow 级高并发会把 Prisma/schema/template/reference 查询一起放大，导致连接池超时污染 SQL 生成结果。
- 实现：新增无依赖并发 limiter；golden runner 增加 `--db-concurrency`、`--llm-concurrency`、`--guard-concurrency`、`--retry-infra-only`，测试默认 LLM 并发 64、生产默认 128，Prisma/LLM/SQL guard 分别限流，JSONL 改为每次 attempt 落盘并在汇总中区分业务失败和 infra 失败；LLM 调用日志写库改为后台异步写入。
- 决策：不拆 Mastra 单用户 workflow，不新增依赖；批量 runner 显式禁用最终 ERP 执行、模板执行、trace 和 LLM DB 日志。
- 验证：运行 `npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts apps/server/test/erpSqlAgent/goldenSqlGenerationConcurrency.test.ts` 通过；沙箱无真实数据库时 runner 能将数据库不可达归类为 `infra` 并正常汇总退出。
### 2026-07-11 Golden Set 3.3a/3.3b 工作台准备

- 实现：基于 Stage 3.1/3.2 sealed baseline 新增只读证据快照生成、隔离文件型标注存储、盲标/草稿/提交/复核/导出 API 与 `/agent/golden-set` 工作台。
- 决策：未写生产数据库、未启动 worker、未进行人工标注或准确率计算；文件存储只允许单实例试标。
- 验证：160/240 证据守恒并 seal；Prisma generate 后 server/web build；web lint 无 error；`git diff --check`。

### 2026-07-11 ProductConfigAgent Golden Set Stage 3.2 自动质量评测

- 背景：Stage 3.1 已封存空白标注集，但原 evaluator 未核验独立标注文件相对 sealed baseline 的不可变预测，且 macro-F1、运行时 schema 与 package exact match 均有审查缺口。
- 实现：复用既有 Golden Set evaluator/CLI，新增 artifact seal/hash 与逐 sample immutable drift 校验、按 layer 的完整运行时 packet schema 校验，以及 item name、model、peer relation、错误明细与更严格的分层 threshold 状态；macro-F1 现在把有 support 但零命中的类别以 F1=0 纳入平均，package exact match 同时比较 name 和 model。
- 验证：Golden Set 专项回归覆盖 sealed prediction/样本集漂移、schema 非法状态、macro-F1、package exact、合法 uncertainty 与 ERP ranking/abstention；使用当前 sealed 空白集实际执行 evaluator，结果仍为 `awaiting_human_annotation`、两层 coverage 为 0、质量指标为 null。未改 sealed artifacts、字典或生产数据库/ERP，未运行 normalization、refresh、worker/job 或业务 LLM。
- 后续：自动评测能力已完成；160 package 与 240 ERP packet 仍全部 pending，尚未有人工 adjudicated gold，不能声称 accuracy 或 threshold 达标。

### 2026-07-11 ProductConfigAgent Golden Set Stage 3.2 审查回归修复

- 实现：schema 失败的 packet 现只返回结构化 validation errors，不再进入语义解引用；item name exact/normalized 分开比较；`abstain` 从 package evidence 与 ERP abstention correctness 分母排除并分别计数；预测 item role/subtype 扩展为完整未来 baseline 合法范围，JSON Schema 与运行时 schema 同步。
- 验证：专项测试覆盖缺字段不崩溃、名称大小写差异、abstain 分母、component role/non-null subtype，sealed 空白集仍只产生等待人工标注的 null 质量指标。

### 2026-07-10 ProductConfigAgent Golden Set v1 与质量评测基线

- 背景：阶段 2.1 已固定 400 份报价包、648 条产品记录和 ERP 身份总账，但尚无人工 adjudicated truth，不能用规则预测伪造 precision/recall/accuracy。
- 实现：新增只读 Golden Set v1 生成/校验/评测模块和 CLI；固定阶段 2.1 输入 hash、dictionary 1522、抽样 seed、160 个 package packet、matched/ambiguous/unresolved 各 80 的 240 个 ERP packet、JSON Schema、source metadata、sample index、阈值 manifest 和 artifact seal。package 层完整纳入 18 份 no-product-evidence 文档，并覆盖多 item、附件/备件/组件信号、长短 blocks、plan/template proxy 及 GD-E70/0918/091001/P504；ERP 候选 Company + PartNum + 产品名覆盖 284/284。
- 决策：prediction、双人 annotations、adjudication 和 gold 严格分层；允许 insufficient_evidence、legitimate_ambiguity、abstain，不强制唯一主产品或 ERP 匹配。当前质量指标全部为 null，仅报告阶段 2.1 全量预测分布 `99/415/134`、coverage `99/648`；达到 package 120、ERP 180 条 adjudicated gold 后才启用阈值。
- 验证：生成器与完整 packet validator 通过；Golden Set 专项 5 项通过；全量 439 tests、server build 和 `git diff --check` 通过。生产 PostgreSQL 主地址失败后仅在当前进程使用用户提供的 `10.0.0.4` 回退完成 400 份只读元数据快照；ERP 产品名通过现有只读 query client 获取。数据库/ERP写入、字典修改、normalization、refresh、job、worker 和业务 LLM 调用均为 0。
- 后续：两名标注员需复制 sealed packet 独立标注，由复核人 adjudicate 后再运行 evaluator；ERP 身份提升线程只能产生新的 prediction baseline，不得覆盖 v1 seal 或人工 gold。

### 2026-07-10 ProductConfigAgent 阶段 2.1 ERP 身份关联总账

- 背景：固定400份报价包的648条产品族记录需要用ERP身份做只读验收，但输入不是精确item总账，不能按名称相似虚报关联。
- 实现：新增可复用 `runErpIdentityLedgerAudit()` 与只读CLI，复用既有 ERP identity service、matcher、query client 和 ERP taxonomy提示，输出逐产品终态、问题、family冲突、400包汇总及输入快照；相同ERP安全查询合并缓存并串行处理报价包。复核后补充 ERP 群组语义，区分成品产品族、模头半成品和内部固定资产，并降低标题六位编号的证据等级。
- 决策：只有精确 PartNum 或真实 ERP OrderNum 才能形成 matched；标题六位号必须再获 ERP 名称或产品族佐证；名称和 expected ProdCode 只作候选；Company + PartNum 是完整身份，family一致/冲突只对 matched 统计；复合产品号及不能分配给具体item的文档级号码保持 blocker。ERP 后缀仅作检索提示，配套产品可挂在同订单兄弟主号下。
- 验证：固定 product-package-discovery-v3.0 输入只读运行，400 package及648 product row守恒，ERP查询失败0且无订单行重复分配；专项测试、全量测试、server build、diff和脱敏检查见交付说明。未写数据库或ERP，未查询价格/BOM明细，未运行 normalization、refresh、worker、job 或业务LLM。

### 2026-07-10 ProductConfigAgent 可复用 ERP 产品身份关联

- 背景：报价包内多个产品均需独立关联 ERP 产品编号、产品群组、BOM 和后续价格，不能依赖一次性查询或只按名称猜测。
- 实现：扩展现有 ERP identity service，新增报价包批量 `linkPackage()` 和纯一对一 matcher；输出 Company + PartNum、ProdCode/ProdGrup、ClassID/PartClass、BOM存在性、置信度和替代候选，并从 ProductConfigAgent 模块统一导出。
- 决策：Company + PartNum 才是完整身份；同 PartNum 多公司时保持 ambiguous；合同号不冒充 ERP OrderNum；复合编号不作精确 PartNum；ERP 后端不绑定命名参数，因此统一使用严格校验和转义的共享只读 SQL builder。
- 验证：单元测试覆盖空查询拒绝、SQL注入防护、产品包一对一匹配和多公司歧义；server build 通过；使用主 `.env` 真实只读查询成功返回 ProdCode、PartClass 和 BOM存在性。未写 ERP 或生产数据库，未查询 BOM 明细或价格。

### 2026-07-10 ProductConfigAgent reparse-candidates 受控写回

- 背景：用户要求对 `tmp/product-config-excel-reparse-compare/reparse-candidates.tsv` 执行 reparse。
- 实现：新增并运行一次性脚本 `tmp/reparse-candidate-documents.ts`；只处理 TSV 中 `recommendedAction=reparse_blocks` 的 211 个 document，先备份旧 `document_blocks.blocks_json` 到 `tmp/product-config-reparse-candidates-apply/backup-before-reparse-1783677596775.json`，再用当前 `v2` cell-only parser 写回。
- 决策：`manual_review` 和 `restore_file` 不混入本批；成功 parse 才写回，失败保留旧状态。首次运行因缺 blocks 的 document 使用 `update` 停在第 2 条，已改为 `upsert` 后完整重跑；第一次备份 `backup-before-reparse-1783677558469.json` 也保留。
- 验证：211 个候选中写回 209、跳过 2（document `5339`、`24814`，均为 `EMPTY_EXCEL_CONTENT` 且原本缺 blocks/parser version 不为 v2）。对 211 个重跑只读 compare 后，209 个为 `same`，剩余 2 个仍为 `parse_failed`；未触发抽取、归一化、candidate refresh、archive、worker/job 或业务 LLM。

### 2026-07-10 ProductConfigAgent manual_review parser 受控写回

- 背景：用户要求将 parser reparse compare 中的 52 个 `manual_review` 文档都重新 parse，同时保留原 parse 内容。
- 实现：新增并运行一次性脚本 `tmp/reparse-manual-review-documents.ts`；先将 52 个旧 `document_blocks.blocks_json` 备份到 `tmp/product-config-manual-review-reparse/backup-before-reparse-1783677397537.json`，再逐个用当前 `v2` cell-only parser 重跑并更新 `document_blocks`。
- 决策：新版 parser 成功时才写回；15 个 `SANITIZED_CONTENT_QUARANTINED` 文档继续保留旧 blocks，避免把异常/空结果覆盖到数据库。脚本不触发抽取、归一化、candidate refresh、archive、worker/job 或业务 LLM。
- 验证：请求 52、找到 52、写回 37、跳过 15；结果输出到 `tmp/product-config-manual-review-reparse/summary.json` 和 `results.tsv`。抽样运行 `product-config-agent:parser-reparse-compare` 验证 1902、15928、29595 当前 blocks 与新版 parser 相同，仍因 `has_hidden_content` 被标为人工复核风险。

### 2026-07-10 ProductConfigAgent Excel parser reparse compare 总账

- 背景：parser 修复后需要判断是否必须全量重写几万份 blocks，避免盲目 reparse 触发后续抽取、归一化、候选和 archive 大面积漂移。
- 实现：新增只读脚本 `product-config-agent:parser-reparse-compare`，支持 `DOTENV_CONFIG_PATH`、分页 batch、`--limit/--skip/--document-id/--out-dir/--no-files`，拒绝 `--apply`；逐文档用当前 parser 重解析并比较旧/新 block count、`llm_text` hash、diff 类型、风险原因和建议动作。
- 决策：只输出 document id 和结构化原因，不写数据库、不触发抽取/归一化、不启动 worker/job、不调用业务 LLM；`whitespace_only` 默认保留旧 blocks，`content_diff/structure_diff` 才进入 reparse 候选，隐藏内容和 sanitizer quarantine 进入人工复核。
- 验证：先跑 `--limit=20` 和 `--limit=120 --batch-size=50` smoke；随后用主 `.env` 全量只读跑 30,401 份，成功 30,378、失败 23，`success+failed=total`。结果：`keep_existing=30,132`、`reparse_blocks=211`、`manual_review=52`、`restore_file=6`；输出在 `tmp/product-config-excel-reparse-compare/`。
- 后续：先处理 `restore_file` 与 52 个 `manual_review`，再用 `reparse-candidates.tsv` 对 211 个 document 做受控写库 reparse；不要全量覆盖 30,401 份。

### 2026-07-10 ProductConfigAgent Excel parser 质量修复

- 背景：本机与服务器配置单审计发现 parser 输出契约、`.xls` 回退、异常文本、隐藏内容/批注、稀疏 used range 和批量 hash 内存占用存在影响 3 万份抽取稳定性的风险。
- 实现：生产解析链路统一为 `v2` cell-only blocks；显式 row blocks 改为 `row:<sheet>:<row>` 命名避免与 `R1` 等单元格 ID 碰撞；`.xls` direct-first 只读一次并保留 `XLS_CONVERT_FAILED` 错误分类；异常控制字符大面积丢弃时返回 `SANITIZED_CONTENT_QUARANTINED`；批注进入 `comment_text` 和 llm_text，隐藏 sheet/row/col 写入 `source.hidden`，textbox 未映射时显式 `mapping_status: "unmapped"`；workbook 遍历改为只扫真实单元格；相关 SHA-256 改为流式读取。
- 决策：保持既有 cell block ID 和 `v2` 兼容，不引入新 parser 依赖，不自动重解析数据库；row blocks 仅作为显式调试/兼容选项。
- 验证：运行 `node --test --import tsx apps/server/test/productConfigAgent/excelParser.test.ts`，8 项通过；运行 `npm run build:server` 通过。未写数据库、未启动 worker/job、未调用业务 LLM。
- 后续：接入服务器另一半语料前，需要用只读审计脚本对 SMB 全量做 hash 去重和 parser 抽样/全量补测，尤其复核 `.xls` 转换环境、textbox 映射和损坏/密码文件占比。

### 2026-07-10 ProductConfigAgent 报价产品包普查 v3.0

- 背景：业务确认配置表是包含多个平级、可独立销售产品的报价包，不存在必须选择的主产品；板片边界不稳定，膜是成品形态而不是模头产品族。
- 实现：普查输出改为 document package 与多条 product-family 记录；模头产品族分为平模、涂布模头、吹膜圆模，独立保存 board/sheet/board_sheet/film 成品形态；新增 ERP ProdCode 只读映射提示和技术问题池，旧 primary/golden 文件名仅作兼容。
- 决策：多产品共现不再算冲突；组件型名称等待 ERP PartNum/订单行确认，不永久拒绝；厚度和阻流棒只影响配置/价格结构，不覆盖明确板片名称；不要求人工填写 golden 100。
- 验证：固定 dictionary version 1522、as-of 2026-07-10 只读重跑 400 个唯一 document，无 plan 280，未来日期进入 recent 为 0；专项测试、server build、脱敏扫描和 `git diff --check` 结果见本次交付说明。未写数据库、未启动 worker/job、未调用业务 LLM。

### 2026-07-10 ProductConfigAgent product type v1.1 候选确认写入

- 背景：用户确认 `cutting_machine`、`vacuum_box`、`defoaming_system`、`dryer` 都应作为独立产品族写入。
- 实现：创建 4 个 active `product_type` canonical；将真空箱、负压箱、吸附箱及英文对应 alias 从已停用状态迁移并激活到 `vacuum_box`。
- 验证：dry-run 无冲突；写后 4 个 canonical 和 11 个 alias 所属均通过校验，dictionary version 为 `1522`、后台任务为 `0`。仅额外标记 document `28353` 为 dictionary dirty，未运行 refresh、normalization、worker 或业务 LLM。

### 2026-07-10 ProductConfigAgent product type v1.1 字典写入

- 背景：400 份发现样本和后段 446 个 unknown 聚类显示存在中英文/泛化 canonical 重复，以及真空箱类 alias 错误挂在 `air_knife`。
- 实现：基于已验证的 approval package，在单事务中合并 8 个旧 product_type canonical、创建 `drive_system`、`connector` 与高证据 `layer_multiplier`，停用 6 个错误 air_knife alias，并将 409 份受影响 unknown 文档标记为 dictionary dirty。
- 决策：未自动创建 `cutting_machine`、`vacuum_box`、`defoaming_system`、`dryer`；它们仍需人工确认独立配置结构。随后单独修正 air_knife 描述，删除真空箱/负压箱表述。
- 验证：dry-run 15 项动作无冲突；写后 active target/source alias ownership、6 个 alias inactive、dictionary version `1521`、后台任务 `0` 均通过。未运行 refresh、normalization、worker 或业务 LLM。

### 2026-07-10 ProductConfigAgent 全量进度总账

- 背景：约 3 万份 document 的 blocks、抽取、归一化、候选、archive 和 duplicate 状态分散在多张表，且 `document.status` 与 `dictionaryDirty` 可能漂移，不能继续用单一字段统计进度。
- 实现：新增只读进度总账核心和 `product-config-agent:progress-ledger` 脚本；按 document 输出最新 overall extraction 与最新 normalized extraction、archive 关联、duplicate、open candidate occurrence、insert gate readiness、终态和 blocker/warning，并按 document ID 区间汇总为 JSON、TSV 和 Markdown。
- 决策：复用现有 `buildAgentReadyInsertGate` 判定 normalized empty/blocked/partial/full；最新抽取晚于最新 normalized 时显式标记 `needs_reextract`，不让旧 archive 掩盖新抽取；脚本拒绝 `--apply`，不写数据库、不启动 job/worker、不调用业务 LLM。
- 验证：运行 `npm test -- apps/server/test/productConfigAgent/progressLedger.test.ts`，410 项测试全部通过；运行 `npm run build:server`、`git diff --check` 通过。加载主项目 `.env` 后对生产库只读生成 30,402 行 ledger，`stageCounts`、`terminalCounts`、`readinessCounts` 和 bands 均各自合计为 30,402；输出到 `/private/tmp/product-config-progress-ledger`。全程未写数据库、未创建 job/worker、未调用业务 LLM。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave16 最终上下文清理

- 背景：剩余 5 条候选需要回读上下文判断；其中 `原料： 挤出` 是两个文档中的同一误挂 application 片段。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave16-final-context-cleanup.mjs`，复用 ProductConfigAgent review 服务处理 4 个去重动作：`公差` split 到 `lip_flatness=气刀唇口直线度小于0.3mm`；`原料： 挤出` 复用既有 rejected 候选并清理本波重复 pending；`供方设计` move 到 `feed_inlet_size=供方设计`；`模头支架` split 到 `customer_notes` 保存长设计要求。
- 决策：没有为 `模头支架` 新增字段，因为当前字典中没有精确的 die-support/bracket termType；用客户备注保留完整业务文本。`原料： 挤出` 来自适用塑料原料/产量的拆分残片，材料和产量已在归一化上下文中存在，不作为 application 入库。
- 验证：生成 `tmp/codex-doc6050-6099_6550-6599-remaining-wave16-final-context-cleanup-apply-report.json` 和 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave16-final-context-cleanup.tsv/json`；4 个动作覆盖 5 个 occurrence，remaining 为 0，background job delta、ProductConfigAgent LLM delta、global LLM delta 均为 0。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave15 免费配件字段别名

- 背景：review 注释指出 `6591 / unknown_field / 免费配件` 也属于额外送/随机备品备件；回读上下文为 `免费配件 / 按公司标准配置`。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave15-free-accessories-alias.mjs`，将 `免费配件` 作为 term-type candidate approve-as-alias 到 `included_spare_parts`。
- 决策：复用已有文本字段 `included_spare_parts`，不新增字段。
- 验证：wave15 成功 `1` 个动作、失败 `0`、覆盖 `1` 条 occurrence，candidate `7638` 状态为 `approved_alias`，remaining 从 `6` 降至 `5`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave15-free-accessories-alias-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave15-free-accessories-alias.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave14 随机备品备件

- 背景：review 注释指出 `模体加热棒2根，电源线1套，中英文说明书1份。` 与 `免费易损配件配置` 都属于额外送/随机备品备件。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave14-included-spare-parts.mjs`；将 6567 清单拆到 `included_spare_parts`，将 6574 字段名 `免费易损配件配置` approve-as-alias 到 `included_spare_parts`。
- 决策：不拆明细数量到多个字段，当前只把赠送/随附清单归到已有文本字段 `included_spare_parts`。
- 验证：wave14 成功 `2` 个动作、失败 `0`、覆盖 `2` 条 occurrence，candidate `7636` 状态为 `split`，candidate `7637` 状态为 `approved_alias`，remaining 从 `8` 降至 `6`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave14-included-spare-parts-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave14-included-spare-parts.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave13 外堵铣槽式错字别名

- 背景：review 注释指出 `6560 / deckle_type / 外堵铣三个女孩式` 应是错字；回读上下文确认它是 `模头宽度调节方式` 的选中项，同批相同位置多次出现 `外堵铣槽式`。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave13-deckle-typo-alias.mjs`，将 `外堵铣三个女孩式` 作为 `deckle_type` value alias 到 `外堵铣槽式`。
- 决策：不新建异常枚举值；按选项值错字治理为 alias。
- 验证：wave13 成功 `1` 个动作、失败 `0`、覆盖 `1` 条 occurrence，candidate `7635` 状态为 `approved_alias`，remaining 从 `9` 降至 `8`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave13-deckle-typo-alias-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave13-deckle-typo-alias.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave12 模唇结构参考拆分

- 背景：review 注释指出 `6095 / lip_adjustment_method / 整体结构 贴辊设计，参考120273、181442` 是复合字段。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave12-lip-structure-reference-split.mjs`，将其拆为 `lip_adjustment_method=下模整体结构`、`customer_notes=贴辊设计`、`reference_die=120273`、`reference_die=181442`。
- 决策：不把整句作为 `lip_adjustment_method` 枚举；参考编号落 `reference_die`，设计说明落 `customer_notes`。
- 验证：wave12 成功 `1` 个动作、失败 `0`、覆盖 `1` 条 occurrence，candidate `7634` 状态为 `split`，remaining 从 `10` 降至 `9`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave12-lip-structure-reference-split-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave12-lip-structure-reference-split.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave11 风刀材料字段别名

- 背景：review 注释指出 `6096 / unknown_field / 风刀材料` 应是材料字段；回读上下文确认原文为 `风刀材料：铝合金，压强：3750-7000Pa...`。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave11-air-knife-material-field.mjs`，将 `风刀材料` 作为 `term_type` candidate approve-as-alias 到 `product_material`。
- 决策：本波只治理字段别名，不把同一原文中的 `铝合金`、压强和说明文本混拆进当前 candidate。
- 验证：wave11 成功 `1` 个动作、失败 `0`、覆盖 `1` 条 occurrence，candidate `7633` 状态为 `approved_alias`，remaining 从 `11` 降至 `10`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave11-air-knife-material-field-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave11-air-knife-material-field.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave10 电动内堵式

- 背景：review 注释指出 `6563 / deckle_type / 电动内堵式` 不应继续 blocked；回读上下文确认它是 `模头宽度调节方式` 的选中项。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave10-deckle-electric-internal.mjs`，写入/复用真实 candidate 后将 `电动内堵式` 作为 `deckle_type` value alias 到 `internal_electric_screw_deckle`。
- 决策：不创建新的孤立枚举值，复用现有电动内挡类 canonical；remaining 中其它项仍保持 blocked，等待逐条证据确认。
- 验证：wave10 成功 `1` 个动作、失败 `0`、覆盖 `1` 条 occurrence，candidate `7632` 状态为 `approved_alias`，remaining 从 `12` 降至 `11`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、全局 LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave10-deckle-electric-internal-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave10-deckle-electric-internal.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave9 接线参考

- 背景：remaining 中 `与No.190485一样`、`按181078一样接线` 是接线方式参考历史模头，不应作为接线枚举；`无` 是接线方式无。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave9-reference-wiring.mjs`，将两个带编号值拆为 `reference_die` 与 `customer_notes`，将 `无` 拆为 `customer_notes=接线方式无`。
- 决策：不创建 `reference_die=无`，避免污染参考模头字典。
- 验证：wave9 成功 `3` 个去重动作、失败 `0`、覆盖 `3` 条 occurrence，remaining 从 `15` 降至 `12`；真实 pending candidate 仍为 `0`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave9-reference-wiring-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave9-reference-wiring.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave8 单位上下文修正

- 背景：wave6 TSV 中 `capacity=L` 和 `product_effective_width=KG左右每小时` 不应继续作为可执行单位候选保留，需要按上下文修正。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave8-unit-context-fix.mjs`；`L` 按来源 `300 kg/h以下（体积：26-100L）` 拆成 `capacity=300 kg/h以下` 与 `customer_notes=体积：26-100L`；`KG左右每小时` 先 reject 错挂的真实 pending unit candidate，再拆成 `LLDPE`、`流延膜`、`capacity=300-400KG左右每小时`、`process_temperature=230度左右`。
- 决策：仓库字典暂无独立 volume term type，体积信息暂落 `customer_notes`；不把 `KG左右每小时` approve 为宽度单位。
- 验证：wave8 成功 `2` 个去重动作、失败 `0`、覆盖 `3` 条 occurrence，remaining 从 `18` 降至 `15`；真实 pending candidate 降为 `0`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave8-unit-context-fix-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave8-unit-context-fix.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave7 unknown 上下文复核

- 背景：remaining 中 `unknown_field` 需要回读 normalized/extraction 上下文，不能只看候选值。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave7-unknown-context.mjs`，基于上下文把 `A/B/A`、`A/B` 拆为层结构/复合比例，把胶水粘度、线速度/产量/压力、涂布厚度、模唇范围+垫片、客户产量情况、产量残片和安装中心距拆到已有 term type。
- 决策：`风刀材料`、`公差`、`模头支架`、`免费配件` 等缺少精确可复用 term type 或容易污染通用字段，继续 blocked。
- 验证：wave7 成功 `9` 个去重动作、失败 `0`、覆盖 `15` 条 occurrence，remaining 从 `33` 降至 `18`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave7-unknown-context-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave7-unknown-context.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave6 配件数量

- 背景：remaining 中多条 `配件数量`、`配件发货数量` 是空数量字段，业务规则明确空值按 `1` 处理。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave6-accessory-quantity.mjs`，将 `配件数量` 和 `配件发货数量` 拆为 `item_quantity=1套`，写入/复用真实 candidate occurrence 后通过 `productConfigAgentService.reviewCandidate` review。
- 决策：仅处理明确包含“数量”的配件字段；`免费配件`、`免费易损配件配置` 继续 blocked，避免把配置项误当数量。
- 验证：wave6 成功 `2` 个去重动作、失败 `0`、覆盖 `11` 条 occurrence，remaining 从 `44` 降至 `33`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave6-accessory-quantity-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave6-accessory-quantity.tsv/json`。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 wave5 termType cleanup

- 背景：继续按 skill 逐条治理 remaining，重点处理明显错 termType、材料/产量/温度混合、进料口/模唇/辊筒/换网器等可由本地证据确认的候选。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-remaining-wave5-termtype-cleanup.mjs`，先生成 approval 包，再写入/复用真实 `dictionary_candidates` 与 occurrences，并通过 `productConfigAgentService.reviewCandidate` 执行 split、alias、move、reject。
- 决策：不确定项继续 blocked；未把 OCR 可疑值、纯配件数量标签、引用式接线、缺数值字段名强行入库；不执行 refresh、不创建 job、不跑 worker、不调用业务 LLM。
- 验证：wave5 成功 `48` 个去重动作、失败 `0`、覆盖 `58` 条 occurrence，remaining 从 `102` 降至 `44`；`backgroundJobDelta=0`、ProductConfigAgent LLM delta `0`、`businessLlmToken=0`。报告输出到 `tmp/codex-doc6050-6099_6550-6599-remaining-wave5-termtype-cleanup-apply-report.json`，当前 remaining 输出到 `tmp/codex-doc6050-6099_6550-6599-current-remaining-after-wave5-termtype-cleanup.tsv/json`。

### 2026-07-10 ProductConfigAgent ERP identity lookup

- 背景：document `3950` item `5`、`3966` item `3` 因 `missing_item_identity` 无法归档，需要只读 ERP 数据辅助判断 item identity。
- 实现：新增 `ProductConfigErpIdentityLookupService` 和脚本 `product-config-agent:erp-identity-lookup`，复用现有 ERP SQL 查询客户端，按 document/item 上下文或显式产品号、订单号、客户、item 文本查询 ERP 销售订单行候选。
- 决策：不写 ERP、不写 archive、不触发 refresh/job/worker、不调用业务 LLM；价格字段先返回 `price: null`，ERP 配对和价格获取留到后续确认口径。
- 验证：运行 `npm run build:server`；本工作树未配置 `DATABASE_URL` / ERP 查询密钥时，真实 3950/3966 候选查询只能在加载服务端同款环境变量后执行。

### 2026-07-10 ProductConfigAgent doc6050-6099/6550-6599 本地候选治理

- 背景：按本地 dedup proposal 对高置信候选写入真实 candidate 并解决，remaining 只输出 blocked 清单。
- 实现：新增临时脚本 `tmp/apply-doc6050-6099-6550-6599-local-candidates.mjs`，从 dedup TSV 仅处理 `resolved_by_unit_alias_or_number_unit`、`resolved_move_to_lip_thickness_adjustment_range`、`resolved_reject_blank_template`；复用 `reviewCandidatesBatch`、`approveUnitCandidate`、`rejectUnitCandidate` 和 `deleteUnitAlias`。
- 决策：不执行 refresh、不创建 job、不跑 worker、不调用业务 LLM；`L -> kg/h` 复核后判定为体积残片，停用 alias 并追加到 blocked。
- 验证：首批真实 apply 报告 `31` 成功、`0` 失败、`1` blocked，remaining `242`；wave2 追加处理 `10` 个去重动作、`0` 失败，remaining `166`；wave3 拆复合字段/材料产量温度混合 `15` 个去重动作、覆盖 `27` 条 occurrence，remaining `139`；wave4 处理明显错 termType `20` 个去重动作、覆盖 `37` 条 occurrence，remaining `102`。各批均 `backgroundJobDelta=0`，ProductConfigAgent LLM delta 为 `0`，`businessLlmToken=0`；报告输出到 `tmp/codex-doc6050-6099_6550-6599-real-candidates-apply-report.json`、`tmp/codex-doc6050-6099_6550-6599-remaining-wave2-apply-report.json`、`tmp/codex-doc6050-6099_6550-6599-remaining-wave3-composites-apply-report.json` 和 `tmp/codex-doc6050-6099_6550-6599-remaining-wave4-wrong-termtype-apply-report.json`。

### 2026-07-09 清理旧 Jiandaoyun 集成

- 背景：主线已统一使用 `apps/server/src/integration/jdy`，旧 `integration/jiandaoyun` 与新 JDY webhook/workflow 入口并存，容易误用。
- 实现：删除旧 `apps/server/src/integration/jiandaoyun`、对应 `apps/server/test/jiandaoyun` 和 `docs/api/jiandaoyun-open-api.md`，移除 `package.json` 中旧的 `jdy:sync-active-forms` 脚本。
- 决策：保留历史实现记录不改写；运行时继续只挂载 `integration/jdy/routes.ts`。
- 验证：运行 `rg -n "jiandaoyun|Jiandaoyun|jdy:sync-active-forms" package.json apps/server/src apps/server/test docs/api`、`npx tsc -p apps/server/tsconfig.json --noEmit`、`node --test --import tsx apps/server/test/jdy/webhook.test.ts apps/server/test/jdy/workflowOperations.test.ts`。

### 2026-07-09 Agent Runtime 会话搜索

- 背景：ERP Agent 手机端会话抽屉需要搜索全部会话内容，前端当前只能过滤已加载当前页标题。
- 实现：`GET /agentRuntime/sessions` 增加可选 `keyword` 参数；无关键词保持原 Prisma 分页查询，有关键词时用参数化 SQL 搜索会话标题和消息正文，并继续应用用户、agentType、status 和分页过滤；前端会话搜索框改为调用后端分页搜索。
- 决策：不新增接口路径、不新增索引、不做分词/高亮/排序加权；后续数据量变大再评估 trigram 或全文索引。
- 验证：运行 `node --test --import tsx apps/server/test/agentRuntime/sessionSearch.test.ts`、`npm run build:server`、`npm run build:web`。

### 2026-07-09 ERP Agent 前端对话工作台

- 背景：后端 ERP SQL Agent 已完成，需要将 `/agent/chat` 从占位页升级为可用的对话工作台。
- 实现：前端新增 Agent runtime service、页面状态 hook、类型和样式；默认调用 `mastraErpSqlAgent`，支持会话分页、新建/归档、发送问题、展示 SQL/表格/告警/财务口径、工具调用详情和 JSON/CSV 导出；手机端改为对话/会话/结果三段切换的单屏聊天布局。
- 决策：不新增依赖、不改后端接口、不做流式响应和多 agent 切换，复用现有 `/agentRuntime/*` 同步接口。
- 验证：`npm run build:web` 通过；用本机 Chrome headless 检查 `/agent/chat` 桌面和 390px 窄屏布局，页面可渲染，未启动后端时会按预期显示接口 Network Error。
### 2026-07-09 ProductConfigAgent dirty refresh 并发

- 背景：document 200-1000 合并治理后，使用单文档 `runDictionaryDirtyRefresh({ documentId })` 串行刷新 485 个 affected docs 耗时过长，需要先做代码级性能优化，且不调用业务 LLM、不做生产写库验证。
- 实现：`runDictionaryDirtyRefresh` 对批量 extraction 按 `documentId` 去重后使用受控并发刷新，并保留单文档串行行为；API/worker 接通 `concurrency` 参数，服务端限制 1-8；新增单测覆盖并发上限、失败隔离、每 document 最多一次和不创建 `pending_llm_upload` job。
- 决策：不改 archive snapshot/version/items rebuild 语义，避免影响版本审计；本次优化只提高多文档调度吞吐。
- 验证：尝试运行 `node --test --import tsx apps/server/test/productConfigAgent/dictionaryDirtyRefresh.test.ts` 和 `npm run build:server`，当前 worktree 未安装 `node_modules`，分别因缺少 `tsx`/依赖类型失败；`npm install` 长时间无完成输出后已中止，未留下 `node_modules`。

### 2026-07-08 员工资料权限页签

- 背景：员工页面会查看员工各种资料，权限维护应作为员工资料里的 tab，而不是独立权限页面。
- 实现：新增 `/auth/admin/users` 分页员工资料接口；前端将 `/admin/permissions` 收敛为 `/admin/employees` 员工资料页，左侧员工列表服务端分页，右侧使用“基本资料 / 账号角色 / 权限”tab；开发环境无 token 时前端使用 mock-token、后端默认接受 dev mock-token。
- 决策：员工资料查看用 `admin.employees:view`，权限 tab 和权限接口仍用 `admin.permissions:view/update` 控制；暂不做员工资料编辑。
- 验证：`npm run prisma:validate`、`npm run prisma:generate`、`npm run build:server`、`npm run build:web`、`node --test --import tsx apps/server/test/auth/permissionService.test.ts` 通过。

### 2026-07-08 ERP 权限系统

- 背景：后续 ERP 页面需要控制谁能访问页面、谁能执行增删改查和导出审批等操作，Agent 细权限暂缓。
- 实现：在 `identity` schema 新增 permissions、role_permissions、user_permission_overrides；后端 auth 模块新增权限合并、`requirePermission` 和管理接口；`/auth/me` 返回 permissions；前端 store 保存权限并按权限过滤 admin/work 菜单和路由。
- 决策：复用现有 users/roles/user_roles 和 capabilities，`admin` 默认拥有全部启用权限，用户 deny 优先于角色 allow；不做部门、数据范围、字段级权限。
- 验证：`npm run prisma:validate`、`npm run prisma:generate`、`npm run build:server`、`npm run build:web`、`node --test --import tsx apps/server/test/auth/permissionService.test.ts` 通过。

### 2026-07-08 通用表格列交互

- 背景：采购申请等宽表需要 Excel 类基础操作，能力应沉到通用 `Table`，避免每个页面重复实现。
- 实现：共享 `Table` 增加列排序、拖拽换位、拖拽调宽、列菜单隐藏/恢复列、列菜单内手柄拖动排序、列偏好本地记录和重置、单元格自动换行和拖拽时整列虚影；采购申请页移除阻断横向滚动的样式，并保留可见滚动条。
- 决策：暂不引入表格库，使用现有 React 状态和鼠标事件实现基础能力；列菜单入口覆盖在表格右上角，不单独占用一行。
- 验证：运行 `npm run build:web` 通过；在 `/admin/purchase/apply` 验证表头排序、列菜单、横向滚动和单元格换行。

### 2026-07-08 采购申请后端接口契约

- 背景：采购申请页面需要从前端 mock 过渡到 Node 后端，同时真实 Epicor 写操作必须留给 ERP 后端结构化接口处理。
- 实现：新增 `purchaseApply` 后端模块，提供 `/erp/purchase/apply` 查询、`/erp/purchase/apply/preview` 预览和 `/erp/purchase/apply/submit` 占位提交；复用 ERP SQL 查询客户端和现有登录校验；新增采购申请 API 文档。
- 决策：提交接口固定返回 `ERP_WRITE_NOT_CONFIGURED`，不在当前项目内调用 `PoKCCreate` 或拼接 SQL 写 ERP；ERP 后端需提供 preview/order/status 三类接口并支持幂等键。
- 验证：`npm run build:server`、`node --test --import tsx apps/server/test/purchaseApply/purchaseApplyService.test.ts`。

### 2026-07-08 运行端口和 CORS 配置

- 背景：生产和本地开发都按前端 `2035`、后端 `2030` 运行；浏览器侧生产 API 通过 `2031` 的 https 入口访问后端。
- 实现：后端默认 `PORT` 改为 `2030`，前端 dev/preview 和 nginx 样例端口改为 `2035`，前端生产 API 地址改为 `https://hz.jc-times.com:2031/`，后端 CORS 使用 `CORS_ORIGIN` 配置并默认允许对应前端端口；根 `.env` 保持生产值，本地 `.env.dev` 覆盖 localhost 配置。
- 决策：`2030` 是后端 http 监听端口；本地认证旁路改为 `NODE_ENV` 非生产且 `PORT=2030`，避免生产同端口误进 local dev。
- 验证：`npm run build:server`、`npm run build:web` 通过。

### 2026-07-08 简道云开放接口接入

- 背景：公司使用简道云作为数据录入平台，需要在后端统一封装应用、表单、字段、数据、流程和文件开放接口，供后续业务组合接口复用。
- 实现：新增 `apps/server/src/integration/jiandaoyun`，包含 `JiandaoyunClient`、单进程滑动窗口限流器、登录鉴权后的后端代理路由，以及不走登录鉴权但校验 `JDY_WEBHOOK_TOKEN` 签名的 webhook 接收路由；在 `integration` schema 下新增 `jdy_apps`、`jdy_forms`、`jdy_fields`、`jdy_records` 元数据和原始记录池；新增 `npm run jdy:sync-active-forms`，只为有近期数据的表单同步字段；补充 `.env.example`、API 文档和 client/限流/webhook 单元测试。
- 决策：不新增前端 route；文件上传代理先采用 JSON/base64 入参，避免为 multipart 引入新依赖；webhook 接收后快速返回成功，具体业务消费等有明确场景再接；`jdy_records` 不默认收全量历史空表/旧表，只存近期有变更或业务声明需要的表单记录；当前限流保护单进程，横向部署时需补 Redis 或队列层全局限流。
- 验证：运行 `npm run prisma:validate`、`npm run build:server`；运行 `node --test --import tsx apps/server/test/jiandaoyun/jiandaoyunClient.test.ts apps/server/test/jiandaoyun/jiandaoyunRateLimit.test.ts apps/server/test/jiandaoyun/jiandaoyunWebhook.test.ts`；执行简道云活跃表单同步后得到 52 个应用、1594 个表单、1206 个有数据表单、100 个在用表单、1681 个字段，未写入 `jdy_records`。

### 2026-07-08 前端账号密码登录

- 背景：非企微网页登录需要参考 `work-report-frontend` 支持账号密码登录。
- 实现：前端复用已有 `/auth/password/token` 和 `/auth/me`，在 AuthService、AuthStore 和 `/login` 页面接入账号密码登录；非企微未登录时跳转 `/login`，企微环境仍走企微 OAuth。
- 决策：不新增认证协议和依赖，不改后端账号表；`/login?reason=...` 继续用于展示企微登录失败原因。
- 验证：在 `apps/web` 运行 `npm run build` 通过；启动 Vite 后检查 `/login?reason=测试&redirect=/admin`，登录卡片、账号输入、密码输入、登录按钮和企微登录按钮可见。

### 2026-07-08 桌面后台侧栏伸缩

- 背景：ERP 管理后台左侧标签和菜单占用横向空间，采购申请等宽表页面需要更大的内容区。
- 实现：在共享 `DesktopLayout` 增加桌面侧栏收起/展开按钮，侧栏可在 240px 与 64px 间切换；收起时保留图标，内容区左边距同步调整，手机抽屉仍保持展开。
- 验证：在 `apps/web` 运行 `npm run build` 通过；启动 Vite 后检查 `/admin/purchase/apply`，侧栏可收起到 64px、再展开到 240px，无页面横向溢出。

### 2026-07-08 采购申请页面视觉收口

- 背景：首页工作台风格更清爽，采购申请页面因筛选、操作条、表格和明细区直接堆叠，视觉层级偏散。
- 实现：保留现有采购申请业务逻辑，只补页面标题说明、浅色标题壳、筛选/操作/表格/明细卡片阴影和统一浅色表头。
- 验证：在 `apps/web` 运行 `npm run build` 通过；启动 Vite 后检查 `/admin/purchase/apply` 桌面布局，无横向页面溢出。

### 2026-07-08 前端首页工作台

- 背景：前端需要一个类似企业微信应用宫格的首页，承接后续越来越多的页面入口。
- 实现：新增 `/` 首页工作台，按智能辅助、业务管理、移动工作台分类聚合入口；桌面使用居中网页工作台和 4 列紧凑网格，手机使用单列触控卡片；根路由不再直接跳转 `/agent/chat`；补充前端路由分区文档。
- 验证：在 `apps/web` 运行 `npm run build` 通过；启动 Vite 后检查 `/` 桌面和 390px 窄屏布局，无横向溢出。

### 2026-07-08 采购申请前端 mock 页面

- 背景：需要把旧 ERP 采购申请界面的前端操作抽到新的 React 后台页面，先不接真实写库接口。
- 实现：新增 `/admin/purchase/apply` 页面、后台菜单、mock service、筛选区、主表行内编辑、批量到货日期和来源明细/PO/库存联动面板。
- 决策：截图只作为功能参考，不照搬旧 WinForms 样式；保留 service 接口形状，后续替换真实接口即可。
- 验证：在 `apps/web` 运行 `npm run build`。
### 2026-07-10 ProductConfigAgent surface/plating history JSON backfill apply

- 背景：surface/plating 字典已迁到 base termType + `qualifier.area`，但历史 `normalized_extraction_json`、`archive_json`、`fields_json` 仍包含旧 termType，旧 termType 不能在历史引用清零前退役。
- 实现：新增临时 dry-run/backfill 脚本 `tmp/backfill-surface-plating-base-qualifier.ts`，扫描并转换 `extraction_results.normalized_extraction_json`、`contract_archives.archive_json`、`contract_archive_items.fields_json` 中的旧 key/嵌套 `term_type`/内部 `fieldPath`，将其改写为 `plating_type`、`plating_thickness`、`plating_hardness`、`surface_roughness` + area qualifier；同一 base 字段多 area 冲突时保留为数组并记录冲突样本。
- 决策：经用户明确批准后分批写生产历史 JSON/archive；不 refresh、不跑 worker、不建 pending upload job、不调用业务 LLM、不删除或 disable 旧 termType。
- 验证：累计 apply 13 份报告，更新 `extraction_results` 2684 行、`contract_archives` 204 行、`contract_archive_items` 1536 行；最终运行 `node --import tsx tmp/backfill-surface-plating-base-qualifier.ts --limit=20` 只读核验，三张表六个旧 key 引用计数均为 0，`jobDelta=0`，`businessLlmToken=0`；最终报告输出到 `tmp/codex-surface-plating-json-backfill-dry-run-1783615146799.json`。

### 2026-07-09 ProductConfigAgent surface/plating base+qualifier dry-run

- 背景：surface/plating 旧专用 termType 需迁移到 base termType + `qualifier.area`，但生产 normalized/archive JSON 仍有大量旧引用，不能直接删除或 disable。
- 实现：normalization 将表面/流道/外表面镀层字段映射到 `plating_type`、`plating_thickness`、`plating_hardness` + area qualifier；裸 `电镀` 只在 raw text 含明确子字段时拆分；roughness 继续映到 `surface_roughness` + area qualifier，不复活 inactive 专用 roughness termType；生成 dry-run package 后，经用户明确批准执行生产字典 upsert，创建 3 个 base termType、1 个 `surface` qualifier、15 个 value、18 个 value alias，并移动/补齐 10 个字段别名。
- 决策：不 refresh、不创建 job/worker、不调用业务 LLM；不 disable/delete 旧 termType，待历史 JSON/archive backfill 后再退役。
- 验证：运行 `node --test --import tsx apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm run build:server` 通过；apply post-check `jobDelta=0`、旧 termType 仍 active、`businessLlmToken=0`。

### 2026-07-09 ProductConfigAgent doc3000-6000 layer material 结构候选处理

- 背景：doc4218 的 `P1是PVDF母料，P3、P4、P6是配方料，P1、P4是做表面层的，P3是中间层` 被拆成 7 个 `plastic_material` 候选，实际应使用已有 `qualifier.layer` 结构。
- 实现：normalization 复用现有 `split_fields`/`qualifier`/数组合并链路，将该句拆成 `layer_count`、带 `qualifier.layer` 的 `plastic_material` 和 `layer_role`；生产库批量 reject 旧候选 4118-4124，并从剩余 TSV 移除。
- 决策：不批准 P 标签为 material enum，不新增结构模型；不 refresh、不创建 job/worker、不调用业务 LLM。
- 验证：`npm run build:server` 通过；`node apps/server/test/run-tests.mjs apps/server/test/productConfigAgent/extractionNormalization.test.ts` 通过；批量 review 7/7 成功，`jobDelta=0`，`businessLlmToken=0`。

### 2026-07-09 ProductConfigAgent doc3000-6000 deckle 数值候选处理

- 背景：doc3000-6000 剩余 TSV 中 7 条 `deckle_type` 实际是 `模头宽度调节方式` 下的 `2480-2950mm` 数值，不能作为堵边方式 enum 写入。
- 实现：normalization 将 `模头宽度调节方式=<number mm>` 改投到 `堵边调节范围`，并把 `/ 模体、模唇配打冷却孔` 拆成 `堵边详细说明`；生产库批量 reject 7 个旧 pending candidate，并从剩余 TSV 移除。
- 决策：不新增 deckle enum，不把数值写成 enum alias；不 refresh、不创建 job/worker、不调用业务 LLM。
- 验证：`npm run build:server` 通过；`node apps/server/test/run-tests.mjs apps/server/test/productConfigAgent/extractionNormalization.test.ts` 通过；post-check 7 条 candidate 已非 pending，相关 refresh/upload job 为空，`businessLlmToken=0`。

### 2026-07-09 ProductConfigAgent doc3000-6000 unit 噪声候选处理

- 背景：doc3000-6000 剩余 TSV 中 `capacity=30的模头正常产量20kg/h左右` 和 `rotation_speed=10－100)转可调/每分钟` 被误切成 unit candidate，但正确单位 `kg/h`、`rpm`、`转/分钟` alias 已存在。
- 实现：为 `normalizeNumberUnit` 增加小型防线，避免右括号残片和长中文说明进入 unit token；生产库将 unit candidate 91/92 按既有重复拒绝状态标记为 `rejected_duplicate_91/92`，并从剩余 TSV 移除。
- 决策：不把整句或 `)转/分钟`、`的模头正常产量2` 写成 unit alias；不 refresh、不创建 job/worker、不调用业务 LLM。
- 验证：`npm run build:server` 通过；`node apps/server/test/run-tests.mjs apps/server/test/productConfigAgent/numberUnit.test.ts apps/server/test/productConfigAgent/extractionNormalization.test.ts` 通过；生产处理 post-check 显示 91/92 已非 pending，`jobDelta=0`，`businessLlmToken=0`。

### 2026-07-09 ProductConfigAgent doc3000-6000 批量字典写入

- 背景：doc3000-6000 rereview 后有 10 条明确可入库字典候选，需要走批量写入而不是逐条 upsert。
- 实现：新增临时执行脚本 `tmp/apply-doc3000-6000-batch-dictionary-write.mjs`，复用 `reviewCandidatesBatch` 一次批量 review；同时修复 batch alias 新建路径把内部 `item` 引用写入 `reviewResult` 导致循环 JSON 的问题，并补充成功 alias create 的回归测试。
- 决策：只处理 10 条已确认候选；2 条材料人工确认和所有 block 项未写库；不调用业务 LLM、不创建 job/worker、不 refresh。
- 验证：`npm run build:server` 通过；`node apps/server/test/run-tests.mjs apps/server/test/productConfigAgent/dictionaryGovernance.test.ts` 通过；生产 post-check 显示 10 条 candidate 均为 `approved`，`pendingRequested=0`，`jobDelta=0`，`businessLlmToken=0`。

### 2026-07-09 ProductConfigAgent 字典治理 batch 写库优化

- 背景：`reviewCandidatesBatch` 原来逐条调用 `reviewCandidate`，每个 candidate 都重复 find/upsert/update/bump/change log/dirty/invalidate，批量治理时写库放大明显。
- 实现：保留单条 `reviewCandidate` 兼容路径；batch path 改为事务内批量读取 candidates/occurrences，`dictionary_terms` 和 aliases 使用去重 `createMany({ skipDuplicates: true })` 后回查映射，candidate 通过一条 raw SQL `VALUES` update 批量写回，受影响 document 汇总后一次标 dirty，真实字典变更只 bump 一次 version，并用 `createMany` 保留 candidate 级 change log；matcher cache 只 invalidate 一次。
- 决策：不新增依赖、不调用业务 LLM、不创建 job/worker、不 refresh；split/split-suggest/create-term-type/update-kind 仍保守走小循环，主路径 create-value/alias/move/reject/needs-human-review 不再逐条 upsert；触达的 `governance.service.ts` 已超过 500 行，本次为避免扩大风险只做局部 helper，后续可按 batch workflow/helper 拆分。
- 验证：运行 `npm run build:server` 通过；运行 `node apps/server/test/run-tests.mjs apps/server/test/productConfigAgent/dictionaryGovernance.test.ts` 通过（runner 实际执行 server 测试 277 项），覆盖重复 canonical create-value、alias 冲突、move termType、reject 不 bump、candidate unique 冲突转 merged、batch 返回 shape 兼容。

### 2026-07-09 ProductConfigAgent indexed item 拆分

- 背景：同一 item 内存在 `尺寸1/尺寸2`、`重量1/重量2`、`产量1/产量2` 等 indexed 字段时，归一化只会生成数组，无法把多个产品实例拆成独立 item。
- 实现：在 `normalizeExtraction` 的 raw field expansion 之后、field normalization 之前新增 deterministic item split；仅在 indexed 字段至少 2 组且型号主键可按数量对齐时拆分，原 item 保留 instance 1，新 item 分配未占用 `item_index`，公共字段复制，indexed 字段去后缀后进入对应 item，并写 split evidence/warning。
- 决策：不调用业务 LLM、不新增依赖、不改 API；`normalization/index.ts` 已超过 500 行，本次为避免扩大风险只做局部 helper，后续触达更多 normalization 逻辑时再按职责拆分。
- 验证：运行 `node --test --import tsx apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm run build:server` 通过；对 `documentId=1271/extractionResultId=26726/item_index=12` 生成 dry-run 后，仅更新该行 `normalizedExtractionJson`，`background_jobs` 数量 0 -> 0，`businessLlmToken=0`。

### 2026-07-08 ProductConfigAgent document 100-200 residual 6 项修复

- 背景：document 100-200 audit 剩余 14 条 `missing_enum_term`，其中 6 类明确属于材质编号归一、应用/进料噪声、特殊配置错归属、接线方式别名和 45°微调方向治理，要求不调用业务 LLM 并刷新 archive。
- 实现：normalization 对 enum 未命中不再二次解析成 number/unit；补充 `1.2311A`、应用括号清理、长 application 备注噪声、进料方式碎片、唇调节复合拆分、堵边/单边挡拆分、航空插头转接分流、45°微调方向清洗等规则；生产库新增 `wiring_method:customer_drawing_wiring`，并新增 8 条 value alias 后使用现有 `runDictionaryDirtyRefresh` 刷新 document 100-200。
- 决策：不为 `45`、`板材`、`形状`、`进料口`、`类似沥青（客户提供原料）` 等噪声/碎片建 canonical；`45°挤出微调朝下` 归到已有 `extrusion_fine_adjustment_direction:downward`，而不是创建数字枚举。
- 验证：100-200 共 101 份刷新完成，最新 extractionResultId 为 25987-26087，archive item count 230；post-check dirty docs/archives=0、pending candidates=0、duplicate archive=0、唯一索引存在、近 30 分钟 LLM 调用=0；最新 audit `missing_enum_term=0`、termTypeIssue=0、aliasIssue=0、unknownRawField=0、pending=0、businessLlmTokens=0；`prisma:validate`、`build:server`、normalization/dailyMaintenance 测试通过。

### 2026-07-08 ProductConfigAgent document 100-200 复合/噪声 enum 治理

- 背景：document 100-200 term audit 剩余 `missing_enum_term` 中大量是复合值、噪声值或长尾枚举，要求按聚类、normalization 修复、少量字典入库、dirty refresh 和复核顺序处理，且不调用业务 LLM。
- 实现：修正 matcher 的 value kind 来源，优先使用 `dictionary_term_types.value_kind`；补充 enum 清洗和复合拆分规则，丢弃空括号、纯标点、市场类说明、长图纸说明和纯数字方向等噪声；拆分塑料原料/应用/唇调节方式、进料方式/参考模头；生产库新增 13 个稳定 value、7 条稳定 alias，并对 100-200 两轮使用现有 `runDictionaryDirtyRefresh` 刷新 archive；刷新后 16 条新 pending candidate 已按稳定值、噪声或人工复核状态治理。
- 决策：不为长句、尺寸句、互配说明、接线细节或疑似字段归属错误创建 canonical term；这些保留为 reject/needs-human-review 或后续 normalization 专项，避免污染字典。
- 验证：最新 audit `termTypeIssue=0`、alias conflict=0、pending candidate=0、unknown raw field=0，dirty docs/archives 为 0，duplicate archive 为 0，部分唯一索引存在，archive item total 为 230；`missing_enum_term` 从 73 降到 14；`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts` 通过；业务 LLM 调用/token 为 0。
- 后续：剩余 14 条集中在 `1.2311A` 材料归一、流延膜复合应用、进料方式碎片、唇厚度范围和少量接线/加热/堵边长尾值，需要下一轮按字段归属继续拆分，不建议直接批量建 term。

### 2026-07-08 ProductConfigAgent document 100-200 term/termType 审计修复

- 背景：按 document id 100-200 audit 发现 raw 中文字段、trace-only 原始字段、legacy `fastener_type`、字段/值定义不规范和 archive dirty refresh 风险，要求不调用业务 LLM、不创建 job、不跑 worker。
- 实现：补强 normalization，数组形态 `fields` 会转为 raw fields，`original=true`/`split_original_retained` 只作追溯不进最终 fields，拆分电压/功率、塑料原料/应用/产量等复合字段，未选中项丢弃；dirty refresh 的 `promptVersion` 截断到生产字段长度；生产库补齐 15 个 termType 定义、17 条 termType alias、`screw_type=12.9高强度` value/alias、`surface_roughness=A级（0.02-0.03μm）`，并将 `紧固件（螺丝）` legacy alias 改指向 `screw_type`。
- 决策：`number`/`number_unit`/开放文本不强制创建 `dictionary_terms`；明显复合或噪声 enum 值不盲建 canonical，保留在 audit 残留清单供后续按证据拆分或 alias 治理。
- 验证：100-200 共 101 份刷新成功，后续对 14 份 legacy fastener 文档二次刷新成功；最新 audit `termTypeIssue=0`、alias conflict=0、pending candidate=0、unknown raw field=0、dirty docs/archives=0、业务 LLM 调用/token=0；`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts` 通过。
- 后续：audit 仍有 73 条 `missing_enum_term` 和 64 条 term description 建议，多数为复合/噪声或长尾枚举，需下一轮按字段语义拆分后治理，避免批量创建垃圾 canonical。

### 2026-07-08 ProductConfigAgent document 101-200 字典治理与残留刷新

- 背景：继续按 document id 101-200 处理非重复配置表，要求先只读理解和写库计划，获得明确允许后再治理生产库，且不调用业务 LLM、不创建 pending job、不跑 worker。
- 实现：生成 101-200 只读审计、normalization dry-run、写库计划和执行结果到 `tmp/`；生产库治理 47 条 candidate（含 refresh 后再生成的 unknown_field），补齐字段名/单位 alias 和少量明确 termType，创建 34 条 `codex-manual-correction` extraction result，并通过现有 `runDictionaryDirtyRefresh` 串行刷新 archive；为 manual correction 初次形态造成 item 为空的 34 份追加 shape repair correction 后重刷 archive。
- 决策：manual correction 不改旧 extraction row，新建修正 row 后由 dirty refresh 生成最终 archive 引用的 refreshed extraction；文件名只在合并配置表或正文缺失 identity 时作为 document-level 编号证据，并在 warnings/source 中留痕；治理影响到 101-200 外的历史 dirty 文档不在本轮扩大刷新。
- 验证：生产库 101-200 dirty docs/archives 为 0，pending candidates 为 0，missing/zero-item archive 为 0，duplicate archive 为 0，`contract_archives_document_id_unique_not_null` 存在；`npm run prisma:validate`、`npm run build:server`、normalization/dailyMaintenance 测试通过；业务 LLM 调用数和 token 均为 0。
- 后续：全库范围外仍有历史 dirty 文档，留给对应批次或专项 dirty refresh 处理。

### 2026-07-08 ProductConfigAgent document 0-100 字典治理写库

- 背景：按 document 0-100 字典 audit 计划，优先治理缺失 target termType、错误 alias 指向，以及高频且确定的 pending candidate，要求不调用业务 LLM、不创建 job、不跑 worker。
- 实现：生产库创建/补齐 document_info 与 item_identity 依赖的 13 个结构 termType，新增/补齐 17 条高频字段名 alias，处理 21 条计划内 candidate，并修复 3 条 value alias 指向；dirty/archive refresh 中发现旧 extraction 的 `dictionaryVersion=null` 兼容问题后，在 `createExtraction` 入口兜底，并限制按 document 刷新 candidate 时只读取最新 extraction，避免旧 proposal 重新生成 stale pending。
- 决策：候选治理继续走 `dictionaryGovernanceService.reviewCandidatesBatch`，dirty/archive 继续走现有 refresh；本批不创建长尾 termType，不删除 `none/无/NA` placeholder alias。
- 验证：生产库 refresh 后 duplicate archive 为 0，部分唯一索引存在，dirty docs/archives 为 0，计划内 pending candidate 为 0，错误 alias 指向为 0；运行 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts` 通过；业务 LLM token 为 0。
- 后续：`型号`、`开口`、`模头加热分区（模体）`、`模内三流道 A/B/A` 等仍属于长尾或需 qualifier/productType 判定的 pending，留到下一批单独治理。

### 2026-07-08 ProductConfigAgent document 30-100 字典治理与归档刷新

- 背景：继续按 document id 30-100 处理非重复配置表，要求只读理解后再经明确授权写库，且业务 LLM token 必须为 0。
- 实现：生成 30-100 只读审计、normalization dry-run、写库计划和执行结果到 `tmp/`；生产库治理 19 条 pending value candidate，新增/更新 14 条字段名 alias，创建 Codex manual correction extraction 后刷新 dirty archive，并为 document 97 走现有 `archiveDocument` 创建 archive。
- 决策：不调用业务 LLM、不创建 pending job、不跑 worker；candidate 继续走 `dictionaryGovernanceService`，dirty/archive 继续走 `productConfigAgentService`。首次 manual correction 暴露 top-level `items` 形态兼容问题后，追加 shape repair correction，把 top-level items 复制到 `extraction.items` 后重刷 archive。
- 验证：生产库 30-100 archive duplicate 为 0，部分唯一索引存在，dirty docs/archives 为 0，目标 pending candidates 为 0，archive item 均非空，document 97 已归档；运行 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts` 通过；业务 LLM token 为 0。

### 2026-07-08 ProductConfigAgent runtime 接入检查

- 背景：后端已有通用 Agent Runtime，需要确认 ProductConfigAgent agent 已覆盖到默认 runtime 和消息路由。
- 实现：检查 `/productConfigAgent/agent/run` 已经通过 `agentRuntimeService.run` 指向 `productConfigAgent`；补充 ProductConfigAgent runtime 测试，覆盖关键词路由和默认 handler 注册。
- 验证：尝试运行 ProductConfigAgent agent runtime 测试和 `npm run build:server`；当前 worktree 未安装 `node_modules`，测试缺 `@prisma/client`，编译缺 `express`、`@prisma/client`、`@types/node` 等依赖，未完成。

### 2026-07-08 ProductConfigAgent 接下来 20 份配置表 dry-run 与数量归一

- 背景：按 document id 继续处理 document 10-29，要求不调用业务 LLM，只读读取 Excel blocks 与既有 extraction，找出确定性 normalization 问题和候选治理动作。
- 实现：新增只读审计与 dry-run 产物到 `tmp/`，确认本批 20 份非重复配置表的 candidate 状态；补强 `item_quantity` 归一，支持 `壹套`、`十二件` 等中文数量转数字，并把 `共（ ）件` 这类空占位归一为 `null`；生产库按治理预案处理 10 条 pending candidate，并为 doc 16/24/29 创建 Codex manual correction extraction result 后刷新 archive。
- 决策：不调用业务 LLM、不创建 pending job、不跑 worker；candidate governance 复用现有 service；refresh 写 extraction 时按生产库真实字段长度截断 `llm_model`、`prompt_version`、`status`，避免 dirty refresh 后缀顶爆字段。
- 验证：运行 `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm run build:server`、`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate` 通过；生产库 29 个受影响 document refresh 成功，重复 archive 为 0，部分唯一索引存在，目标 candidate 无 pending，业务 LLM token 为 0。

### 2026-07-08 ProductConfigAgent 重复 archive 清理与唯一索引

- 背景：历史归档以 `archive_key` 唯一，同一 document 可因不同 archiveKey 留下多条 archive，检索会命中旧副本或重复副本。
- 实现：生产库按 document 分组保留一条 archive，优先保留 `status=archived` 且 `dirty_reason is null` 的最新记录，删除重复 archive 及其 item、item product binding、version；在底表 `production_config_agent.contract_archives` 创建 `document_id is not null` 的部分唯一索引，并补 SQL migration 固化。
- 决策：`agent.contract_archives` 是兼容 view，索引必须建在 `production_config_agent.contract_archives` 底表；Prisma schema 不能表达 partial unique index，使用 SQL migration 记录。
- 验证：生产库清理前 375 个 document 有重复、需删除 390 条 archive；清理后重复组为 0，索引 `contract_archives_document_id_unique_not_null` 已存在。

### 2026-07-08 ProductConfigAgent 字典刷新与 archive 异常修复

- 背景：生产字典入库后重跑 archive refresh 时，重复 archive 会触发 `(document_id, extraction_result_id)` 唯一约束；同时候选 occurrence 幂等写入和 governance change log 与线上 schema 存在噪声或兼容异常。
- 实现：archive 刷新只更新同 document 的首个/canonical archive，并将重复 archive 标记为 `duplicate_archive_not_refreshed`；dirty refresh 失败时恢复 document dirty 标记；dictionary split 改为按现有 schema find/update/create；change log 写入线上必填字段；candidate occurrence 创建前先查重，避免 Prisma P2002 噪声。
- 决策：不调用业务 LLM、不重新抽取、不创建 pending job、不运行 worker；重复 archive 不强刷，保留 dirtyReason 作为审计线索。
- 验证：生产库对 document 6/7/8 重跑 dictionary dirty refresh 成功，document 4/6/7/8/9 均为 `dictionaryDirty=false`；运行 `npm run prisma:validate`、`npm run prisma:generate`、`npm test -- apps/server/test/productConfigAgent/dictionaryGovernance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过。

### 2026-07-08 ProductConfigAgent 前 5 份配置表归一化修复 dry-run

- 背景：以 document 4/6/7/8/9 为样本，只读比对 Excel blocks 后的既有抽取结果，修复已确认的 normalization 噪声和 qualifier 丢失问题。
- 实现：补强配置字段 qualifier 保留、复合值拆分、非 enum candidate 抑制、`90°阻流棒` 单位误判规避、空 document_info 跳过和合同/订单编号字段边界；生成 dry-run 报告与字典入库预案。
- 决策：单位 alias 匹配继续复用 `DictionaryMatcherService.matchUnit()` / `dictionaryUnitAlias`，规则层只避免误切复合业务文本；本次不调用业务 LLM、不重抽取、不写生产库。
- 验证：运行 `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过。
- 后续：待明确“允许写库”后，按入库预案走现有 candidate governance 审核路径；document 9 的漏抽仍按 extraction issue 处理。

### 2026-07-08 ProductConfigAgent 前 5 条 Excel 配置重解析与比对脚本

- 背景：需要先对既有 Excel 配置（json block）做重解析入库，并对已入库版本与新结果做差异核对。
- 实现：新增 `product-config-agent:reparse-excel-configs` 脚本 `reparseExcelConfigsAndCompare.ts`，批量读取 Excel 文档、强制重解析 block、强制重抽取（固定走 codex token 路由）、落表到 `extraction_results`，并输出 block / extraction / candidate 差异和未入典 termType 预检清单。
- 决策：不新增持久化表，直接复用现有 `extraction_results`、`dictionary_candidates` 与 `dictionary_candidate_occurrences` 作为“每次抽取留痕”依据；保留现有候选治理路径。
- 验证：已补充新脚本命令到 `package.json` 与脚本清单文档；建议先跑 `npm run product-config-agent:reparse-excel-configs -- --limit=5` 做第一批验证。

### 2026-07-08 ProductConfigAgent candidate 噪声归一化

- 背景：生产库 pending candidate 高频项中，`plastic_material=at`、图纸签名空表单、`电磁阀液压站` 等多来自 normalization 未清理包装文本，而非 LLM 抽取本身。
- 实现：在 enum/enums 字典匹配前清理说明外壳、其他/其它前缀、应用领域包装、液压站后缀、图纸状态模板、传感器来源说明、45°安装括号备注和加热相位简称；candidate 入库收集口增加噪声兜底过滤。
- 决策：不把真实缺失字典值硬编码进 normalization；当前生产库 pending/历史 term type candidate 查询为空，详见 `docs/operations/product-config-candidate-top100-audit.md`。
- 验证：运行 `node --test --import tsx apps/server/test/productConfigAgent/extractionNormalization.test.ts apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过；对 top20 样本文档做只读 dry-run，watched 高频旧 candidate 未再生成。
### 2026-07-09 ERP SQL 客户趋势 AnalysisPlan

- 背景：golden dry-run 暴露客户产品趋势问题误拒答、检索未使用拆解结果、LLM 可能猜不存在字段。
- 实现：扩展 `AnalysisPlan` route/assumptions/retrievalHints 等字段；planner 增加客户产品同比趋势、客户销售同比/三年趋势确定性 plan；toolchain 将 retrieval hints 拼进模板/参考检索问题；composer 支持 year bucket、year-over-year 时间过滤和基于 approved customer dimension expression 的客户过滤；输出消息合并默认口径；ERP SQL scope 关键词补齐合同/报价/配置/费用/余额/事业部。
- 决策：继续复用现有 Mastra ERP SQL toolchain、approved atomic metric composer 和 repository，不新增多 Agent 或依赖；产品类型 v1 只映射到现有 product 维度。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts`、`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`、`node --test --import tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`npm run build:server` 通过；`erp-sql-agent:golden-sql -- --per-type` 在本沙箱因 tsx IPC/外部 LLM 数据出口审批限制未执行。
### 2026-07-09 JDY 流程主动操作接口

- 背景：后期需要在系统内主动查询待办/抄送，并提交、回退、转交、加签、撤回、否决、结束或激活 JDY 流程。
- 实现：`JdyClient` 增加流程操作 API 封装；新增受登录态保护的 `/integration/jdy/workflow/*` 后端接口；新增 `integration.jdy_flow_operation_logs` 记录主动操作请求、响应和失败原因；成功操作后 best-effort 同步流程实例与流程日志。
- 决策：暂存不接 JDY 流程接口，继续视为本地草稿能力；查询待办/抄送不写操作日志，只有会改变流程状态的动作写日志。
- 验证：`npm run prisma:validate`、`npm run build:server`、`node --test --import tsx apps/server/test/jdy/webhook.test.ts apps/server/test/jdy/workflowOperations.test.ts` 通过。

### 2026-07-09 JDY Webhook 流程实例落库

- 背景：需要接收简道云数据推送 webhook，并本地保存流程实例当前状态和推送事件轨迹。
- 实现：新增未登录态 `POST /integration/jdy/webhook`，使用 `JDY_WEBHOOK_SECRET` token 鉴权；新增 `integration.jdy_flow_instances` 和 `integration.jdy_flow_instance_events`；复用 `integration.webhook_events` 记录接收、成功和失败状态；配置 `JDY_API_KEY` 时调用 JDY 流程实例信息和流程日志接口，保存审批节点、审批人、意见、附件和动作。
- 决策：流程实例唯一键使用 `data._id`；推送事件和流程日志共用事件表，通过 `event_source` 区分；完整 payload 保留在 `raw_json`/`raw_instance_json`。
- 验证：`npm run prisma:validate`、`npm run build:server`、`node --test --import tsx apps/server/test/jdy/webhook.test.ts` 通过。

### 2026-07-09 ERP SQL 真实 Schema Guard 通过

- 背景：Mastra golden/customer trend 能走到拆解和 composer，但 SQL guard 会拦截 approved metric catalog 里的不存在字段，LLM fallback 在 schema 证据不足时也可能补字段。
- 实现：`MetricComposerService` 增加 approved dimension/time/customer-name 组合前校验；golden runner 输出 SQL-layer report；新增只读 approved metric guard audit 脚本；新增迁移修正销售/毛利相关 approved metric definition，移除 `DocTotalCost`、`ShortChar01/02` 等坏字段依赖。
- 决策：保持 guard 严格；catalog 修复走可审查迁移，不在 composer 里硬编码替换；无 schema 证据时 LLM fallback 返回无 SQL 的软失败。
- 验证：待运行 `node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts`、`npm run build:server`，以及 main `.env` 的 golden/audit dry-run。

### 2026-07-09 ERP SQL 客户趋势强制 Composer

- 背景：真实 golden 复测发现客户同比/产品类型趋势题会因外部 LLM 空返回或 JSON 截断退到弱 LLM/rule fallback，生成不存在字段或漏客户过滤。
- 实现：Mastra analysis planner 增加客户跨年趋势的 deterministic plan，输出 `customer_product_yoy_trend`、年粒度和客户名；atomic composer 支持 year period、year-over-year 时间窗和安全客户名过滤；Mastra workflow 对该 scenario 强制 approved composer，缺 approved metric 时直接 blocked，不再 LLM fallback；Mastra slots 过滤客户名虚词；golden dry-run 改为调用 Mastra workflow，模板和生成 SQL 都不执行，且只把 guard valid 的 SQL 计为 generated；用户可见失败文案改为“口径不确定/可能不准/可走近似分析”，内部 `success/error` 仍保留给系统判断；LLM fallback 遇到 schema missing field/table 会带 guard error 自动重试一次，重试后仍 invalid 时不再把无效 SQL 暴露为最终 SQL。
- 决策：classic `ErpSqlAgentService` 不接新逻辑，后续统一走 Mastra workflow；客户过滤只在 metric definition 明确给出客户名/客户ID表达式时追加，避免把客户名错塞到 Company。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts` 通过 74 项；`npm run build:server` 通过。

### 2026-07-09 ERP SQL Agent 域外拒答

- 背景：ERP SQL Agent 不应回答天气、闲聊等与 ERP Agent 无关的问题，也不能因为“查询”这类宽泛词误路由到 ERP。
- 实现：新增 ERP SQL Agent scope 关键词判断；路由改为只在命中 ERP/SQL/报表/采购/库存/订单/财务等领域词时进入 `erpSqlAgent`；普通 ERP runtime、service 和 Mastra runtime 入口都增加域外拒答兜底。
- 决策：不用额外 LLM 做意图分类，先用可维护的白名单关键词覆盖现有业务表达；客户确认多轮仍保留原状态机。
- 验证：`npm test -- apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`npm run build:server` 通过。

### 2026-07-09 ERP SQL Golden SQL 生成 Dry-run

- 背景：需要按 golden question 类型验证能否生成 SQL，同时避免连接最终 ERP 执行查询，并补充客户年度销售/产品类型趋势类问题。
- 实现：新增 `npm run erp-sql-agent:golden-sql`，复用 `ErpSqlAgentService` 和 golden question JSON，模板命中时使用 dry-run template executor 返回 SQL 模板，不调用最终 ERP；在 `business_decision_composite` 中追加 5 条客户同比、产品类型趋势、三年趋势和毛利影响问题。
- 决策：不新增独立测试框架，继续复用现有 agent service、template repository 和 golden 列表；从 JDY CRM 客户表取真实简称（三环科技、帝龙永孚、中博塑料、精卫科技、扬帆新）覆盖客户趋势 golden。
- 验证：`npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts` 通过；用主线程 `.env` 跑 `erp-sql-agent:golden-sql -- --per-type`，9 类中 7 类生成 SQL、2 类被误拒答；客户类新增问题 5 条均可生成 SQL，但生成结果多为 rule fallback 或引用不存在字段，客户过滤/趋势聚合仍需后续加强。

### 2026-07-09 ERP SQL 客户确认多轮分支

- 背景：客户简称模糊命中多个候选时，需要让用户用“第2个/选二/客户名”继续确认；确认回复本身不是完整业务问题，不能只靠单轮 LLM 理解。
- 实现：ERP SQL agent 在模糊客户返回中增加结构化 `customerClarification`；agent runtime 会继承同一 session 的上一轮 context，并沿用该 session 的 agentType；ERP SQL runtime handler 先识别确认式回复，选中候选后把原问题中的简称替换成客户全称再继续查询。
- 决策：确认分支走确定性状态机，避免把“第2个”误路由或误送 SQL agent；语义型追问仍保留给后续 LLM 多轮改写扩展。
- 验证：`npm run build:server`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts` 通过。

### 2026-07-09 JDY CRM 客户简称同步

- 背景：ERP SQL 问答中用户会用客户公司简称提问，单靠 `Customer.Name LIKE` 无法覆盖 CRM 里维护的客户简称。
- 实现：新增 `integration.jdy_crm_customers` 表和 Prisma model；新增 JDY CRM 客户全量同步脚本 `npm run jdy:sync-crm-customers`，默认拉取 JDY 客户表单整条记录并存入 `raw_data`，同时抽取客户名称、别名/简称、编码索引列；写库改为批量 `INSERT ... ON CONFLICT`；ERP SQL 模板参数解析会先用本地 JDY 客户缓存把简称解析成客户名称，销售订单/发货模板同时匹配 `Customer.Name` 和 `Customer.CustID`；简称模糊命中多个客户且没有精确匹配时，会返回候选让用户确认，不继续执行 SQL。
- 决策：同步脚本只 upsert 不清空，避免外部接口临时失败导致本地缓存被删空；字段 id 不写死，`JDY_CRM_APP_ID=6191e49fc6c18500070f60ca`、`JDY_CRM_CUSTOMER_ENTRY_ID=020100200000000000000001` 作为默认配置，客户名称/简称字段仍需按表单控件 id 配置。
- 验证：`npm run build:server`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts` 通过；已同步 JDY 客户 10430 条，`raw_data` 覆盖 10430 条，别名/简称 6995 条。

### 2026-07-08 ERP SQL 采购维度组合修复

- 背景：20 条经营 golden 里 #7/#18 不再缺 approved metric，但采购指标与销售/成本指标维度不兼容，不能用 PO order 硬 join 销售订单或供应商硬 join 生产成本。
- 实现：planner 新增 `purchase_supplier_product_summary`，供应商采购问题只用 `purchase_amount` 按供应商/产品执行；`purchase_cost_margin_impact` 标记为 `decision_support`，让它走 reference-assisted fallback；成本四分项触发词收窄，不再因普通“物料”误加生产成本四分项；workflow 在缺 approved 指标或 reference-assisted estimate 时追加 `finance_review_needed:` warning，方便后续从 trace/warnings 汇总财务待确认事项。
- 决策：不新增 speculative PO-to-sales-order bridge；没有人工批准桥接口径前，采购影响客户订单毛利只能 estimate/reference-assisted，不能 strict atomic compose。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 83 项；`npm run build:server` 通过；前 20 条 compose smoke 为 19 条 `composed`、1 条 `fallback_required`、0 条 missing/strict compose error，#7 workflow 测试确认 reference-assisted estimate 会调用 generator 并以 `financeMode=estimate` 校验。

### 2026-07-08 ERP SQL shipped/open job approved metrics

- 背景：21 条经营 golden 只剩 #11 `open_job_margin_cost_risk` 和 #16 `shipped_amount` 缺 approved atomic metric，用户已批准补齐。
- 实现：迁移追加 `shipped_amount` 与 `open_job_margin_cost_risk`；发货金额按 `ShipDtl -> ShipHead` 发货日期和发货数量折算订单行金额，未完工工单风险按 `JobHead -> JobProd -> OrderDtl` 统计未关闭未完成工单数；#16 recipe 收敛到客户粒度，避免把发票回款 overdue 强行分摊到产品。
- 决策：两个口径都是运营分析口径，不代表发票收入、回款、结算、退款或财务报表金额；不新增专用 SQL 模板，也不把 historical reference 当 strict 授权。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 81 项；`npm run build:server` 通过；21 条 composite golden 静态分流为 20 条 `approved_plan`、1 条 `clarification`、0 条 `blocked_missing_metric`。

### 2026-07-08 ERP SQL 21 条经营问题分流收尾

- 背景：21 条经营 golden 还剩少量 no_plan/误反问/误维度，需要稳定落到可执行 plan、明确反问或明确 blocked。
- 实现：planner 新增事业部销售毛利月度趋势、产品销售库存未交付、发货客户毛利回款、未完工工单客户风险 recipe；“毛利低于/偏低/高价值产品毛利低”默认 `gross_margin_rate`；维度识别补 `supplier` 和 `salesperson`；新增迁移给销售类 atomic metric 补 `salesperson = OrderHed.EntryPerson`，给 `purchase_amount` 补 `supplier = POHeader.VendorNum`。
- 决策：不批准 `shipped_amount` 或工单风险指标；严格模式缺口返回 `blocked_missing_metric`，不偷用待发货金额或历史 reference 当执行授权。库存是当前快照，产品销售/库存/未交付组合按 `product` 输出，不强行带订单维度。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 78 项；`npm run build:server` 通过；21 条 composite golden planner smoke 为 20 条 plan、1 条 clarification、0 条 no_plan。

### 2026-07-08 ERP SQL 回款 overdue approved atomic metrics

- 背景：回款慢、逾期回款、逾期应收问题已确认采用发票未收余额运营口径，不再要求实收明细口径确认。
- 实现：迁移追加 `collection_delay_days` 与 `collection_overdue_amount`，固定 `Erp.InvcHead`、`Posted = 1`、`OpenInvoice = 1`、`DocInvoiceBal > 0`、`DueDate < CAST(GETDATE() AS date)`；planner 将回款/收款/账龄/overdue 问法映射到逾期天数，并自动带上逾期金额；composer 删除 `collection_delay_days` 专门反问，缺 approved metric 时统一走 `blocked_missing_metric`。
- 决策：不接 `CashDtl/CashHead`，不处理实收明细、退款、冲销或坏账核销拆分；如果现场缺 `DocInvoiceBal`，保持缺口阻断等待重新确认。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 70 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 趋势与集中度 scenario recipe

- 背景：趋势和客户集中度问题需要先输出可判断的数据，但不新增趋势/集中度专用 approved atomic metric。
- 实现：`AnalysisPlan` 增加 `timeGrain` 与 `analysisShape`；planner 新增 `customer_margin_monthly_trend` 和 `product_customer_concentration` recipe；composer 在月度粒度下按 `period` 聚合/连接，并为产品客户集中度输出客户占比和客户数窗口列。
- 决策：趋势只输出月度序列，不在 SQL 内判断连续下降；集中度不内置阈值，只输出 `customer_share_rate/customer_count`。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 70 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 待发货/未交付 approved atomic metrics

- 背景：待发货、未发货、欠发、未交付、延期交付问题需要复用 `family_037` release 口径，避免继续落到打开订单金额粗口径。
- 实现：迁移追加 `open_shipping_qty` 与 `open_shipping_amount`，固定 `OrderRel -> OrderDtl -> OrderHed -> Customer`、`OpenRelease = 1`、`OurReqQty > 0`，金额按待发数量折算；planner 将待发相关词展开到金额+数量，延期交付标记 `overdue`；composer 从 metric definition 追加 `overdueFilters`。
- 决策：保留 `open_order_amount`；不新增通用 filter DSL，延期只支持 `OrderRel.ReqDate < CAST(GETDATE() AS date)`。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 63 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 库存现存量 approved atomic metric

- 背景：经营问答需要把“当前库存/现存量/库存是否够”稳定落到 approved 原子指标，而不是只靠 historical SQL reference；同时让库存和待发货指标能按仓库组合。
- 实现：迁移追加 `inventory_on_hand_qty`，口径为 `SUM(PartWhse.OnHandQty)`，支持产品和仓库维度，只统计 `OnHandQty > 0` 的当前库存；`open_shipping_amount/open_shipping_qty` approved definition 补齐仓库维度；planner 增加“仓库”维度识别；composer 补充库存现存量与其他原子指标按 `Company + product` 组合的测试。
- 决策：库存是运营数量口径，不代表库存金额、成本、ATP、发票、回款或结算；待发货是运营 backlog 口径，不代表发票、回款、结算或会计收入；暂不引入库位和可用量逻辑。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 62 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 成本四分项 approved atomic metrics

- 背景：经营决策问题里“成本主要高在哪、材料/人工/制造/外协谁高”不能只用总成本粗口径。
- 实现：迁移追加 4 个 approved atomic metric：`material_cost_amount`、`labor_cost_amount`、`burden_cost_amount`、`subcontract_cost_amount`，金额口径为 `PartTran.*UnitCost * ABS(PartTran.TranQty)`，只批准 `MFG-STK/MFG-CUS` 生产成本事务。`AnalysisPlannerService` 将成本构成/材料/人工/制造/外协问题展开到四分项；`MetricComposerService` 支持 definition 里的按维度附加 join。
- 决策：保留 `cost_component_amount` 总成本粗口径；不新增“最大成本项”专用 SQL；不把 RMA、发货、采购、库存调整纳入四分项 approved 口径。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 57 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL scenario recipe 与 approved atomic metrics

- 背景：20 条经营决策问题不能继续依赖“每题一个 SQL 模板”，需要稳定分流到可组合指标、清楚阻断或反问。
- 实现：`AnalysisPlannerService` 增加 4 个轻量 scenario recipe，`analysisPlan` 记录 `scenario/requiredMetrics/missingApprovedMetrics`；`MetricComposerService` 按 required metrics 阻断缺口，并修正多 CTE 组合时外层 join 需要带上维度，避免同 Company 下维度互乘；strict finance 缺 required approved metric 时仍查 reference evidence，但直接返回 `blocked_missing_metric`，不再调用慢 LLM generator。新增迁移 upsert 7 个 approved atomic metric：`order_amount`、`invoice_revenue`、`gross_margin_amount`、`gross_margin_rate`、`cost_component_amount`、`open_order_amount`、`purchase_amount`。
- 决策：不批准 `inventory_on_hand_qty` 和 `collection_delay_days`；reference dataset/family 只做 evidence，不做 strict 执行授权；recipe 不保存题级 SQL。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 55 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL reference-assisted fallback

- 背景：经营决策问题命中 `analysisPlan` 后，如果 approved atomic metric 不全，旧链路会直接失败，导致 4000 条 embedding SQL reference 和 family/template 资产没有参与。
- 实现：Mastra ERP SQL toolchain 在 atomic composer 普通缺口时进入 `findSqlReference` + LLM generator + `SqlGuardService` fallback；`collection_delay_days` 这类明确缺审批口径的问题继续反问，不走 fallback。`product_margin_cost_ratio_top5` 在 reference 阶段也按固定问法过滤，避免成为宽泛财务问题的 strict 授权。
- 决策：历史 SQL 资产只做生成证据，不直接作为 strict finance 执行授权；strict finance 仍由 approved metric/template/scenario 决定是否可执行。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 55 项；`npm run build:server` 通过。20 条 composite golden 在不连 ERP 后端模式下：1 条 generated-only，3 条 clarification，16 条因外部 LLM/检索链路 25s 超时。

### 2026-07-08 ERP SQL Guard CTE 派生列校验修复

- 背景：实际执行 `product_margin_cost_ratio_top5` 时，approved SQL 中的 CTE 派生列被误当作 `Erp.PartTran` 等物理字段校验，导致 strict finance guard 在执行前拦截。
- 实现：`SqlGuardService` 收集 CTE 输出列并标记为 derived；derived 字段保留给 finance 金额/日期/状态规则使用，但跳过物理字段存在性校验，底层真实表字段仍照常校验。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 54 项；`npm run build:server` 通过；经用户批准后实际连接 LLM/ERP 执行目标问题成功返回 5 行。

### 2026-07-08 ERP SQL approved composite metric 快捷路径

- 背景：`6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？` 已有 approved composite metric，但 analysis planner 会拆成三颗 atomic metric，缺少任一 atomic metric 时会提前失败。
- 实现：Mastra ERP SQL toolchain 在 atomic composer 前先尝试 `product_margin_cost_ratio_top5` approved metric；命中且有 `representative_sql` 时用固定 SQL 生成 rule result，并继续通过 `SqlGuardService` strict finance 校验。快捷路径只放行“6月/本月 + 高价值/销售额 Top + 产品 + 客户 + 毛利 + 成本”的固定问法，避免套到事业部/采购/库存等更宽问题。`analysisPlan` 增加可选 `limit`，仅记录 TopN 语义。
- 决策：产品粒度按 `PartNum`；不新增 `order_amount`、`gross_margin_rate`、`cost_component_amount` 三颗 atomic metric，不扩展通用复合规划框架。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过；`npm run build:server` 通过。20 条 composite golden 在不连 ERP 后端模式下：1 条生成通过但未执行，9 条缺 approved atomic metric 阻断，3 条反问，7 条 25s 超时。

### 2026-07-08 ERP SQL 原子指标 Analysis Planner

- 背景：综合经营问题不能继续依赖“每问一个 approved template/metric”，需要先拆成可批准、可组合的原子指标。
- 实现：新增 `AnalysisPlannerService` 和 `MetricComposerService`；Mastra toolchain 在 planner 后用规则优先、JSON-only LLM 兜底产出 `analysisPlan`，命中时只从 `status='approved'` 且 `definition_json.kind='atomic_metric'` 的指标组合 SQL，并继续走 `SqlGuardService`。缺少 `collection_delay_days` 或 grain/joinKeys 不兼容时在 generator/executor 前阻断。
- 决策：v1 复用 `business_metric_catalog.definition_json`，不新增表；composer 只使用 definition 里的表达式、过滤、时间字段和 join keys，不让 LLM 编字段。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` 通过 18 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 模糊问题反问关卡

- 背景：经营决策问题常包含“评估/认为/帮忙看看”等模糊表达，直接生成 SQL 容易误猜数量、单价、时间范围和分析维度。
- 实现：Mastra ERP SQL toolchain 在 planner 后调用 `AnalysisPlannerService` 做规则反问；命中时返回 `error=clarification_required` 和 `clarificationQuestions`，并停止 generator/executor。当前覆盖“数量”“单价/价格”等明显模糊口径。
- 决策：先用规则实现，不引入 LLM 反问判断；只拦截明显模糊的经营评估问法，避免影响普通明细/汇总查询。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts` 通过 36 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 综合经营 golden questions

- 背景：实际决策者问题常跨销售、毛利、成本、库存、交付、采购和车间反馈，不能只用单一报表式问题评测检索能力。
- 实现：在 `sqlTemplateGoldenQuestions.json` 新增 `business_decision_composite` 类型 21 条问题，覆盖销售额 Top、客户贡献、库存/未交付、毛利低、回款慢、采购成本影响、客户集中度，以及“车间认为今年数量变多但单价下降”的评估问题；同步 retrieval eval 测试允许新业务类型。补充 `family_100` 对“销售额/单价”的提示词，不使用泛化“数量”避免误伤库存数量问题。
- 决策：继续复用现有 family retrieval 评测，不新增多跳规划框架；综合问题用最接近的 family 组合作为 golden 期望。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlPlanner.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts` 通过 32 项；`npm run build:server` 通过。

### 2026-07-08 产品毛利成本占比 approved metric

- 背景：用户问题“检查6月份产品，价值比较高的5种，毛利是多少，成本占比最大的是什么，都是哪些客户”在严格财务模式下缺少 approved metric/template，旧链路会被阻断或生成不可靠 SQL。
- 实现：基于检索到的“客户订单成本占比分析”和“入库毛利”参考 SQL，在真实库 `erp_agent.business_metric_catalog` upsert `product_margin_cost_ratio_top5`，状态为 `approved`；`definition_json` 固定口径：时间字段 `Erp.PartTran.TranDate`，6 月默认当前年份，价值高按未税销售额 Top5，毛利返回金额和毛利率，成本占比分母为未税销售额，最大成本项在物料/人工/制造/外协费中取金额最大，客户按 Top 产品列出。
- 决策：未把 SQL 直接批准为 executable template，因为当前 `SqlGuardService` 对 CTE 派生列存在误报；先批准 metric，让严格财务生成必须引用固定口径。代表 SQL 写入 `business_metric_catalog.representative_sql`，不再保留运行时不会读取的 `tmp` SQL artifact。
- 验证：字段存在性检查通过；`findApprovedMetricCandidates` 对原问题命中 `product_margin_cost_ratio_top5` 且 score=1；`node --test --import tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过。全链路 ask 和 ERP-only 执行因需要向外部 LLM/ERP 后端发送财务上下文/SQL，被安全审核拦截，未继续绕行。

### 2026-07-08 ERP SQL 财务估算模式

- 背景：严格财务 SQL 需要 approved template/metric，但经营决策场景允许用户明确要求“估算/大概/粗算”时查看非财务口径参考值。
- 实现：`SqlGuardService` 增加 `financeMode`，strict 只放行 approved metric/template，estimate 允许历史 dataset/family reference；Mastra `validateSql` 传入 module/references/financeMode，workflow 对估算问题返回 `financeScope` 和免责声明。
- 决策：不重做 SQL 安全校验器，不新增 dry-run/explain 框架；估算模式必须由用户显式触发，结果不可用于报表、对账、审计或付款结算。
- 验证：`npx tsx --test apps/server/test/erpSqlAgent/sqlGuard.test.ts`、`npx tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`、`npm run build:server` 通过；`npm test` 曾完整通过 304 项，后续复跑出现 1 个既有 SQL family promotion review 断言波动（markdown family heading 计数 10 vs 5），与本次 finance guard/Mastra workflow 改动路径无关。

### 2026-07-08 ERP SQL 财务定义草稿补全

- 背景：第一轮只细化了财务汇总、应收实收差异和退款/冲销，剩余财务明细、同比/环比、排行、异常核对、多表 join 仍是空骨架。
- 实现：将 `finance_detail`、`finance_period_compare`、`finance_group_ranking`、`finance_exception_check`、`finance_join_metric` 升级为 `draft_definition`，复用已确认的 `Erp.InvcHead.ApplyDate`、`Erp.InvcHead`、`Erp.InvcDtl` 收入侧口径，补充明细粒度、同比/环比输出、排行默认排序、异常规则和 join 预聚合约束。
- 决策：仍不批准执行；付款、冲销、RMA 金额、PartTran 成本窗口、join 基数和发票状态继续作为 approval blocker。
- 验证：运行 `npm run build:server`、`npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`；真实库执行 `sql-family:promote-assets -- --apply` 后用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=12`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 灰度观察

- 背景：ERP SQL reference/embedding 已过验收，正式放开前需要先观察生成 SQL 的证据链，避免 LLM 生成绕过模板、reference 和 guard。
- 实现：新增 `ERP_SQL_AGENT_EXECUTE_GENERATED_SQL` 灰度开关，默认只执行 approved template，LLM SQL 只生成、校验和记录；trace 增加 session/run/user/rollout mode，generation 保存 reference score、matchedSignals 和 vector signal；新增 `sql-agent:observe-rollout` 只读观察脚本。
- 决策：财务继续采用 approved metric/template 准入，不把普通 dataset/family reference 当作财务执行凭证；追问/纠错先按同 session 30 分钟内后续用户消息和关键词轻量判断。
- 验证：`npm run prisma:validate`、`npm run build:server`、指定 ERP SQL 单测通过；真实库 `sql-template:audit-reference-index -- --strict --require-embeddings --limit=3` 通过，`datasetCount=4085`、`embeddingCoverageRatio=1`、唯一向量维度 `1536`；`sql-agent:observe-rollout -- --hours=24` 可运行，当前窗口 trace 为 0。`sql-agent:evaluate` 未达标：160 条中 Top3 命中 106 条，准确率 66.25%，finance 20/20 通过，失败集中在 purchase_delivery、sales_order_shipping、inventory_material、job_material_bom，需要单独修复真实库检索资产/排序后再作为上线红线放行。

### 2026-07-08 ERP SQL 财务定义草稿细化

- 背景：财务骨架模板入库后，需要把高频财务问题的可确认口径先沉淀到 `definition_json`，但不能在字段未完全确认前批准执行。
- 实现：将 `finance_summary`、`finance_ar_cash_diff`、`finance_refund_writeoff` 从空骨架升级为 `draft_definition`，补充金额表达式、时间字段、税/退款策略、必需表字段、允许维度/过滤、输出控制列、证据来源和审批阻断项。
- 决策：只使用历史 reference 中能确认的 `Erp.InvcHead`、`Erp.InvcDtl`、`Erp.RMADtl`、`Erp.RMAHead` 线索；实收表、冲销字段、退款日期、发票状态和税率例外仍列为 approval blocker，数据库 `status` 继续保持 `draft`。
- 验证：运行 `npm run build:server`、`npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`；真实库执行 `sql-family:promote-assets -- --apply` 后用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=7`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 财务骨架模板

- 背景：财务类优先模板化，但现阶段不追求模板数量，需要先覆盖财务汇总、明细、同比/环比、排行、异常核对、应收实收差异、退款/冲销和多表 join 指标等高风险 family。
- 实现：在 SQL family asset promotion 中追加 8 条 finance skeleton metric draft，写入 `business_metric_catalog.definition_json`，保留时间、维度、过滤、排序、limit 等可变槽位；同步 verify 脚本和单测计数。
- 决策：不生成可执行 SQL，不自动批准；非财务 family 继续走既有模板/引用/LLM 路径。
- 验证：运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`、`npm run build:server`；真实库执行 pending additive migrations 后运行 `sql-family:promote-assets -- --apply`，再用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=7`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 财务指标定义层

- 背景：财务 SQL 不能只依赖历史 SQL reference 和 prompt 约束，需要把收入、税退款、成本、时间和排除规则固定在已批准指标定义里。
- 实现：`business_metric_catalog` 增加 `definition_json`；ERP SQL Agent 在 finance 无已批准模板时只检索 `status='approved'` 的 finance metric，未命中则阻断生成；LLM 和 guard 都只接受 approved metric/template 作为财务准入。
- 决策：继续复用现有模板优先级、metric catalog 和 guard，不新增独立财务 agent；现有 draft metric 不自动升级。
- 验证：运行 `npm test -- apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts` 通过（runner 实际执行 292 项）；`npm run build:server` 通过；`npm run prisma:validate` 通过。

### 2026-07-08 人事绩效 PostgreSQL schema 和只读账号隔离

- 背景：后续人事绩效 Agent 需要独立 schema，并和普通只读账号做数据库层权限隔离。
- 实现：新增 `hr_performance_agent` Prisma migration，Prisma datasource 纳入该 schema；补充只读账号 psql 模板，普通只读账号只授予非 HR schema，HR 只读账号只授予 `hr_performance_agent`；README 和 `.env.example` 增加对应说明。
- 决策：真实账号密码不写入 migration 或代码，只放本机 `.env`/未提交 `.env.*`，避免分享仓库时泄露绩效库连接信息。
- 验证：运行 `npm run prisma:validate`。

### 2026-07-08 ERP SQL Reference Embedding

- 背景：历史 SQL reference index 已覆盖 4085 条 dataset，需要在不上 pgvector、不新增依赖的前提下补 embedding 增强重排。
- 实现：新增 OpenAI-compatible embedding client 和 `sql-template:build-reference-embeddings` 脚本，复用 `openai` SDK 与 `llm_call_logs`；检索在有 query embedding 和 row vector 时按 `0.75 * mixedScore + 0.25 * vectorScore` 重排，失败自动回退 mixed score；index rebuild 时 `embedding_text` 变化会清空旧 vector/model/time；audit 增加 embedding 覆盖率、模型、维度和 `--strict --require-embeddings` 检查。
- 决策：v1 继续 JSONB 向量内存扫描，4000 级别数据不引入 pgvector；日志只记录 batch size/model/dim，不记录完整 SQL；embedding client 需要 `ERP_SQL_EMBEDDING_TRUSTED=1`，避免未确认 endpoint 时发送 ERP reference 文本。
- 验证：运行 `npm test -- apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceAudit.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceIndexBuilder.test.ts` 通过（runner 实际执行 286 项）；`npm run build:server` 通过；`DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/db npm run prisma:validate` 通过。未连接真实 embedding 网关执行 apply。

### 2026-07-08 ERP SQL 历史检索库真实库 Apply/Audit

- 背景：需要确认 4000+ 条 FineReport SQL 不只是代码侧可构建，而是已在真实数据库完成索引落库并通过 strict audit。
- 实现：用主线程 `.env` 连接真实库执行 Prisma migration deploy，应用 `20260708020000_sql_dataset_reference_index`；随后运行 `sql-template:build-reference-index -- --apply`，按 `dataset_id` upsert 4085 条 dataset 索引。
- 决策：补强索引解析器以支持中文表/字段、反引号标识符、逗号 join、FineReport `[表]别名` 写法；对纯内联 `SELECT ... UNION` 用 `inline_values`，对无法解析列名的内联/通配场景用 `inline_value`/`*`，让 strict audit 有明确口径。
- 验证：真实库 apply 输出 `datasetCount=4085`、`indexedCount=4085`、`coverageRatio=1`、`financeCount=763`、`verifiedCount=123`、`metricTaggedCount=628`；`sql-template:audit-reference-index -- --strict --limit=3` 退出码 0，所有 `fieldGaps` 为 0，`smokeGapCount=0`；本地运行 `npm test -- apps/server/test/erpSqlAgent/sqlDatasetReferenceIndexBuilder.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceAudit.test.ts`、`npm run build:server`、加载主线程 `.env` 的 `npm run prisma:validate` 均通过。

### 2026-07-08 ERP SQL 业务类型 Golden Questions

- 背景：SQL family 验证按 family 组织不贴近真实用户问法，改为按业务类型验证路由/召回是否命中正确 SQL 来源。
- 实现：新增 `sqlTemplateGoldenQuestions.json`，按采购到货、销售订单发货、库存物料、生产进度、工单物料/BOM、工序报工、报价配置、财务成本毛利 8 类各 20 条；`SqlTemplateRetrievalEvalService` 默认从 JSON 读取用例，并把 reference family 和 metric catalog 纳入 eval 候选。
- 决策：v1 跳过 noise/low-value family，不为每个 family 平均凑题；重叠业务问题允许多个 expected family；finance metric family 若尚未入库，用静态 eval fallback 防止 golden 验证被缺失候选拖垮。
- 验证：新增 golden questions 结构测试；运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`、`npm run sql-template:retrieval-eval -- --out tmp/sql-template-retrieval-eval.json --md-out tmp/sql-template-retrieval-eval.md --compact-out tmp/sql-template-retrieval-eval.compact.json`、`npm run build:server`。

### 2026-07-08 ERP SQL 财务 Guard

- 背景：财务 SQL 的金额口径风险高，需要只对 finance family 增加更严格校验。
- 实现：在 `SqlGuardService` 增加可选上下文，finance 模块要求命中历史 SQL/模板参考、出现金额/状态/日期字段、明细金额表 join 前预聚合，并返回时间字段、金额字段、状态过滤、税退款口径说明列。
- 决策：不新增独立 guard 类，复用现有 parser、字段收集和 generator guard 调用；非 finance 调用保持原校验。
- 验证：运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlGuard.test.ts` 和 `npm run build:server` 通过；`npm test -- apps/server/test/erpSqlAgent/sqlGuard.test.ts` 会触发仓库 runner 全量测试，当前因 Prisma client 未生成失败。

### 2026-07-08 ERP SQL 历史检索库

- 背景：LLM fallback 只参考少量 family 摘要，FineReport 导入的历史 SQL 没有以 dataset 粒度参与召回。
- 实现：新增 `sql_dataset_reference_index` 迁移和 Prisma 模型；新增索引构建脚本；索引记录自然语言问题、SQL、family、表字段、指标、时间口径、业务场景、财务标记和验证标记；扩展 `findSqlReference` 和旧 `erpSqlAgent.ask` fallback 路径，LLM 生成前先返回 dataset 级参考，再补 family 级参考；补充检索打分测试和架构说明。
- 决策：第一阶段不上 pgvector、不新增依赖，使用 family/module/intent、问题词、表字段、参数、指标词和财务关键词混合打分；未归类 SQL 的 family 记为 `unclassified`，`verified=true` 只来自 approved 且 guard_passed 的模板来源；embedding 字段只预留。
- 验证：新增 `sqlDatasetReferenceSearch.test.ts` 覆盖财务优先、无 family 召回和 toolchain 输出兼容。
- 补充：新增 `sql-template:audit-reference-index` 只读审计脚本，输出索引覆盖率、缺字段计数、指标分布和 Top 检索 smoke 结果。
- 补充：LLM prompt 保留 Top reference 元数据，但只给前 3 条携带 SQL preview，避免历史 SQL 片段挤占上下文。
- 后续：`toolchain.tools.ts` 本次只做小范围接线，文件已超过 500 行；后续触达更多 Mastra tool 时应按 tool 分片拆出 mapper/schema。

### 2026-07-08 前端规范收口拆分

- 背景：`FieldReviewPanel`、`DictionaryDetailModal` 和 `quoteAgent.service` 文件过长，职责混在入口、表单、表格和请求实现里。
- 实现：拆出字段审核 payload/utils、表单控件和 action forms；拆出字典详情工具、term 详情区和弹窗内标准值表；将 quoteAgent service 拆为 archive/candidate/dictionary/masterData 分片并保留兼容 facade。
- 决策：不改 URL、API 参数、返回类型、调用方 import 和 UI 行为；因目录已有 `DictionaryValueTable.tsx`，弹窗内表格命名为 `DictionaryDetailValueTable.tsx`，避免重命名既有页面表格。
- 验证：在 `apps/web` 运行 `npm run build` 通过；`npm run lint` 通过，保留既有 27 个 warning，无 error。

### 2026-07-08 Codex 沙箱数据库快速失败

- 背景：Codex 沙箱网络不可访问 `hz.jc-times.com:5433`，数据库操作会反复等待远端连接超时。
- 实现：Prisma 单例初始化前检测 `CODEX_SANDBOX_NETWORK_DISABLED=1` 且 `DATABASE_URL` 指向该远端库时，改成本地 `127.0.0.1:9` 快速失败；其他环境不变。
- 验证：新增 `apps/server/test/lib/prisma.test.ts` 覆盖 URL 改写逻辑。

### 2026-07-08 其他前端入口拆分

- 背景：`opportunitySearch`、`externalContact` 和候选簇审核入口承载了较多状态、表单和展示 JSX，需要继续按“入口只组合 hook 和展示组件”的规则收口。
- 实现：拆出商机搜索 filters/results/hook；拆出外部联系人绑定 form/hook；拆出候选簇页面 header/content/dictionary modal，并保留原 service、store、样式和业务流程。
- 决策：不拆 `quoteAgentDictionary`、`conceptResolver/index.tsx` 和 `archive/index.tsx`；`/external_contact` 与 `/quote-agent/clusters` 继续直接渲染，兼容已有入口。
- 验证：在 `apps/web` 运行 `npm run build` 通过；`npm run lint` 通过，保留既有 27 个 warning，无新增 error。

### 2026-07-08 Agent 数据库 schema 拆分

- 背景：ERP SQL Agent 和 ProductConfigAgent 混在 `agent` schema，不利于后续按业务域隔离权限，尤其未来 HR agent 会涉及绩效、薪资等敏感数据。
- 实现：新增 Prisma 迁移 `20260708010000_split_agent_domain_schemas`，创建 `erp_agent` 和 `production_config_agent` schema，并用 `ALTER TABLE ... SET SCHEMA` 迁移现有 ERP/ProductConfig 专属表；`agent` schema 保留兼容 view。Prisma 模型同步标注到新 schema，ERP 直接 SQL 改为访问 `erp_agent`。
- 决策：通用 runtime、LLM 日志和用户偏好暂留 `agent`；ProductConfig 旧硬编码 `agent.*` 先通过 view 兼容，避免一次性大改。
- 验证：运行 `npm run prisma:validate`、`npm run build:server` 通过。

### 2026-07-08 前端 ERP 路由分区基础

- 背景：前端后续除了 Agent 对话，还要承接 ERP 后台页面和生产员工手机端页面，需要先把路由入口和布局壳分开。
- 实现：新增 `/agent`、`/admin`、`/work` 三个分区，拆出 `AppRoutes` 和旧路径跳转；将原桌面布局拆为后台/Agent 共享的桌面壳，并新增移动端基础壳和占位页。
- 决策：旧 `/quote-agent`、`/quote`、`/template`、`/external_contact` 路径保留跳转；不迁移具体 C# 页面，不新增依赖。
- 验证：在 `apps/web` 运行 `npm run build` 通过；启动 Vite 后检查 `/agent/archive`、`/agent/review`、`/admin/quote/history`、`/admin/template`、旧 `/quote-agent`、`/quote/history`、`/template` 和公共 `/auth-callback`、`/quote/share/test` 均返回 200。

### 2026-07-08 前端文件命名统一

- 背景：前端仍有 `MATERIAL.ts`、`IntervalInput1.tsx`、`test.tsx`、大小写目录混用和零散样式文件名，目录结构统一后还需要收口文件命名。
- 实现：将前端目录统一为 camelCase，将工具文件改为 camelCase，将测试样例组件改为 `TestComponent.tsx`，将 `IntervalInput1` 改为 `IntervalInputWithUnit`，同步更新引用和前端命名规范文档。
- 决策：保留 `index.tsx` 作为目录入口，不删除未引用的模板样式文件，避免把命名重构扩大成清理重构。
- 验证：在 `apps/web` 运行 `npm run build` 通过；`npm run lint` 通过但保留既有 React hooks / fast-refresh warning。

### 2026-07-08 前端目录命名统一和 quoteAgent 入口拆分

- 背景：前端存在 `page`、`hook`、`util` 单复数混用，`quoteAgent/index.tsx` 同时承载工具栏、任务列表、上传区和明细渲染，后续维护成本偏高。
- 实现：将前端目录统一为 `src/pages`、`src/hooks`、`src/utils`，更新对应 import；把 quoteAgent 页面入口拆成工具栏、任务面板、审核明细面板和批量提交栏；补充前端结构文档并修正 README 的样式栈说明。
- 决策：保留 Tailwind 和现有模块样式，不引入新组件库；本次不改 URL、API、环境变量和业务规则。
- 验证：在 `apps/web` 运行 `npm run build` 通过；`npm run lint` 通过但保留既有 React hooks / fast-refresh warning。

### 2026-07-08 统一 Codex 规范和文档目录

- 背景：需要让后续 Codex 编程时自动读取统一规范，并避免项目文档散落在源码目录和前端子目录。
- 实现：新增根目录 `AGENTS.md`，明确代码规模、复用、后端 API 文档、前端样式和文档目录规则；将正式文档集中到 `docs/api`、`docs/frontend`、`docs/architecture`、`docs/operations`、`docs/archive`，旧路径保留短跳转。
- 决策：实现记录迁入 `docs/operations/codex-implementation-log.md`；根目录和子项目的 `AGENTS.md` 作为 Codex 读取规则，不算业务文档散落。
- 验证：文档整理，无需运行构建；使用 `rg --files -g '*.md'` 和旧路径引用搜索检查。

### 2026-07-06 超 500 行代码文件审查与复用约束

- 背景：当前仓库中存在多个超过 500 行的 TypeScript 源码文件，需要明确后续实现不能把单个模块继续写大，并优先考虑拆分和复用。
- 实现：检查 `src`、`test` 下代码文件行数，新增“代码规模与复用原则”，要求接近或超过 500 行时主动拆分职责、复用已有模块，并在记录中说明复用情况。
- 审查：当前超过 500 行的源码文件共 14 个，主要包括 `src/modules/productConfigAgent/db.service.ts`、`src/modules/productConfigAgent/routes/productConfigAgent.routes.ts`、`src/modules/productConfigAgent/extraction/plannedExtraction.ts`、`src/modules/productConfigAgent/normalization/index.ts`、`src/modules/productConfigAgent/dictionary/governance.service.ts`、`src/modules/productConfigAgent/excelParser/index.ts`、`src/modules/productConfigAgent/service.ts`、`src/modules/productConfigAgent/archive/*` 的归档/覆盖/插入门禁模块，以及 `src/modules/erpSqlAgent/templates/service/*` 的 SQL 模板分析和家族推广模块。
- 拆分建议：优先拆 `db.service.ts` 的 repository 查询、mapper、候选收集逻辑；拆 `productConfigAgent.routes.ts` 为按领域分组的 route handler；拆 `plannedExtraction.ts` 的 prompt、validation、batch workflow、range mapping；拆 `normalization/index.ts` 的字典匹配、字段归一化、数值单位解析；拆 `excelParser/index.ts` 的 workbook 读取、LLM 文本生成、选项解析、textbox XML 解析；拆 SQL family promotion 中的采样、验证、资产写入、报告生成公共 helper。
- 决策：本次先记录审查结果和约束，不直接大规模重构，避免影响已有未提交改动和业务行为；后续功能开发或修复触达这些文件时，应顺手做局部拆分并补充针对性测试。
- 验证：使用 PowerShell 统计 `src`、`test` 下 `.ts/.tsx/.js/.jsx/.mjs/.cjs` 文件行数，排除 `node_modules`、`build` 和备份 JSON。

### 2026-07-04 新增 Codex 实现记录文档

- 背景：希望后续使用 Codex 做实现时，可以把实现概要沉淀到仓库文档中。
- 实现：新增 Codex 实现记录文档，提供简略记录原则、推荐格式和实现记录区域。
- 决策：采用追加式 Markdown 记录，保持轻量，避免和 `README.md`、模块级设计文档重复。
- 验证：文档新增，无需运行测试。
