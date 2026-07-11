# ProductConfigAgent ERP 产品身份关联

ERP 产品身份关联是只读领域服务，入口为：

- `ProductConfigErpIdentityLookupService.lookup()`：单个产品候选查询。
- `ProductConfigErpIdentityLookupService.linkPackage()`：报价包内多个平级产品的一对一关联。
- `matchErpPackageProducts()`：不访问 ERP 的纯匹配函数，可供批处理、Agent 工具和测试复用。

模块从 `apps/server/src/modules/productConfigAgent/index.ts` 统一导出。

## 身份与输出

ERP 产品身份键为 `Company + PartNum`。同一 PartNum 在多个 Company 下存在时，若 Company 未确定必须返回 `ambiguous`，因为 ProdCode、BOM 和后续价格上下文可能不同。

候选输出包含 Company、PartNum、产品描述、ProdCode/ProdGrup、ClassID/PartClass、BOM 存在性、订单行证据、置信度和替代候选。关联状态为 `matched`、`ambiguous` 或 `unresolved`。

## 匹配顺序

1. Company + PartNum 精确匹配。
2. PartNum 精确但 Company 未确定：只有唯一候选时才可确认，多公司候选保持 ambiguous。
3. 有 ERP OrderNum 时，一次查询全部订单行，再按名称、预期 ProdCode、数量和包内顺序做一对一分配。
4. 没有 OrderNum 时，逐产品使用中心产品词查询候选，再合并去重并匹配。
5. 合同号不默认当作 ERP OrderNum。

文档级产品编号列表不能作为精确 PartNum。normalized item 同索引名称为空时，依次回退 raw extraction 和 plan item。

### ERP 编号层级提示

对当前样本中的六位主号，ERP 存在较稳定但并非绝对的后缀约定：

- 无后缀六位号通常是报价中的主设备或模头成品。
- `-001`、`-002` 等低位后缀通常是上模、下模、侧板等半成品或工件。
- `-100` 通常是当前产品的销售套件；嵌套的 `-500-100` 表示 `-500` 产品自己的销售套件。
- `-200`、`-300`、`-400`、`-500`、`-600`、`-700` 通常分别提示连接器、分配器、换网器、计量泵、静态混合器、液压站。
- `-800`、`-900` 及字母后缀存在较多历史和工程例外，不作确定分类。

后缀只用于生成候选，不能单独建立身份或父子关系。实际报价中，配套产品可能挂在同一订单的兄弟六位主号下；必须联合产品描述、ProdCode、Company 和完整订单行确认。例如 GD E70 计量泵是 `250159-500`，而 `250160-100` 是 `250160` 的销售套件，并不存在 `250160-500`。

## 调用示例

```ts
const result = await productConfigErpIdentityLookupService.linkPackage({
  orderNumber: 2001,
  items: [
    { itemKey: "die", productName: "PET片材模头", expectedProdCodes: ["0910"] },
    { itemKey: "pump", productName: "GD-E70计量泵", expectedProdCodes: ["0902"] },
  ],
});
```

ERP 查询后端当前不绑定客户端传入的命名参数。服务通过严格类型校验、SQL文本转义、LIKE通配符转义和中心产品词收缩构造只读 SQL；禁止调用方自行拼接 SQL。

服务不写 ERP 或 ProductConfigAgent 数据库，也不复制 BOM 明细和价格。批量关联应输出单独只读总账；在用户明确批准前不写回 archive 或 normalized extraction。

## 阶段 2.1 批量总账

`runErpIdentityLedgerAudit()` 复用上述 service 和 matcher，对固定报价包输入生成逐产品身份总账。它只在精确 PartNum 或真实 ERP OrderNum 提供强身份依据时返回 `matched`；名称相似和 expected ProdCode 只能形成 `ambiguous` 候选。同一查询会缓存，报价包按顺序处理，完整身份仍为 Company + PartNum。

输入中的 `package_item_order` 是产品族发现顺序，不冒充 extraction item index。只有唯一名称对应的结构化 item 产品号才作为精确 item 证据；单产品包标题中的唯一六位号只是候选，仍需 ERP 名称或产品族佐证。多产品包无法分配的文档级号码明确留作 blocker。输出不含客户、联系人、地址、金额、价格或 BOM 明细。
