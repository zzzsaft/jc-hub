# Codex 开发规范

这份规范用于约束 Codex 在本项目中写代码、改代码和重构代码时的默认做法。除非用户明确提出不同要求，所有新增和修改都应遵守这里的结构和风格。

## 总体原则

- 优先理解现有项目结构，再写代码。
- 优先复用已有组件、hooks、工具函数、类型和 service，不重复造相同能力。
- 保持改动范围小，只修改和需求直接相关的文件。
- 不做无关重构，不顺手格式化大批无关文件。
- 保持代码清晰、可读、可维护，避免把页面、逻辑、请求、样式全部堆在一个文件里。
- 前端正式文档统一放到根目录 `docs/frontend/`，不要继续在 `apps/web/docs/` 新增文档。

## 文件职责

- 顶层目录统一使用复数命名：页面放 `src/pages/`，全局 hooks 放 `src/hooks/`，通用工具放 `src/utils/`。
- 目录名使用 camelCase，组件文件使用 PascalCase，工具文件使用 camelCase。
- 页面或组件目录入口允许保留 `index.tsx`；样式入口优先用 `styles.css` / `styles.less`，组件专用样式可用 `componentName.module.less`。
- `index.tsx` 只作为页面或模块主入口，负责组合组件、传递必要状态和事件。
- 页面级状态和业务流程逻辑放到 `hooks/`，例如 `useQuoteAgentPageState.ts`。
- UI 展示组件放到 `components/`，组件应按业务功能拆分。
- API 请求统一放到 `services/` 或项目现有 API service 目录中。
- 通用计算、格式化、匹配、转换等纯函数放到 `utils.ts` 或更细的工具文件中。
- 常量、选项、默认值放到 `constants.ts`。
- 类型定义放到 `types.ts`，避免在组件里散落大型内联类型。
- 样式独立拆分到同模块的 `styles.css` / `.less` / `.module.less`，不要把大量样式规则继续堆进全局样式文件。
- 新增页面、交互或样式约定时，同步更新 `docs/frontend/` 下对应文档。

## 文件大小

- 单个业务文件应尽量控制在 300 行以内。
- 超过 300 行时，应优先考虑按功能拆分组件、hook、工具函数或常量文件。
- 超过 500 行通常视为需要重构，除非是非常稳定且不适合拆分的配置或数据文件。
- `index.tsx` 应尽量保持轻量，通常不应承载复杂业务逻辑。

## 组件规范

- 优先复用项目已有组件，例如通用表单、选择器、弹窗、表格、按钮样式等。
- 新组件应只负责一个明确功能，避免一个组件同时处理列表、弹窗、请求、表单提交和复杂转换。
- 组件 props 要清晰，避免把整页状态无差别传入子组件。
- 可复用组件不要依赖页面私有状态；页面专用组件可以放在对应页面的 `components/` 下。
- 展示组件尽量保持无副作用，复杂数据加载和提交逻辑放在 hook 或 service 中。

## Hook 和业务逻辑

- 页面级数据加载、筛选、分页、提交、轮询、草稿状态等逻辑应放入自定义 hook。
- hook 可以组合 service、utils 和页面状态，但不应直接渲染 JSX。
- hook 返回值应围绕页面需要暴露，避免返回过多内部实现细节。
- 异步逻辑要处理 loading、error 和 finally 状态。

## API 和数据访问

- 请求后端接口必须放在 service 层，不要在组件里直接写请求细节。
- service 负责接口路径、参数和返回值类型。
- 页面和组件通过 service 方法表达业务意图，例如 `listDocuments`、`submitBatchReviews`。
- 不在 UI 组件中拼接复杂接口参数，必要时抽到 hook 或工具函数中。

## 工具函数和类型

- 纯函数优先放到工具文件，方便复用和测试。
- 工具函数要命名清楚，表达业务含义。
- 重复出现两次以上的转换、状态判断、格式化逻辑，应考虑抽出。
- 避免使用大量 `any`；如果后端结构暂不稳定，可以先局部兼容，但应把兼容逻辑集中在工具函数或 service 中。

## 样式规范

- 模块专用样式放在模块目录内，例如 `src/pages/quoteAgent/styles.css`。
- 全局样式只放基础变量、reset、通用组件样式。
- 新增模块样式优先使用 `.less` / `.module.less` / 现有 CSS 方案，跟随所在页面已有风格。
- 大量 Tailwind class 可以保留在 JSX 中，但重复出现的稳定样式应抽成 CSS 类或小组件。
- 不要为了一个页面把大量私有样式写进 `src/index.css`。
- quoteAgent / productConfigAgent 这类后台页面的页内功能 tab，统一复用候选簇页面的 `qa-review-tabs`、`qa-review-tabs-track`、`qa-review-tab` 样式；不要在 JSX 中临时拼 `border-b` / `text-blue` 等零散 Tailwind class 做 tab。若其他模块复用这套 tab，必须显式引入承载这些类的样式文件，避免出现无样式 tab。

## 重构要求

- 重构时优先保持行为不变，先移动代码，再做必要的小幅整理。
- 拆文件后必须检查 import 路径、类型引用和循环依赖。
- 如果只是结构拆分，不应同时改业务规则。
- 原有用户改动不能回滚；遇到无关脏文件时忽略。

## 验证要求

- 改完代码后优先运行项目现有校验命令，例如 `npm run build`。
- 如果构建失败，要区分是本次改动导致，还是环境、缓存、既有代码问题。
- 最终说明里要写清楚改了哪些文件、是否通过构建、还有哪些已知提示或风险。

## 推荐目录示例

```text
src/pages/example/
  index.tsx
  constants.ts
  types.ts
  utils.ts
  styles.css
  hooks/
    useExamplePageState.ts
  services/
    example.service.ts
  components/
    ExampleToolbar.tsx
    ExampleList.tsx
    ExampleDetailPanel.tsx
    ExampleModal.tsx
```

## 页面入口示例

`index.tsx` 应接近下面这种形态：

```tsx
export default function ExamplePage() {
  const state = useExamplePageState();

  return (
    <PageShell>
      <ExampleToolbar {...state.toolbarProps} />
      <ExampleList {...state.listProps} />
      <ExampleDetailPanel {...state.detailProps} />
    </PageShell>
  );
}
```

入口文件不应包含大量请求逻辑、复杂数据转换、大型弹窗实现或长篇样式。
