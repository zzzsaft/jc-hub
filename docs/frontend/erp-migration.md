# ERP 页面迁移约定

## 目标

- 未来迁移 C# / 旧 ERP 页面时，只抽取业务功能、字段、接口和状态规则。
- 页面样式、交互密度、路由入口按当前 React 前端重做。
- 新页面默认进入 `/agent`、`/admin`、`/work` 三个分区，不新增旧风格入口。

## 迁移流程

1. 先读旧页面，列出用户任务、字段、按钮、列表、校验、权限和后端数据来源。
2. 将请求放到 service，页面状态放 hook，纯转换放 utils，类型放 types。
3. 桌面后台页面挂 `/admin/...`，生产员工手机页挂 `/work/...`，Agent 对话或审核页挂 `/agent/...`。
4. 按现有前端风格重做 UI，不照搬 C# 布局、颜色和控件。
5. 查询/列表页面必须按分页接口消费，不默认一次拉全量。
6. 需要兼容旧链接时，只在 `apps/web/src/app/AppRoutes.tsx` 增加跳转，不让新代码继续依赖旧路径。

## 权限

- 页面入口和按钮使用统一权限码，格式为 `resource:action`，例如 `admin.purchase.apply:view`。
- 菜单无权限则隐藏，直连无权限页面跳 `/error/no-permission`。
- 前端只做显示裁剪，后端接口仍必须用同一权限码做最终拦截。

## 风格参考

- 后台管理：参考当前 `AdminLayout` 的侧栏、顶部栏、浅色数据区和高密度表格。
- 手机端：参考 `MobileLayout` 的底部导航、安全区、窄屏约束和大触控区域。
- Agent：参考 `AgentLayout`，优先突出对话、审核和治理任务。

## ERP Agent 对话

- 前端页面：`/agent/chat`。
- 桌面端使用独立聊天工作台：移除后台框架的顶部栏和可折叠导航侧栏，左侧固定展示 ERP Agent 标识、新聊天、会话搜索与历史记录；空会话在主区居中展示欢迎语和圆角输入框，结果详情仅在有结果时展开。手机端仍使用会话抽屉。
- 左侧栏标题右侧提供“关闭侧边栏”和“返回主页面”按钮；关闭后可通过主区左上角“会话”按钮重新打开。
- 每条带结构化结果的 Agent 回复下方提供“查看详情”；详情以右侧可收起抽屉展示，点击抽屉外侧即可收起；手机端提供左上返回按钮并支持右滑关闭。聊天主区从任意位置横向右滑可跟手打开会话抽屉，松手后按阈值决定是否打开。抽屉中的复制与 JSON/CSV 导出针对该条回复的结果。
- 面向业务用户的聊天内结果表展示全部 `inlineVisible=true` 的业务字段；ERP 公司代码映射为公司名称，产品类别销售排行以 ERP `ProdGrup.Description` 展示名称而非只显示 `ProdCode`，编码和 technical 口径只在“查看详情”中展示。结果表复用通用 `Table`，支持调整列宽、列顺序和显示列。
- Agent 查询结果列由后端 `columns[]` 元数据驱动：前端按 `label/dataType/format/role/inlineVisible` 通用渲染金额、百分比、日期、整数及技术列，不维护“上月销售额/去年同期销售额/同比差额/同比率”等字段白名单，也不生成“数据列 N”兜底标题。聊天内只展示 `inlineVisible=true`，详情保留 technical 列。
- 结果详情通用展示后端 `scope`（能力、指标、维度、实体筛选、时间、比较和模板覆盖）；scope 属于技术审计信息，不进入聊天内联摘要。
- Agent 回答标题会显示该回答相对前一条用户问题的查询耗时，历史会话同样适用。
- 当前 Node 后端接口：`/agentRuntime/*`，默认 `agentType` 为 `mastraErpSqlAgent`。
- 页面支持会话列表分页、后端关键词搜索、新建/归档会话、展示回答、SQL、表格结果、告警、财务口径和工具调用详情；发送问题使用 `POST /agentRuntime/run/stream`，在该用户消息下显示等待计时与服务端实时工具事件。
- 当前不做 token 级别的模型输出流和多 agent 切换；旧 `erpSqlAgent` 仅作为后端兼容能力保留。

## 采购申请

- 前端页面：`/admin/purchase/apply`。
- 当前 Node 后端接口：`GET /erp/purchase/apply`、`POST /erp/purchase/apply/preview`、`POST /erp/purchase/apply/submit`。
- 真实写 ERP 仍由 ERP 后端补充结构化接口；当前项目的 `submit` 固定返回 `ERP_WRITE_NOT_CONFIGURED`，避免绕过 ERP 队列、事务和幂等控制。
- 接口字段、错误码和 ERP 后端待办见 `docs/api/purchase-apply.md`。
