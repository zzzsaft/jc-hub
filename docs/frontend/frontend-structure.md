# 前端结构约定

## 目录

- 页面入口放在 `apps/web/src/pages/`。
- 应用级路由放在 `apps/web/src/app/`，布局壳放在 `apps/web/src/components/layout/`。
- 全局 hooks 放在 `apps/web/src/hooks/`。
- 通用工具放在 `apps/web/src/utils/`。
- 页面私有组件、hooks、services、types、constants、utils 和样式放在对应页面目录内。
- 目录名统一使用 camelCase，例如 `productConfigForm/`、`opportunitySearch/`。

## 路由分区

- `/agent`：Agent 对话、合同归档、候选审核、字典治理等智能辅助页面。
- `/admin`：桌面后台管理页面，包括报价、模板、客户或后续 ERP 管理页面。
- `/work`：生产员工手机端页面，使用移动端壳和底部导航。
- 旧路径只做兼容跳转，不在新页面里继续写旧入口。

## 页面模块

- `index.tsx` 只组合状态和展示组件。
- 页面和普通组件文件使用 PascalCase，例如 `QuoteFormPage.tsx`、`QuoteAgentToolbar.tsx`。
- hooks 使用 `useXxx.ts`，工具文件使用 camelCase，例如 `material.ts`、`value.ts`。
- 页面级请求、筛选、分页、提交、轮询等流程放到模块内 `hooks/`。
- 后端请求放到模块内 `services/` 或 `src/api/services/`。
- 纯计算放 `utils.ts`，类型放 `types.ts`，常量放 `constants.ts`。
- 新 ERP 页面按分区放置：Agent 页面放 `pages/agent` 或现有 agent 领域目录，后台页面放对应业务目录，手机端生产页面放 `pages/work`。

## 样式

- 保留 Tailwind CSS，不新增组件库。
- `src/index.css` 只放 Tailwind、全局 tokens/base 和真正通用组件类。
- 模块私有样式放模块目录，例如 `src/pages/quoteAgent/styles.css`。
- 组件目录内样式优先用 `styles.less`；单组件 CSS module 用 `componentName.module.less`。
- 稳定复用的页内控件样式可以沉淀成模块样式类，避免把大量私有规则放到全局。
