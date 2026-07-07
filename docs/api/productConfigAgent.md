# ProductConfigAgent API

本文档记录当前 ProductConfigAgent API 面向调用方的路由、权限和关键字段。接口实现源头是 `routes/productConfigAgent.routes.ts`；所有 `/productConfigAgent/*` 路由都会自动生成 `/quoteAgent/*` 旧路径兼容别名。

## 认证与权限

认证由 `routeAuth` 和 ProductConfigAgent route wrapper 处理：

- 本地开发：当有效端口为 `2001` 时，系统视为 local dev。读写接口默认允许请求通过，用户 id 来自 `x-user-id`，没有传则为 `local-dev`。
- 生产/非本地端口：读接口需要 JWT。推荐使用 `Authorization: Bearer <token>`。
- 生产写接口：除 JWT 外，还要求用户 id 出现在 `PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS`，兼容变量为 `QUOTE_AGENT_ADMIN_USER_IDS`。
- 公开分享接口 `GET /productConfigAgent/agent/shared/:shareToken` 不需要登录，但会校验 token 未撤销且未过期。

注意：当前 `authService` 仍兼容 `token` header 和 query token。公网环境建议只使用 Authorization header，避免 token 泄露到 URL、日志或代理记录。

## 兼容路径

- `/quoteAgent/*`：由 `/productConfigAgent/*` 自动映射，行为和权限完全一致。
- `/api/extractions*`：兼容旧前端 extraction 调用。
- `/api/dictionary/product-types`：兼容旧前端产品类型字典调用。

新增调用方应优先使用 `/productConfigAgent/*`。

## 通用约定

- 分页参数通常为 `page`、`pageSize`，部分兼容 `page_size`。
- id 参数可传字符串形式，服务端会在需要时转换为 `BigInt`。
- 写接口失败通常返回 `{ "error": "message" }`。
- LLM 或批处理接口可能返回 job id、progress、resultJson，需通过 jobs API 查询最终状态。

## Agent

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/productConfigAgent/agent/sessions` | token | 列出当前用户 ProductConfigAgent sessions。 |
| `POST` | `/productConfigAgent/agent/run` | token | 运行 ProductConfigAgent agent。 |
| `GET` | `/productConfigAgent/agent/sessions/:sessionId` | token | 获取 session 详情。 |
| `GET` | `/productConfigAgent/agent/configs/:id` | token | 获取生成配置。 |
| `POST` | `/productConfigAgent/agent/configs/:id/share-token` | token | 创建 30 天分享 token。 |
| `POST` | `/productConfigAgent/agent/configs/:id/share-token/revoke` | token | 撤销分享 token。 |
| `GET` | `/productConfigAgent/agent/shared/:shareToken` | public | 通过分享 token 获取配置。 |

`POST /agent/run` 关键字段：

- `message`：必填，用户输入。
- `sessionId`：可选，复用已有 session。
- `confirmed`：可选，确认型操作标志。
- `referenceConfigId`：可选，参考配置 id。
- `llmModel`：可选，覆盖默认模型。
- `context`：可选，附加上下文对象。

## Documents And Extraction

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/productConfigAgent/contracts/upload` | admin | 注册合同文件并解析 blocks。 |
| `GET` | `/productConfigAgent/contracts/summary` | token | 合同统计摘要。 |
| `GET` | `/productConfigAgent/contracts` | token | 列出合同文档。 |
| `GET` | `/productConfigAgent/contracts/:documentId` | token | 获取合同详情。 |
| `PUT` | `/productConfigAgent/contracts/:documentId/blocks` | admin | 覆盖保存 blocks。 |
| `GET` | `/productConfigAgent/documents/:documentId/open-file` | token | 返回文档文件访问结果。 |
| `GET` | `/productConfigAgent/extractions` | token | 列出抽取结果。 |
| `GET` | `/productConfigAgent/extractions/llm-summary` | token | LLM 调用摘要。 |
| `GET` | `/productConfigAgent/extractions/:documentId` | token | 获取文档抽取结果。 |
| `POST` | `/productConfigAgent/extractions/:documentId/reextract` | admin | 强制重新抽取。 |
| `POST` | `/productConfigAgent/extractions/:documentId/renormalize` | admin | 重新归一化文档最新抽取。 |
| `POST` | `/productConfigAgent/extraction-results/:extractionResultId/renormalize` | admin | 重新归一化指定抽取结果。 |
| `POST` | `/productConfigAgent/extractions/renormalize-batch` | admin | 批量重新归一化。 |
| `POST` | `/productConfigAgent/workflows/parse-blocks-batch` | admin | 批量解析文件 blocks。 |

`POST /contracts/upload` 关键字段：

- `filePath`：必填，服务端可访问文件路径。
- `fileName`：可选，默认使用 `path.basename(filePath)`。
- `source`：可选，默认 `manual`。
- `blocksJson`：可选，传入后可跳过 Excel 解析。

`GET /contracts` 常用查询：

- `page`、`pageSize`
- `status`
- `q`
- `productNumber` 或 `product_number`
- `customerId` 或 `customer_id`

## Jobs

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/productConfigAgent/jobs/:jobId` | token | 获取后台任务详情。 |
| `GET` | `/productConfigAgent/background-jobs` | token | 列出后台任务。 |
| `GET` | `/productConfigAgent/background-jobs/:jobId` | token | 获取后台任务详情。 |
| `GET` | `/productConfigAgent/documents/pending-llm-upload/status` | token | 查询 pending LLM 批处理状态。 |
| `POST` | `/productConfigAgent/documents/pending-llm-upload/start` | admin | 创建或启动 pending LLM 批处理。 |
| `GET` | `/productConfigAgent/dictionary-dirty/refresh/status` | token | 查询字典 dirty refresh 状态。 |
| `POST` | `/productConfigAgent/dictionary-dirty/refresh/start` | admin | 启动字典 dirty refresh。 |

`POST /pending-llm-upload/start` 关键字段：

- `limit`：可选，批处理文档数量。
- `concurrency`：可选，服务端会限制在合理范围内。
- `llmModel`：可选，覆盖默认模型。

## Dictionary And Governance

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/productConfigAgent/dictionary/term-types` | token | 列出 term types。 |
| `POST` | `/productConfigAgent/dictionary/term-types` | admin | 创建或 upsert term type。 |
| `PUT` | `/productConfigAgent/dictionary/term-types/:id` | admin | 更新 term type。 |
| `DELETE` | `/productConfigAgent/dictionary/term-types/:id` | admin | 删除 term type。 |
| `GET` | `/productConfigAgent/dictionary/values` | token | 列出字典值。 |
| `POST` | `/productConfigAgent/dictionary/values` | admin | 创建或 upsert 字典值。 |
| `PUT` | `/productConfigAgent/dictionary/values/:id` | admin | 更新字典值。 |
| `DELETE` | `/productConfigAgent/dictionary/values/:id` | admin | 删除字典值。 |
| `GET` | `/productConfigAgent/dictionary/unit-aliases` | token | 列出单位别名。 |
| `POST` | `/productConfigAgent/dictionary/unit-aliases` | admin | 创建单位别名。 |
| `DELETE` | `/productConfigAgent/dictionary/unit-aliases/:id` | admin | 删除单位别名。 |
| `GET` | `/productConfigAgent/candidates` | token | 列出候选项。 |
| `GET` | `/productConfigAgent/candidates/suggestions` | token | 获取候选建议。 |
| `POST` | `/productConfigAgent/candidates/suggestions/batch` | admin | 批量生成候选建议。 |
| `GET` | `/productConfigAgent/candidates/clusters` | token | 候选聚类。 |
| `GET` | `/productConfigAgent/candidates/clusters/review-prompt` | token | 聚类 review prompt。 |
| `POST` | `/productConfigAgent/candidates/clusters/suggestions/batch` | admin | 批量生成聚类建议。 |
| `POST` | `/productConfigAgent/candidates/reviews/batch` | admin | 批量 review 候选。 |
| `GET` | `/productConfigAgent/candidates/splits` | token | 列出拆分建议。 |
| `GET` | `/productConfigAgent/candidates/units` | token | 列出单位候选。 |
| `GET` | `/productConfigAgent/candidates/units/review-prompt` | token | 单位候选 review prompt。 |
| `POST` | `/productConfigAgent/candidates/units/:candidateId/approve` | admin | 批准单位候选。 |
| `POST` | `/productConfigAgent/candidates/units/:candidateId/reject` | admin | 拒绝单位候选。 |
| `POST` | `/productConfigAgent/candidates/:candidateId/review` | admin | review 单个候选。 |
| `POST` | `/productConfigAgent/candidates/:type/:candidateId/reject` | admin | 按类型拒绝候选。 |

候选治理还保留以下语义化快捷路径：

- `POST /productConfigAgent/candidates/term-type/:candidateId/create-term-type`
- `POST /productConfigAgent/candidates/term-type/:candidateId/suggest`
- `POST /productConfigAgent/candidates/term-type/:candidateId/approve-as-alias`
- `POST /productConfigAgent/candidates/term-type/:candidateId/split`
- `POST /productConfigAgent/candidates/term-type/:candidateId/mark-as-doc-info`
- `POST /productConfigAgent/candidates/value/:candidateId/create-value`
- `POST /productConfigAgent/candidates/value/:candidateId/split`
- `POST /productConfigAgent/candidates/value/:candidateId/split-suggest`
- `POST /productConfigAgent/candidates/value/:candidateId/move-to-term-type`
- `POST /productConfigAgent/candidates/value/:candidateId/approve-as-alias`
- `POST /productConfigAgent/candidates/value/:candidateId/update-term-type-kind`

`review` 关键字段：

- `action`：必填，支持 approve、reject、create-value、approve-as-alias、split、move-to-term-type 等兼容写法。
- `candidateType`：可选，term-type/value/unit 等。
- `canonicalValue`：可选，标准值。
- `targetTermType` 或 `termType`：可选，目标 term type。
- `parts` 或 `splits`：可选，拆分结果。
- `note`：可选，review 备注。

## Concept Resolver And Health

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/productConfigAgent/concept-resolver/run` | admin | 运行概念解析。 |
| `GET` | `/productConfigAgent/concept-resolver/runs/:runId` | token | 获取解析 run。 |
| `GET` | `/productConfigAgent/concept-resolver/resolutions` | token | 列出解析结果。 |
| `GET` | `/productConfigAgent/concept-resolver/patterns` | token | 列出概念模式。 |
| `POST` | `/productConfigAgent/concept-resolver/patterns/:id/review` | admin | review 概念模式。 |
| `POST` | `/productConfigAgent/concept-resolver/patterns/:id/apply-candidates` | admin | 应用模式生成候选。 |
| `POST` | `/productConfigAgent/dictionary/health/audit` | admin | 创建字典健康审计任务或报告。 |
| `GET` | `/productConfigAgent/dictionary/health-audit/jobs` | token | 查看健康审计 jobs。 |
| `GET` | `/productConfigAgent/dictionary/health-report` | token | 查看健康报告。 |

## Master Data

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/productConfigAgent/master-data/model-binding` | token | 查询模型绑定。 |
| `POST` | `/productConfigAgent/master-data/model-binding` | admin | 写入模型绑定。 |

## Archive And Search

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/productConfigAgent/contract-archives` | token | 列出归档。 |
| `POST` | `/productConfigAgent/contract-archives` | admin | 创建归档。 |
| `POST` | `/productConfigAgent/contracts/:documentId/archive` | admin | 从文档创建归档。 |
| `GET` | `/productConfigAgent/contracts/:documentId/archive-readiness` | token | 检查归档 readiness。 |
| `GET` | `/productConfigAgent/contract-archives/:archiveId` | token | 获取归档详情。 |
| `GET` | `/productConfigAgent/contract-archives/:archiveId/snapshot` | token | 获取归档快照。 |
| `PATCH` | `/productConfigAgent/contract-archives/:archiveId` | admin | 对安全路径应用 JSON patch。 |
| `GET` | `/productConfigAgent/contract-archives/:archiveId/versions` | token | 列出归档版本。 |
| `GET` | `/productConfigAgent/contract-archives/:archiveId/versions/:version` | token | 获取指定版本。 |
| `PUT` | `/productConfigAgent/contract-archives/:archiveId/items/:itemId/product-bindings` | admin | 替换 item 产品绑定。 |
| `GET` | `/productConfigAgent/product-configs/search` | token | 搜索归档产品配置。 |

`PATCH /contract-archives/:archiveId` 关键字段：

- `changes`：数组，JSON patch 风格变更。服务端只允许 docInfo 和 item 中安全字段。

`GET /product-configs/search` 常用查询：

- `q` 或 `query`
- `model`
- `limit`

## Legacy `/api/*` Compatibility

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/extractions` | token | 同 `GET /productConfigAgent/extractions`。 |
| `GET` | `/api/extractions/llm-summary` | token | 同 `GET /productConfigAgent/extractions/llm-summary`。 |
| `GET` | `/api/extractions/:documentId` | token | 同 `GET /productConfigAgent/extractions/:documentId`。 |
| `POST` | `/api/extractions/:documentId/reextract` | admin | 同 reextract。 |
| `POST` | `/api/extractions/:documentId/renormalize` | admin | 同 renormalize。 |
| `POST` | `/api/extraction-results/:extractionResultId/renormalize` | admin | 同 extraction result renormalize。 |
| `GET` | `/api/dictionary/product-types` | token | 同 term types。 |
