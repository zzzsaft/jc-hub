import { productConfigAgentRepository } from "../db.service.js";
import type { WorkflowJobResult, WorkflowDocumentProgress } from "./types.js";

export type PendingLlmJobDependencies = {
  listPendingDocuments?: (limit: number) => Promise<Array<any>>;
  extractDocument?: (params: {
    documentId: string | number;
    llmModel?: string;
    force?: boolean;
    onStreamProgress?: (progress: { contentLength: number; chunkCount: number; finishReason?: string | null }) => void;
  }) => Promise<unknown>;
  updateJobProgress?: (jobId: string | number, progress: number, resultJson?: unknown) => Promise<unknown>;
};

export class ProductConfigAgentPendingLlmJobService {
  private runningJob: WorkflowJobResult | null = null;

  constructor(private readonly dependencies: PendingLlmJobDependencies = {}) {}

  getRunningJob() {
    return this.runningJob;
  }

  async runPendingLlmBatch(params: {
    limit: number;
    llmModel?: string;
    concurrency?: number;
    jobId?: string | number;
  }): Promise<WorkflowJobResult> {
    if (this.runningJob && this.runningJob.processed < this.runningJob.total) {
      return this.runningJob;
    }
    const documents = await (this.dependencies.listPendingDocuments ?? defaultListPendingDocuments)(params.limit);
    const result: WorkflowJobResult = {
      total: documents.length,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      currentDocumentIds: [],
      documentProgress: [],
      errors: [],
    };
    this.runningJob = result;
    const concurrency = Math.max(1, Math.min(10, Math.floor(params.concurrency ?? 3)));
    let cursor = 0;
    const progressByDocumentId = new Map<number, WorkflowDocumentProgress>();
    const updateProgress = async () => {
      if (!params.jobId) return;
      await (this.dependencies.updateJobProgress ?? productConfigAgentRepository.updateJobProgress.bind(productConfigAgentRepository))(
        params.jobId,
        result.total === 0 ? 100 : (result.processed / result.total) * 100,
        result,
      );
    };
    const runWorker = async () => {
      while (cursor < documents.length) {
        const document = documents[cursor++];
        const documentId = Number(document.id);
        const fileName = String(document.fileName ?? document.file_name ?? "");
        const progress: WorkflowDocumentProgress = {
          documentId,
          fileName,
          status: "running",
          contentLength: 0,
          chunkCount: 0,
          finishReason: null,
        };
        progressByDocumentId.set(documentId, progress);
        result.documentProgress = [...progressByDocumentId.values()];
        result.currentDocumentIds = [...new Set([...result.currentDocumentIds, documentId])];
        await updateProgress();
        try {
          await (this.dependencies.extractDocument ?? defaultExtractDocument)({
            documentId,
            llmModel: params.llmModel,
            force: false,
            onStreamProgress: (streamProgress) => {
              progress.contentLength = streamProgress.contentLength;
              progress.chunkCount = streamProgress.chunkCount;
              progress.finishReason = streamProgress.finishReason ?? null;
              result.documentProgress = [...progressByDocumentId.values()];
            },
          });
          progress.status = "success";
          result.successCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.status = "failed";
          progress.error = message;
          result.failedCount += 1;
          result.errors.push({ documentId, fileName, error: message });
        } finally {
          result.processed += 1;
          result.currentDocumentIds = result.currentDocumentIds.filter((id) => id !== documentId);
          result.documentProgress = [...progressByDocumentId.values()];
          await updateProgress();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, documents.length) }, () => runWorker()));
    this.runningJob = null;
    return result;
  }
}

export const productConfigAgentPendingLlmJobService =
  new ProductConfigAgentPendingLlmJobService();

async function defaultListPendingDocuments(limit: number) {
  const documents = await productConfigAgentRepository.listDocuments({
    status: "parsed",
    pageSize: limit,
  });
  return documents.items;
}

async function defaultExtractDocument(params: {
  documentId: string | number;
  llmModel?: string;
  force?: boolean;
}) {
  const { productConfigAgentService } = await import("../service.js");
  return productConfigAgentService.extractDocument({
    documentId: params.documentId,
    llmModel: params.llmModel,
    force: params.force,
  });
}
