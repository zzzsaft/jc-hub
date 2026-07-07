# 前端结构合规检查

检查日期：2026-07-08

## 已处理

- `apps/web/src/pages/quoteAgent/archive/components/FieldTable.tsx` 从 454 行拆到 216 行。
- 新增 `apps/web/src/pages/quoteAgent/archive/components/FieldValueEditors.tsx` 承接枚举单选、多选和展示标签，保留归档模块内聚。
- `/external_contact` 改为跳转 `/admin/external-contact`。
- `/quote-agent/clusters` 改为跳转 `/agent/clusters`。
- `apps/web/src/pages/externalContact/styles.less` 已迁移为 `styles.module.less`，页面状态、表单布局和移动端 checkbox 样式改为 CSS Module。
- `apps/web/src/pages/quoteAgent/conceptResolver/*.css` 已迁移为多个 `.module.less`，通过 `classNames.ts` 映射 `cr-*` 私有类；单个样式文件均低于 300 行。
- `apps/web/src/pages/quoteAgent/styles.css` 已拆出 archive 私有样式到 `archive/styles.module.less` 和 `archive/detail.module.less`，原共享样式文件降到 278 行。
- `apps/web/src/pages/quoteAgent/types.ts` 已拆为 status/review/field/document/masterData/dictionary/candidate/archive/unit 类型文件，入口保留 re-export。
- `apps/web/src/pages/quoteAgent/utils.ts` 已拆为 common/field/archiveReview/storage/review 工具文件，入口保留 re-export；拆分后单文件均低于 300 行。
- `apps/web/src/pages/quoteAgent/candidateCluster.utils.ts` 已拆为 core/response/suggestion/result 工具文件，入口保留 re-export；拆分后单文件均低于 300 行。
- `apps/web/src/pages/quoteAgent/hooks/useQuoteAgentPageState.ts` 已拆出 route sync、远端加载、上传/LLM、草稿和批量动作子 hook，主 hook 降到 277 行。
- `apps/web/src/pages/quoteAgent/hooks/useCandidateClusterReviewState.ts` 已拆出 `useCandidateClusterActions`，主 hook 降到 231 行，动作 hook 250 行。
- `apps/web/src/pages/quoteAgent/conceptResolver/components/ProposalList.tsx` 已拆为 `ProposalList`、`ProposalCard`、`ProposalDetails`、`ProposalShared`，单文件均低于 300 行。
- `apps/web/src/pages/quoteAgent/conceptResolver/hooks/useConceptResolverReviewState.ts` 已拆出 `resolutionFilters.ts`，主 hook 降到 278 行。
- `apps/web/src/pages/quoteAgent/components/ProductMasterDataPanel.tsx` 已拆出 `ProductMasterDataDetail` 和模块工具文件，主面板降到 256 行。
- `apps/web/src/pages/quoteAgentDictionary/components/DictionaryDataTable.tsx` 已拆出 localStorage 状态持久化工具，表格文件降到 293 行，并清掉该文件的 hook 依赖 warning。
- `apps/web/src/pages/quoteAgent/archive/components/ArchiveDetailPage.tsx` 已拆出 `ArchiveDetailSkeleton`，详情页降到 282 行。

## 当前合规点

- 应用路由集中在 `apps/web/src/app/AppRoutes.tsx`。
- 页面入口整体较轻，当前最大的入口是 `quoteAgentDictionary/index.tsx`，约 115 行。
- `externalContact`、`opportunitySearch`、`quoteAgent` 等页面已按 `components/`、`hooks/`、`services/`、`types.ts`、`utils.ts` 拆分。
- 目录命名以 camelCase 为主，组件文件以 PascalCase 为主。

## 仍需拆分

当前重点检查范围 `quoteAgent`、`quoteAgentDictionary`、`externalContact` 内暂未发现 300 行以上的前端业务、样式文件；最高为 `DictionaryDetailValueTable.tsx` 298 行。

## 路由检查

- 新页面入口符合 `/agent`、`/admin`、`/work` 分区。
- 旧 `/quote-agent/*`、`/quote/*`、`/template/*`、`/external_contact` 路径保留兼容跳转。
- 暂未发现旧路径继续直渲染页面的新增问题。

## 样式检查

- `externalContact` 和 `conceptResolver` 私有样式已迁移为 `.module.less`。
- `quoteAgent/styles.css` 仅保留共享按钮、tab、浮动字典按钮和 modal 动画，后续可改名为 shared 样式文件。
- 没有发现新增私有样式写入 `src/index.css` 的问题。

## 请求位置检查

- 大多数后端请求已在 `services/` 或 `src/api/services/`。
- 仍有少数页面组件直接引用全局 service：`QuoteSharePage.tsx`、`TemplateCreatePage.tsx`、`TemplateFormPage.tsx`、`OpportunitySearchFilters.tsx`、`ExternalContactBindingForm.tsx`。
- 这些引用未直接拼请求细节，优先级低于 500+ 行文件拆分。
