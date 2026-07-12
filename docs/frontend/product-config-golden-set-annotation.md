# Golden Set 标注工作台

## v2 全文盲审入口

入口为 `/agent/golden-set/full-review`。页面一次完成产品包、配置字段、ERP identity 和归档判断；证据区只显示冻结脱敏内容，不显示 prediction、另一标注员答案、匹配状态或内部 gold。保存草稿采用 debounce，提交成功后进入当前席位下一条未提交任务。

A/B 席位由后端按登录用户固定绑定。操作者不能在页面切换席位，也不能读取对方草稿或提交；管理员只在双方都已提交且答案不同后，才能从差异复核接口看到 A/B 答案。不要用假用户、改请求头或手工标记 A/B 来替代真实权限验证。

### 20 任务 pilot

pilot 开始前：

1. 验证 v2 `artifact-seal.json`，确认恰好 400 个唯一文档、280 个 calibration、120 个 acceptance，且 snapshot、manifest 的 hash/bytes 一致。
2. 冻结 schema、reason code 解释、表单文案和规则/prompt 版本；pilot 期间不改 acceptance 集。
3. 给两位真实用户分别配置 `annotator-a`、`annotator-b`，使用同一组预先选定的 20 个 calibration 文档；不把 120 个 acceptance 文档用于 pilot 调参。
4. 确认 export 目录为空且没有旧 `exports-manifest.json`；确认 admission 接口仅为 preview。

两位标注员各自独立完成全部 20 条。pilot 至少覆盖并复核一条人工 `auto_archive`、一条 `quarantine` 和一条 `reject`；每条产品项、配置字段和 ERP identity 都必须有冻结 evidence reference。对 ERP 只使用 `Company + PartNum` 判定身份。浏览器验收同时检查：

- 对方席位看不到本席位草稿或提交；
- 管理员只看到双方均提交且答案不同的复核项；
- desktop、360px、390px、430px 无横向溢出、隐藏抽屉残影、输入遮挡或底部 action bar 覆盖，底部安全区生效；
- 草稿 revision 冲突可见，已提交任务不可覆盖；
- `quarantine`、`reject` 不产生 archive 写入；admission preview 不修改归档。

完成后由管理员生成四份 A/B 导出及 `exports-manifest.json`，逐一复核 SHA-256、bytes、slot、document ID、cohort、schema version、evidence hash，并用 v2 seal 执行 merge。差异必须有可解释 reason-code 路径并显式复核，系统不得偏向或自动挑选 `auto_archive`。

### 推进与冻结边界

20-task pilot 只有同时满足以下条件，才可推进剩余 380 条：

- A、B 两位标注员都完成同一组 20 条；
- 四份导出和 `exports-manifest.json` 全部通过 v2 seal 校验；
- 所有分歧都有明确 reason-code 路径并完成显式复核；
- 桌面与 360/390/430px 浏览器验收通过；
- 120 个 acceptance 文档始终未参与规则、prompt、阈值或 UI 文案调优。

推进后仍保持 280/120 cohort 不变。calibration 用于规则与标注一致性校准；acceptance 只用于冻结后的独立验收。只有 acceptance cohort、双方提交与复核完成、四导出 seal 校验通过、acceptance threshold 为 `both_layers_passed` 且 admission preview 返回 `auto_archive` 的记录，才有资格进入后续 archive pipeline。`quarantine` 和 `reject` 是停止自动归档的最终操作结果，不是延迟或静默 archive 写入。

## v1 工作台（保留）

旧入口 `/agent/golden-set` 继续服务 product package / ERP identity 分层标注；其 baseline、预测、manifest 和 artifact hash 不由 v2 工作流修改。
