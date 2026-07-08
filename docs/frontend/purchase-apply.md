# 采购申请页面

采购申请页面位于 `/admin/purchase/apply`，用于迁移旧 ERP 的采购申请前端操作。

当前版本前端仍可使用 mock 数据；后端已提供 `/erp/purchase/apply` 查询、`/erp/purchase/apply/preview` 预览和 `/erp/purchase/apply/submit` 占位提交接口。真实 ERP 写库仍等待 ERP 后端提供结构化 WebService，不由前端或当前 Node 后端直接写 Epicor。

主表复用通用 `Table` 能力：表头可点击排序，列可拖拽换位、拖拽调整宽度、通过列菜单隐藏或恢复，列菜单内也可通过手柄拖动调整顺序，列显隐、顺序和宽度会记录为本地用户偏好并可重置，单元格内容默认自动换行。

后续接真实功能时，替换 `apps/web/src/pages/purchaseApply/services/purchaseApply.service.ts` 的查询和保存实现即可；接口契约见 `docs/api/purchase-apply.md`。
