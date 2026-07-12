# Task 1 Independent Review

## Verdict

**FAIL**

提交确实保留了父提交中的 186 条原有 case，并新增 1 条，最终为 187 条；quotation、库存安全线、operation/labor、finance 也都做了 fail-closed/拆分，焦点测试和 `build:server` 均通过。但 golden 契约字段并未正确迁移完整，且现有测试会因遗漏 requirement 而假绿；同时至少两个应 clarify/unsupported 的问题被标为 execute。

## Blockers

1. **`requiredFilters` 与遗留 `requiredSlots` 不一致，导致 executable coverage 测试通过的是被削弱后的契约。**

   - 12 个 case 的旧 `requiredSlots` 没有完整进入 `requiredFilters`；其中 6 个是 `execute`：
     - `未来 7 天内要到货的采购明细` 保留 `requiredSlots: ["dueBeforeDate"]`，但 `requiredFilters: []`（`sqlTemplateGoldenQuestions.json:67-94`）。
     - `查一下液压站相关物料的库存` 的 `partDescription` 被遗漏（`sqlTemplateGoldenQuestions.json:1208-1225`，后续 `requiredFilters` 为空）。
     - `ABC123 的库存明细到库位` 的 `partNum` 被遗漏（`sqlTemplateGoldenQuestions.json:1268-1294`）。
     - `液压站物料当前库存够不够` 的 `partDescription` 被遗漏（`sqlTemplateGoldenQuestions.json:1475-1499`）。
     - `物料 ABC123 被哪些工单需求`、`哪些工单需求物料 ABC123` 的旧 slot 为 `partNum`，新 filter 却改成 `materialPartNum`，没有建立兼容映射（`sqlTemplateGoldenQuestions.json:2281`、`:2657` 附近）。
   - 另 6 个 unsupported case 也丢了旧 slot（两条 operation 的 `departmentName`、四条 finance 的 `customerName`）。即使 outcome 为 unsupported，golden case 仍应准确声明需求。
   - 测试只检查新 `requiredFilters` 是否属于 registry（`erpSqlCapabilityRegistry.test.ts:38-46`），完全没有校验旧 `requiredSlots` 已被迁移/映射，因此遗漏字段反而让测试更容易通过。
   - 这违反“每条 case receives 正确 contract fields”和“迁移全部 187 条”的核心要求，应修复数据并增加 `requiredSlots -> requiredFilters` 一致性/显式映射测试。

2. **存在被过度标注为 `execute` 的 genuine ambiguity / unsupported assessment。**

   - `查某个物料在哪些库位有库存`（`sqlTemplateGoldenQuestions.json:1425` 附近）没有具体物料，也没有 required filter，却标为 execute；按 brief 的规则，这是需要追问物料编号/描述的 genuine ambiguity，应为 `clarify`。
   - `查某个物料的子件清单`（`sqlTemplateGoldenQuestions.json:2632` 附近）同理，没有具体物料却标为 execute，应为 `clarify`。
   - `液压站物料当前库存够不够`（`sqlTemplateGoldenQuestions.json:1475-1499`）只声明 `inventory_on_hand_qty`。判断“够不够”必须有需求量、安全库存或其他比较基准；`inventory.stock_lookup` 仅发布现存量查询，不能完成该判断。应 clarify 比较口径，或按安全库存/需求能力 fail-closed，而不是 execute。
   - 当前 187 条中 outcome 只有 94 execute + 93 unsupported，**0 clarify**。这不是单纯分布问题，但与上述明确歧义案例结合，说明 `clarify` 迁移规则未真正落实。

## Important

1. **运行时 parser 丢弃旧字段，类型也没有表达兼容字段。**

   - JSON 中仍保留 `requiredSlots`，但 `GoldenCapabilityCase` 不包含它（`capabilities/types.ts:16-29`），`parseGoldenCapabilityCase()` 返回值也直接丢弃它（`capabilities/goldenContract.ts:16-29`）。
   - 因此原 JSON 的旧字段虽然文本上未被破坏，任何采用新 parser 的调用方都无法再消费 `requiredSlots`。这也直接掩盖了 blocker 1 的迁移错误。
   - 建议明确兼容策略：要么 parser/type 保留 `requiredSlots`，并验证它与新 filters 的映射；要么一次性迁移并更新所有旧消费者/测试，而不是 JSON 保留、解析结果丢弃。

2. **测试没有验证 capability 与九类 business type 的允许映射，只验证“不同名”和若干 capability 曾出现。**

   - `erpSqlCapabilityRegistry.test.ts:50-55` 只断言 safety/operation/finance capability 至少存在，以及 capability 不等于 businessType；任意 business type 错绑到另一个已注册 capability 仍会通过。
   - 应建立九类到允许的拆分 capability 集合并逐 case 校验，尤其是 sales 的 order/shipping、job 的 requirement/BOM、operation 三分支。

## Minor

1. `stringArray()` 只校验元素类型，不拒绝空字符串，也不检查重复值（`capabilities/goldenContract.ts:42-47`）；`requiredString()` 也接受纯空白字符串（`:36-39`）。作为运行时边界解析，可用 `trim().length > 0` 并拒绝空数组元素/重复项提高健壮性。

2. `ERP_SQL_CAPABILITIES` 仅把外层数组声明为 readonly，返回的 capability 对象及其数组仍可被调用方修改；`resolveCapability()` 返回共享对象。当前静态用法风险较低，但公开 registry 契约最好使用 readonly 字段/冻结对象，避免全局定义被意外污染。

## 已确认符合规格的部分

- 对比 `9536d39b^` 与当前 JSON：父提交 186 条全部按 `question` 找到，所有旧字段深比较无变化；当前新增 1 条，合计 187 条。
- 9 个 business type 均为 20 条，另 `business_decision_composite` 为 27 条；总数正确。
- 注册 14 个 capability；库存 safety stock、operation/labor/master/resource、finance 均从宽业务类拆出。
- `quotation.contract_config` 为 `unsupported`，reasonCode 为 `missing_approved_data_source`；全部 20 条 quotation case 也为 unsupported，quotation 确实 fail-closed。
- 提交仅包含 brief 列出的 5 个文件；没有新增单问句 SQL 特判，也没有触达 Guard/权限代码。
- `expectedFamilyIds` 与 `allowedTemplateFamilies` 在 187 条中逐条相等，没有发现 family 字段迁移漂移。

## 验证命令与证据

1. `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`
   - exit 0；6 tests passed。
2. `npm run build:server`
   - exit 0；TypeScript build passed。
3. Node 只读对比脚本（`git show 9536d39b^:...json` 与工作树 JSON，按 question 比对旧字段）
   - old=186，current=187，missing old cases=0，changed old fields=0。
4. Node 只读统计脚本
   - outcome：execute=94，unsupported=93，clarify=0。
   - capability：14 个；business type：九个 20 条业务类 + composite 27 条。
5. Node 只读一致性脚本（`requiredSlots - requiredFilters`）
   - 发现 12 条不一致；其中 6 条 execute。
6. `rg -n "question.*===|===.*question|includes\\(.*question" apps/server/src apps/server/test`
   - 未发现本提交引入的单问句 SQL 特判；命中均为既有通用逻辑/测试上下文。

## 审查边界

- 未修改实现代码，未提交。
- 工作树存在大量其他任务的未提交改动；本审查以提交 `9536d39b` 的 5 个文件和相关既有接口为范围，未评价或改动相邻任务内容。
