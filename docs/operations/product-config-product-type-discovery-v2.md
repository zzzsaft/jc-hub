# ProductConfigAgent 报价产品包普查 v3.0

执行日期：2026-07-10。

## 目标与模型

阶段 2.1 不再假设一份配置表只有一个主产品。文档表示报价产品包，包内模头、分配器、连接器、换网器、计量泵等均为平级、可独立销售的产品，后续分别关联 ERP 产品编号、BOM 和价格。

正式实现位于：

- `apps/server/src/modules/productConfigAgent/productType/resolver.ts`
- `apps/server/src/modules/productConfigAgent/productType/discovery.ts`
- `apps/server/src/modules/productConfigAgent/productType/dieConfiguration.ts`
- `apps/server/src/modules/productConfigAgent/productType/erpTaxonomy.ts`
- `apps/server/src/modules/productConfigAgent/scripts/auditProductTypeDiscovery.ts`

旧 `tmp/product-config-new-product-type-review-400/run-review.ts` 只保留为阶段 2 历史证据。

## 规则

- documentId 只作稳定标识；日期优先 archive order date/docInfo，其次明确业务标签的 blocks 日期，`createdAt` 只作低置信导入日期。
- 晚于 `--as-of` 的业务日期不能进入 recent。
- blocks 标签、内部标题、章节、normalized/extraction/plan 共同参与产品证据融合；plan 不无条件抢占。
- 文档输出一个产品包和多个产品族记录，不把多产品共现称为主产品冲突。
- 名称像组件的证据暂存等待 ERP PartNum/订单行确认，不永久认定不可售。
- 开放式标题发现不要求产品名预先存在于白名单。
- 输出不包含完整文件名、客户、公司、联系人、电话或地址。

## 模头产品族与成品形态

模头产品族只分：

- `flat_die`：平模；流延膜模头仍属于平模。
- `coating_die`：涂布/涂覆模头。
- `round_die`：吹膜圆模；字典兼容 canonical 为 `blown_film_die`。

成品形态独立保存为 `board`、`sheet`、`board_sheet`、`film` 或 `unknown`。“膜”由成品形态决定，不等于圆模；平模也可以生产膜。文档没有明确板或片时暂归 `board_sheet`。

厚度、阻流棒、application 和工艺属于配置/报价结构证据，不强行覆盖文档明确写出的板材或片材名称。热成型 0.15–2.5mm 可标记常规片材配置；大于 2.5mm 或明确配置阻流棒可标记板材结构配置，但板/片名称与结构不一致时只生成技术问题。

## ERP 证据边界

2026-07-10 使用 ERP Agent 只读核对：

- `0910` 平模头、`091031` 涂布模头、`091020` 圆模头。
- `0918` 是高端平模头子分类，仍归平模产品族；`091001` 是模头半成品/未完工工件，不作为成品产品族冲突。
- `0904` 分配器、`0906` 连接器、`0903` 换网器、`0902` 计量泵。
- `PartClass=1010 模头` 同时覆盖三类模头，不能用于细分。

六位主号后的后缀可作候选提示：`-100` 多为销售套件，`-200/-300/-400/-500/-600/-700` 多为连接器、分配器、换网器、计量泵、静态混合器、液压站，`-001` 等低位号多为半成品/工件。该规则存在历史例外，且配套产品可能挂在同订单的兄弟主号下，因此不能代替产品描述、ProdCode 和订单行核验。已核实 GD E70 计量泵为 `250159-500`；`250160-100` 是平模头 `250160` 的销售套件。

`ProdCode/ProdGrup` 只作为产品族强提示；维修、半成品、研发、高端等群组不能直接映射为配置产品族。只有关联具体 PartNum 或订单行后，才允许继续查询独立 BOM 和价格。

## 只读运行与产物

固定参数：

- `as-of=2026-07-10`
- dictionary version `1522`
- rule version `product-package-discovery-v3.0`
- seed `product-package-discovery-400-v3.0-2026-07-10`

主要产物位于 `tmp/product-config-new-product-type-review-400-v2/`：

- `document-product-packages.tsv`：一行一个报价包。
- `document-products.tsv`：一行一个文档级产品族记录。
- `technical-question-samples-100.tsv`：规则和 ERP 身份问题池，不要求逐行人工标注。
- `erp-product-group-reference.tsv`：ERP 产品群组提示映射。
- `new-product-type-candidates.tsv`、`alias-risk-audit.tsv`、`approval-package.json`、`summary.json`、`report.md`。
- `document-primary-products.tsv` 和 `golden-review-100.tsv` 仅作旧文件名兼容，内容已分别改为产品包和技术问题池。

## 审批边界与下一步

本轮不写生产数据库，不运行 refresh、normalization 或 worker。四组 alias 风险仍只生成 blocked approval package。

下一步按每个产品项执行 ERP 身份关联：优先配置表 PartNum，其次订单号对应的 `OrderDtl`，再用名称、顺序和数量消歧。验收指标改为产品包覆盖率、多产品召回、ERP PartNum 关联率、ProdCode 一致率和无法关联原因；不要求人工填写 100 行标签。

阶段 2.1 的只读 ERP 身份总账输出到 `tmp/product-config-erp-identity-ledger-400-v1/`。其中名称和 expected ProdCode 只作候选提示，不能单独产生 matched；family 冲突只在身份已 matched 后统计，避免把 ambiguous 候选误当 ERP 真值。
