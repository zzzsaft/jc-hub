import type { Request, Response } from "express";
import { AppError } from "../../../lib/errors.js";
import { extractAuthToken, resolveUser } from "../../../middleware/auth.js";
import { permissionService } from "../../auth/permission.service.js";
import { authService } from "../../../services/authService.js";
import { isLocalDevRoute, resolveUserIdOrLocalDev } from "../../../routes/routeAuth.js";
import type { ReviewSlot } from "../goldenSet/fullReviewMerge.js";

export type RouteAction = (request: Request, response: Response) => Promise<void>;

export const FULL_REVIEW_PERMISSIONS = {
  annotateA: "product-config-agent.golden-set.annotate-a",
  annotateB: "product-config-agent.golden-set.annotate-b",
  adjudicate: "product-config-agent.golden-set.adjudicate",
} as const;

type FullReviewRequest = Request & { userId?: string; fullReviewSlot?: ReviewSlot };

export function resolveFullReviewSlot(permissionCodes: Iterable<string>): ReviewSlot {
  const permissions = new Set(permissionCodes);
  const slots = [
    permissions.has(FULL_REVIEW_PERMISSIONS.annotateA) ? "annotator-a" : null,
    permissions.has(FULL_REVIEW_PERMISSIONS.annotateB) ? "annotator-b" : null,
  ].filter((slot): slot is ReviewSlot => slot !== null);
  if (slots.length !== 1) throw new AppError(403, "full review requires exactly one annotation permission");
  return slots[0];
}

export async function getProductConfigAgentUserId(request: Request): Promise<string | null> {
  const resolvedUserId = (request as Request & { userId?: string }).userId;
  if (resolvedUserId) return resolvedUserId;
  return resolveUserIdOrLocalDev(request);
}

function productConfigAgentAdminUserIds(): Set<string> {
  return new Set(
    String(
      process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS ??
        process.env.QUOTE_AGENT_ADMIN_USER_IDS ??
        "",
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function requireProductConfigAgentAdmin(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) return true;

  const adminUserIds = productConfigAgentAdminUserIds();
  if (adminUserIds.size === 0) {
    response.status(403).json({
      error:
        "PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS is required for production productConfigAgent writes",
    });
    return false;
  }

  const user = await authService.verifyToken(request);
  if (!user?.userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!adminUserIds.has(user.userId)) {
    response.status(403).json({ error: "Forbidden" });
    return false;
  }
  (request as Request & { userId?: string }).userId = user.userId;
  return true;
}

export async function requireProductConfigAgentToken(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) return true;

  const userId = await getProductConfigAgentUserId(request);
  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  (request as Request & { userId?: string }).userId = userId;
  return true;
}

export function withProductConfigAgentAdmin(action: RouteAction): RouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentAdmin(request, response))) return;
    await action(request, response);
  };
}

export function withProductConfigAgentToken(action: RouteAction): RouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentToken(request, response))) return;
    await action(request, response);
  };
}

export function withFullReviewAnnotator(action: RouteAction): RouteAction {
  return async (request, response) => {
    const account = await resolveFullReviewAccount(request);
    (request as FullReviewRequest).userId = account.userId;
    (request as FullReviewRequest).fullReviewSlot = resolveFullReviewSlot(account.permissionCodes);
    response.locals.userId = account.userId;
    await action(request, response);
  };
}

export function withFullReviewAdjudicator(action: RouteAction): RouteAction {
  return async (request, response) => {
    const account = await resolveFullReviewAccount(request);
    if (!account.permissionCodes.includes(FULL_REVIEW_PERMISSIONS.adjudicate)) throw new AppError(403, "当前用户无裁决权限");
    (request as FullReviewRequest).userId = account.userId;
    response.locals.userId = account.userId;
    await action(request, response);
  };
}

async function resolveFullReviewAccount(request: Request) {
  if (isLocalDevRoute()) {
    const userId = await resolveUserIdOrLocalDev(request);
    if (!userId) throw new AppError(401, "Unauthorized");
    const header = request.headers["x-permission-codes"];
    const permissionCodes = (Array.isArray(header) ? header.join(",") : String(header ?? ""))
      .split(",").map((code) => code.trim()).filter(Boolean);
    return { userId, permissionCodes };
  }
  const token = extractAuthToken(request.headers.authorization, request.cookies);
  if (!token) throw new AppError(401, "token 缺失或失效");
  const account = await resolveUser(token);
  return { userId: account.id, permissionCodes: await permissionService.getEffectivePermissionCodes(account) };
}
