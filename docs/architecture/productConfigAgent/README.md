# ProductConfigAgent

`ProductConfigAgent` 是从旧 `jdy_backend` 迁移到 Prisma 的合同配置抽取与治理模块。它负责把生产明细/合同 Excel 转换为结构化配置，经过 LLM 抽取、规则归一化、字典治理、归档和搜索，最终服务前端和 Agent 工具链。

## 模块边界

- `routes/productConfigAgent.routes.ts`：公开 API route table，自动生成 `/quoteAgent/*` 兼容路径。
- `service.ts`：面向路由的业务编排入口。
- `db.service.ts`：Prisma repository，封装 ProductConfigAgent 数据访问。
- `workflow/`：block 解析、抽取流程、pending LLM job、每日维护、重复文档分析。
- `excelParser/`：Excel 到 block/`llm_text` 的解析。
- `extraction/`：两阶段 LLM planned extraction、结果校验和兼容 shape。
- `normalization/`：抽取结果归一化规则，包括单位、范围、选项、产品路由、主数据匹配。
- `dictionary/`：字典匹配、候选项治理、概念解析、策略评分、健康报告。
- `archive/`：归档 readiness、归档快照、JSON patch、版本、产品配置搜索。
- `agent/` 与 `tools/`：ProductConfigAgent 的 planner、executor 和工具实现。
- `erpIdentityLookup.service.ts` 与 `erpIdentityMatcher.ts`：报价包产品项到 ERP Company + PartNum 的只读候选查询和一对一匹配，详见 `erp-product-identity.md`。
- `worker/`：基于 `background_jobs` 的可恢复后台任务 worker。

旧 TypeORM 布局仅作为行为参考，不应新增 TypeORM 依赖。

## 运行时形态

所有 ProductConfigAgent 主路径以 `/productConfigAgent/*` 暴露。`LegacyProductConfigAgentRoutes` 会从同一张 route table 生成 `/quoteAgent/*`，因此新旧路径共享同一套 action、权限和业务逻辑。

权限分为两类：

- 读接口使用 `withProductConfigAgentToken`，非生产环境的本地 `2030` 端口可通过 `x-user-id` 或默认 `local-dev` 进入，生产环境需要 JWT。
- 写接口使用 `withProductConfigAgentAdmin`，生产环境要求 JWT 用户 id 在 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS` 或 `QUOTE_AGENT_ADMIN_USER_IDS` 中。

## 核心工作流

### 1. 合同上传与注册

入口通常是 `POST /productConfigAgent/contracts/upload`。当前 API 接收服务端 `filePath`，会先检查文件可访问，再调用 `registerDocument`。

主要步骤：

1. 读取文件并计算 sha256 hash。
2. 创建或复用文档记录，保留重复上传信息。
3. 如果没有传入 `blocksJson`，解析 `.xls/.xlsx` 得到 sheet/row blocks。
4. 写入 `document_blocks`，保存 parser version 和 `llm_text`。
5. 文档进入可抽取状态。

重复文件不会简单丢弃；系统会通过 `document_duplicates` 保存重复关系，后续可做 canonical document 分析。

### 2. Excel 解析

`excelParser/index.ts` 将 workbook 转成面向 LLM 的 block 数据：

- 保留 sheet、row、cell 和文本证据。
- 对选项文本生成 option set 信息。
- 生成 `llm_text`，供 hash、抽取 prompt 和重复分析使用。
- 清理 null、异常空白和不稳定文本。

批量解析入口：

- API：`POST /productConfigAgent/workflows/parse-blocks-batch`
- 脚本：`npm run product-config-agent:parse-production-detail-excels`

### 3. LLM 抽取

抽取使用 planned extraction 两阶段流程：

1. 先规划文档内容和 item 范围。
2. 再按计划抽取 item raw fields。
3. 校验 LLM 输出必须是 raw extraction shape。
4. 拒绝在 raw stage 出现字典归一化字段，避免模型提前“猜标准答案”。

LLM 调用经由 `llm/routedChatClient.ts`，默认根据模型前缀或 `LLM_GATEWAY` 选择 InferAIChat 或 XH。调用日志写入 `llm_call_logs`。

### 4. 归一化

`normalization/` 把 raw extraction 转为更稳定的业务结构。主要规则包括：

- item index 去重和排序。
- 数值、单位、范围、上下界字段合并。
- 选项字段和未选项过滤。
- 产品类型推断与字段重定向。
- 文档信息字段与 item 字段分流。
- qualifier、孔径、层级、备注、拆分字段保留。
- 字典别名、单位别名、主数据模型匹配。

归一化会产生 warnings 和 dictionary proposals，供治理和归档 readiness 使用。

### 5. 字典治理

治理围绕候选项、别名、拆分、概念解析和健康报告展开：

- `dictionary_candidates` 保存未解析 term type/value/unit。
- review action 可批准、拒绝、创建标准值、创建 term type、标记 alias、拆分复合值、移动 term type。
- 字典变化会 bump dictionary version，并标记受影响文档 `dictionaryDirty`。
- dirty refresh 会重新归一化文档、刷新候选项，并刷新已有归档。
- concept resolver 用于发现跨概念、复合字段、文档级字段等问题。
- health audit 汇总重复 alias、pending 压力、拆分建议和风险标签。

### 6. 归档与搜索

归档前通过 readiness 检查：

- 是否存在可用 blocks。
- 是否存在 normalized extraction。
- 是否仍有阻塞候选项。
- item 是否有产品编号或产品绑定。

归档写入 archive snapshot、items、product bindings 和版本记录。`archive/jsonPatch.ts` 只允许编辑安全路径，阻止 status、id、binding、prototype 等危险路径。搜索通过 `product-configs/search` 查询归档和产品绑定，兼容旧 product config match shape。

### 7. Agent Runtime

ProductConfigAgent 使用通用 `agentRuntime` 保存 session、message、run、tool call 和 generated config。模块内 planner 会根据用户意图选择工具链，executor 记录工具结果，草稿通过 `validateConfig` 后才保存。

相关工具包括：

- `searchIndustryConfigs`
- `searchCustomerConfigs`
- `searchSimilarConfigs`
- `getProductRules`
- `generateConfigDraft`
- `validateConfig`
- `saveProductConfig`

### 8. 后台任务

`background_jobs` 是单一可恢复 worker 队列。`worker/backgroundWorker.ts` 会 claim queued 或 stale-running jobs，执行后 complete 或 fail。

支持 job type：

- `pending_llm_upload`：处理已解析但未抽取文档。
- `dictionary_dirty_refresh`：刷新字典变更影响的文档。
- `concept_resolver_backfill`：运行概念解析。
- `dictionary_health_audit`：生成字典健康报告。
- `archive_dirty_refresh`：刷新 dirty archive。
- `daily_maintenance`：组合执行 dirty refresh、archive refresh、health audit。

运行方式：

```bash
npm run product-config-agent:worker
```

或在 API 进程内设置：

```env
PRODUCT_CONFIG_AGENT_WORKER_ENABLED=true
```

## 重要兼容路径

- 所有 `/productConfigAgent/*` 自动生成 `/quoteAgent/*` 兼容路径。
- extraction 相关部分保留 `/api/extractions*`。
- dictionary product type 保留 `/api/dictionary/product-types`。

新增接口时应优先添加到 `/productConfigAgent/*`，再明确是否需要旧路径兼容。

## 验证

模块级改动后建议运行：

```bash
npm run prisma:validate
npm run build
npm test
```

当前测试覆盖重点：

- Excel parser 和 block parsing
- planned extraction 校验
- normalization rules
- dictionary governance 和 health report
- archive readiness、json patch、search
- pending LLM job 和 daily maintenance
- ProductConfigAgent agent runtime
