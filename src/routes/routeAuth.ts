import type { Request, Response } from "express";
import { authService } from "../services/authService.js";

const LOCAL_DEV_PORT = 2001;

type RouteAction = (request: Request, response: Response) => Promise<void>;

export function effectiveRoutePort(): number {
  return Number(
    process.env.PORT ??
      (process.env.NODE_ENV === "production" ? 2000 : LOCAL_DEV_PORT),
  );
}

export function isLocalDevRoute(): boolean {
  return effectiveRoutePort() === LOCAL_DEV_PORT;
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
