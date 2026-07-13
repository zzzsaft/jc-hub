# ERP SQL 多轮命令理解与结果展示设计

## 背景

用户在同一 ERP Agent 会话中依次提出：

1. “采购金额按供应商统计”；
2. “最近一个月”；
3. “请不要用 supplier 编号，需要查询具体供应商名称”。

当前第二轮能够补齐时间范围，但第三轮会重新询问时间。调查确认有三个直接原因：

- Agent Runtime 当前只读取最近 6 条消息，而设计目标是最近 6 轮，即最多 12 条用户/助手消息；
- ERP 用户消息写库时被替换为不可逆哈希占位符，构造会话上下文时又会过滤这些占位符，因此分析 LLM 通常看不到用户原始追问和纠正；
- approved `purchase_amount` 指标将 `supplier` 维度定义为 `POHeader.VendorNum`，所以 composer 默认按供应商编号输出。

此外，结果字段仅有少量英文 key 配置了中文 label，未登记字段可能直接以英文形式成为表格标题。

## 目标

- 分析 LLM 接收当前消息、最近 6 轮完整会话、上一份有效结构化计划和更早语义摘要。
- 用户的新陈述能够修改上一轮查询，同时继承未被修改的指标、维度、时间、比较、筛选、排序和业务规则。
- LLM 只生成受控结构化查询计划；系统验证、编译并执行该计划，不允许 LLM 直接执行任意 SQL、Shell 或其他系统命令。
- 供应商统计在 SQL 内部用供应商编号维持实体唯一性，对用户只显示供应商名称。
- ERP 查询结果的可见表格标题全部使用中文。

## 非目标

- 不开放任意 SQL 或系统命令执行。
- 不把原始查询结果行、完整 SQL、鉴权信息或内部审计字段加入 LLM 会话历史。
- 不改变现有 capability、approved metric、SQL Guard 和 ERP 权限边界。
- 不顺带重构其他 Agent 的会话存储。

## 会话上下文

### 最近消息

同一 session 读取最近 6 轮用户/助手对话，最多 12 条消息，按时间正序交给路由 LLM 和分析 LLM。当前正在处理的用户消息由调用参数单独提供，避免重复计入历史。

ERP 原始用户文本需要保存在仅供当前会话推理使用的受保护载荷中。对外消息列表、会话标题、运行审计、工具审计和日志继续使用现有脱敏表示。读取推理载荷前必须执行 session owner 校验；载荷不得进入 trace、日志或最终响应。

若历史会话只有旧的哈希占位符，则无法恢复原文，系统回退到上一份有效 `analysisPlan` 和语义摘要，不伪造历史文本。

### 语义摘要与有效计划

最近 6 轮之前的语义只保留以下结构化字段：

- capability；
- metrics、dimensions 和展示偏好；
- timeRange、comparison；
- dimensionFilters、排序和 TopN；
- 用户确认或纠正的业务规则；
- 尚未解决的歧义。

上一份通过类型校验的 `analysisPlan` 是执行继承的权威来源。审计脱敏对象、自然语言助手回复和旧哈希占位符不能直接作为编译输入。

## LLM 命令与执行边界

分析 LLM 输出 JSON `analysisPlan`，表达“新查询”或“修改上一查询”。对于第三轮纠正，期望计划保持：

- capability：`purchase.supplier_amount_summary`；
- metric：`purchase_amount`；
- dimension：`supplier`；
- timeRange：`{ kind: "relative", days: 30 }`；
- supplier 展示：名称。

系统对输出依次执行 JSON schema 校验、capability coverage、approved metric/dimension coverage、权限校验、SQL 编译和 SQL Runtime Guard。全部通过后才调用 ERP 查询 executor。任何阶段失败都按现有 clarify/unsupported/semantic mismatch 契约返回，不降级为任意命令执行。

当当前消息只是展示方式、排序、筛选或其他查询修正时，planner 必须继承上一计划中未被明确覆盖的字段，不能因为当前句没有再次出现时间词而删除 `timeRange`。

## 供应商名称语义

`supplier` 对用户表示供应商名称。approved `purchase_amount` 定义增加 Vendor 主数据关联：

- 内部实体键：`POHeader.VendorNum`；
- 展示值：`Vendor.Name`；
- 关联条件：Company 与 VendorNum；
- 聚合保持供应商编号和名称共同约束，避免同名供应商被合并；
- 结果中的编号列标记为 technical 且 `inlineVisible=false`，或不进入最终可见列。

供应商名称缺失时不得用编号冒充名称；可见值统一显示“未命名供应商”，内部仍以 VendorNum 区分实体。

## 中文表头

SQL 和响应继续使用稳定英文 `key`，前端排序、格式化和详情引用 key。服务端 `columns[].label` 负责中文业务名称，前端表头只显示 label。

至少补齐本场景涉及的映射：

- `supplier` → `供应商名称`；
- `purchase_amount` → `采购金额`；
- `period` → `统计期间`；
- supplier 内部编号 → `供应商编号`，并标记 technical、默认隐藏。

所有 ERP 可见列必须得到中文 label。对未登记且仍为英文的字段，服务端不得把英文 key 美化后直接展示；应使用明确的中文兜底并记录测试失败，以推动补齐正式映射。已有中文 SQL alias 原样保留。

## 数据流

1. Agent Runtime 校验 session owner，读取受保护的最近 6 轮推理文本和上一有效上下文。
2. Route classifier 使用当前消息、会话上下文和锁定 capability 判断仍由 ERP Agent 处理。
3. Analysis planner 使用同一上下文输出结构化计划，最新明确用户陈述覆盖旧字段。
4. Context merger 继承当前消息未修改的上一计划字段，并记录 `contextInheritance`。
5. Approved metric composer 用供应商内部键关联、按名称展示，生成候选 SQL。
6. Runtime Guard 和权限层通过后执行 ERP 查询。
7. 服务端生成稳定 key、中文 label、数据类型、角色和显示属性；前端按 label 展示标题。

## 安全与兼容

- 推理用原始消息与审计消息分离，原始消息不进入普通日志、trace、tool args/result 或接口响应。
- 会话读取仍先做 owner 和 ERP 当前权限校验。
- 旧会话没有可恢复原文时安全回退，不迁移或猜测历史内容。
- 现有响应字段 `fields`、`rows`、`columns` 保持兼容；新增或调整的是列 label、role、可见性及 approved metric 定义。
- 数据库定义变更使用新的 Prisma migration，不改写已应用 migration。

## 测试与验收

### 单元测试

- 上下文构造读取 6 轮、最多 12 条，并保持时间顺序；第 7 轮进入语义摘要范围。
- ERP 推理上下文包含原始用户纠正，但普通消息和审计载荷仍为脱敏内容。
- 三轮 planner 回归：第三轮继承 `purchase_amount`、`supplier` 和最近 30 天，不再询问时间。
- composer SQL 使用 Vendor 关联、内部 VendorNum 唯一键和 Vendor.Name 展示值。
- 结果列的 `supplier`、`purchase_amount`、`period` 均生成中文 label；可见列不出现英文标题。

### 集成验收

在真实网页同一 session 顺序提交三轮问题，第三轮必须直接执行或返回明确的 guard/空数据结果，不得再次询问时间范围。结果表满足：

- 可见供应商列内容为名称；
- 供应商编号不显示；
- 表格标题全部为中文；
- scope 仍包含采购金额、供应商和最近一个月；
- trace 显示同一 capability，且没有任意 SQL/系统命令绕过受控工具链。

## 文档影响

实现时同步更新：

- `docs/api/erp-sql-agent.md`：6 轮上下文、结构化修改命令和中文列契约；
- `docs/operations/codex-implementation-log.md`：根因、变更范围和验证命令。
