# 按钮适用规范

本文档约束项目内按钮、图标按钮和表格操作按钮的默认使用方式。新增或修改 UI 时，优先复用 `src/components/ui/core.tsx` 中的 `Button`，只有在需要高度定制交互区域时才直接使用原生 `button`。

## 基本原则

- 优先使用已有 `Button` 组件，不重复写一套按钮基础样式。
- 按钮文案必须表达动作，例如“保存”“取消”“刷新”“新增标准值”，避免只写状态或对象名。
- 同一操作区最多保留一个主按钮，主按钮使用 `type="primary"`。
- 次要操作使用默认按钮；弱操作使用 `type="text"`；纯导航或低强调操作才使用 `type="link"`。
- 图标应使用 `src/components/ui/icons.tsx` 中的图标组件，不要用临时字符代替，例如 `?`、`e`、`✎`。
- 原生 `button` 必须显式清除默认样式：`appearance-none border-0 bg-transparent p-0 shadow-none`。

## 常见按钮类型

| 场景 | 推荐写法 | 说明 |
| --- | --- | --- |
| 页面主操作 | `<Button type="primary">新增</Button>` | 每个操作区通常只放一个 |
| 普通操作 | `<Button>刷新</Button>` | 默认按钮用于次要但可见操作 |
| 弱操作 | `<Button type="text">取消</Button>` | 不希望抢视觉优先级时使用 |
| 链接式操作 | `<Button type="link">编辑</Button>` | 表格行操作或低强调入口 |
| 危险操作 | `<Button danger>删除</Button>` | 删除、撤销、清空等破坏性动作 |
| 加载中 | `<Button loading={saving}>保存</Button>` | 防止重复提交 |

## 图标按钮

图标按钮用于空间紧张或动作含义明确的场景，例如表格单元格编辑、关闭弹窗、展开折叠。

推荐样式：

```tsx
<button
  type="button"
  aria-label="编辑"
  className="inline-flex h-6 w-6 appearance-none items-center justify-center rounded border-0 bg-transparent p-0 text-slate-400 shadow-none transition hover:bg-slate-100 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
>
  <EditOutlined />
</button>
```

要求：

- 必须提供 `aria-label`。
- 默认状态应低强调，不使用深色背景或粗边框。
- hover 时可以使用浅色背景和品牌色图标。
- 尺寸要稳定，常用 `h-6 w-6`、`h-8 w-8`。
- 不要把字符当图标使用。

## 表格内操作按钮

- 行尾主操作优先使用 `Button type="link"` 加图标，例如编辑、查看。
- 单元格内的轻量编辑按钮使用图标按钮，不使用默认按钮边框。
- 单元格按钮点击时必须 `event.stopPropagation()`，避免触发行点击打开详情。
- 按钮应贴近被编辑内容右侧，但不能挤压正文；正文容器需要 `min-w-0` 和换行策略。

示例：

```tsx
<div className="flex items-start justify-between gap-2">
  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
  <button
    type="button"
    aria-label="编辑标准值"
    className="inline-flex h-6 w-6 shrink-0 appearance-none items-center justify-center rounded border-0 bg-transparent p-0 text-slate-400 shadow-none transition hover:bg-slate-100 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
    onClick={(event) => {
      event.stopPropagation();
      onEdit();
    }}
  >
    <EditOutlined />
  </button>
</div>
```

## 弹窗按钮

- 弹窗底部按钮右对齐。
- 保存、确认、提交使用主按钮。
- 取消、关闭使用默认按钮。
- 弹窗右上角关闭按钮使用图标按钮，不显示文字，不使用深色边框。
- 编辑详情弹窗里，如果“编辑”不是最终提交动作，应使用默认按钮，不使用主按钮。

## 禁止写法

- 不要使用未清样式的原生按钮，避免出现浏览器默认粗边框和灰色背景。
- 不要用 `?`、`e`、`x`、`✎` 等字符模拟图标。
- 不要在同一个操作区放多个 `primary` 按钮。
- 不要把按钮做成大面积深色底，除非它是明确的主操作。
- 不要只靠颜色表达危险状态，危险操作必须同时有明确文案。

