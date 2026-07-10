import { Router } from "express";
import { withRequiredPermission } from "../../../routes/routeAuth.js";
import { erpSqlAccessPolicyAdminService } from "./ErpSqlAccessPolicyAdminService.js";
import {
  ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION,
  ERP_SQL_ACCESS_POLICY_VIEW_PERMISSION,
} from "./types.js";

const router = Router();

router.get("/api/erp-sql/access-policies", wrap(ERP_SQL_ACCESS_POLICY_VIEW_PERMISSION, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await erpSqlAccessPolicyAdminService.list(req.query));
}));

router.get("/api/erp-sql/access-policies/:id", wrap(ERP_SQL_ACCESS_POLICY_VIEW_PERMISSION, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await erpSqlAccessPolicyAdminService.get(req.params.id));
}));

router.post("/api/erp-sql/access-policies", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.status(201).json(await erpSqlAccessPolicyAdminService.create(req.body, auditContext(req)));
}));

router.patch("/api/erp-sql/access-policies/:id", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.json(await erpSqlAccessPolicyAdminService.update(req.params.id, req.body, auditContext(req)));
}));

router.post("/api/erp-sql/access-policies/:id/enable", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.json(await erpSqlAccessPolicyAdminService.setEnabled(req.params.id, true, auditContext(req)));
}));

router.post("/api/erp-sql/access-policies/:id/disable", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.json(await erpSqlAccessPolicyAdminService.setEnabled(req.params.id, false, auditContext(req)));
}));

router.delete("/api/erp-sql/access-policies/:id", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.json(await erpSqlAccessPolicyAdminService.archive(req.params.id, auditContext(req)));
}));

router.post("/api/erp-sql/access-policies/preview-scope", wrap(ERP_SQL_ACCESS_POLICY_MANAGE_PERMISSION, async (req, res) => {
  res.json(erpSqlAccessPolicyAdminService.previewScope(req.body));
}));

router.get("/api/erp-sql/access-policies/:id/audit-logs", wrap(ERP_SQL_ACCESS_POLICY_VIEW_PERMISSION, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await erpSqlAccessPolicyAdminService.auditLogs(req.params.id, req.query));
}));

function wrap(permission: string, action: Parameters<typeof withRequiredPermission>[1]) {
  return async (req: Parameters<typeof action>[0], res: Parameters<typeof action>[1], next: (error?: unknown) => void) => {
    try {
      await withRequiredPermission(permission, action)(req, res);
    } catch (error) {
      next(error);
    }
  };
}

function auditContext(req: any) {
  return {
    actorUserId: req.userId ?? req.res?.locals?.userId,
    reason: req.body?.reason,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

export const erpSqlAccessPolicyRouter = router;
