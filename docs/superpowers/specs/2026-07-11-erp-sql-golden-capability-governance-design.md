# ERP SQL Golden 能力契约治理设计

## 背景

2026-07-11 使用真实网页逐题执行 187 个 ERP SQL golden questions。最终结果为：114 题正常完成、5 题返回数据但忽略订单或客户范围、21 题 SQL/Guard 错误、26 题路由错误、21 题要求补充口径或字段。8 路页面并发曾使 2030 服务退出，降低并发并重启后完成测试。

现有 golden 集合混合了三类内容：已经具备可靠执行能力的问题、合理需要澄清的问题，以及尚无 approved 数据源或查询资产的问题。仅按 family 检索命中判断“已验证”，会把错误范围结果、未覆盖模板和不可执行愿望当作成功能力。

## 目标

建立能力契约驱动的 ERP SQL golden 治理体系：只有数据源、指标、维度、筛选、时间、比较和权限边界完整的问题才能进入可执行集合；合理歧义和当前不支持能力分别以稳定、可审计的响应验收。禁止为单个问句增加 SQL 特判。

## Golden 分层

每个问题必须声明一种预期结果：

- `execute`：必须生成并执行通过 Guard 的 SQL，且通过结构化语义断言。
- `clarify`：必须返回指定澄清问题，不得生成或执行 SQL。
- `unsupported`：必须返回能力缺口代码和说明，不得生成或执行 SQL。

建议扩展 golden case：

```json
{
  "businessType": "sales_order_shipping",
  "question": "订单 10086 的待发货情况",
  "capability": "sales.open_shipping",
  "expectedOutcome": "execute",
  "requiredMetrics": ["open_shipping_amount", "open_shipping_qty"],
  "requiredDimensions": ["order"],
  "requiredFilters": ["orderNum"],
  "requiredTimeSemantics": [],
  "allowedTemplateFamilies": ["family_037"],
  "unsupportedReason": null
}
```

`unsupported` 必须给出稳定原因代码，例如 `missing_approved_data_source`、`missing_metric_definition`、`missing_dimension_bridge` 或 `capability_not_published`。报价配置在可靠后端数据源接通前整体进入 `unsupported`，不能继续尝试生成失败 SQL。

## 能力注册表

新增可版本化的 capability registry。每项能力声明：

- capability code 和业务说明；
- approved 数据源、表族或外部服务；
- approved metrics、dimensions、filter slots；
- 支持的时间与比较语义；
- 允许的模板 family；
- Guard/权限模块；
- 当前状态 `executable|clarification_only|unsupported|planned`；
- 版本、审批来源和失效时间。

Planner 先解析结构化查询计划，再用 registry 校验覆盖范围。覆盖不足时返回 clarification 或 unsupported，不能进入模板、LLM SQL 或执行路径。

## 范围与筛选正确性

订单、客户、供应商、物料、工单和仓库等实体统一进入 `dimensionFilters`。Atomic metric composer 通用编译 approved dimension expression 上的筛选，不只处理客户。

模板覆盖元数据必须显式声明支持的 filter slots。问题要求 `orderNum` 或 `customerName` 时，没有对应覆盖声明的模板不得抢占。

SQL Runtime Guard 增加 query-plan coverage 校验：

- 每个 required metric 必须有 approved 证据；
- 每个 required dimension 必须出现在 SELECT/GROUP BY；
- 每个 required filter 必须真实出现在 WHERE/JOIN，且绑定的是解析后的实体值；
- 时间窗口和比较窗口必须与计划一致；
- 排序和 TopN 要求必须被覆盖。

结果响应输出 scope metadata，包括实际指标、维度、筛选实体和时间范围。Narrator 只基于该 scope 描述结果。问单个订单却返回其他订单时，Runtime Guard 或结果范围验证必须阻止成功响应。

## 路由治理

ERP 路由覆盖生产工序、未完工工序、资源组、班组、员工报工、OpMaster 和车间经营评估等词汇。路由决策优先识别 capability，而不是仅依赖零散关键词。

命中 ERP capability 但资产未发布时仍进入 ERP Agent，并返回 unsupported。不得误报“不是 ERP Agent 问题”。

## 查询资产修复波次

### 波次 1：高风险正确性

- 通用 dimension filter 编译；
- 模板 filter coverage；
- Runtime Guard 计划覆盖校验；
- 结果范围验证；
- 修复 5 个待发货范围错误问题。

### 波次 2：路由与稳定性

- 补齐 operation/labor/production capability 路由；
- 前端限制同时运行数量；
- Agent Runtime、LLM 和 ERP 查询使用独立有界队列；
- 超载返回可重试的 429/503；
- 未捕获异常不能使服务进程退出；
- 健康检查区分存活、就绪和依赖退化。

### 波次 3：库存与生产资产

- 定位并修复安全库存三题的 Internal Server Error；
- 审批安全库存数据源与字段；
- 发布 JobOper、LaborDtl、ResourceGrp、OpMaster 等操作报工只读资产；
- 保留现有权限与分页边界。

### 波次 4：财务与复合分析

- approved finance metrics 补齐 status field、status filters 和 scope explanation；
- 明细金额表必须先按单据键预聚合再关联；
- 复合分析只组合 approved atomic metrics；
- 任一 required metric/dimension 缺失时返回 unsupported，不降级到无关订单明细。

### 波次 5：报价和产品配置桥接

- 报价配置在数据源未发布前保持 unsupported；
- 后续接入报价服务或 ProductConfigAgent 时先发布只读 capability contract；
- 产品语义桥接必须使用 reviewed `Company + PartNum` 绑定，不能用名称正则推断财务维度。

## 稳定性边界

前端默认最多 2 个并行 Agent 查询；管理型回归工具最多 4 个并行页面。后端队列限制必须独立配置，不允许无限排队。过载时返回稳定错误码并保持 2030 进程存活。

网页回归应记录请求开始、完成、耗时、响应类别和 trace id。传输失败与业务失败分开统计。

## 验收体系

网页回归对不同层级分别验收：

- execute pass：成功执行，且 metric/dimension/filter/time/comparison/template/结果范围全部满足断言；
- clarify pass：返回指定澄清问题，未生成或执行 SQL；
- unsupported pass：返回指定 capability code 和原因，未生成或执行 SQL；
- fail：路由错误、Guard 错误、内部错误、范围错误、答非所问或进程不可用。

不再把“页面返回了一张表”视为成功。每次发布生成按 capability 和 business type 分组的报告，并保留失败 trace。

## 初始迁移建议

- `purchase_delivery`、`job_material_bom`：优先迁为 execute 集合。
- `sales_order_shipping`：修复范围校验后进入 execute。
- `inventory_material`：除安全库存外先进入 execute；安全库存暂为 planned/unsupported。
- `production_task_progress`、`operation_labor`：先修路由，再按已发布资产拆分 execute/unsupported。
- `quotation_config`：全部迁为 unsupported，等待可靠数据源。
- `finance_cost_margin`、`business_decision_composite`：仅 approved metric 覆盖完整的题进入 execute，其余迁为 unsupported 或 clarify。

## 非目标

- 不为 187 个问句逐项硬编码 SQL。
- 不降低 Guard 或权限规则以提升表面通过率。
- 不用 PartNum、产品描述或名称正则冒充未治理的产品分类。
- 不在本方案中实现 ERP 写操作。

## 成功标准

1. 所有 golden case 都有唯一 capability 和 expected outcome。
2. executable case 不再出现缺失必需筛选仍返回成功的情况。
3. clarification/unsupported case 不生成或执行 SQL。
4. operation/labor ERP 问题不再被路由为非 ERP。
5. 4 路网页回归期间后端保持健康；超过容量返回稳定过载响应。
6. 报告分别统计 execute、clarify、unsupported 和 fail，且可追溯到 trace。
