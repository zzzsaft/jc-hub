# 架构审查报告

审查对象：`agent` 后端项目。审查范围包括 Express 入口、路由聚合、认证授权、Prisma 数据访问、ProductConfigAgent 核心链路、LLM 客户端、后台任务和测试基线。

本报告只记录现状、风险和建议，不代表本次已修改业务代码。

## 当前结论

总体架构方向合理：项目已经从旧 TypeORM 迁移到 Prisma，路由集中聚合，ProductConfigAgent 的合同解析、LLM 抽取、归一化、字典治理、归档和 Agent Runtime 有较清晰的业务层次。测试基线也比较好，`npm run build` 和 `npm test` 当前通过，测试覆盖了归一化、字典治理、归档、worker、Agent Runtime 等关键规则。

主要风险集中在三个方面：

- 认证和公网部署保护仍偏迁移期，需要收紧本地开发旁路、query token、错误信息和限流。
- `productConfigAgent.routes.ts`、`db.service.ts`、`service.ts` 文件过大，输入校验和错误处理分散，后续维护成本较高。
- `/productConfigAgent/*`、`/quoteAgent/*`、`/api/*` 兼容路径较多，需要明确生命周期，避免新增接口时继续扩大兼容面。

## 已确认架构

- `src/index.ts` 是唯一 Express 入口，负责 CORS、JSON/body limit、`/health`、全局路由挂载和全局错误处理。
- `src/routes/index.ts` 聚合 `AgentRuntimeRoutes`、`FrontendRoutes`、`ProductConfigAgentRoutes`、`LegacyProductConfigAgentRoutes`。
- `src/lib/prisma.ts` 提供 PrismaClient 单例，非生产环境挂到 `globalThis` 以适配热重载。
- `src/routes/routeAuth.ts` 提供本地开发/生产认证差异：`PORT=2001` 会走 local dev 用户，其他端口验证 JWT。
- ProductConfigAgent 写接口在生产环境通过 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS` 或 `QUOTE_AGENT_ADMIN_USER_IDS` 判断管理员。
- LLM 调用通过 `llm/routedChatClient.ts` 路由到 InferAIChat 或 XH，模型前缀可覆盖默认网关。
- `background_jobs` 是 ProductConfigAgent 的单一可恢复 worker 队列。
- `/quoteAgent/*` 由 `/productConfigAgent/*` 自动映射，旧路径和新路径共享同一套 action。

## 安全风险

| 风险 | 级别 | 已确认事实 | 建议 |
| --- | --- | --- | --- |
| 本地开发认证旁路 | 高 | `PORT=2001` 时 `isLocalDevRoute()` 返回 true，读写接口可使用 `x-user-id` 或 `local-dev`。 | 生产禁止使用 `PORT=2001`；启动时若 `NODE_ENV=production && PORT=2001` 应直接失败。 |
| Query token | 高 | `authService` 接受 `request.query.token`。 | 公网环境移除 query token，只接受 `Authorization: Bearer`。 |
| 分享配置权限 | 高 | `agent/configs/:id`、share-token 创建/撤销按 id 操作，wrapper 只保证 token 用户存在。 | 明确 owner/admin 检查，确保用户只能读写自己的 generated config 或管理员可操作。 |
| 服务端 filePath 上传 | 高 | `/contracts/upload` 接收服务端 `filePath` 并执行 `fs.access(filePath)`。 | 生产环境改为受控上传目录或对象存储；最少增加路径白名单和扩展名/大小检查。 |
| 原始错误信息返回 | 中 | `src/index.ts` 全局错误处理向客户端返回 `error.message`。 | 生产环境返回通用错误码，详细 stack 仅写日志。 |
| 未启用限流 | 中 | 依赖包含 `express-rate-limit`，入口当前未使用。 | 在认证、LLM、写接口和分享接口前启用限流。 |
| LLM 日志敏感数据 | 中 | LLM 调用日志记录 input/output JSON。 | 明确保留周期、脱敏策略和访问权限。 |
| CORS 默认全开 | 中 | `app.use(cors())` 未配置 origin 白名单。 | 生产环境按前端域名设置 CORS allowlist。 |

## 架构合理性

### 合理部分

- Prisma 单数据访问层让迁移后的数据模型集中在 `schema.prisma`，比旧 TypeORM/Prisma 混合态更可控。
- route table 统一聚合让 `/productConfigAgent/*` 到 `/quoteAgent/*` 兼容映射简单直接。
- LLM routed client 把供应商选择、模型规范化和默认参数集中处理，有利于扩展供应商。
- ProductConfigAgent 的业务域已经拆出 workflow、dictionary、normalization、archive、agent、tools 等子目录，领域边界基本存在。
- `pendingLlmJob.service.ts` 使用依赖注入，方便测试并发和进度逻辑。
- `archive/jsonPatch.ts` 对归档 patch 做路径限制，比直接写 JSON 安全。
- `utils/advisoryLock.ts` 和 `dailyMaintenance.service.ts` 体现了跨进程任务互斥意识。

### 主要结构压力

- `productConfigAgent.routes.ts` 超过千行，承担路由声明、权限包装、输入解析、错误处理和 response mapping。
- `db.service.ts` 同时承载 documents、dictionary、archive、jobs、master data 等仓储逻辑，模块边界不够硬。
- `service.ts` 是面向路由的总编排层，方法跨度大，随着接口增加会变成隐性核心瓶颈。
- `agentRuntime/routes.ts`、`productConfigAgent.routes.ts`、`frontend/routes` 各自有局部 `sendError` 和 parsing helper，行为不完全一致。
- `any` 在 normalization、routes、repository mapping、测试 monkey patch 中较多；合理处是 JSON/Prisma 边界，但路由输入和 service 返回更适合收敛类型。

## 可复用模块

- `routes/routeAuth.ts`：可复用本地开发用户解析、生产 JWT 解析、`withRequiredUser` 包装模式。
- `llm/routedChatClient.ts`：可复用多供应商 LLM 路由、模型前缀识别、默认网关选择。
- `workflow/pendingLlmJob.service.ts`：可复用批处理并发、进度聚合、依赖注入测试模式。
- `archive/jsonPatch.ts`：可复用安全 JSON patch 校验和写入模式。
- `utils/advisoryLock.ts`：可复用 PostgreSQL advisory lock 互斥任务模式。
- `normalization/rules`：可复用字段归一化、单位/范围/选项合并、产品路由规则。
- `dictionary/matcher.service.ts`：可复用字典别名和单位别名匹配能力。
- `dictionary/policyScoring.service.ts` 和 `conceptTargetScoring.service.ts`：可复用治理风险评分模式。

## 冗余与重复

- 输入解析重复：`requireString`、`optionalString`、`optionalNumber` 在多个 route 文件重复存在。
- 错误处理重复：不同 route 模块局部定义 `sendError`，HTTP 状态码映射不统一。
- 兼容路径重复：`/productConfigAgent/*`、`/quoteAgent/*`、`/api/*` 同时存在，文档和测试需要明确主路径。
- Repository 过宽：大量 `mapBigInts`、mapper、Prisma 查询混在一个 `db.service.ts`，应按业务域拆分。
- Auth 入口重复：ProductConfigAgent 自己实现 token/admin wrapper，AgentRuntime 使用通用 wrapper，后续可统一成 route metadata。

## 建议路线图

### P0：上线前安全门禁

- 禁止生产环境使用 `PORT=2001`。
- 移除或配置禁用 query token。
- 为 generated config 详情、share token 创建和撤销补 owner/admin 权限校验。
- 为 `contracts/upload` 增加路径白名单、文件类型和大小限制。
- 生产错误响应脱敏。
- 启用 `express-rate-limit` 和 CORS allowlist。

### P1：路由和校验收敛

- 新增通用 route helper：统一 `requireString`、`optionalString`、`optionalNumber`、`parseBigIntId`、分页参数、错误响应。
- 为 route table 增加 metadata：`auth: "public" | "token" | "admin"`、`compatibility`、`description`。
- 用 metadata 生成 API 文档或至少生成路由清单，避免文档漂移。

### P2：仓储拆分

- 将 `db.service.ts` 拆成 documents、extractions、dictionary、archive、jobs、masterData 子 repository。
- 保留 `productConfigAgentRepository` 作为兼容 facade，逐步迁移调用方。
- 把 mapper 和 `mapBigInts` 放入共享 serialization helper。

### P3：业务编排瘦身

- 将 `service.ts` 拆为面向用例的 application services：
  - document registration/parsing
  - extraction/renormalization
  - dictionary governance
  - archive lifecycle
  - background job orchestration
  - agent generated configs
- 每个 service 保留清晰输入/输出类型，减少跨域直接访问 repository。

### P4：兼容路径治理

- 明确 `/productConfigAgent/*` 是主路径。
- 为 `/quoteAgent/*` 和 `/api/*` 设置兼容说明、迁移目标和废弃条件。
- 新增接口默认不增加 `/api/*`，除非有明确前端兼容需求。

## 测试建议

已有测试基础较好，后续建议补充：

- 生产端口下 local dev 绕过不可用的认证测试。
- ProductConfigAgent admin 权限测试，覆盖无 admin env、非 admin 用户、admin 用户。
- Generated config owner/admin 权限测试。
- `contracts/upload` 路径限制测试。
- API route metadata 或文档生成快照测试，防止路径清单漂移。
- 错误脱敏和 rate limit 行为测试。

## 运维检查清单

上线前确认：

- `NODE_ENV=production`。
- `PORT` 不是 `2001`。
- `JWT_SECRET` 为强随机密钥。
- `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS` 已配置。
- CORS origin 已限制。
- 限流已启用。
- LLM key 和 base URL 已按网关配置。
- `DATABASE_URL` 指向正确 PostgreSQL，并可访问 `agent`、`erp_agent`、`production_config_agent`、`identity`、`integration` schema。
- worker 是独立进程运行，或明确设置 `PRODUCT_CONFIG_AGENT_WORKER_ENABLED=true`。
- LLM 日志和合同文件存储有权限控制与保留策略。
