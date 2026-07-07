import { productConfigAgentService } from "../service.js";
import { productConfigAgentRepository } from "../db.service.js";
import { productConfigAgentDailyMaintenanceService } from "../workflow/dailyMaintenance.service.js";

export class ProductConfigAgentWorker {
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workerId = `product-config-agent-${process.pid}`,
    private readonly pollIntervalMs = 5000,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async tick() {
    try {
      const job = await productConfigAgentRepository.claimNextJob(
        [
          "pending_llm_upload",
          "dictionary_dirty_refresh",
          "concept_resolver_backfill",
          "daily_maintenance",
          "archive_dirty_refresh",
          "dictionary_health_audit",
        ],
        this.workerId,
      );
      if (job) await this.runJob(job);
    } catch (error) {
      console.error("[productConfigAgentWorker] tick failed", error);
    } finally {
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
      }
    }
  }

  private async runJob(job: any) {
    try {
      const payload = job.payloadJson ?? {};
      if (job.jobType === "pending_llm_upload") {
        const result = await productConfigAgentService.runPendingLlmBatch({
          limit: Number(payload.limit ?? payload.batchLimit ?? 20),
          llmModel: payload.llmModel ?? payload.model,
          concurrency: Number(payload.concurrency ?? 3),
          jobId: job.id,
        });
        await productConfigAgentRepository.completeJob(job.id, result);
        return;
      }
      if (job.jobType === "dictionary_dirty_refresh") {
        const result = await productConfigAgentService.runDictionaryDirtyRefresh({
          documentId: payload.documentId,
          source: payload.source ?? "worker",
          limit: Number(payload.limit ?? 100),
          jobId: job.id,
        });
        await productConfigAgentRepository.completeJob(job.id, result);
        return;
      }
      if (job.jobType === "concept_resolver_backfill") {
        const { conceptResolverService } = await import("../dictionary/conceptResolver.service.js");
        const result = await conceptResolverService.runResolver(payload);
        await productConfigAgentRepository.completeJob(job.id, result);
        return;
      }
      if (job.jobType === "dictionary_health_audit") {
        const result = await productConfigAgentRepository.createHealthReport(payload.createdBy ?? null);
        await productConfigAgentRepository.completeJob(job.id, result);
        return;
      }
      if (job.jobType === "archive_dirty_refresh") {
        const result = await productConfigAgentService.renormalizeBatch({
          limit: Number(payload.limit ?? 50),
          scope: payload.scope ?? "with_pending_candidates",
        });
        await productConfigAgentRepository.completeJob(job.id, result);
        return;
      }
      if (job.jobType === "daily_maintenance") {
        const result = await productConfigAgentDailyMaintenanceService.runDailyMaintenance({
          createdBy: payload.createdBy ?? null,
          dirtyLimit: Number(payload.dirtyLimit ?? payload.dirtyRefreshLimit ?? 50),
          archiveLimit: Number(payload.archiveLimit ?? 50),
          forceArchive: Boolean(payload.forceArchive ?? false),
        });
        await productConfigAgentRepository.completeJob(job.id, result);
      }
    } catch (error) {
      await productConfigAgentRepository.failJob(job.id, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const productConfigAgentWorker = new ProductConfigAgentWorker();
