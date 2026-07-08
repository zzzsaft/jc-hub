# 采购申请 API

采购申请后端位于 `apps/server/src/modules/purchaseApply/`，用于承接前端 `/admin/purchase/apply` 页面。当前项目只做 ERP 只读查询、提交预览和契约说明，不直接执行 Epicor 写操作。

## 权限

当前代码复用现有 `withRequiredUser` 做登录校验；权限系统恢复后按以下权限码接入：

- `GET /erp/purchase/apply`：`admin.purchase.apply:view`
- `POST /erp/purchase/apply/preview`：`admin.purchase.apply:update`
- `POST /erp/purchase/apply/submit`：`admin.purchase.apply:create`

## 查询采购申请

`GET /erp/purchase/apply`

查询参数与前端筛选项同名：`partNum`、`partDescription`、`jobNum`、`requiredFrom`、`requiredTo`、`area`、`demandOnly`。

返回结构保持和前端 mock service 一致：

```json
{
  "rows": [],
  "sources": [],
  "pos": [],
  "inventories": []
}
```

数据来源：

- 工单物料需求：`Erp.JobMtl / Erp.JobHead / Erp.Part`
- 未到货 PO：`Erp.POHeader / Erp.PODetail / Erp.PORel / Erp.RcvDtl / Erp.Vendor`
- 库存：`Erp.PartWhse / Erp.PartBin`

现场自定义申请表 `ApplyData / ApplyDataByOA / ApplyDataMl` 的字段只在旧 WebService 回写逻辑中确认了 `ApplyNum / ApplyLine / ReApprove / ponum / poline` 等名称，第一版查询不直接写这些表。

## 提交预览

`POST /erp/purchase/apply/preview`

请求：

```json
{
  "buyerId": "B01",
  "orderDate": "2026-07-08",
  "taxRegionCode": "CN13",
  "userId": "zhangsan",
  "rows": []
}
```

预览按 `vendorId` 分组，并映射为旧 `PoKCCreate` 需要的 `PoData / PoDetail` 形状。当前校验要求每行具备 `partNum / vendorId / unit / arrivalDate / orderQty / pieces / applyNum / applyLine`。

## 真实提交

`POST /erp/purchase/apply/submit`

当前固定返回 `501`：

```json
{
  "error": "ERP_WRITE_NOT_CONFIGURED",
  "message": "采购申请真实提交需要 ERP 后端提供结构化写接口，当前项目不直接执行 Epicor 写操作。",
  "contract": {}
}
```

## ERP 后端需提供

`POST /purchase/apply/orders/preview`

- 输入：`buyerId`、`orderDate`、`vendorId`、`taxRegionCode`、`userId`、`autoPo=true`、`details[]`。
- `details[]`：`partNum`、`ourQty`、`vendQty`、`pieces`、`ium`、`pum`、`dueDate`、`commentText`、`baseType`、`cpNum`、`applyNum`、`applyLine`、`area`、`price?`、`maxPrice?`、`minPrice?`。
- 返回：是否可提交、缺失字段、供应商/税率/采购员校验结果、将生成的 PO 分组。

`POST /purchase/apply/orders`

- 行为等价或替代现有 `PoKCCreate`。
- 成功返回：`poNum`、`lines[{ applyNum, applyLine, poLine }]`。
- 失败返回：稳定错误码、中文消息、失败行号。
- 必须支持 `idempotencyKey`，避免重复生成 PO。
- 失败时必须回滚已创建 PO，或明确返回待人工处理状态。

`GET /purchase/apply/orders/:jobId`

- 若 ERP 端采用队列，返回 `pending/running/succeeded/failed`、`poNum`、错误明细。

## 旧 WebService 参考

已检查 `/Users/zzzsaft/Documents/JCEpicorWebService`：

- `EpicorWebService.asmx.cs` 暴露 `PoKCCreate(string dataJson)`。
- `BLL/PO.cs` 的 `PoKCCreate(PoData poData)` 会创建 POHeader/PODetail，并回写 `ApplyData / ApplyDataByOA / ApplyDataMl`。
- `CommonClass/Podata.cs` 定义了 `PoData / PoDetail` 字段。

建议 ERP 后端后续改为结构化 JSON、参数化 SQL 和事务，不继续拼接 SQL 字符串。
