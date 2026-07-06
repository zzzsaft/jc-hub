# Agent Backend

`agent` 是从 `jdy_backend` 迁移出来的 Prisma 后端服务，承载 LLM 调用、通用 Agent Runtime、ProductConfigAgent 以及 `/quoteAgent/*` 兼容接口。当前项目已经移除旧 TypeORM 运行时，数据库访问统一通过 Prisma 和 `agent` schema。

## 技术栈

- Node.js + TypeScript + ESM
- Express route table，不使用 Express Router 子模块
- Prisma + PostgreSQL，默认 schema 为 `agent`
- 内置 `node --test` 测试，使用 `tsx` 运行 TypeScript 测试
- LLM 客户端支持 InferAIChat、XH、DeepSeek、本地 OpenAI-compatible 服务
- Excel 解析使用 `exceljs`/`xlsx`，归档和治理数据持久化在 PostgreSQL

## 目录结构

```text
src/
  index.ts                         # Express 入口、全局中间件、路由挂载、可选内置 worker
  routes/                          # 全局路由聚合和通用认证辅助
  agentRuntime/                    # 通用会话、消息、运行、工具调用 runtime
  frontend/                        # 前端偏好配置 API
  llm/                             # 多供应商 LLM 客户端和路由
  productConfigAgent/              # 合同配置抽取、字典治理、归档、Agent 工具
  lib/prisma.ts                    # PrismaClient 单例
  config/                          # 环境变量加载和日志
prisma/
  schema.prisma                    # agent schema 下的 Prisma 模型
  migrations/                      # 数据库迁移
test/
  productConfigAgent/              # 归一化、字典、归档、worker、agent runtime 测试
docs/
  ARCHITECTURE_REVIEW.md           # 架构审查和风险清单
```

## 快速启动

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npm run build
npm run dev
```

开发服务默认监听 `http://localhost:2001`，健康检查为：

```bash
curl http://localhost:2001/health
```

生产运行通常使用：

```bash
npm run build
npm start
```

## 数据库

`DATABASE_URL` 指向 PostgreSQL，示例值：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agent?schema=agent"
```

Prisma datasource 启用了 `multiSchema`，当前 schema 固定为 `agent`。迁移内容包括：

- Agent runtime：sessions、messages、runs、tool calls、generated configs
- ProductConfigAgent：documents、blocks、extractions、dictionary、candidates、archives、jobs
- LLM call logs：provider、model、purpose、input/output、latency、status
- 前端用户偏好：`user_preferences`

常用数据库命令：

```bash
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
```

## 环境变量

以 `.env.example` 为基准：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串，必须包含可访问的 `agent` schema。 |
| `PORT` | 服务端口。开发默认 `2001`，生产默认 `2000`。 |
| `JWT_SECRET` | JWT 签名密钥。生产环境必须设置强随机值。 |
| `LLM_GATEWAY` | 默认 LLM 网关，当前支持 `inferaichat` 和 `xh`。 |
| `LLM_MODEL` | 可选的全局模型覆盖值。 |
| `INFERAI_MODEL` | InferAIChat 默认模型，例如 `inferaichat:deepseek-v4-flash`。 |
| `ANTHROPIC_AUTH_TOKEN` | InferAIChat 客户端使用的认证 token。 |
| `INFERAI_BASE_URL` | InferAIChat base URL，可选。 |
| `XH_API_KEY` / `XH_AUTH_TOKEN` | XH 客户端认证变量，代码当前读取 `XH_AUTH_TOKEN`。 |
| `XH_ADDRESS` / `XH_MODEL` | XH base URL 和默认模型。 |
| `DEEPSEEK_API_KEY` | DeepSeek 客户端认证变量。 |
| `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_API_KEY` / `LOCAL_LLM_MODEL` | 本地 OpenAI-compatible 模型配置。 |
| `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS` | 生产环境 ProductConfigAgent 写接口管理员用户 id，逗号分隔。 |
| `QUOTE_AGENT_ADMIN_USER_IDS` | 管理员兼容变量，低优先级于 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`。 |
| `PRODUCT_CONFIG_AGENT_WORKER_ENABLED` | 设为 `true` 时 API 进程内启动 ProductConfigAgent worker。 |
| `ERP_QUERY_BACKEND_URL` | ERP SQL 查询后端地址，默认 `http://122.226.146.110:780`。 |
| `ERP_QUERY_API_KEY` | ERP SQL 查询接口 HMAC-SHA256 签名密钥，对应 `jctimes_backend` 的同名变量。 |
| `ERP_QUERY_CRYPTO_SECRET` | ERP SQL 查询接口 AES-256-GCM 加解密密钥，对应 `jctimes_backend` 的同名变量。 |
| `ERP_QUERY_CLIENT_TIMEOUT_MS` | 调用 ERP SQL 查询后端的客户端超时，默认 `15000`。 |
| `PRISMA_LOG_QUERIES` | 设为 `true` 时输出 Prisma query 日志。 |
| `LOG_LEVEL` | Winston 日志级别，默认 `info`。 |
| `TZ` | 时区。未设置时默认为 `Asia/Shanghai`。 |

## 路由和权限

所有路由由 `src/routes/index.ts` 聚合：

- `/agentRuntime/*`：通用 Agent 会话和运行 API
- `/user-preferences/*`：前端用户偏好 API
- `/productConfigAgent/*`：合同配置抽取、治理、归档、Agent API
- `/quoteAgent/*`：从 `/productConfigAgent/*` 自动生成的旧路径兼容 API
- 部分 `/api/*`：前端旧调用兼容路径，例如 extraction 和 dictionary product type

认证策略：

- `PORT=2001` 被视为本地开发模式，`routeAuth` 会允许 `x-user-id` 或默认 `local-dev` 用户通过。
- 非本地端口需要 JWT，推荐使用 `Authorization: Bearer <token>`。
- ProductConfigAgent 写接口在生产环境还要求用户 id 出现在 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`。
- `authService` 当前也兼容 `token` header 和 query token。公网部署前建议收敛为 Authorization header，避免 URL 泄露 token。

## ProductConfigAgent

核心文档见：

- [ProductConfigAgent 模块说明](src/productConfigAgent/README.md)
- [ProductConfigAgent API](src/productConfigAgent/productConfigAgent.api.md)
- [ProductConfigAgent Flow](src/productConfigAgent/FLOW.md)
- [架构审查报告](docs/ARCHITECTURE_REVIEW.md)

主要工作流：

1. 注册合同文件，计算 hash，解析 Excel block，写入 `documents` 和 `document_blocks`。
2. 对 block 执行两阶段 LLM 抽取，校验 raw extraction shape。
3. 根据字典、单位、范围、选项、主数据和产品路由规则归一化。
4. 生成候选项，进入字典治理、拆分、别名、概念解析、健康审计。
5. 满足 readiness 后创建归档，支持 JSON patch、版本快照、产品绑定和搜索。
6. Agent runtime 使用工具链生成、验证、保存产品配置草稿。

## 后台任务和运维脚本

单独运行 ProductConfigAgent worker：

```bash
npm run product-config-agent:worker
```

或在 API 进程内启用：

```env
PRODUCT_CONFIG_AGENT_WORKER_ENABLED=true
```

常用脚本：

```bash
npm run product-config-agent:parse-production-detail-excels
npm run product-config-agent:report-duplicate-production-detail-documents
npm run product-config-agent:apply-duplicate-production-detail-documents
npm run product-config-agent:normalize-full
npm run product-config-agent:concept-resolver-backfill
npm run product-config-agent:concept-resolver-audit
npm run product-config-agent:refresh-master-data-bindings
npm run product-config-agent:consolidate-qualifier-terms
npm run product-config-agent:reextract-cross-concept
npm run product-config-agent:upgrade-excel-blocks-options
```

后台队列表为 `background_jobs`，worker 支持：

- `pending_llm_upload`
- `dictionary_dirty_refresh`
- `concept_resolver_backfill`
- `dictionary_health_audit`
- `archive_dirty_refresh`
- `daily_maintenance`

## 验证

当前基线：

```bash
npm run build
npm test
```

最近一次检查结果：TypeScript 编译通过，`npm test` 共 72 个测试全部通过。

迁移或文档更新后建议至少运行：

```bash
npm run prisma:validate
npm run build
npm test
```

## 生产部署注意事项

- 不要在公网生产环境使用 `PORT=2001`，否则会进入本地开发认证旁路。
- 必须设置强 `JWT_SECRET`，并配置 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`。
- 建议移除 query token 入口，避免 token 出现在访问日志、浏览器历史和代理日志。
- `/productConfigAgent/contracts/upload` 依赖服务端可访问的 `filePath`，生产环境应明确上传目录、权限和路径白名单。
- 全局错误处理当前会返回原始 error message，生产环境建议改为脱敏响应。
- 已安装 `express-rate-limit`，但入口尚未启用；公网部署前建议加到认证和 LLM/写接口前。
- LLM 调用会记录输入输出日志，涉及敏感合同内容时需要明确保留周期和访问权限。
