import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const CODEX_SANDBOX_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:9/agent?schema=agent";

export const avoidCodexSandboxRemoteDatabase = () => {
  if (process.env.CODEX_SANDBOX_NETWORK_DISABLED !== "1" || !process.env.DATABASE_URL) return;

  try {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    if (databaseUrl.hostname === "hz.jc-times.com" && databaseUrl.port === "5433") {
      // ponytail: Codex sandbox cannot reach this host; fail fast locally instead of timing out remotely.
      process.env.DATABASE_URL = CODEX_SANDBOX_DATABASE_URL;
    }
  } catch {
    // Keep Prisma's own validation error for malformed URLs.
  }
};

avoidCodexSandboxRemoteDatabase();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.PRISMA_LOG_QUERIES === "true"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
