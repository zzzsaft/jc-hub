import { prisma } from "../../../lib/prisma.js";
import type { PrismaAdvisoryLockClient } from "../utils/advisoryLock.js";
import { withTryAdvisoryTransactionLock } from "../utils/advisoryLock.js";
import { productConfigAgentRepository } from "../db.service.js";
import { productConfigAgentService } from "../service.js";

export const PRODUCT_CONFIG_AGENT_DAILY_MAINTENANCE_LOCK_KEY = 2001000;
export const PRODUCT_CONFIG_AGENT_ARCHIVE_EXISTING_LOCK_KEY = 2001002;

export type DailyMaintenanceArchiveCandidate = {
  documentId: string | number | bigint;
  extractionResultId: string | number | bigint;
  fileName?: string | null;
};

export type DailyMaintenanceDependencies = {
  lockClient?: PrismaAdvisoryLockClient;
  refreshDictionaryCandidates?: (params: { source: string }) => Promise<unknown>;
  createHealthReport?: (createdBy?: string | null) => Promise<unknown>;
  renormalizeBatch?: (params: { limit: number; scope: string }) => Promise<unknown>;
  findArchiveCandidates?: (limit: number) => Promise<DailyMaintenanceArchiveCandidate[]>;
  archiveDocument?: (params: {
    documentId: string | number | bigint;
    createdBy?: string | null;
    force?: boolean;
  }) => Promise<{ id?: unknown; archive?: { id?: unknown } }>;
};

export type RunDailyMaintenanceParams = {
  createdBy?: string | null;
  dirtyLimit?: number;
  archiveLimit?: number;
  forceArchive?: boolean;
};

export class ProductConfigAgentDailyMaintenanceService {
  constructor(private readonly dependencies: DailyMaintenanceDependencies = {}) {}

  async runDailyMaintenance(params?: RunDailyMaintenanceParams) {
    const lockClient = this.dependencies.lockClient ?? prisma;
    const locked = await withTryAdvisoryTransactionLock(
      lockClient,
      PRODUCT_CONFIG_AGENT_DAILY_MAINTENANCE_LOCK_KEY,
      async () => this.runUnlocked(params),
    );
    if (!locked.acquired) {
      return { status: "skipped" as const, reason: "lock_not_acquired" };
    }
    return locked.value;
  }

  private async runUnlocked(params?: RunDailyMaintenanceParams) {
    const dirtyLimit = normalizePositiveInt(params?.dirtyLimit, 50);
    const archiveLimit = normalizePositiveInt(params?.archiveLimit, 50);
    const createdBy = params?.createdBy ?? "system:daily-product-config-maintenance";
    const forceArchive = params?.forceArchive ?? false;

    const dictionary = await (
      this.dependencies.refreshDictionaryCandidates ??
      productConfigAgentRepository.refreshDictionaryCandidates.bind(productConfigAgentRepository)
    )({ source: "daily_maintenance" });

    const archiveDirtyRefresh = await (
      this.dependencies.renormalizeBatch ??
      productConfigAgentService.renormalizeBatch.bind(productConfigAgentService)
    )({ limit: dirtyLimit, scope: "with_pending_candidates" });

    const archiveExisting = await this.archiveExistingUnlocked({
      limit: archiveLimit,
      createdBy,
      force: forceArchive,
    });

    const health = await (
      this.dependencies.createHealthReport ??
      productConfigAgentRepository.createHealthReport.bind(productConfigAgentRepository)
    )(createdBy);

    return {
      status: "completed" as const,
      dictionary,
      archiveDirtyRefresh,
      archiveExisting,
      health,
    };
  }

  async archiveExisting(params: {
    limit?: number;
    createdBy?: string | null;
    force?: boolean;
  }) {
    const lockClient = this.dependencies.lockClient ?? prisma;
    const locked = await withTryAdvisoryTransactionLock(
      lockClient,
      PRODUCT_CONFIG_AGENT_ARCHIVE_EXISTING_LOCK_KEY,
      async () => this.archiveExistingUnlocked(params),
    );
    if (!locked.acquired) {
      return {
        status: "skipped" as const,
        reason: "lock_not_acquired",
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        failedResults: [],
      };
    }
    return locked.value;
  }

  private async archiveExistingUnlocked(params: {
    limit?: number;
    createdBy?: string | null;
    force?: boolean;
  }) {
    const limit = normalizePositiveInt(params.limit, 50);
    const candidates = await (
      this.dependencies.findArchiveCandidates ?? findUnarchivedNormalizedExtractions
    )(limit);
    const archiveDocument =
      this.dependencies.archiveDocument ??
      productConfigAgentService.archiveDocument.bind(productConfigAgentService);
    const results: Array<{
      documentId: number;
      extractionResultId: number;
      fileName: string | null;
      status: "archived" | "failed";
      archiveId?: number | null;
      error?: string;
    }> = [];

    for (const candidate of candidates) {
      try {
        const archived = await archiveDocument({
          documentId: String(candidate.documentId),
          createdBy: params.createdBy ?? "system:daily-product-config-maintenance",
          force: params.force ?? false,
        });
        results.push({
          documentId: Number(candidate.documentId),
          extractionResultId: Number(candidate.extractionResultId),
          fileName: candidate.fileName ?? null,
          status: "archived",
          archiveId: toOptionalNumber(archived.archive?.id ?? archived.id),
        });
      } catch (error) {
        results.push({
          documentId: Number(candidate.documentId),
          extractionResultId: Number(candidate.extractionResultId),
          fileName: candidate.fileName ?? null,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      status: "completed" as const,
      processedCount: results.length,
      successCount: results.filter((item) => item.status === "archived").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      failedResults: results.filter((item) => item.status === "failed"),
      results,
    };
  }
}

export async function findUnarchivedNormalizedExtractions(limit: number) {
  const rows = await prisma.extractionResult.findMany({
    where: {
      status: "normalized",
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(1, limit), 500),
  });
  const candidates: DailyMaintenanceArchiveCandidate[] = [];
  for (const row of rows as any[]) {
    const items = Array.isArray(row.normalizedExtractionJson?.items)
      ? row.normalizedExtractionJson.items
      : [];
    if (items.length === 0) continue;
    const existing = await prisma.contractArchive.findFirst({
      where: { documentId: row.documentId, extractionResultId: row.id },
      select: { id: true },
    });
    if (existing) continue;
    const document = await prisma.productDocument.findUnique({
      where: { id: row.documentId },
      select: { fileName: true },
    });
    candidates.push({
      documentId: row.documentId,
      extractionResultId: row.id,
      fileName: document?.fileName ?? null,
    });
  }
  return candidates;
}

export const productConfigAgentDailyMaintenanceService =
  new ProductConfigAgentDailyMaintenanceService();

function normalizePositiveInt(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
