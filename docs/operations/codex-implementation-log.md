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

### 2026-07-08 字典表格和归档详情收口

- 背景：`DictionaryDataTable.tsx`、`ArchiveDetailPage.tsx` 均略超 300 行，是前端结构合规检查中最后一批超线文件。
- 实现：为字典表格拆出 `DictionaryDataTable.storage.ts`，并将轻量 `tableWidth` 计算改为直接计算，清掉该文件的 hook 依赖 warning；为归档详情页拆出 `ArchiveDetailSkeleton.tsx`。拆分后字典表格 293 行、归档详情页 282 行。
- 决策：不拆表格行渲染和归档编辑区，当前文件已低于规范线，避免为少量行数制造更深组件层级。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，warning 从 27 个降到 26 个、0 error；对 `quoteAgent`、`quoteAgentDictionary`、`externalContact` 执行行数扫描，未发现 300 行以上文件。

### 2026-07-08 产品主数据面板拆分

- 背景：`ProductMasterDataPanel.tsx` 略超 300 行，主数据归一化 helper、明细展示和搜索绑定流程集中在一个组件文件。
- 实现：拆出 `ProductMasterDataDetail.tsx` 和 `ProductMasterDataPanel.utils.ts`，主面板降到 256 行。
- 决策：保留原搜索、自动单条绑定和确认绑定流程，只移动展示组件和纯函数。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 conceptResolver review hook 筛选工具拆分

- 背景：`useConceptResolverReviewState.ts` 略超 300 行，底部筛选和排序纯函数与 hook 状态编排混在一个文件。
- 实现：拆出 `resolutionFilters.ts` 承接 resolution 搜索过滤和排序逻辑，主 hook 降到 278 行。
- 决策：只移动纯函数，不改 URL search params、加载和提交流程。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 conceptResolver proposal 列表拆分

- 背景：`ProposalList.tsx` 超过 400 行，列表容器、proposal 卡片、操作按钮和详情面板集中在一个组件文件。
- 实现：拆出 `ProposalCard`、`ProposalDetails` 和 `ProposalShared`，`ProposalList` 只保留列表状态、空态和卡片映射；所有拆分文件均低于 300 行。
- 决策：不改 props 和父组件调用，保持 health report、action intent 和 selection 行为不变。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 候选簇审核 hook 拆分

- 背景：`useCandidateClusterReviewState.ts` 超过 400 行，加载候选簇、生成 AI 建议、手动建议、批量提交和重跑归一化集中在一个 hook。
- 实现：拆出 `useCandidateClusterActions` 承接建议生成、提交、手动操作和 renormalize 批处理；主 hook 保留筛选、数据加载和派生列表，降到 231 行。
- 决策：不改 `CandidateClusterReviewPage` 的 state 使用方式，动作函数名和返回字段保持兼容。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 quoteAgent 页面状态 hook 拆分

- 背景：`useQuoteAgentPageState.ts` 超过 400 行，页面筛选、路由同步、详情/候选加载、上传、草稿和批量提交编排集中在一个 hook。
- 实现：拆出 `useQuoteAgentRouteSync`、`useQuoteAgentTaskLoaders`、`useQuoteAgentUploads`、`useQuoteAgentDrafts`、`useQuoteAgentActions` 和 `pageState.utils`；主 hook 保留页面对外返回契约并降到 277 行。
- 决策：不改页面组件引用和返回字段名，减少组件层联动风险。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 quoteAgent 候选簇工具拆分

- 背景：`candidateCluster.utils.ts` 超过 600 行，候选簇响应标准化、suggestion 合并、操作展开和批量结果文案混在一起。
- 实现：拆出 `candidateCluster.core.ts`、`candidateCluster.response.ts`、`candidateCluster.suggestion.ts`、`candidateCluster.result.ts`；原 `candidateCluster.utils.ts` 保留 re-export 入口。
- 决策：把 `suggestionOf` 和 operation 规范化保留在 core，避免 response 和 suggestion 模块互相依赖；调用方 import 路径不变。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 quoteAgent 工具文件拆分

- 背景：`quoteAgent/utils.ts` 超过 600 行，混合通用格式化、字段展示、归档审核摘要、浏览器存储和候选审核逻辑，不符合前端文件大小和职责拆分规范。
- 实现：拆出 `common.utils.ts`、`field.utils.ts`、`archiveReview.utils.ts`、`storage.utils.ts`、`review.utils.ts`；`utils.ts` 保留 re-export，现有调用方无需改 import。
- 决策：只移动纯函数和类型依赖，不调整业务行为；每个拆分文件均控制在 300 行以内。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 quoteAgent 类型文件拆分

- 背景：`quoteAgent/types.ts` 超过 700 行，混合文档、字段、候选、字典、归档、单位候选等类型，不符合前端文件大小和职责拆分规范。
- 实现：按领域拆出 `status/review/field/document/masterData/dictionary/candidate/archive/unit` 类型文件；`types.ts` 保留 re-export 兼容现有调用方。
- 决策：不改现有 import 路径，避免把类型拆分扩大成调用方重写。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 quoteAgent 归档样式模块化

- 背景：`quoteAgent/styles.css` 仍混有共享样式和 archive 私有样式，文件超过 500 行。
- 实现：保留共享 `qa-btn`、`qa-review-tabs`、浮动字典按钮和 modal 动画在 `quoteAgent/styles.css`；将 archive 页面私有样式拆到 `archive/styles.module.less` 和 `archive/detail.module.less`，新增 `archive/classNames.ts` 映射 archive 私有类。
- 决策：暂不把 `qa-btn` / `qa-review-tabs` 改成 module，因为 quoteAgent、dictionary、conceptResolver 多处共享；原共享文件已降到 278 行。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 前端样式模块化第一批

- 背景：继续按前端结构规范分批收口样式，优先处理可独立迁移的页面私有样式。
- 实现：将 `externalContact` 样式迁移为 `styles.module.less` 并清理局部 inline style；将 `conceptResolver` 的 `styles/table/detail/feedback.css` 改为 `.module.less`，新增 `classNames.ts` 映射 `cr-*` 类，并将 proposal 相关样式拆到 `proposal.module.less`。
- 决策：暂保留 `quoteAgent/styles.css` 中共享 `qa-btn`、`qa-review-tabs`，因为这些类被多个 quoteAgent 子页面复用，下一批单独拆 shared/module。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

### 2026-07-08 前端结构合规检查与归档字段表拆分

- 背景：需要检查前端页面是否符合结构、命名、样式、route 和页面入口规范，并对明显超标文件做最小拆分。
- 实现：将归档 `FieldTable` 中的枚举编辑/展示逻辑拆到 `FieldValueEditors`，把 `/external_contact` 和 `/quote-agent/clusters` 旧路径改为兼容跳转，新增 `docs/frontend/frontend-compliance-audit.md` 记录剩余不合规点。
- 决策：本次不大拆 `quoteAgent/types.ts`、`utils.ts`、`styles.css` 等 500+ 文件，避免把结构检查扩大成高风险全域重构。
- 验证：在 `apps/web` 运行 `npm run build` 通过，Vite 保留既有大 chunk 提示；`npm run lint` 通过，保留既有 27 个 warning、0 error。

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
