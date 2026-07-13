# ERP 复杂查询 Planner、RAG 证据与多阶段分析设计

## 背景

当前 ERP Agent 的底层核心仍是把用户问题转换为 SQL，再执行查询并生成简短说明。仓库已经导入 4,085 条 FineReport SQL 数据集，建立了 `sql_dataset_reference_index`，并支持混合检索与可选 embedding；这些历史资产目前主要用于 SQL 模板匹配和 LLM SQL fallback。

现有链路对单一明细、单一指标和单模块问题较合适，但大量管理分析问题需要同时取得销售、库存、未交付、采购、生产和成本等多类数据。把这类问题压缩成单个 SQL 会产生以下风险：

- 一个 SQL 同时跨多个明细粒度，容易重复计数或放大金额；
- 不同模块缺少经过批准的关联键时，LLM 可能按名称或猜测关系连接；
- 某个指标或维度缺失会导致整条查询失败，无法安全返回已支持部分；
- 查询成功后只有单一、轻量的结果 Narrator，难以完成证据化分析和结论审核；
- 多角色 LLM 即使表达更流畅，也不能弥补 capability、指标、schema 或关联规则缺失。

已有评测也表明问题分布在多个阶段，而非单一模型能力。2026-07-08 的 160 条模板检索评测中，Top-1 与 Top-3 准确率均为 66.25%，失败 54 条；2026-07-11 的一组 19 条语义检查中，18 条出现 schema retriever 无表候选，复杂问题还暴露 approved metric 维度、跨模块桥接和 LLM fallback 稳定性不足。

因此本设计保留 SQL 作为事实获取层，在其上增加结构化复杂查询 Planner、受控查询任务图、确定性结果拼接、RAG 证据包、Business Analyst 和 Evidence Reviewer。

## 目标

- 将跨指标、跨模块或决策型问题拆成多个可审计的 ERP 查询任务。
- 每个子查询继续复用现有 capability、approved metric/template、权限、SQL Guard 和只读 executor。
- 支持无依赖步骤并行执行，以及基于上一步实体集合的依赖查询。
- 用经过注册的实体粒度和关联键确定性拼接结果，不让 LLM 拼接原始 ERP 行。
- 将 4,085 条历史模板转化为查询参考、能力、指标和关联知识四层证据。
- 由 Business Analyst 生成带证据引用的结论，再由 Evidence Reviewer 检查数字、口径和推断边界。
- 在部分能力缺失或部分查询失败时返回明确、可用的部分结果。
- 建立覆盖 Planner、子查询、拼接和最终回答的分层评测。

## 非目标

- 不用 RAG 替代 ERP 实时 SQL 查询。
- 不把全部历史 SQL 直接批准为可执行模板。
- 不允许 Planner、Analyst 或 Reviewer 绕过 capability、权限和 Runtime Guard 执行自由 SQL。
- 第一阶段不建设多个可自由调用任意工具的自治 Agent，也不实现开放式多轮辩论。
- 不使用名称相似、字段共现或 LLM 判断自动批准跨模块关联。
- 不在本设计阶段写 ERP、生产数据库或模板审批数据。
- 不改变简单查询现有接口和执行路径。

## 方案比较

### 单个超大 SQL

实现直接，但跨模块后难以控制粒度、重复聚合、关联正确性和部分失败，不采用。

### 结构化 Planner 与查询任务图

Planner 生成受约束 JSON；任务执行器复用现有查询能力；Result Composer 确定性拼接；分析和审核角色只读取证据包。该方案可测试、可审计，并能渐进复用当前代码，作为本设计采用方案。

### 全自治多 Agent

销售、库存、成本、风险等角色各自自由查询并辩论，灵活但延迟、成本、不可重复性和安全面都更大。后续只有在结构化方案评测证明角色专业化确有收益时再引入。

## 总体架构

```text
用户问题
  -> 复杂度路由
  -> Complex Query Planner
  -> Query Plan Validator
  -> Query Task Graph Executor
       -> 现有 capability/template/metric 检索
       -> SQL Runtime Guard
       -> ERP 只读执行
  -> Deterministic Result Composer
  -> Business Analyst
  -> Evidence Reviewer
  -> 最终回答
```

简单问题保持现有路径：

```text
简单问题 -> 当前模板/指标/SQL fallback -> ERP 执行 -> Narrator
```

满足下列任一条件时进入复杂 Planner：

- 两个以上独立指标；
- 跨销售、库存、采购、生产、发货、成本或财务模块；
- 包含比较、归因、风险、优先级或决策建议；
- 单个已注册 capability 无法覆盖完整目标。

## Complex Query Planner

Planner 只把业务目标转换为查询任务图。它不生成 SQL、不读取查询结果、不执行工具，也不下业务结论。

### 计划契约

```json
{
  "objective": "识别销售增长快但库存或交付存在风险的产品",
  "entityGrain": ["Company", "ProdCode"],
  "steps": [
    {
      "id": "sales_growth",
      "capabilityCode": "erp.sales.analysis",
      "metrics": ["order_amount"],
      "dimensions": ["product_category", "month"],
      "filters": [],
      "timeRange": { "type": "last_complete_months", "count": 3 },
      "output": { "keys": ["Company", "ProdCode"], "limit": 20 }
    },
    {
      "id": "inventory",
      "dependsOn": ["sales_growth"],
      "capabilityCode": "erp.inventory.on_hand",
      "metrics": ["inventory_on_hand_qty"],
      "dimensions": ["product_category"],
      "inputFrom": {
        "stepId": "sales_growth",
        "keys": ["Company", "ProdCode"]
      }
    },
    {
      "id": "backlog",
      "dependsOn": ["sales_growth"],
      "capabilityCode": "erp.shipping.backlog",
      "metrics": ["open_shipping_qty", "open_shipping_amount"],
      "dimensions": ["product_category"],
      "inputFrom": {
        "stepId": "sales_growth",
        "keys": ["Company", "ProdCode"]
      }
    }
  ],
  "joinPolicy": {
    "keys": ["Company", "ProdCode"],
    "allowNameBasedJoin": false
  },
  "analysisRules": [
    { "code": "sales_growth_rate", "method": "period_over_period" },
    { "code": "inventory_risk", "method": "compare_inventory_with_open_demand" }
  ],
  "budget": {
    "maxQueries": 5,
    "maxRowsPerQuery": 500,
    "timeoutMs": 30000,
    "maxReviewerFollowupQueries": 1
  }
}
```

### 校验规则

Query Plan Validator 必须在执行前确认：

- `objective`、step id 和依赖图完整，依赖图无环；
- capability、metric、dimension 和 analysis rule 均已注册；
- 所有依赖输入都来自上游声明的稳定 key；
- `entityGrain` 与 `joinPolicy` 有已批准的关联知识支持；
- 查询数量、行数、超时和 Reviewer 补查不超过预算；
- 用户权限作用域能够传递到每个 step，但不能因上游结果扩大权限；
- 缺失年份、阈值或业务定义会实质改变结果时进入 clarification，不自行猜测。

## 查询任务图执行

无依赖 step 在现有 ERP 队列限制内并行执行；依赖 step 只在上游完成并得到符合契约的实体键后执行。每个 step 独立经过：

```text
capability 校验
-> approved metric/template 与历史参考检索
-> 参数和权限作用域
-> SQL Runtime Guard
-> ERP 只读执行
-> 结构化 step result
```

step 状态固定为：

- `completed`：结果完整可用；
- `partial`：结果截断、关联覆盖不足或语义为 estimate；
- `clarification_required`：缺少不能安全假设的口径；
- `unsupported`：没有已批准能力；
- `failed`：guard、查询或结果契约失败；
- `skipped`：上游无可用结果或预算已耗尽。

一个 step 失败不自动取消所有独立 step；只取消依赖该 step 的后续节点。最终回答必须列明完成、缺失和跳过部分。

## 四层知识与 RAG 证据

### 历史查询参考

由 4,085 条历史 SQL 索引提供表、字段、参数、业务场景、时间口径、风险标记和 SQL 摘要。它们用于召回和提示，不直接获得执行权。

### 查询能力

从同类历史模板中归纳稳定 capability，例如销售分析、库存余额、采购未到货。只有通过现有 schema/semantic guard、测试和审批的模板或 composer 才能执行。

### 指标定义

保存指标计算表达式、时间字段、状态过滤、适用粒度、维度和正式程度。历史模板中的字段或聚合不能自动提升为 approved metric。

### 关联知识

保存允许跨步骤合并的权威键和粒度，例如：

- `Company + OrderNum + OrderLine`；
- `Company + JobNum`；
- `Company + PartNum`；
- `Company + ProdCode`。

关联规则需要明确来源和审批状态。字段在多个模板中共同出现只能作为候选证据，不能自动成为可执行 join policy。

### 检索输出

RAG 返回结构化证据包，而非一段无类型上下文：

```json
{
  "capabilities": [],
  "approvedMetrics": [],
  "historicalReferences": [],
  "joinRules": [],
  "warnings": [],
  "evidenceLevel": "approved"
}
```

`evidenceLevel` 允许 `approved`、`verified_reference`、`historical` 和 `inferred`。只有 `approved` 能授权指标、capability 或关联执行；其他等级用于召回、解释或人工治理建议。

## Step Result 与确定性拼接

每个子查询输出统一契约：

```json
{
  "stepId": "inventory",
  "grain": ["Company", "ProdCode"],
  "columns": [],
  "rows": [],
  "scope": {},
  "evidence": [],
  "semanticStatus": "exact",
  "truncated": false
}
```

Result Composer 只能：

- 使用 Planner 声明且关联知识批准的键；
- 合并相同粒度的数据；
- 按已注册规则把更细粒度数据先聚合到目标粒度；
- 记录重复键、未匹配行、空值和关联覆盖率；
- 保持缺失值为缺失，不把缺失值自动当成零；
- 拒绝名称模糊匹配、未批准键或可能导致行数膨胀的多对多拼接。

拼接证据至少包含：

```json
{
  "joinCoverage": {
    "salesRows": 20,
    "matchedRows": 16,
    "unmatchedRows": 4,
    "coverageRate": 0.8
  }
}
```

覆盖不足时允许分析已匹配部分，但最终回答不得把已匹配部分描述成全量结论。

## Business Analyst

Business Analyst 接收：

- 用户原问题；
- Planner 的 objective 和 analysis rules；
- Result Composer 的结构化结果；
- 指标定义、证据等级和 join coverage；
- 失败、跳过、截断和 estimate step。

它不接收无权限的原始行，不执行查询，也不能创建未注册指标。输出固定为：

```json
{
  "summary": "",
  "findings": [],
  "risks": [],
  "recommendedDrilldowns": [],
  "claims": [
    {
      "text": "",
      "evidenceIds": [],
      "confidence": "high"
    }
  ]
}
```

每条 claim 必须引用存在的 `evidenceIds`。`confidence` 允许 `high`、`medium` 和 `low`，且不能高于其最低证据等级和关联覆盖所允许的级别。

## Evidence Reviewer

Reviewer 不重新生成一份独立业务答案，而是逐条审核 Analyst claims：

- 引用证据是否存在并支持该结论；
- 数字、排序和比较是否与确定性结果一致；
- 是否把相关性写成因果性；
- 是否遗漏时间范围、权限、截断、estimate 或 join coverage；
- 是否使用未批准指标或未批准关联；
- 是否实际回答用户 objective。

Reviewer 的动作固定为：

- `accept`：原 claim 可发布；
- `rewrite`：降低强度或补充限制后发布；
- `remove`：证据不足，不发布；
- `request_query`：建议补充查询。

第一版最多允许 Reviewer 在剩余预算中追加一次查询。没有预算或缺少 capability 时，`request_query` 转化为用户可见的推荐下钻问题，不能形成无限分析循环。

## 错误处理与降级

- Planner 无法确定计划时返回针对性 clarification。
- 部分 capability 缺失时执行已支持 step，并明确缺失部分。
- 关联规则缺失时分别展示各 step 结果，不跨模块合并。
- step 超时或失败时取消其依赖节点，保留独立成功节点。
- Reviewer 拒绝全部 claims 时仍可返回授权后的基础数据和限制说明。
- 预算耗尽时停止补查，给出可继续追问的方向。
- 复杂 Planner 失败后不得静默退回自由生成的跨模块超大 SQL。

例如成本能力缺失时，最终回答应明确：“已完成销售、库存和未交付分析；成本指标尚未建立当前产品粒度，因此本次不判断毛利原因。”

## 权限、数据保护与审计

- 一个复杂分析使用同一用户权限快照，但每个 step 独立应用 Company、模块、敏感字段和行级权限。
- 上游结果中的实体不能扩大后续查询权限。
- Analyst 与 Reviewer 只接收当前用户有权查看且经过必要聚合、分类或脱敏的证据。
- 原始 ERP 行、客户名称、金额、完整 SQL 和鉴权信息不进入普通 LLM 日志。
- 审计保存 capability、metric、dimension、关联键、SQL hash、行数、字段类别、耗时、状态、join coverage、claim/evidence 引用以及 Reviewer 动作。

一次复杂分析使用父 trace 与子步骤：

```text
planner
|- query:sales
|- query:inventory
|- query:backlog
|- compose
|- analyst
`- reviewer
```

## 兼容性

- 简单查询继续走当前 `erpSqlToolchain`，不增加多轮 LLM 延迟。
- 复杂分析通过新的结构化计划和结果字段扩展现有 Agent Runtime 响应；现有 `fields`、`rows`、`columns`、`scope` 和 `analysis` 保持兼容。
- 第一阶段不要求重建 4,085 条索引；复用当前 reference index，新增的是类型化证据读取和治理层。
- 已存在的 approved template、metric composer、权限和 Runtime Guard 继续作为执行权威来源。

## 评测与验收

### Planner 评测

- 复杂问题拆出正确的 capability、metrics、dimensions、time range、依赖和 entity grain。
- 简单问题不误入复杂 Planner。
- 缺失关键口径时返回 clarification，不生成猜测计划。
- 无环、预算和关联知识校验生效。

### 子查询评测

- 每个 step 命中预期 approved template/metric 或返回明确 unsupported。
- 所有 SQL 通过现有 schema、semantic、scope 和权限 guard 后才执行。
- 并行与依赖步骤按任务图顺序执行，失败只传播到依赖节点。

### Result Composer 评测

- 相同粒度按批准键正确合并。
- 更细粒度先聚合，避免明细 join 导致金额或数量膨胀。
- 多对多、名称匹配和未批准关联被拒绝。
- 未匹配行、空值和 join coverage 计算准确。

### Analyst 与 Reviewer 评测

- 每条 claim 都引用有效 evidence id。
- 数字、排序、同比/环比和阈值与确定性计算一致。
- 无证据 claim 数量为零。
- 部分失败、截断、estimate 和覆盖不足被明确披露。
- Reviewer 能删除虚构原因、错误因果和越权口径。

### Golden 集

从真实失败问题中选取 30 至 50 条，至少覆盖：

- 销售、库存和未交付；
- 销售、成本和毛利；
- 采购、生产和交期；
- 客户、产品和回款；
- 部分 step 失败；
- join coverage 不足；
- 缺少正式指标或关联规则。

验收不能只判断“生成了 SQL”或“输出了一段回答”，必须同时验证计划、执行、拼接和 claim 证据。

## 分阶段落地

### 第一阶段：任务图与确定性执行

以“最近 3 个月销售增长最快的产品，库存是否足够，未交付还有多少”为首个场景，实现：

- 复杂度路由；
- 结构化 Planner 与 Validator；
- 销售、库存、未交付三个 step；
- 并行/依赖执行、预算和部分失败；
- 基础 Result Composer 与 join coverage。

第一阶段不加入成本、Reviewer 自动补查或更多自治角色。

### 第二阶段：RAG 证据与双角色分析

- 输出四层结构化证据包；
- 完善 Result Composer 证据；
- 接入 Business Analyst 与 Evidence Reviewer；
- 建立 claim/evidence 审计和完整回答评测。

### 第三阶段：跨模块桥接扩展

- 补充成本/毛利、采购影响、生产交期和回款等已批准指标及关联规则；
- 按真实失败基线扩展 golden；
- 仅在评测证明有收益时增加专门领域角色或受控讨论轮次。

## 实现文档影响

实施时同步更新：

- `docs/architecture/`：复杂查询任务图、证据模型和结果拼接；
- `docs/api/erp-sql-agent.md`：复杂分析响应、step 状态、claims 和证据契约；
- `docs/frontend/erp-migration.md`：复杂分析进度、部分结果和限制展示；
- `docs/operations/codex-implementation-log.md`：实现范围、兼容影响和验证命令。
