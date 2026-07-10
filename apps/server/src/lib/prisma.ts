import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { throwIfAborted } from "./abort.js";
import { createConcurrencyLimiter, type ConcurrencyLimiter } from "./concurrencyLimiter.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const CODEX_SANDBOX_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:9/agent?schema=agent";
let prismaLimiter: ConcurrencyLimiter | undefined;
let prismaLimiterInstalled = false;
const prismaAbortSignal = new AsyncLocalStorage<AbortSignal | undefined>();

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

export function configurePrismaConcurrencyLimit(limit: number): void {
  prismaLimiter = createConcurrencyLimiter(limit, { name: "erp_sql_db" });
  if (prismaLimiterInstalled) return;
  prismaLimiterInstalled = true;
  prisma.$use((params, next) => {
    const signal = prismaAbortSignal.getStore();
    const run = async () => {
      throwIfAborted(signal);
      const result = await next(params);
      throwIfAborted(signal);
      return result;
    };
    return prismaLimiter && shouldLimitPrisma(params) ? prismaLimiter(run, signal) : run();
  });
}

export function runWithPrismaAbortSignal<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  return signal ? prismaAbortSignal.run(signal, task) : task();
}

export function runWithoutPrismaAbortSignal<T>(task: () => Promise<T>): Promise<T> {
  return prismaAbortSignal.run(undefined, task);
}

function shouldLimitPrisma(params: { model?: string; action: string }): boolean {
  if (!params.model) return true;
  if (params.model === "LlmCallLog") return false;
  if (params.model === "ErpQueryTemplate") return false;
  if (["ErpSchemaTable", "ErpSchemaField"].includes(params.model) && /^(find|count)/u.test(params.action)) return false;
  return true;
}
