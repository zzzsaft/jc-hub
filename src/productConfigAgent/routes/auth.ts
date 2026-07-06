import type { Request, Response } from "express";
import { authService } from "../../services/authService.js";
import { isLocalDevRoute, resolveUserIdOrLocalDev } from "../../routes/routeAuth.js";

export type RouteAction = (request: Request, response: Response) => Promise<void>;

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
