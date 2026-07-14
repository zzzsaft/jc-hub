# 独立 XTools CRM PostgreSQL 导出器设计

## 目标

交付一个可单独复制到 Windows 电脑运行的 Node.js 工具。该电脑位于 CRM 允许的 IP，操作员通过可见浏览器正常登录；工具随后只读导出订单、行动列表和订单相关行动详情，先保存本地 JSONL，再幂等写入 jc-hub 使用的 PostgreSQL。

工具不依赖 jc-hub 源码、服务端或 Prisma，只从同目录 `.env` 读取 `DATABASE_URL`。它同时支持首次全量导入、异常续跑和后续增量同步。

## 授权与安全边界

- 只使用操作员在可见 Chromium 中正常登录后、页面请求本身携带的授权参数。
- 不保存 CRM 用户名、密码、Cookie 或浏览器配置；会话参数只保存在进程内存中。
- 不绕过 IP、并发登录、角色权限或会话过期控制。
- CRM 请求保持单线程，默认间隔 800ms，可通过 `XCRM_DELAY_MS` 调整。
- 会话过期时停止请求并提示重新登录；成功后从检查点继续。
- `.env`、本地 JSONL、检查点和真实数据不进入交付 ZIP 或版本库。
- 附件仅保存名称和移除会话参数后的相对路径，不下载附件内容。

## 独立目录

```text
xtcrm-exporter/
├── package.json
├── package-lock.json
├── README.md
├── .env.example
├── schema.sql
├── setup.cmd
├── start.cmd
├── start-full.cmd
├── upload.cmd
├── refresh-details.cmd
├── src/
├── test/
└── data/                 # 运行时生成，不进入 ZIP
```

生产依赖仅包含 Playwright、`pg` 和 `dotenv`。运行环境为 Windows 和 Node.js 20 LTS；`setup.cmd` 安装依赖并下载 Chromium。

## 登录与会话捕获

1. 工具启动可见 Chromium，并打开 CRM 登录页。
2. 操作员手动输入凭据并进入工作台。
3. 工具点击页面自身的“日程任务”菜单，读取页面脚本中行动列表、行动详情和公共会话参数。
4. 工具点击页面自身的“合同订单”菜单，读取订单列表参数。
5. 工具验证两个模块属于同一会话，然后开始导出，并保持浏览器开启。

工具不直接拼接模块页面地址，因为该系统可能把直接切换识别为异常会话。捕获逻辑只读取页面请求参数，不读取 Cookie、本地存储或密码字段。

## 数据流

```text
可见浏览器手动登录
        ↓
捕获三个只读模块请求模板
        ↓
单线程请求 CRM（限速、重试、GB18030 解码）
        ↓
逐条写入 data/*.jsonl + 原子更新 checkpoint.json
        ↓
每 100 条事务 upsert PostgreSQL
        ↓
生成 CSV、manifest.json 和运行统计
```

本地 JSONL 是可靠缓冲区。PostgreSQL 不可用时 CRM 导出仍可继续；`upload.cmd` 可在数据库恢复后仅重放本地 JSONL。每个 JSONL 文件以 CRM ID 去重，重复续跑不会生成重复数据。

## PostgreSQL 模型

工具首次运行在事务中创建 `xtcrm_import` schema 和以下表：

### `orders`

- `crm_id text primary key`
- `mdb text`
- `order_numbers text[]`
- `subject text`
- `category text`
- `customer_name text`
- `begin_date_raw text`
- 金额原文：`total_amount_raw`、`paid_amount_raw`、`invoiced_amount_raw`
- `delivery_status`、`return_status`、`status`、`owner`、`supplemental`
- `source_page integer`、`fetched_at timestamptz`
- `raw_json jsonb`、`updated_at timestamptz`

### `actions`

- `crm_id text primary key`
- `mdb text`
- `order_numbers text[]`、`is_order_followup boolean`
- `category`、`subject`、`status`、`priority`
- `customer_name`、`begin_date_raw`、`executor`
- `source_page`、`fetched_at`、`raw_json`、`updated_at`

### `action_details`

- `action_id text primary key references actions(crm_id)`
- `subject`、`content`、`executor`
- `extra_fields jsonb`、`form_fields jsonb`、`attachments jsonb`
- `fetched_at`、`raw_json`、`updated_at`

### `order_action_links`

- `order_id text references orders(crm_id)`
- `action_id text references actions(crm_id)`
- `order_number text`
- 以上三列构成主键

### `sync_runs`

- `id uuid primary key`
- `mode text`、`stage text`、`status text`
- `started_at`、`completed_at`
- `orders_count`、`actions_count`、`details_count`、`links_count`、`errors_count`
- `last_error text`、`metadata jsonb`

结构化列供 jc-hub 查询，`raw_json` 保留完整抓取记录以兼容 CRM 字段变化。所有 SQL 使用参数绑定；每批 upsert 在事务中执行。

## 全量与增量规则

### 首次全量

- 扫描全部订单页和行动页。
- 根据行动主题中的精确订单号建立关联。
- 为全部订单相关行动读取详情。
- 生成未匹配订单号报告，不做模糊关联。

### 后续增量

- 重新扫描订单和行动列表，并按 CRM ID upsert，以覆盖新增和列表字段变更。
- 只读取数据库和本地 JSONL 中尚无详情的订单相关行动。
- `refresh-details.cmd` 明确要求时，重新读取全部既有详情。
- CRM 在扫描期间新增记录可能导致分页移动；列表扫描结束后重新读取前若干页并 upsert，直到连续一轮没有新 ID，减少遗漏。

## 检查点与错误处理

- 检查点阶段为 `orders`、`actions`、`details`、`links`、`upload`、`complete`。
- 列表每页保存检查点；详情逐条写 JSONL，每 10 条保存检查点。
- HTTP 429、502、503、504 和网络错误按 2/5/10 秒退避重试。
- 登录页响应触发暂停，不被记录成普通详情错误。
- 单条详情持续失败时写入 `errors.jsonl` 并继续，最终统计失败数。
- PostgreSQL 批次失败时回滚该批，不删除或修改本地 JSONL。
- 进度输出至少包含阶段、已处理/总数、成功数、失败数和最终状态。

## Windows 命令

- `setup.cmd`：安装 npm 依赖和 Chromium。
- `start.cmd`：自动判断首次全量或后续增量。
- `start-full.cmd`：强制重新扫描全部列表和缺失详情。
- `refresh-details.cmd`：重新读取全部订单相关详情。
- `upload.cmd`：不访问 CRM，仅把已有 JSONL 补传 PostgreSQL。

## 验证与交付

自动测试覆盖：

- GB18030 响应解码和登录/权限页面识别。
- CRM 嵌套表格 HTML、订单号提取、多订单行动和详情字段。
- JSONL ID 去重、检查点恢复和增量详情选择。
- PostgreSQL 参数映射、事务回滚和 upsert SQL。
- 浏览器会话捕获使用离线 HTML/脚本样本测试，不在测试中保存真实令牌。

交付前运行 Node 测试、离线冒烟导出、PostgreSQL schema 语法检查，并在 Windows 命令文件中检查含空格路径。最终生成不含 `.env`、`data/`、浏览器资料和真实令牌的 ZIP。

## 非目标

- 不下载附件文件。
- 不修改 CRM 数据。
- 不实现多线程或多会话抓取。
- 不创建 jc-hub 后端 API 或管理界面。
- 不把 CRM 密码或会话令牌长期保存到 PostgreSQL。
