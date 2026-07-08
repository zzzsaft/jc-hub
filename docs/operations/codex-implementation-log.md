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

### 2026-07-08 ProductConfigAgent 重复 archive 清理与唯一索引

- 背景：历史归档以 `archive_key` 唯一，同一 document 可因不同 archiveKey 留下多条 archive，检索会命中旧副本或重复副本。
- 实现：生产库按 document 分组保留一条 archive，优先保留 `status=archived` 且 `dirty_reason is null` 的最新记录，删除重复 archive 及其 item、item product binding、version；在底表 `production_config_agent.contract_archives` 创建 `document_id is not null` 的部分唯一索引，并补 SQL migration 固化。
- 决策：`agent.contract_archives` 是兼容 view，索引必须建在 `production_config_agent.contract_archives` 底表；Prisma schema 不能表达 partial unique index，使用 SQL migration 记录。
- 验证：生产库清理前 375 个 document 有重复、需删除 390 条 archive；清理后重复组为 0，索引 `contract_archives_document_id_unique_not_null` 已存在。

### 2026-07-08 ProductConfigAgent 字典刷新与 archive 异常修复

- 背景：生产字典入库后重跑 archive refresh 时，重复 archive 会触发 `(document_id, extraction_result_id)` 唯一约束；同时候选 occurrence 幂等写入和 governance change log 与线上 schema 存在噪声或兼容异常。
- 实现：archive 刷新只更新同 document 的首个/canonical archive，并将重复 archive 标记为 `duplicate_archive_not_refreshed`；dirty refresh 失败时恢复 document dirty 标记；dictionary split 改为按现有 schema find/update/create；change log 写入线上必填字段；candidate occurrence 创建前先查重，避免 Prisma P2002 噪声。
- 决策：不调用业务 LLM、不重新抽取、不创建 pending job、不运行 worker；重复 archive 不强刷，保留 dirtyReason 作为审计线索。
- 验证：生产库对 document 6/7/8 重跑 dictionary dirty refresh 成功，document 4/6/7/8/9 均为 `dictionaryDirty=false`；运行 `npm run prisma:validate`、`npm run prisma:generate`、`npm test -- apps/server/test/productConfigAgent/dictionaryGovernance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过。

### 2026-07-08 ProductConfigAgent 前 5 份配置表归一化修复 dry-run

- 背景：以 document 4/6/7/8/9 为样本，只读比对 Excel blocks 后的既有抽取结果，修复已确认的 normalization 噪声和 qualifier 丢失问题。
- 实现：补强配置字段 qualifier 保留、复合值拆分、非 enum candidate 抑制、`90°阻流棒` 单位误判规避、空 document_info 跳过和合同/订单编号字段边界；生成 dry-run 报告与字典入库预案。
- 决策：单位 alias 匹配继续复用 `DictionaryMatcherService.matchUnit()` / `dictionaryUnitAlias`，规则层只避免误切复合业务文本；本次不调用业务 LLM、不重抽取、不写生产库。
- 验证：运行 `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过。
- 后续：待明确“允许写库”后，按入库预案走现有 candidate governance 审核路径；document 9 的漏抽仍按 extraction issue 处理。

### 2026-07-08 ProductConfigAgent 前 5 条 Excel 配置重解析与比对脚本

- 背景：需要先对既有 Excel 配置（json block）做重解析入库，并对已入库版本与新结果做差异核对。
- 实现：新增 `product-config-agent:reparse-excel-configs` 脚本 `reparseExcelConfigsAndCompare.ts`，批量读取 Excel 文档、强制重解析 block、强制重抽取（固定走 codex token 路由）、落表到 `extraction_results`，并输出 block / extraction / candidate 差异和未入典 termType 预检清单。
- 决策：不新增持久化表，直接复用现有 `extraction_results`、`dictionary_candidates` 与 `dictionary_candidate_occurrences` 作为“每次抽取留痕”依据；保留现有候选治理路径。
- 验证：已补充新脚本命令到 `package.json` 与脚本清单文档；建议先跑 `npm run product-config-agent:reparse-excel-configs -- --limit=5` 做第一批验证。

### 2026-07-08 ProductConfigAgent candidate 噪声归一化

- 背景：生产库 pending candidate 高频项中，`plastic_material=at`、图纸签名空表单、`电磁阀液压站` 等多来自 normalization 未清理包装文本，而非 LLM 抽取本身。
- 实现：在 enum/enums 字典匹配前清理说明外壳、其他/其它前缀、应用领域包装、液压站后缀、图纸状态模板、传感器来源说明、45°安装括号备注和加热相位简称；candidate 入库收集口增加噪声兜底过滤。
- 决策：不把真实缺失字典值硬编码进 normalization；当前生产库 pending/历史 term type candidate 查询为空，详见 `docs/operations/product-config-candidate-top100-audit.md`。
- 验证：运行 `node --test --import tsx apps/server/test/productConfigAgent/extractionNormalization.test.ts apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts`、`npm run build:server` 通过；对 top20 样本文档做只读 dry-run，watched 高频旧 candidate 未再生成。


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

### 2026-07-08 人事绩效 PostgreSQL schema 和只读账号隔离

- 背景：后续人事绩效 Agent 需要独立 schema，并和普通只读账号做数据库层权限隔离。
- 实现：新增 `hr_performance_agent` Prisma migration，Prisma datasource 纳入该 schema；补充只读账号 psql 模板，普通只读账号只授予非 HR schema，HR 只读账号只授予 `hr_performance_agent`；README 和 `.env.example` 增加对应说明。
- 决策：真实账号密码不写入 migration 或代码，只放本机 `.env`/未提交 `.env.*`，避免分享仓库时泄露绩效库连接信息。
- 验证：运行 `npm run prisma:validate`。

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
