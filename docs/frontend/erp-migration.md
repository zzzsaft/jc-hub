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
- 当前 Node 后端接口：`/agentRuntime/*`，默认 `agentType` 为 `mastraErpSqlAgent`。
- 页面支持会话列表分页、后端关键词搜索、新建/归档会话、展示回答、SQL、表格结果、告警、财务口径和工具调用详情；发送问题使用 `POST /agentRuntime/run/stream`，在该用户消息下显示等待计时与服务端实时工具事件。
- 当前不做 token 级别的模型输出流和多 agent 切换；旧 `erpSqlAgent` 仅作为后端兼容能力保留。

## 采购申请

- 前端页面：`/admin/purchase/apply`。
- 当前 Node 后端接口：`GET /erp/purchase/apply`、`POST /erp/purchase/apply/preview`、`POST /erp/purchase/apply/submit`。
- 真实写 ERP 仍由 ERP 后端补充结构化接口；当前项目的 `submit` 固定返回 `ERP_WRITE_NOT_CONFIGURED`，避免绕过 ERP 队列、事务和幂等控制。
- 接口字段、错误码和 ERP 后端待办见 `docs/api/purchase-apply.md`。
