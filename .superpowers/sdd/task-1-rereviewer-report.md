# Task 1 Fresh Re-review

## Verdict

**PASS**

最终净改动 `f0d39d9..8c7de39f` 满足 Task 1 契约要求，前次两项 Blocker 与两项 Important 均已真实修复；针对性测试 9/9 通过，服务端 TypeScript 构建通过，未发现新的阻断性回归。

## 前次问题复核

1. **Blocker：`requiredSlots` / `requiredFilters` 漂移 — 已修复。**
   - `GoldenCapabilityCase` 保留可选 `requiredSlots`（`apps/server/src/modules/erpSqlAgent/capabilities/types.ts:21`）。
   - parser 保留该字段，并在解析边界逐项校验 slot 到 filter 的映射（`apps/server/src/modules/erpSqlAgent/capabilities/goldenContract.ts:17-21,28`）。
   - 工单物料的遗留 `partNum` 显式映射为 `materialPartNum`（`apps/server/src/modules/erpSqlAgent/capabilities/goldenContract.ts:40-42`）。
   - 对全部 187 条执行只读审计，`requiredSlots -> requiredFilters` mismatch 为 **0**；测试也覆盖该不变量（`apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts:38-46`）。

2. **Blocker：genuine ambiguity 被误标 execute — 已修复。**
   - 三条指定问题现在均为 `clarify`（测试断言见 `apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts:48-55`）。
   - “库存够不够”同时声明 `comparison_baseline`，不再假装仅凭现存量即可执行。
   - 全量 outcome 统计为 **91 execute / 3 clarify / 93 unsupported**。

3. **Important：旧字段兼容 — 已修复。**
   - 类型、parser 返回值及一致性校验均保留 `requiredSlots`，旧消费者不会因采用新 parser 而丢字段（`types.ts:21`; `goldenContract.ts:17-21,28`）。

4. **Important：九类 business type 白名单 — 已修复。**
   - 测试建立九类到允许 capability 集合，并逐 case 校验（`apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts:77-93`）。
   - 全量统计为八类各 20 条，加 `business_decision_composite` 27 条，总计 187 条。

## 其他重点验证

- **187 条完整性：** parser 测试硬断言 187（`erpSqlCapabilityRegistry.test.ts:16-29`）；只读统计同样得到 187。
- **execute 覆盖约束：** 每条 execute 的 metric、dimension、filter、time semantics、family 均必须属于已发布 executable capability（`erpSqlCapabilityRegistry.test.ts:57-67`）。
- **quotation fail-closed：** registry 为 `unsupported / missing_approved_data_source`（`apps/server/src/modules/erpSqlAgent/capabilities/registry.ts:52`）；20 条 quotation golden case 全部为同一 unsupported 原因。
- **finance fail-closed：** 两个 finance capability 均为 unsupported，原因分别为 `missing_metric_definition` 与 `missing_dimension_bridge`（`registry.ts:53-54`）；全部 finance golden case 均为 unsupported。
- **无问句 SQL 特判：** 检查最终净 diff 中新增的 `question === ...`、反向等值、`question.includes(...)` 等模式，无新增命中。现有源码中的正则/关键词通用分类逻辑不属于单问句特判。
- **改动范围：** 最终净 diff 仅包含 brief 指定的 5 个文件，没有修改 Guard、权限或 SQL 执行路径。

## 非阻断观察

- `unsupportedReason` 的专用校验仍接受纯空白字符串，因为使用 `unsupportedReason.length > 0` 而非 `trim()`（`apps/server/src/modules/erpSqlAgent/capabilities/goldenContract.ts:9-14`）。当前 187 条数据没有该问题，且不影响本任务验收；若后续强化公共输入边界，可与其他字符串字段保持一致。
- registry 仍只保证外层数组 readonly，内部对象/数组可变；这是前次已标注的 Minor，当前静态契约用法下不阻断 Task 1。

## 验证命令

1. `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`
   - exit 0；9 tests passed。
2. `npm run build:server`
   - exit 0；TypeScript build passed。
3. Node 只读全量审计
   - total=187；slot mismatch=0；outcomes=91/3/93；quotation 与 finance 全部 fail-closed。
4. `git diff --check f0d39d9..8c7de39f`
   - exit 0。

## 审查边界

- 未修改业务代码，未提交。
- 工作树存在大量其他任务的未提交改动；本复审严格以 `f0d39d9..8c7de39f` 的 5 个 Task 1 文件最终净改动为范围。
