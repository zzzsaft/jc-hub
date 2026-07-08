import type { Request, Response } from "express";
import { withRequiredUser } from "../../routes/routeAuth.js";
import { purchaseApplyService } from "./service.js";
import type { PurchaseApplyFilters } from "./types.js";

export const PurchaseApplyRoutes = [
  {
    path: "/erp/purchase/apply",
    method: "get",
    action: withRequiredUser(searchPurchaseApply),
  },
  {
    path: "/erp/purchase/apply/preview",
    method: "post",
    action: withRequiredUser(previewPurchaseApply),
  },
  {
    path: "/erp/purchase/apply/submit",
    method: "post",
    action: withRequiredUser(submitPurchaseApply),
  },
];

async function searchPurchaseApply(request: Request, response: Response) {
  response.json(await purchaseApplyService.search(request.query as Partial<PurchaseApplyFilters>));
}

async function previewPurchaseApply(request: Request, response: Response) {
  response.json(purchaseApplyService.preview(request.body ?? {}));
}

async function submitPurchaseApply(_request: Request, response: Response) {
  response.status(501).json({
    error: "ERP_WRITE_NOT_CONFIGURED",
    message: "采购申请真实提交需要 ERP 后端提供结构化写接口，当前项目不直接执行 Epicor 写操作。",
    contract: purchaseApplyService.erpContract(),
  });
}
