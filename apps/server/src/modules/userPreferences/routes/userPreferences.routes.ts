import type { Request, Response } from "express";
import { resolveUserIdOrLocalDev } from "../../../routes/routeAuth.js";
import {
  userPreferencesService,
  type UserPreferencesService,
} from "../userPreferences.service.js";

type UserPreferenceRouteAction = (
  request: Request,
  response: Response,
) => Promise<void>;

type UserPreferenceRouteService = Pick<
  UserPreferencesService,
  "getPreference" | "savePreference"
>;

type ResolveUserId = (request: Request) => Promise<string | null>;

function decodePreferenceKey(rawKey: unknown): string {
  if (typeof rawKey !== "string" || rawKey.trim() === "") {
    throw new BadRequestError("key is required");
  }

  try {
    const key = decodeURIComponent(rawKey).trim();
    if (!key) {
      throw new BadRequestError("key is required");
    }
    return key;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError("key must be URL encoded");
  }
}

function requireBodyValue(request: Request): unknown {
  const body = request.body;
  if (
    !body ||
    typeof body !== "object" ||
    !Object.prototype.hasOwnProperty.call(body, "value")
  ) {
    throw new BadRequestError("value is required");
  }
  return body.value;
}

function withUserPreferenceOwner(
  action: UserPreferenceRouteAction,
  resolveUserId: ResolveUserId,
): UserPreferenceRouteAction {
  return async (request, response) => {
    const ownerUserId = await resolveUserId(request);
    if (!ownerUserId) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    response.locals.userPreferenceOwnerId = ownerUserId;
    await action(request, response);
  };
}

function createGetUserPreference(service: UserPreferenceRouteService) {
  return async (request: Request, response: Response) => {
    try {
      const key = decodePreferenceKey(request.params.key);
      response.json(
        await service.getPreference({
          ownerUserId: response.locals.userPreferenceOwnerId,
          key,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  };
}

function createSaveUserPreference(service: UserPreferenceRouteService) {
  return async (request: Request, response: Response) => {
    try {
      const key = decodePreferenceKey(request.params.key);
      const value = requireBodyValue(request);
      response.json(
        await service.savePreference({
          ownerUserId: response.locals.userPreferenceOwnerId,
          key,
          value,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  };
}

export function createUserPreferenceRoutes(
  service: UserPreferenceRouteService = userPreferencesService,
  resolveUserId: ResolveUserId = resolveUserIdOrLocalDev,
) {
  return [
    {
      path: "/user-preferences/:key",
      method: "get",
      action: withUserPreferenceOwner(
        createGetUserPreference(service),
        resolveUserId,
      ),
    },
    {
      path: "/user-preferences/:key",
      method: "put",
      action: withUserPreferenceOwner(
        createSaveUserPreference(service),
        resolveUserId,
      ),
    },
  ];
}

export const UserPreferenceRoutes = createUserPreferenceRoutes();

class BadRequestError extends Error {}

function sendError(response: Response, error: unknown) {
  if (error instanceof BadRequestError) {
    response.status(400).json({ error: error.message });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}
