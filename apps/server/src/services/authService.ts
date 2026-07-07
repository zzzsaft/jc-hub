import type { Request } from "express";
import { verifyTokenValue, type AuthUser } from "../utils/jwt.js";

export const authService = {
  async verifyToken(request: Request): Promise<AuthUser | null> {
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : typeof request.headers.token === "string"
          ? request.headers.token
          : typeof request.query.token === "string"
            ? request.query.token
            : "";
    return token ? verifyTokenValue(token) : null;
  },
};
