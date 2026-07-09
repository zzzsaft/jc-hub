# Agent Backend

`agent` 是从 `jdy_backend` 迁移出来的 Prisma 后端服务，承载 LLM 调用、通用 Agent Runtime、ProductConfigAgent 以及 `/quoteAgent/*` 兼容接口。当前项目已经移除旧 TypeORM 运行时，数据库访问统一通过 Prisma 和 PostgreSQL 多 schema。

## 技术栈

- Node.js + TypeScript + ESM
- Express route table，不使用 Express Router 子模块
- Prisma + PostgreSQL，使用 `agent`、`erp_agent`、`production_config_agent` 等 schema
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
  schema.prisma                    # 多 schema Prisma 模型
  migrations/                      # 数据库迁移
test/
  productConfigAgent/              # 归一化、字典、归档、worker、agent runtime 测试
docs/
  api/                             # 后端接口文档
  architecture/                    # 架构、流程、模块设计
  frontend/                        # 前端页面、组件、样式规范
  operations/                      # 脚本、运维、迁移、排查记录
  archive/                         # 历史文档
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

开发服务默认监听 `http://localhost:2030`，健康检查为：

```bash
curl http://localhost:2030/health
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

Prisma datasource 启用了 `multiSchema`。核心 schema 分工：

- `agent`：通用 Agent runtime、LLM 调用日志、前端偏好和集成日志等共享表
- `erp_agent`：ERP SQL Agent 的 schema 知识层、SQL trace、SQL template、指标目录
- `production_config_agent`：ProductConfigAgent 的 documents、blocks、extractions、dictionary、candidates、archives、jobs
- `hr_performance_agent`：人事绩效相关 Agent 的隔离 schema
- LLM call logs：provider、model、purpose、input/output、latency、status

旧 `agent.*` 生产配置/ERP 表名保留兼容 view；新代码应直接访问真实 domain schema。

常用数据库命令：

```bash
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
```

人事绩效只读隔离账号用本机密码执行：

```bash
export DATABASE_URL="$(node -e "require('dotenv').config(); process.stdout.write(process.env.DATABASE_URL || '')")"
psql "$DATABASE_URL" -v app_reader=jc_hub_reader -v app_reader_password='change-me' -v hr_reader=jc_hub_hr_performance_reader -v hr_reader_password='change-me' -f docs/operations/hr-performance-postgres-access.sql
```

## 环境变量

以 `.env.example` 为基准：

根目录 `.env` 按生产可复制配置维护；本地开发差异放 `.env.dev`，后端在非生产环境会自动加载并覆盖 `.env` 中的同名变量。

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串，必须可访问 `agent`、`erp_agent`、`production_config_agent`、`identity`、`integration`、`hr_performance_agent` schema。 |
| `DATABASE_URL_READONLY` | 可选，普通只读账号连接串，只授予非人事绩效 schema 的读取权限。 |
| `HR_PERFORMANCE_DATABASE_URL` | 可选，人事绩效只读账号连接串，只授予 `hr_performance_agent` 的读取权限；真实值放本机 `.env` 或未提交的 `.env.*`。 |
| `PORT` | 服务端口。默认 `2030`。 |
| `JWT_SECRET` | JWT 签名密钥。生产环境必须设置强随机值。 |
| `LLM_GATEWAY` | 默认 LLM 网关，当前支持 `inferaichat` 和 `xh`。 |
| `LLM_MODEL` | 可选的全局模型覆盖值。 |
| `LLM_CONCURRENCY_LIMIT` | API 进程内 LLM 调用并发上限，默认 `12`。 |
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
| `ERP_SQL_DB_CONCURRENCY` | 可选的 Prisma 查询并发上限，生产推荐 `6`；模板、schema 和 LLM 日志轻量读写不占该队列。 |
| `ERP_SQL_GUARD_CONCURRENCY` | ERP SQL schema guard 并发上限，默认 `4`。 |
| `ERP_SQL_REFERENCE_SOFT_TIMEOUT_MS` | ERP SQL reference lookup 软超时，默认 `2500`。 |
| `ERP_SQL_TEMPLATE_CACHE_TTL_MS` | Approved SQL template 进程内缓存 TTL，默认 `60000`；设为 `0` 可关闭。 |
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

- `NODE_ENV` 非生产且 `PORT=2030` 被视为本地开发模式，`routeAuth` 会允许 `x-user-id` 或默认 `local-dev` 用户通过。
- 非本地端口需要 JWT，推荐使用 `Authorization: Bearer <token>`。
- ProductConfigAgent 写接口在生产环境还要求用户 id 出现在 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`。
- `authService` 当前也兼容 `token` header 和 query token。公网部署前建议收敛为 Authorization header，避免 URL 泄露 token。

## ProductConfigAgent

核心文档见：

- [ProductConfigAgent 模块说明](docs/architecture/productConfigAgent/README.md)
- [ProductConfigAgent API](docs/api/productConfigAgent.md)
- [ProductConfigAgent Flow](docs/architecture/productConfigAgent/FLOW.md)
- [架构审查报告](docs/architecture/ARCHITECTURE_REVIEW.md)

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

- 不要在公网生产环境使用非生产 `NODE_ENV`，否则 `PORT=2030` 会进入本地开发认证旁路。
- 必须设置强 `JWT_SECRET`，并配置 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`。
- 建议移除 query token 入口，避免 token 出现在访问日志、浏览器历史和代理日志。
- `/productConfigAgent/contracts/upload` 依赖服务端可访问的 `filePath`，生产环境应明确上传目录、权限和路径白名单。
- 全局错误处理当前会返回原始 error message，生产环境建议改为脱敏响应。
- 已安装 `express-rate-limit`，但入口尚未启用；公网部署前建议加到认证和 LLM/写接口前。
- LLM 调用会记录输入输出日志，涉及敏感合同内容时需要明确保留周期和访问权限。
