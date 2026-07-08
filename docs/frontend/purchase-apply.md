# 采购申请页面

采购申请页面位于 `/admin/purchase/apply`，用于迁移旧 ERP 的采购申请前端操作。

当前版本只接入前端 mock 数据，不连接真实 ERP 写库接口。页面保留筛选、主表选择、行内编辑、批量到货日期、保存校验，以及来源明细、PO、库存三块联动明细。

后续接真实功能时，替换 `apps/web/src/pages/purchaseApply/services/purchaseApply.service.ts` 的查询和保存实现即可。
