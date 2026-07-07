import jwt from "jsonwebtoken";

export type AuthUser = {
  userId: string;
  name?: string;
  avatar?: string;
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.TOKEN_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return secret || "local-dev-secret";
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyTokenValue(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || typeof decoded !== "object") return null;
    const userId = (decoded as Record<string, unknown>).userId;
    return typeof userId === "string" ? (decoded as AuthUser) : null;
  } catch {
    return null;
  }
}
