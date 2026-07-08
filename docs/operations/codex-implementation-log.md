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

### 2026-07-08 ProductConfigAgent document 100-200 residual 6 项修复

- 背景：document 100-200 audit 剩余 14 条 `missing_enum_term`，其中 6 类明确属于材质编号归一、应用/进料噪声、特殊配置错归属、接线方式别名和 45°微调方向治理，要求不调用业务 LLM 并刷新 archive。
- 实现：normalization 对 enum 未命中不再二次解析成 number/unit；补充 `1.2311A`、应用括号清理、长 application 备注噪声、进料方式碎片、唇调节复合拆分、堵边/单边挡拆分、航空插头转接分流、45°微调方向清洗等规则；生产库新增 `wiring_method:customer_drawing_wiring`，并新增 8 条 value alias 后使用现有 `runDictionaryDirtyRefresh` 刷新 document 100-200。
- 决策：不为 `45`、`板材`、`形状`、`进料口`、`类似沥青（客户提供原料）` 等噪声/碎片建 canonical；`45°挤出微调朝下` 归到已有 `extrusion_fine_adjustment_direction:downward`，而不是创建数字枚举。
- 验证：100-200 共 101 份刷新完成，最新 extractionResultId 为 25987-26087，archive item count 230；post-check dirty docs/archives=0、pending candidates=0、duplicate archive=0、唯一索引存在、近 30 分钟 LLM 调用=0；最新 audit `missing_enum_term=0`、termTypeIssue=0、aliasIssue=0、unknownRawField=0、pending=0、businessLlmTokens=0；`prisma:validate`、`build:server`、normalization/dailyMaintenance 测试通过。

### 2026-07-08 ProductConfigAgent document 100-200 复合/噪声 enum 治理

- 背景：document 100-200 term audit 剩余 `missing_enum_term` 中大量是复合值、噪声值或长尾枚举，要求按聚类、normalization 修复、少量字典入库、dirty refresh 和复核顺序处理，且不调用业务 LLM。
- 实现：修正 matcher 的 value kind 来源，优先使用 `dictionary_term_types.value_kind`；补充 enum 清洗和复合拆分规则，丢弃空括号、纯标点、市场类说明、长图纸说明和纯数字方向等噪声；拆分塑料原料/应用/唇调节方式、进料方式/参考模头；生产库新增 13 个稳定 value、7 条稳定 alias，并对 100-200 两轮使用现有 `runDictionaryDirtyRefresh` 刷新 archive；刷新后 16 条新 pending candidate 已按稳定值、噪声或人工复核状态治理。
- 决策：不为长句、尺寸句、互配说明、接线细节或疑似字段归属错误创建 canonical term；这些保留为 reject/needs-human-review 或后续 normalization 专项，避免污染字典。
- 验证：最新 audit `termTypeIssue=0`、alias conflict=0、pending candidate=0、unknown raw field=0，dirty docs/archives 为 0，duplicate archive 为 0，部分唯一索引存在，archive item total 为 230；`missing_enum_term` 从 73 降到 14；`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts` 通过；业务 LLM 调用/token 为 0。
- 后续：剩余 14 条集中在 `1.2311A` 材料归一、流延膜复合应用、进料方式碎片、唇厚度范围和少量接线/加热/堵边长尾值，需要下一轮按字段归属继续拆分，不建议直接批量建 term。

### 2026-07-08 ProductConfigAgent document 100-200 term/termType 审计修复

- 背景：按 document id 100-200 audit 发现 raw 中文字段、trace-only 原始字段、legacy `fastener_type`、字段/值定义不规范和 archive dirty refresh 风险，要求不调用业务 LLM、不创建 job、不跑 worker。
- 实现：补强 normalization，数组形态 `fields` 会转为 raw fields，`original=true`/`split_original_retained` 只作追溯不进最终 fields，拆分电压/功率、塑料原料/应用/产量等复合字段，未选中项丢弃；dirty refresh 的 `promptVersion` 截断到生产字段长度；生产库补齐 15 个 termType 定义、17 条 termType alias、`screw_type=12.9高强度` value/alias、`surface_roughness=A级（0.02-0.03μm）`，并将 `紧固件（螺丝）` legacy alias 改指向 `screw_type`。
- 决策：`number`/`number_unit`/开放文本不强制创建 `dictionary_terms`；明显复合或噪声 enum 值不盲建 canonical，保留在 audit 残留清单供后续按证据拆分或 alias 治理。
- 验证：100-200 共 101 份刷新成功，后续对 14 份 legacy fastener 文档二次刷新成功；最新 audit `termTypeIssue=0`、alias conflict=0、pending candidate=0、unknown raw field=0、dirty docs/archives=0、业务 LLM 调用/token=0；`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts` 通过。
- 后续：audit 仍有 73 条 `missing_enum_term` 和 64 条 term description 建议，多数为复合/噪声或长尾枚举，需下一轮按字段语义拆分后治理，避免批量创建垃圾 canonical。

### 2026-07-08 ProductConfigAgent document 101-200 字典治理与残留刷新

- 背景：继续按 document id 101-200 处理非重复配置表，要求先只读理解和写库计划，获得明确允许后再治理生产库，且不调用业务 LLM、不创建 pending job、不跑 worker。
- 实现：生成 101-200 只读审计、normalization dry-run、写库计划和执行结果到 `tmp/`；生产库治理 47 条 candidate（含 refresh 后再生成的 unknown_field），补齐字段名/单位 alias 和少量明确 termType，创建 34 条 `codex-manual-correction` extraction result，并通过现有 `runDictionaryDirtyRefresh` 串行刷新 archive；为 manual correction 初次形态造成 item 为空的 34 份追加 shape repair correction 后重刷 archive。
- 决策：manual correction 不改旧 extraction row，新建修正 row 后由 dirty refresh 生成最终 archive 引用的 refreshed extraction；文件名只在合并配置表或正文缺失 identity 时作为 document-level 编号证据，并在 warnings/source 中留痕；治理影响到 101-200 外的历史 dirty 文档不在本轮扩大刷新。
- 验证：生产库 101-200 dirty docs/archives 为 0，pending candidates 为 0，missing/zero-item archive 为 0，duplicate archive 为 0，`contract_archives_document_id_unique_not_null` 存在；`npm run prisma:validate`、`npm run build:server`、normalization/dailyMaintenance 测试通过；业务 LLM 调用数和 token 均为 0。
- 后续：全库范围外仍有历史 dirty 文档，留给对应批次或专项 dirty refresh 处理。

### 2026-07-08 ProductConfigAgent document 0-100 字典治理写库

- 背景：按 document 0-100 字典 audit 计划，优先治理缺失 target termType、错误 alias 指向，以及高频且确定的 pending candidate，要求不调用业务 LLM、不创建 job、不跑 worker。
- 实现：生产库创建/补齐 document_info 与 item_identity 依赖的 13 个结构 termType，新增/补齐 17 条高频字段名 alias，处理 21 条计划内 candidate，并修复 3 条 value alias 指向；dirty/archive refresh 中发现旧 extraction 的 `dictionaryVersion=null` 兼容问题后，在 `createExtraction` 入口兜底，并限制按 document 刷新 candidate 时只读取最新 extraction，避免旧 proposal 重新生成 stale pending。
- 决策：候选治理继续走 `dictionaryGovernanceService.reviewCandidatesBatch`，dirty/archive 继续走现有 refresh；本批不创建长尾 termType，不删除 `none/无/NA` placeholder alias。
- 验证：生产库 refresh 后 duplicate archive 为 0，部分唯一索引存在，dirty docs/archives 为 0，计划内 pending candidate 为 0，错误 alias 指向为 0；运行 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm test -- apps/server/test/productConfigAgent/dictionaryCandidateRefresh.test.ts` 通过；业务 LLM token 为 0。
- 后续：`型号`、`开口`、`模头加热分区（模体）`、`模内三流道 A/B/A` 等仍属于长尾或需 qualifier/productType 判定的 pending，留到下一批单独治理。

### 2026-07-08 ProductConfigAgent document 30-100 字典治理与归档刷新

- 背景：继续按 document id 30-100 处理非重复配置表，要求只读理解后再经明确授权写库，且业务 LLM token 必须为 0。
- 实现：生成 30-100 只读审计、normalization dry-run、写库计划和执行结果到 `tmp/`；生产库治理 19 条 pending value candidate，新增/更新 14 条字段名 alias，创建 Codex manual correction extraction 后刷新 dirty archive，并为 document 97 走现有 `archiveDocument` 创建 archive。
- 决策：不调用业务 LLM、不创建 pending job、不跑 worker；candidate 继续走 `dictionaryGovernanceService`，dirty/archive 继续走 `productConfigAgentService`。首次 manual correction 暴露 top-level `items` 形态兼容问题后，追加 shape repair correction，把 top-level items 复制到 `extraction.items` 后重刷 archive。
- 验证：生产库 30-100 archive duplicate 为 0，部分唯一索引存在，dirty docs/archives 为 0，目标 pending candidates 为 0，archive item 均非空，document 97 已归档；运行 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate`、`npm run build:server`、`npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts` 通过；业务 LLM token 为 0。

### 2026-07-08 ProductConfigAgent runtime 接入检查

- 背景：后端已有通用 Agent Runtime，需要确认 ProductConfigAgent agent 已覆盖到默认 runtime 和消息路由。
- 实现：检查 `/productConfigAgent/agent/run` 已经通过 `agentRuntimeService.run` 指向 `productConfigAgent`；补充 ProductConfigAgent runtime 测试，覆盖关键词路由和默认 handler 注册。
- 验证：尝试运行 ProductConfigAgent agent runtime 测试和 `npm run build:server`；当前 worktree 未安装 `node_modules`，测试缺 `@prisma/client`，编译缺 `express`、`@prisma/client`、`@types/node` 等依赖，未完成。

### 2026-07-08 ProductConfigAgent 接下来 20 份配置表 dry-run 与数量归一

- 背景：按 document id 继续处理 document 10-29，要求不调用业务 LLM，只读读取 Excel blocks 与既有 extraction，找出确定性 normalization 问题和候选治理动作。
- 实现：新增只读审计与 dry-run 产物到 `tmp/`，确认本批 20 份非重复配置表的 candidate 状态；补强 `item_quantity` 归一，支持 `壹套`、`十二件` 等中文数量转数字，并把 `共（ ）件` 这类空占位归一为 `null`；生产库按治理预案处理 10 条 pending candidate，并为 doc 16/24/29 创建 Codex manual correction extraction result 后刷新 archive。
- 决策：不调用业务 LLM、不创建 pending job、不跑 worker；candidate governance 复用现有 service；refresh 写 extraction 时按生产库真实字段长度截断 `llm_model`、`prompt_version`、`status`，避免 dirty refresh 后缀顶爆字段。
- 验证：运行 `npm test -- apps/server/test/productConfigAgent/extractionNormalization.test.ts`、`npm test -- apps/server/test/productConfigAgent/dailyMaintenance.test.ts`、`npm run build:server`、`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run prisma:validate` 通过；生产库 29 个受影响 document refresh 成功，重复 archive 为 0，部分唯一索引存在，目标 candidate 无 pending，业务 LLM token 为 0。

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
