# ERP SQL Agent 12 项生产资产验收

本文对应生产就绪评估第 5 节“仍需完成的具体资产”12 项。状态使用 `complete`、`partial`、`blocked`；未获真实 ERP 或业务 owner 审批的资产只能是 `draft` 或 `blocked`。

| # | 资产 | 状态 | 当前事实 | 实现/测试 | 依赖/阻断 |
| --- | --- | --- | --- | --- | --- |
| 1 | 报价/配置 | partial | `family_008/080` 已有语义信号；`JCJDY.dbo.ProductQuotation*` 租户字段未证明。 | 合同号 slot、配置清单/内容/外部库/购销合同信号、family_016 负例。 | 销售/ERP owner 确认 Company/租户字段后才能 approved。 |
| 2 | 库存 | partial | 普通库存 `family_027/050` 与安全库存/库龄 `family_089` 已排他。 | 普通库存、近期交易、安全库存、库龄/呆滞、混合措辞正负例。 | FIFO、转库、退货、排除仓库需仓储 owner 审批。 |
| 3 | 工单物料 | partial | `family_076` 已有 JobMtl 快路径；`family_086` 研发工单口径仍需治理。 | JobMtl/JobAsmbl/BOM/ECO 只读验证清单，family_031/006 负例。 | 生产 owner 确认工单类型、研发工单 BOM 和 Company scope。 |
| 4 | 报工/资源 | partial | `family_014/092` 使用 `LaborDtl/JCDept`，避免 `QiMoJob/ResourceGroup`。 | schema 负向测试禁止 `QiMoJob`、错误 `ResourceGroup`、`OpMaster.Void`。 | 生产 owner 确认资源组、班组、部门 join。 |
| 5 | 财务 | partial | 部分 approved atomic metrics 存在；费用、供应商段、事业部、销售员等仍 draft。 | metric definition 必填版本/owner/状态/有效期/用途，exact/estimate 边界。 | 财务 owner 提供费用科目、税/退款、成本月份、币种等对账材料。 |
| 6 | Schema snapshot | partial | 现有 schema metadata 可检索；snapshot id/新鲜度未完全运行时绑定。 | 新增 `erp_schema_snapshots`，定义漂移、过期、未知字段 fail closed。 | DBA 提供 snapshot 抓取任务、ERP 版本来源和覆盖率阈值。 |
| 7 | 版本化接口契约 | partial | `agentRuntime` 已存在；公共 Data Gateway 契约新增。 | `docs/api/erp-data-gateway.md` 定义 actor/purpose/scope/mode/execution/maxRows/deadline/status/confidence/evidence/warnings/traceId。 | 外部业务 Agent 接入时再落正式 route/SDK。 |
| 8 | 分页 | partial | 当前已有 `maxRows/truncated`，缺 cursor 运行时。 | 契约定义 `pageInfo`、稳定排序、HMAC cursor、防篡改、同 snapshot 翻页。 | executor/template 层需后续实现真实 cursor。 |
| 9 | 数据新鲜度 | partial | trace 有 schema snapshot version；响应尚未全量带 `dataAsOf/schemaAsOf/metricVersion`。 | 契约要求字段来自执行/注册表/snapshot，禁止当前时间占位。 | executor 需返回源系统时间或 refresh registry。 |
| 10 | 审计 | complete | P0 线程已有 rendered/final SQL hash、脱敏绑定参数、终态审计。 | registry 复用 `SqlTraceService`，invalid public SQL 为空。 | 继续跟随 P0 audit/dataProtection/trace。 |
| 11 | 安全 | complete | P0 线程已有 fail-closed access policy、Company scope、敏感字段脱敏。 | registry 固化 prompt 不扩权、跨 scope fail closed、外部 LLM DLP。 | 组织到 ERP Company/部门/客户权威映射仍需上线前补齐。 |
| 12 | 成本 | partial | LLM lifecycle/token 日志已有基础；预算硬阻断未完全接入。 | 新增版本化 cost price 资产，定义 not_sent/0 cost、70/90/100% 策略。 | FinOps/平台 owner 审批模型价格、币种、生效日期和日预算。 |

## 只读验收脚本

上线前按资产 owner 分别执行：

1. Schema/compile：对每个 template SQL 使用当前 schema snapshot 编译或只读 `TOP 3`，记录 snapshot id、ERP 版本和覆盖率。
2. Golden：运行 ERP SQL Agent post-change golden，不得复用旧 69.2% 结果作为生产通过证据。
3. 财务对账：对 approved metric 输出 bridge、grain、dimension、currency/tax/refund 对账报告；缺审批保持 draft/blocked。
4. 安全：跨用户、跨 Company、跨部门、跨客户、重命名敏感别名、混合 `dbo/JCJDY` 数据源负例必须 fail closed。
5. 成本：外部 LLM 未发送时记录 `not_sent/0 cost`；达到预算 70/90/100% 时分别告警、降级、阻断。

数据库变更只允许使用 additive migration；Codex 不执行真实 ERP 写入。
