import type { Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { extractAuthToken, resolveUser } from "../middleware/auth.js";
import { permissionService } from "../modules/auth/permission.service.js";
import { authService } from "../services/authService.js";

const LOCAL_DEV_PORT = 2030;

type RouteAction = (request: Request, response: Response) => Promise<void>;

export function effectiveRoutePort(): number {
  return Number(
    process.env.PORT ??
      LOCAL_DEV_PORT,
  );
}

export function isLocalDevRoute(): boolean {
  return process.env.NODE_ENV !== "production" && effectiveRoutePort() === LOCAL_DEV_PORT;
}

export async function resolveUserIdOrLocalDev(
  request: Request,
  localDefaultUserId = "local-dev",
): Promise<string | null> {
  if (isLocalDevRoute()) {
    const localUser =
      typeof request.headers["x-user-id"] === "string"
        ? request.headers["x-user-id"].trim()
        : "";
    return localUser || localDefaultUserId;
  }

  const user = await authService.verifyToken(request);
  return user?.userId || null;
}

export function withRequiredUser(
  action: RouteAction,
  options?: {
    localDefaultUserId?: string;
    localsKey?: string;
  },
): RouteAction {
  return async (request, response) => {
    const userId = await resolveUserIdOrLocalDev(
      request,
      options?.localDefaultUserId,
    );
    if (!userId) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    (request as Request & { userId?: string }).userId = userId;
    response.locals[options?.localsKey ?? "userId"] = userId;
    await action(request, response);
  };
}

export function withRequiredPermission(code: string, action: RouteAction): RouteAction {
  return async (request, response) => {
    if (isLocalDevRoute()) {
      await withRequiredUser(action)(request, response);
      return;
    }

    const token = extractAuthToken(request.headers.authorization, request.cookies);
    if (!token) throw new AppError(401, "token 缺失或失效");
    const user = await resolveUser(token);
    if (!(await permissionService.hasPermission(user, code))) throw new AppError(403, "当前用户无权限");
    (request as Request & { userId?: string }).userId = user.id;
    response.locals.userId = user.id;
    await action(request, response);
  };
}
