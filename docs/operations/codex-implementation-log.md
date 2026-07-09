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

### 2026-07-09 ERP SQL 客户趋势 AnalysisPlan

- 背景：golden dry-run 暴露客户产品趋势问题误拒答、检索未使用拆解结果、LLM 可能猜不存在字段。
- 实现：扩展 `AnalysisPlan` route/assumptions/retrievalHints 等字段；planner 增加客户产品同比趋势、客户销售同比/三年趋势确定性 plan；toolchain 将 retrieval hints 拼进模板/参考检索问题；composer 支持 year bucket、year-over-year 时间过滤和基于 approved customer dimension expression 的客户过滤；输出消息合并默认口径；ERP SQL scope 关键词补齐合同/报价/配置/费用/余额/事业部。
- 决策：继续复用现有 Mastra ERP SQL toolchain、approved atomic metric composer 和 repository，不新增多 Agent 或依赖；产品类型 v1 只映射到现有 product 维度。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts`、`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`、`node --test --import tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`npm run build:server` 通过；`erp-sql-agent:golden-sql -- --per-type` 在本沙箱因 tsx IPC/外部 LLM 数据出口审批限制未执行。

### 2026-07-09 ERP SQL Agent 域外拒答

- 背景：ERP SQL Agent 不应回答天气、闲聊等与 ERP Agent 无关的问题，也不能因为“查询”这类宽泛词误路由到 ERP。
- 实现：新增 ERP SQL Agent scope 关键词判断；路由改为只在命中 ERP/SQL/报表/采购/库存/订单/财务等领域词时进入 `erpSqlAgent`；普通 ERP runtime、service 和 Mastra runtime 入口都增加域外拒答兜底。
- 决策：不用额外 LLM 做意图分类，先用可维护的白名单关键词覆盖现有业务表达；客户确认多轮仍保留原状态机。
- 验证：`npm test -- apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`npm run build:server` 通过。

### 2026-07-09 ERP SQL Golden SQL 生成 Dry-run

- 背景：需要按 golden question 类型验证能否生成 SQL，同时避免连接最终 ERP 执行查询，并补充客户年度销售/产品类型趋势类问题。
- 实现：新增 `npm run erp-sql-agent:golden-sql`，复用 `ErpSqlAgentService` 和 golden question JSON，模板命中时使用 dry-run template executor 返回 SQL 模板，不调用最终 ERP；在 `business_decision_composite` 中追加 5 条客户同比、产品类型趋势、三年趋势和毛利影响问题。
- 决策：不新增独立测试框架，继续复用现有 agent service、template repository 和 golden 列表；从 JDY CRM 客户表取真实简称（三环科技、帝龙永孚、中博塑料、精卫科技、扬帆新）覆盖客户趋势 golden。
- 验证：`npm run build:server`、`node --test --import tsx apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts` 通过；用主线程 `.env` 跑 `erp-sql-agent:golden-sql -- --per-type`，9 类中 7 类生成 SQL、2 类被误拒答；客户类新增问题 5 条均可生成 SQL，但生成结果多为 rule fallback 或引用不存在字段，客户过滤/趋势聚合仍需后续加强。

### 2026-07-09 ERP SQL 客户确认多轮分支

- 背景：客户简称模糊命中多个候选时，需要让用户用“第2个/选二/客户名”继续确认；确认回复本身不是完整业务问题，不能只靠单轮 LLM 理解。
- 实现：ERP SQL agent 在模糊客户返回中增加结构化 `customerClarification`；agent runtime 会继承同一 session 的上一轮 context，并沿用该 session 的 agentType；ERP SQL runtime handler 先识别确认式回复，选中候选后把原问题中的简称替换成客户全称再继续查询。
- 决策：确认分支走确定性状态机，避免把“第2个”误路由或误送 SQL agent；语义型追问仍保留给后续 LLM 多轮改写扩展。
- 验证：`npm run build:server`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/agentRuntimeHandler.test.ts`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts` 通过。

### 2026-07-09 JDY CRM 客户简称同步

- 背景：ERP SQL 问答中用户会用客户公司简称提问，单靠 `Customer.Name LIKE` 无法覆盖 CRM 里维护的客户简称。
- 实现：新增 `integration.jdy_crm_customers` 表和 Prisma model；新增 JDY CRM 客户全量同步脚本 `npm run jdy:sync-crm-customers`，默认拉取 JDY 客户表单整条记录并存入 `raw_data`，同时抽取客户名称、别名/简称、编码索引列；写库改为批量 `INSERT ... ON CONFLICT`；ERP SQL 模板参数解析会先用本地 JDY 客户缓存把简称解析成客户名称，销售订单/发货模板同时匹配 `Customer.Name` 和 `Customer.CustID`；简称模糊命中多个客户且没有精确匹配时，会返回候选让用户确认，不继续执行 SQL。
- 决策：同步脚本只 upsert 不清空，避免外部接口临时失败导致本地缓存被删空；字段 id 不写死，`JDY_CRM_APP_ID=6191e49fc6c18500070f60ca`、`JDY_CRM_CUSTOMER_ENTRY_ID=020100200000000000000001` 作为默认配置，客户名称/简称字段仍需按表单控件 id 配置。
- 验证：`npm run build:server`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts`、`./node_modules/.bin/tsx apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts` 通过；已同步 JDY 客户 10430 条，`raw_data` 覆盖 10430 条，别名/简称 6995 条。

### 2026-07-08 ERP SQL 采购维度组合修复

- 背景：20 条经营 golden 里 #7/#18 不再缺 approved metric，但采购指标与销售/成本指标维度不兼容，不能用 PO order 硬 join 销售订单或供应商硬 join 生产成本。
- 实现：planner 新增 `purchase_supplier_product_summary`，供应商采购问题只用 `purchase_amount` 按供应商/产品执行；`purchase_cost_margin_impact` 标记为 `decision_support`，让它走 reference-assisted fallback；成本四分项触发词收窄，不再因普通“物料”误加生产成本四分项；workflow 在缺 approved 指标或 reference-assisted estimate 时追加 `finance_review_needed:` warning，方便后续从 trace/warnings 汇总财务待确认事项。
- 决策：不新增 speculative PO-to-sales-order bridge；没有人工批准桥接口径前，采购影响客户订单毛利只能 estimate/reference-assisted，不能 strict atomic compose。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 83 项；`npm run build:server` 通过；前 20 条 compose smoke 为 19 条 `composed`、1 条 `fallback_required`、0 条 missing/strict compose error，#7 workflow 测试确认 reference-assisted estimate 会调用 generator 并以 `financeMode=estimate` 校验。

### 2026-07-08 ERP SQL shipped/open job approved metrics

- 背景：21 条经营 golden 只剩 #11 `open_job_margin_cost_risk` 和 #16 `shipped_amount` 缺 approved atomic metric，用户已批准补齐。
- 实现：迁移追加 `shipped_amount` 与 `open_job_margin_cost_risk`；发货金额按 `ShipDtl -> ShipHead` 发货日期和发货数量折算订单行金额，未完工工单风险按 `JobHead -> JobProd -> OrderDtl` 统计未关闭未完成工单数；#16 recipe 收敛到客户粒度，避免把发票回款 overdue 强行分摊到产品。
- 决策：两个口径都是运营分析口径，不代表发票收入、回款、结算、退款或财务报表金额；不新增专用 SQL 模板，也不把 historical reference 当 strict 授权。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 81 项；`npm run build:server` 通过；21 条 composite golden 静态分流为 20 条 `approved_plan`、1 条 `clarification`、0 条 `blocked_missing_metric`。

### 2026-07-08 ERP SQL 21 条经营问题分流收尾

- 背景：21 条经营 golden 还剩少量 no_plan/误反问/误维度，需要稳定落到可执行 plan、明确反问或明确 blocked。
- 实现：planner 新增事业部销售毛利月度趋势、产品销售库存未交付、发货客户毛利回款、未完工工单客户风险 recipe；“毛利低于/偏低/高价值产品毛利低”默认 `gross_margin_rate`；维度识别补 `supplier` 和 `salesperson`；新增迁移给销售类 atomic metric 补 `salesperson = OrderHed.EntryPerson`，给 `purchase_amount` 补 `supplier = POHeader.VendorNum`。
- 决策：不批准 `shipped_amount` 或工单风险指标；严格模式缺口返回 `blocked_missing_metric`，不偷用待发货金额或历史 reference 当执行授权。库存是当前快照，产品销售/库存/未交付组合按 `product` 输出，不强行带订单维度。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 78 项；`npm run build:server` 通过；21 条 composite golden planner smoke 为 20 条 plan、1 条 clarification、0 条 no_plan。

### 2026-07-08 ERP SQL 回款 overdue approved atomic metrics

- 背景：回款慢、逾期回款、逾期应收问题已确认采用发票未收余额运营口径，不再要求实收明细口径确认。
- 实现：迁移追加 `collection_delay_days` 与 `collection_overdue_amount`，固定 `Erp.InvcHead`、`Posted = 1`、`OpenInvoice = 1`、`DocInvoiceBal > 0`、`DueDate < CAST(GETDATE() AS date)`；planner 将回款/收款/账龄/overdue 问法映射到逾期天数，并自动带上逾期金额；composer 删除 `collection_delay_days` 专门反问，缺 approved metric 时统一走 `blocked_missing_metric`。
- 决策：不接 `CashDtl/CashHead`，不处理实收明细、退款、冲销或坏账核销拆分；如果现场缺 `DocInvoiceBal`，保持缺口阻断等待重新确认。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 70 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 趋势与集中度 scenario recipe

- 背景：趋势和客户集中度问题需要先输出可判断的数据，但不新增趋势/集中度专用 approved atomic metric。
- 实现：`AnalysisPlan` 增加 `timeGrain` 与 `analysisShape`；planner 新增 `customer_margin_monthly_trend` 和 `product_customer_concentration` recipe；composer 在月度粒度下按 `period` 聚合/连接，并为产品客户集中度输出客户占比和客户数窗口列。
- 决策：趋势只输出月度序列，不在 SQL 内判断连续下降；集中度不内置阈值，只输出 `customer_share_rate/customer_count`。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 70 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 待发货/未交付 approved atomic metrics

- 背景：待发货、未发货、欠发、未交付、延期交付问题需要复用 `family_037` release 口径，避免继续落到打开订单金额粗口径。
- 实现：迁移追加 `open_shipping_qty` 与 `open_shipping_amount`，固定 `OrderRel -> OrderDtl -> OrderHed -> Customer`、`OpenRelease = 1`、`OurReqQty > 0`，金额按待发数量折算；planner 将待发相关词展开到金额+数量，延期交付标记 `overdue`；composer 从 metric definition 追加 `overdueFilters`。
- 决策：保留 `open_order_amount`；不新增通用 filter DSL，延期只支持 `OrderRel.ReqDate < CAST(GETDATE() AS date)`。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 63 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 库存现存量 approved atomic metric

- 背景：经营问答需要把“当前库存/现存量/库存是否够”稳定落到 approved 原子指标，而不是只靠 historical SQL reference；同时让库存和待发货指标能按仓库组合。
- 实现：迁移追加 `inventory_on_hand_qty`，口径为 `SUM(PartWhse.OnHandQty)`，支持产品和仓库维度，只统计 `OnHandQty > 0` 的当前库存；`open_shipping_amount/open_shipping_qty` approved definition 补齐仓库维度；planner 增加“仓库”维度识别；composer 补充库存现存量与其他原子指标按 `Company + product` 组合的测试。
- 决策：库存是运营数量口径，不代表库存金额、成本、ATP、发票、回款或结算；待发货是运营 backlog 口径，不代表发票、回款、结算或会计收入；暂不引入库位和可用量逻辑。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 62 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 成本四分项 approved atomic metrics

- 背景：经营决策问题里“成本主要高在哪、材料/人工/制造/外协谁高”不能只用总成本粗口径。
- 实现：迁移追加 4 个 approved atomic metric：`material_cost_amount`、`labor_cost_amount`、`burden_cost_amount`、`subcontract_cost_amount`，金额口径为 `PartTran.*UnitCost * ABS(PartTran.TranQty)`，只批准 `MFG-STK/MFG-CUS` 生产成本事务。`AnalysisPlannerService` 将成本构成/材料/人工/制造/外协问题展开到四分项；`MetricComposerService` 支持 definition 里的按维度附加 join。
- 决策：保留 `cost_component_amount` 总成本粗口径；不新增“最大成本项”专用 SQL；不把 RMA、发货、采购、库存调整纳入四分项 approved 口径。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 57 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL scenario recipe 与 approved atomic metrics

- 背景：20 条经营决策问题不能继续依赖“每题一个 SQL 模板”，需要稳定分流到可组合指标、清楚阻断或反问。
- 实现：`AnalysisPlannerService` 增加 4 个轻量 scenario recipe，`analysisPlan` 记录 `scenario/requiredMetrics/missingApprovedMetrics`；`MetricComposerService` 按 required metrics 阻断缺口，并修正多 CTE 组合时外层 join 需要带上维度，避免同 Company 下维度互乘；strict finance 缺 required approved metric 时仍查 reference evidence，但直接返回 `blocked_missing_metric`，不再调用慢 LLM generator。新增迁移 upsert 7 个 approved atomic metric：`order_amount`、`invoice_revenue`、`gross_margin_amount`、`gross_margin_rate`、`cost_component_amount`、`open_order_amount`、`purchase_amount`。
- 决策：不批准 `inventory_on_hand_qty` 和 `collection_delay_days`；reference dataset/family 只做 evidence，不做 strict 执行授权；recipe 不保存题级 SQL。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 55 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL reference-assisted fallback

- 背景：经营决策问题命中 `analysisPlan` 后，如果 approved atomic metric 不全，旧链路会直接失败，导致 4000 条 embedding SQL reference 和 family/template 资产没有参与。
- 实现：Mastra ERP SQL toolchain 在 atomic composer 普通缺口时进入 `findSqlReference` + LLM generator + `SqlGuardService` fallback；`collection_delay_days` 这类明确缺审批口径的问题继续反问，不走 fallback。`product_margin_cost_ratio_top5` 在 reference 阶段也按固定问法过滤，避免成为宽泛财务问题的 strict 授权。
- 决策：历史 SQL 资产只做生成证据，不直接作为 strict finance 执行授权；strict finance 仍由 approved metric/template/scenario 决定是否可执行。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 55 项；`npm run build:server` 通过。20 条 composite golden 在不连 ERP 后端模式下：1 条 generated-only，3 条 clarification，16 条因外部 LLM/检索链路 25s 超时。

### 2026-07-08 ERP SQL Guard CTE 派生列校验修复

- 背景：实际执行 `product_margin_cost_ratio_top5` 时，approved SQL 中的 CTE 派生列被误当作 `Erp.PartTran` 等物理字段校验，导致 strict finance guard 在执行前拦截。
- 实现：`SqlGuardService` 收集 CTE 输出列并标记为 derived；derived 字段保留给 finance 金额/日期/状态规则使用，但跳过物理字段存在性校验，底层真实表字段仍照常校验。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过 54 项；`npm run build:server` 通过；经用户批准后实际连接 LLM/ERP 执行目标问题成功返回 5 行。

### 2026-07-08 ERP SQL approved composite metric 快捷路径

- 背景：`6月份销售额最高的5类产品分别卖给了哪些客户，毛利率怎么样，成本主要高在哪一块？` 已有 approved composite metric，但 analysis planner 会拆成三颗 atomic metric，缺少任一 atomic metric 时会提前失败。
- 实现：Mastra ERP SQL toolchain 在 atomic composer 前先尝试 `product_margin_cost_ratio_top5` approved metric；命中且有 `representative_sql` 时用固定 SQL 生成 rule result，并继续通过 `SqlGuardService` strict finance 校验。快捷路径只放行“6月/本月 + 高价值/销售额 Top + 产品 + 客户 + 毛利 + 成本”的固定问法，避免套到事业部/采购/库存等更宽问题。`analysisPlan` 增加可选 `limit`，仅记录 TopN 语义。
- 决策：产品粒度按 `PartNum`；不新增 `order_amount`、`gross_margin_rate`、`cost_component_amount` 三颗 atomic metric，不扩展通用复合规划框架。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过；`npm run build:server` 通过。20 条 composite golden 在不连 ERP 后端模式下：1 条生成通过但未执行，9 条缺 approved atomic metric 阻断，3 条反问，7 条 25s 超时。

### 2026-07-08 ERP SQL 原子指标 Analysis Planner

- 背景：综合经营问题不能继续依赖“每问一个 approved template/metric”，需要先拆成可批准、可组合的原子指标。
- 实现：新增 `AnalysisPlannerService` 和 `MetricComposerService`；Mastra toolchain 在 planner 后用规则优先、JSON-only LLM 兜底产出 `analysisPlan`，命中时只从 `status='approved'` 且 `definition_json.kind='atomic_metric'` 的指标组合 SQL，并继续走 `SqlGuardService`。缺少 `collection_delay_days` 或 grain/joinKeys 不兼容时在 generator/executor 前阻断。
- 决策：v1 复用 `business_metric_catalog.definition_json`，不新增表；composer 只使用 definition 里的表达式、过滤、时间字段和 join keys，不让 LLM 编字段。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/metricComposer.test.ts` 通过 18 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 模糊问题反问关卡

- 背景：经营决策问题常包含“评估/认为/帮忙看看”等模糊表达，直接生成 SQL 容易误猜数量、单价、时间范围和分析维度。
- 实现：Mastra ERP SQL toolchain 在 planner 后调用 `AnalysisPlannerService` 做规则反问；命中时返回 `error=clarification_required` 和 `clarificationQuestions`，并停止 generator/executor。当前覆盖“数量”“单价/价格”等明显模糊口径。
- 决策：先用规则实现，不引入 LLM 反问判断；只拦截明显模糊的经营评估问法，避免影响普通明细/汇总查询。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts` 通过 36 项；`npm run build:server` 通过。

### 2026-07-08 ERP SQL 综合经营 golden questions

- 背景：实际决策者问题常跨销售、毛利、成本、库存、交付、采购和车间反馈，不能只用单一报表式问题评测检索能力。
- 实现：在 `sqlTemplateGoldenQuestions.json` 新增 `business_decision_composite` 类型 21 条问题，覆盖销售额 Top、客户贡献、库存/未交付、毛利低、回款慢、采购成本影响、客户集中度，以及“车间认为今年数量变多但单价下降”的评估问题；同步 retrieval eval 测试允许新业务类型。补充 `family_100` 对“销售额/单价”的提示词，不使用泛化“数量”避免误伤库存数量问题。
- 决策：继续复用现有 family retrieval 评测，不新增多跳规划框架；综合问题用最接近的 family 组合作为 golden 期望。
- 验证：`node --test --import tsx apps/server/test/erpSqlAgent/sqlPlanner.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts` 通过 32 项；`npm run build:server` 通过。

### 2026-07-08 产品毛利成本占比 approved metric

- 背景：用户问题“检查6月份产品，价值比较高的5种，毛利是多少，成本占比最大的是什么，都是哪些客户”在严格财务模式下缺少 approved metric/template，旧链路会被阻断或生成不可靠 SQL。
- 实现：基于检索到的“客户订单成本占比分析”和“入库毛利”参考 SQL，在真实库 `erp_agent.business_metric_catalog` upsert `product_margin_cost_ratio_top5`，状态为 `approved`；`definition_json` 固定口径：时间字段 `Erp.PartTran.TranDate`，6 月默认当前年份，价值高按未税销售额 Top5，毛利返回金额和毛利率，成本占比分母为未税销售额，最大成本项在物料/人工/制造/外协费中取金额最大，客户按 Top 产品列出。
- 决策：未把 SQL 直接批准为 executable template，因为当前 `SqlGuardService` 对 CTE 派生列存在误报；先批准 metric，让严格财务生成必须引用固定口径。代表 SQL 写入 `business_metric_catalog.representative_sql`，不再保留运行时不会读取的 `tmp` SQL artifact。
- 验证：字段存在性检查通过；`findApprovedMetricCandidates` 对原问题命中 `product_margin_cost_ratio_top5` 且 score=1；`node --test --import tsx apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/sqlPlanner.test.ts` 通过。全链路 ask 和 ERP-only 执行因需要向外部 LLM/ERP 后端发送财务上下文/SQL，被安全审核拦截，未继续绕行。

### 2026-07-08 ERP SQL 财务估算模式

- 背景：严格财务 SQL 需要 approved template/metric，但经营决策场景允许用户明确要求“估算/大概/粗算”时查看非财务口径参考值。
- 实现：`SqlGuardService` 增加 `financeMode`，strict 只放行 approved metric/template，estimate 允许历史 dataset/family reference；Mastra `validateSql` 传入 module/references/financeMode，workflow 对估算问题返回 `financeScope` 和免责声明。
- 决策：不重做 SQL 安全校验器，不新增 dry-run/explain 框架；估算模式必须由用户显式触发，结果不可用于报表、对账、审计或付款结算。
- 验证：`npx tsx --test apps/server/test/erpSqlAgent/sqlGuard.test.ts`、`npx tsx --test apps/server/test/erpSqlAgent/mastraErpSqlAgent.test.ts`、`npm run build:server` 通过；`npm test` 曾完整通过 304 项，后续复跑出现 1 个既有 SQL family promotion review 断言波动（markdown family heading 计数 10 vs 5），与本次 finance guard/Mastra workflow 改动路径无关。

### 2026-07-08 ERP SQL 财务定义草稿补全

- 背景：第一轮只细化了财务汇总、应收实收差异和退款/冲销，剩余财务明细、同比/环比、排行、异常核对、多表 join 仍是空骨架。
- 实现：将 `finance_detail`、`finance_period_compare`、`finance_group_ranking`、`finance_exception_check`、`finance_join_metric` 升级为 `draft_definition`，复用已确认的 `Erp.InvcHead.ApplyDate`、`Erp.InvcHead`、`Erp.InvcDtl` 收入侧口径，补充明细粒度、同比/环比输出、排行默认排序、异常规则和 join 预聚合约束。
- 决策：仍不批准执行；付款、冲销、RMA 金额、PartTran 成本窗口、join 基数和发票状态继续作为 approval blocker。
- 验证：运行 `npm run build:server`、`npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`；真实库执行 `sql-family:promote-assets -- --apply` 后用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=12`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 灰度观察

- 背景：ERP SQL reference/embedding 已过验收，正式放开前需要先观察生成 SQL 的证据链，避免 LLM 生成绕过模板、reference 和 guard。
- 实现：新增 `ERP_SQL_AGENT_EXECUTE_GENERATED_SQL` 灰度开关，默认只执行 approved template，LLM SQL 只生成、校验和记录；trace 增加 session/run/user/rollout mode，generation 保存 reference score、matchedSignals 和 vector signal；新增 `sql-agent:observe-rollout` 只读观察脚本。
- 决策：财务继续采用 approved metric/template 准入，不把普通 dataset/family reference 当作财务执行凭证；追问/纠错先按同 session 30 分钟内后续用户消息和关键词轻量判断。
- 验证：`npm run prisma:validate`、`npm run build:server`、指定 ERP SQL 单测通过；真实库 `sql-template:audit-reference-index -- --strict --require-embeddings --limit=3` 通过，`datasetCount=4085`、`embeddingCoverageRatio=1`、唯一向量维度 `1536`；`sql-agent:observe-rollout -- --hours=24` 可运行，当前窗口 trace 为 0。`sql-agent:evaluate` 未达标：160 条中 Top3 命中 106 条，准确率 66.25%，finance 20/20 通过，失败集中在 purchase_delivery、sales_order_shipping、inventory_material、job_material_bom，需要单独修复真实库检索资产/排序后再作为上线红线放行。

### 2026-07-08 ERP SQL 财务定义草稿细化

- 背景：财务骨架模板入库后，需要把高频财务问题的可确认口径先沉淀到 `definition_json`，但不能在字段未完全确认前批准执行。
- 实现：将 `finance_summary`、`finance_ar_cash_diff`、`finance_refund_writeoff` 从空骨架升级为 `draft_definition`，补充金额表达式、时间字段、税/退款策略、必需表字段、允许维度/过滤、输出控制列、证据来源和审批阻断项。
- 决策：只使用历史 reference 中能确认的 `Erp.InvcHead`、`Erp.InvcDtl`、`Erp.RMADtl`、`Erp.RMAHead` 线索；实收表、冲销字段、退款日期、发票状态和税率例外仍列为 approval blocker，数据库 `status` 继续保持 `draft`。
- 验证：运行 `npm run build:server`、`npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`；真实库执行 `sql-family:promote-assets -- --apply` 后用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=7`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 财务骨架模板

- 背景：财务类优先模板化，但现阶段不追求模板数量，需要先覆盖财务汇总、明细、同比/环比、排行、异常核对、应收实收差异、退款/冲销和多表 join 指标等高风险 family。
- 实现：在 SQL family asset promotion 中追加 8 条 finance skeleton metric draft，写入 `business_metric_catalog.definition_json`，保留时间、维度、过滤、排序、limit 等可变槽位；同步 verify 脚本和单测计数。
- 决策：不生成可执行 SQL，不自动批准；非财务 family 继续走既有模板/引用/LLM 路径。
- 验证：运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlFamilyAssetPromotion.test.ts`、`npm run build:server`；真实库执行 pending additive migrations 后运行 `sql-family:promote-assets -- --apply`，再用 `sql-family:verify-assets` 验证 `templateDraftFound=5`、`referenceFamilyFound=7`、`metricDraftFound=13`、`unexpectedTemplateFamilyCount=0`、`failedCount=0`。

### 2026-07-08 ERP SQL 财务指标定义层

- 背景：财务 SQL 不能只依赖历史 SQL reference 和 prompt 约束，需要把收入、税退款、成本、时间和排除规则固定在已批准指标定义里。
- 实现：`business_metric_catalog` 增加 `definition_json`；ERP SQL Agent 在 finance 无已批准模板时只检索 `status='approved'` 的 finance metric，未命中则阻断生成；LLM 和 guard 都只接受 approved metric/template 作为财务准入。
- 决策：继续复用现有模板优先级、metric catalog 和 guard，不新增独立财务 agent；现有 draft metric 不自动升级。
- 验证：运行 `npm test -- apps/server/test/erpSqlAgent/sqlGuard.test.ts apps/server/test/erpSqlAgent/erpSqlAgentService.test.ts apps/server/test/erpSqlAgent/llmSqlGenerator.test.ts` 通过（runner 实际执行 292 项）；`npm run build:server` 通过；`npm run prisma:validate` 通过。

### 2026-07-08 ERP SQL Reference Embedding

- 背景：历史 SQL reference index 已覆盖 4085 条 dataset，需要在不上 pgvector、不新增依赖的前提下补 embedding 增强重排。
- 实现：新增 OpenAI-compatible embedding client 和 `sql-template:build-reference-embeddings` 脚本，复用 `openai` SDK 与 `llm_call_logs`；检索在有 query embedding 和 row vector 时按 `0.75 * mixedScore + 0.25 * vectorScore` 重排，失败自动回退 mixed score；index rebuild 时 `embedding_text` 变化会清空旧 vector/model/time；audit 增加 embedding 覆盖率、模型、维度和 `--strict --require-embeddings` 检查。
- 决策：v1 继续 JSONB 向量内存扫描，4000 级别数据不引入 pgvector；日志只记录 batch size/model/dim，不记录完整 SQL；embedding client 需要 `ERP_SQL_EMBEDDING_TRUSTED=1`，避免未确认 endpoint 时发送 ERP reference 文本。
- 验证：运行 `npm test -- apps/server/test/erpSqlAgent/sqlDatasetReferenceSearch.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceAudit.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceIndexBuilder.test.ts` 通过（runner 实际执行 286 项）；`npm run build:server` 通过；`DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/db npm run prisma:validate` 通过。未连接真实 embedding 网关执行 apply。

### 2026-07-08 ERP SQL 历史检索库真实库 Apply/Audit

- 背景：需要确认 4000+ 条 FineReport SQL 不只是代码侧可构建，而是已在真实数据库完成索引落库并通过 strict audit。
- 实现：用主线程 `.env` 连接真实库执行 Prisma migration deploy，应用 `20260708020000_sql_dataset_reference_index`；随后运行 `sql-template:build-reference-index -- --apply`，按 `dataset_id` upsert 4085 条 dataset 索引。
- 决策：补强索引解析器以支持中文表/字段、反引号标识符、逗号 join、FineReport `[表]别名` 写法；对纯内联 `SELECT ... UNION` 用 `inline_values`，对无法解析列名的内联/通配场景用 `inline_value`/`*`，让 strict audit 有明确口径。
- 验证：真实库 apply 输出 `datasetCount=4085`、`indexedCount=4085`、`coverageRatio=1`、`financeCount=763`、`verifiedCount=123`、`metricTaggedCount=628`；`sql-template:audit-reference-index -- --strict --limit=3` 退出码 0，所有 `fieldGaps` 为 0，`smokeGapCount=0`；本地运行 `npm test -- apps/server/test/erpSqlAgent/sqlDatasetReferenceIndexBuilder.test.ts apps/server/test/erpSqlAgent/sqlDatasetReferenceAudit.test.ts`、`npm run build:server`、加载主线程 `.env` 的 `npm run prisma:validate` 均通过。

### 2026-07-08 ERP SQL 业务类型 Golden Questions

- 背景：SQL family 验证按 family 组织不贴近真实用户问法，改为按业务类型验证路由/召回是否命中正确 SQL 来源。
- 实现：新增 `sqlTemplateGoldenQuestions.json`，按采购到货、销售订单发货、库存物料、生产进度、工单物料/BOM、工序报工、报价配置、财务成本毛利 8 类各 20 条；`SqlTemplateRetrievalEvalService` 默认从 JSON 读取用例，并把 reference family 和 metric catalog 纳入 eval 候选。
- 决策：v1 跳过 noise/low-value family，不为每个 family 平均凑题；重叠业务问题允许多个 expected family；finance metric family 若尚未入库，用静态 eval fallback 防止 golden 验证被缺失候选拖垮。
- 验证：新增 golden questions 结构测试；运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`、`npm run sql-template:retrieval-eval -- --out tmp/sql-template-retrieval-eval.json --md-out tmp/sql-template-retrieval-eval.md --compact-out tmp/sql-template-retrieval-eval.compact.json`、`npm run build:server`。

### 2026-07-08 ERP SQL 财务 Guard

- 背景：财务 SQL 的金额口径风险高，需要只对 finance family 增加更严格校验。
- 实现：在 `SqlGuardService` 增加可选上下文，finance 模块要求命中历史 SQL/模板参考、出现金额/状态/日期字段、明细金额表 join 前预聚合，并返回时间字段、金额字段、状态过滤、税退款口径说明列。
- 决策：不新增独立 guard 类，复用现有 parser、字段收集和 generator guard 调用；非 finance 调用保持原校验。
- 验证：运行 `npx tsx --test apps/server/test/erpSqlAgent/sqlGuard.test.ts` 和 `npm run build:server` 通过；`npm test -- apps/server/test/erpSqlAgent/sqlGuard.test.ts` 会触发仓库 runner 全量测试，当前因 Prisma client 未生成失败。

### 2026-07-08 ERP SQL 历史检索库

- 背景：LLM fallback 只参考少量 family 摘要，FineReport 导入的历史 SQL 没有以 dataset 粒度参与召回。
- 实现：新增 `sql_dataset_reference_index` 迁移和 Prisma 模型；新增索引构建脚本；索引记录自然语言问题、SQL、family、表字段、指标、时间口径、业务场景、财务标记和验证标记；扩展 `findSqlReference` 和旧 `erpSqlAgent.ask` fallback 路径，LLM 生成前先返回 dataset 级参考，再补 family 级参考；补充检索打分测试和架构说明。
- 决策：第一阶段不上 pgvector、不新增依赖，使用 family/module/intent、问题词、表字段、参数、指标词和财务关键词混合打分；未归类 SQL 的 family 记为 `unclassified`，`verified=true` 只来自 approved 且 guard_passed 的模板来源；embedding 字段只预留。
- 验证：新增 `sqlDatasetReferenceSearch.test.ts` 覆盖财务优先、无 family 召回和 toolchain 输出兼容。
- 补充：新增 `sql-template:audit-reference-index` 只读审计脚本，输出索引覆盖率、缺字段计数、指标分布和 Top 检索 smoke 结果。
- 补充：LLM prompt 保留 Top reference 元数据，但只给前 3 条携带 SQL preview，避免历史 SQL 片段挤占上下文。
- 后续：`toolchain.tools.ts` 本次只做小范围接线，文件已超过 500 行；后续触达更多 Mastra tool 时应按 tool 分片拆出 mapper/schema。

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
