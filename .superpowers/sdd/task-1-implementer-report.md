# Task 1 Implementer Report

## 实现摘要

- 新增 ERP SQL capability 类型、注册表和 golden case 运行时解析契约。
- 注册 14 个细分 capability，覆盖现有九个 business type；单独拆分库存安全线、operation/labor、finance，并将 `quotation.contract_config` 标记为 `missing_approved_data_source`。
- 在现有未提交 golden JSON 基础上增量迁移全部 187 条，保留原有新增的“按产品类别，上个月销售额最高，和去年同比”案例。
- 迁移结果：94 条 `execute`，93 条 `unsupported`；没有把真实能力缺口标为可执行，也没有增加单问句 SQL 特判或修改 Guard/权限。

## RED / GREEN 证据

- RED：`node --import tsx --test apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts`
  - exit 1，`ERR_MODULE_NOT_FOUND`，缺少 `capabilities/goldenContract.js`，符合预期缺失功能。
- GREEN：同一焦点测试最终 4/4 通过。
- 新增覆盖一致性测试曾按预期发现采购行维度和采购单筛选映射缺口；补齐通用 registry/contract 映射后转绿。

## 最终验证

- `node --import tsx --test apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts apps/server/test/erpSqlAgent/sqlTemplateRetrievalEval.test.ts`
  - exit 0，6/6 通过。
- `npm run build:server`
  - exit 0。
- `git diff --cached --check`
  - exit 0（提交前）。

## 提交

- SHA：`9536d39b`
- Message：`feat(erp-sql): add capability golden contracts`

## 变更文件

- `apps/server/src/modules/erpSqlAgent/capabilities/types.ts`
- `apps/server/src/modules/erpSqlAgent/capabilities/registry.ts`
- `apps/server/src/modules/erpSqlAgent/capabilities/goldenContract.ts`
- `apps/server/src/modules/erpSqlAgent/templates/golden/sqlTemplateGoldenQuestions.json`
- `apps/server/test/erpSqlAgent/erpSqlCapabilityRegistry.test.ts`

## 风险与刻意未处理

- 当前 capability registry 只提供 Task 1 静态契约；Planner/workflow 的前置能力决策属于 Task 2，未在本提交接线。
- 财务复合、报价、库存安全线和 operation/labor 继续 fail-closed 为 unsupported，需对应数据源、指标或 capability 发布后才能转为 executable。
- 未修改任何现有 Guard、权限、productConfigAgent、quoteAgent 或其他任务文件。

## Review 修复（2026-07-12）

- 新增并先运行失败测试，复现缺少 `requiredSlots` 兼容接口、slot/filter 漂移、genuine ambiguity 误标 execute、九类 business type 缺少 capability 绑定校验。
- parser/type 现保留可选 `requiredSlots`；`mapRequiredSlotToFilter()` 明确声明同名兼容及工单物料 `partNum -> materialPartNum` 映射，parser 在边界强制一致性。
- 补齐全部遗留 slot 需求；映射审计结果 `mismatches: 0`。
- 两条“某个物料”问题改为 `clarify`；“液压站物料当前库存够不够”改为 `clarify`，并用 `comparison_baseline` 表达缺失比较基准。
- 增加九类 business type 到允许 capability 集合的逐 case 测试；迁移结果更新为 91 `execute`、3 `clarify`、93 `unsupported`。
- 最终验证：焦点与旧 golden 兼容测试 9/9 通过；`npm run build:server` exit 0；`git diff --cached --check` exit 0。
- 修复提交：`8c7de39f feat(erp-sql): fix golden capability compatibility`。
- Minor：顺带收紧 parser 的纯空白字符串、空数组元素和重复数组项校验；未扩范围处理 registry 深冻结。
