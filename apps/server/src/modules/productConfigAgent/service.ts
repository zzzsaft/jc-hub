import crypto from "node:crypto";
import fs from "node:fs/promises";
import { contractArchiveService, createArchiveItemsFromExtraction, createArchiveVersionForCurrent } from "./archive/archive.service.js";
import { buildAgentReadyInsertGate } from "./archive/insertGate.js";
import { productConfigAgentRepository } from "./db.service.js";
import { conceptResolverService } from "./dictionary/conceptResolver.service.js";
import { dictionaryGovernanceService } from "./dictionary/governance.service.js";
import { runPlannedExtraction, TWO_STAGE_PROMPT_VERSION } from "./extraction/plannedExtraction.js";
import { normalizeExtractionWithDictionary } from "./normalization/index.js";
import { productConfigAgentMasterDataService, type ProductConfigAgentModelTermType } from "./masterData.service.js";
import { productConfigAgentBlockParsingService } from "./workflow/blockParsing.service.js";
import { productConfigAgentPendingLlmJobService } from "./workflow/pendingLlmJob.service.js";
import type { ParseBlocksInput } from "./workflow/types.js";

export type ProductConfigAgentProcessParams = {
  filePath: string;
  fileName?: string;
  source?: string;
  blocksJson?: unknown;
  llmModel?: string;
};

export class ProductConfigAgentService {
  async calculateFileSha256(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  async registerDocument(params: ProductConfigAgentProcessParams) {
    return productConfigAgentBlockParsingService.parseAndSaveBlocks({
      filePath: params.filePath,
      fileName: params.fileName,
      source: params.source,
      blocksJson: params.blocksJson,
      parserVersion: params.blocksJson === undefined ? undefined : "manual-json",
    });
  }

  async parseBlocksBatch(inputs: ParseBlocksInput[]) {
    return productConfigAgentBlockParsingService.parseAndSaveBlocksBatch(inputs);
  }

  async saveBlocks(params: {
    documentId: number | string;
    blocksJson: unknown;
    parserVersion?: string;
  }) {
    await productConfigAgentRepository.updateDocumentStatus(params.documentId, "parsed");
    return productConfigAgentRepository.upsertBlocks(params);
  }

  async extractDocument(params: {
    documentId: number | string;
    llmModel?: string;
    force?: boolean;
  }) {
    const document = await productConfigAgentRepository.findDocumentById(params.documentId);
    if (!document) throw new Error(`Document not found: ${params.documentId}`);
    const blocks = await productConfigAgentRepository.findBlocksByDocumentId(params.documentId);
    if (!blocks) throw new Error(`Document blocks not found: ${params.documentId}`);

    if (!params.force) {
      const latest = await productConfigAgentRepository.findLatestExtractionByDocumentId(params.documentId);
      if (latest) return { document, blocks, extraction: latest, reusedExtraction: true };
    }

    const result = await runPlannedExtraction({
      fileName: document.fileName,
      blocksJson: blocks.blocksJson,
      llmModel: params.llmModel,
    });
    const normalized = await normalizeExtractionWithDictionary(result.extraction);
    const extraction = await productConfigAgentRepository.createExtraction({
      documentId: document.id,
      extractionJson: result.extraction,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals,
      warnings: result.warnings,
      llmPlanJson: result.plan,
      llmModel: params.llmModel,
      promptVersion: TWO_STAGE_PROMPT_VERSION,
      dictionaryVersion: 1,
      status: "normalized",
    });
    await productConfigAgentRepository.updateDocumentStatus(document.id, "normalized");
    return { document, blocks, extraction, reusedExtraction: false };
  }

  async listDocuments(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    return productConfigAgentRepository.listDocuments(params);
  }

  async getSummary() {
    return productConfigAgentRepository.getSummary();
  }

  async getDocument(documentId: number | string) {
    const document = await productConfigAgentRepository.findDocumentById(documentId);
    if (!document) throw new Error(`Document not found: ${documentId}`);
    const [blocks, extraction] = await Promise.all([
      productConfigAgentRepository.findBlocksByDocumentId(documentId),
      productConfigAgentRepository.findLatestExtractionByDocumentId(documentId),
    ]);
    return { document, blocks, extraction };
  }

  async listExtractions(params: { page?: number; pageSize?: number; documentId?: string }) {
    return productConfigAgentRepository.listExtractions(params);
  }

  async listTermTypes() {
    return productConfigAgentRepository.listTermTypes();
  }

  async upsertTermType(data: {
    termType: string;
    displayName?: string;
    kind?: string;
    metadata?: unknown;
  }) {
    return productConfigAgentRepository.upsertTermType(data);
  }

  async updateTermType(id: string | number, data: {
    termType?: string;
    displayName?: string;
    kind?: string;
    metadata?: unknown;
    isActive?: boolean;
  }) {
    return productConfigAgentRepository.updateTermType(id, data);
  }

  async deleteTermType(id: string | number) {
    return productConfigAgentRepository.deleteTermType(id);
  }

  async listValues(termType?: string) {
    return productConfigAgentRepository.listValues(termType);
  }

  async upsertValue(data: {
    termType: string;
    canonicalValue: string;
    displayName?: string;
    metadata?: unknown;
  }) {
    return productConfigAgentRepository.upsertValue(data);
  }

  async updateValue(id: string | number, data: {
    canonicalValue?: string;
    displayName?: string | null;
    metadata?: unknown;
    isActive?: boolean;
  }) {
    return productConfigAgentRepository.updateValue(id, data);
  }

  async deleteValue(id: string | number) {
    return productConfigAgentRepository.deleteValue(id);
  }

  async listUnitAliases() {
    return productConfigAgentRepository.listUnitAliases();
  }

  async upsertUnitAlias(data: { canonicalUnit: string; displayUnit?: string | null; aliasValue: string; source?: string; note?: string | null }) {
    return productConfigAgentRepository.upsertUnitAlias(data);
  }

  async deleteUnitAlias(id: string | number) {
    return productConfigAgentRepository.deleteUnitAlias(id);
  }

  async startPendingLlmBatch(params?: { limit?: number; llmModel?: string; concurrency?: number }) {
    const job = await productConfigAgentRepository.enqueueJob({
      jobType: "pending_llm_upload",
      payloadJson: { limit: params?.limit ?? 20, llmModel: params?.llmModel, concurrency: params?.concurrency },
      priority: 10,
    });
    const result = await this.runPendingLlmBatch({
      limit: params?.limit ?? 20,
      llmModel: params?.llmModel,
      concurrency: params?.concurrency,
      jobId: job.id,
    });
    await productConfigAgentRepository.completeJob(job.id, result);
    return { job, result };
  }

  async pendingLlmStatus() {
    return productConfigAgentRepository.listJobs({
      jobType: "pending_llm_upload",
      pageSize: 10,
    });
  }

  async getJob(jobId: string | number) {
    return productConfigAgentRepository.getJob(jobId);
  }

  async listJobs(params?: { jobType?: string; status?: string; page?: number; pageSize?: number }) {
    return productConfigAgentRepository.listJobs(params);
  }

  async runPendingLlmBatch(params: { limit: number; llmModel?: string; concurrency?: number; jobId?: string | number }) {
    return productConfigAgentPendingLlmJobService.runPendingLlmBatch(params);
  }

  async startDictionaryDirtyRefresh(params?: { documentId?: string; source?: string; concurrency?: number }) {
    const job = await productConfigAgentRepository.enqueueJob({
      jobType: "dictionary_dirty_refresh",
      payloadJson: params ?? {},
      priority: 5,
    });
    try {
      const result = await this.runDictionaryDirtyRefresh({
        documentId: params?.documentId,
        source: params?.source ?? "dirty_refresh",
        concurrency: params?.concurrency,
        jobId: job.id,
      });
      await productConfigAgentRepository.completeJob(job.id, result);
      return { job, result };
    } catch (error) {
      await productConfigAgentRepository.failJob(job.id, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async dictionaryDirtyRefreshStatus() {
    return productConfigAgentRepository.listJobs({
      jobType: "dictionary_dirty_refresh",
      pageSize: 10,
    });
  }

  async runDictionaryDirtyRefresh(params?: {
    documentId?: string;
    source?: string;
    jobId?: string | number;
    limit?: number;
    concurrency?: number;
  }) {
    const extractions = params?.documentId
      ? { items: [await productConfigAgentRepository.findLatestExtractionByDocumentId(params.documentId)].filter(Boolean) as any[] }
      : await productConfigAgentRepository.listExtractions({ pageSize: params?.limit ?? 100 });
    const progress: Array<Record<string, unknown>> = [];
    let processed = 0;
    const allExtractions = extractions.items as any[];
    const refreshItems = uniqueExtractionsByDocumentId(allExtractions);
    const concurrency = params?.documentId ? 1 : normalizeDirtyRefreshConcurrency(params?.concurrency);
    await runDictionaryDirtyRefreshBatch(refreshItems, concurrency, async (extraction) => {
      const entry: Record<string, unknown> = {
        documentId: extraction.documentId,
        extractionResultId: extraction.id,
        status: "running",
      };
      try {
        const normalized = await normalizeExtractionWithDictionary(extraction.extractionJson);
        const refreshedExtraction = await productConfigAgentRepository.createExtraction({
          documentId: extraction.documentId,
          extractionJson: extraction.extractionJson,
          normalizedExtractionJson: normalized,
          dictionaryProposals: normalized.dictionaryProposals,
          warnings: extraction.warnings,
          llmPlanJson: extraction.llmPlanJson,
          llmModel: extraction.llmModel,
          promptVersion: `${extraction.promptVersion ?? TWO_STAGE_PROMPT_VERSION}:dirty-refresh`.slice(0, 50),
          dictionaryVersion: extraction.dictionaryVersion,
          status: "normalized",
        });
        const candidates = await productConfigAgentRepository.refreshDictionaryCandidates({
          documentId: extraction.documentId,
          source: params?.source ?? "dirty_refresh",
        });
        const archiveRefresh = await contractArchiveService.refreshArchivesForDocument({
          documentId: extraction.documentId,
          editedBy: "dictionary_dirty_refresh",
        });
        await productConfigAgentRepository.markDocumentsDictionaryClean([extraction.documentId]);
        entry.status = "completed";
        entry.refreshedExtractionResultId = refreshedExtraction.id;
        entry.candidates = candidates;
        entry.archiveUpdatedCount = archiveRefresh.updatedCount;
        entry.archiveVersionCount = archiveRefresh.versionCount;
        entry.archiveIds = archiveRefresh.archiveIds;
      } catch (error) {
        await productConfigAgentRepository.markDocumentsDictionaryDirty([extraction.documentId]);
        entry.status = "failed";
        entry.error = error instanceof Error ? error.message : String(error);
      }
      processed += 1;
      progress.push(entry);
      if (params?.jobId) {
        await productConfigAgentRepository.updateJobProgress(
          params.jobId,
          (processed / Math.max(1, refreshItems.length)) * 100,
          { scanned: allExtractions.length, queued: refreshItems.length, processed, progress },
        );
      }
    });
    return {
      scanned: allExtractions.length,
      queued: refreshItems.length,
      processed,
      successCount: progress.filter((item) => item.status === "completed").length,
      failedCount: progress.filter((item) => item.status === "failed").length,
      progress,
    };
  }

  async listCandidates(params: {
    termType?: string;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    semanticTag?: string;
    semanticGroup?: string;
    semanticRisk?: string;
    sort?: string;
  }) {
    return productConfigAgentRepository.listCandidates(params);
  }

  async generateCandidatesForDocument(documentId: string | number) {
    return productConfigAgentRepository.generateCandidatesForDocument(documentId);
  }

  async reviewCandidate(params: {
    candidateId: string | number;
    action: any;
    candidateType?: string;
    canonicalValue?: string;
    targetTermType?: string;
    termType?: string;
    kind?: string;
    parts?: unknown;
    reviewedBy?: string | null;
  }) {
    return dictionaryGovernanceService.reviewCandidate(params);
  }

  async reviewCandidatesBatch(params: {
    reviews: Array<Record<string, unknown>>;
    reviewedBy?: string | null;
  }) {
    return dictionaryGovernanceService.reviewCandidatesBatch(params);
  }

  async createDictionaryHealthReport(createdBy?: string | null) {
    return productConfigAgentRepository.createHealthReport(createdBy);
  }

  async listDictionaryHealthReports(params?: { page?: number; pageSize?: number; status?: string }) {
    return productConfigAgentRepository.listHealthReports(params);
  }

  async listUnitCandidates(params?: { status?: string }) {
    return productConfigAgentRepository.listUnitCandidates(params);
  }

  async approveUnitCandidate(params: { candidateId: string | number; canonicalUnit?: string; reviewedBy?: string | null }) {
    return productConfigAgentRepository.approveUnitCandidate(params);
  }

  async rejectUnitCandidate(params: { candidateId: string | number; reviewedBy?: string | null }) {
    return productConfigAgentRepository.rejectUnitCandidate(params);
  }

  async getLlmSummary() {
    return productConfigAgentRepository.getLlmSummary();
  }

  async getLlmDictionaryContext() {
    return productConfigAgentRepository.getLlmDictionaryContext();
  }

  async listSuggestions(params?: { termType?: string; status?: string; page?: number; pageSize?: number }) {
    return dictionaryGovernanceService.listSuggestions(params);
  }

  async suggestCandidatesBatch(params: { candidateIds?: Array<string | number>; limit?: number }) {
    return dictionaryGovernanceService.suggestBatchCandidateReviews(params);
  }

  async listCandidateClusters(params?: {
    status?: string;
    limit?: number;
    semanticTag?: string;
    semanticGroup?: string;
    semanticRisk?: string;
    sort?: string;
    groupBy?: string;
  }) {
    return dictionaryGovernanceService.listClusters(params);
  }

  async splitCandidate(params: {
    candidateId: string | number;
    parts: unknown;
    reviewedBy?: string | null;
  }) {
    return dictionaryGovernanceService.splitCandidate(params);
  }

  async listSplits(params?: { termType?: string; status?: string }) {
    return dictionaryGovernanceService.listSplits(params);
  }

  async runConceptResolver(params?: { conceptType?: string; sourceValue?: string; dryRun?: boolean; limit?: number }) {
    return conceptResolverService.runResolver(params);
  }

  async getConceptResolverRun(runId: string | number) {
    return conceptResolverService.getRun(runId);
  }

  async listConceptResolutions(params?: { conceptType?: string; status?: string }) {
    return conceptResolverService.listResolutions(params);
  }

  async listConceptPatterns(params?: { status?: string }) {
    return conceptResolverService.listPatterns(params);
  }

  async reviewConceptPattern(params: { id: string | number; status: string; reviewedBy?: string | null; note?: string }) {
    return conceptResolverService.reviewPattern(params);
  }

  async applyConceptPatternCandidates(params: { id: string | number; reviewedBy?: string | null }) {
    return conceptResolverService.applyPatternCandidates(params);
  }

  async listArchives(params: {
    q?: string;
    status?: string;
    productNumber?: string;
    customerId?: string;
    page?: number;
    pageSize?: number;
  }) {
    return productConfigAgentRepository.listArchives(params);
  }

  async upsertArchive(params: {
    documentId?: string | number | null;
    extractionResultId?: string | number | null;
    archiveKey?: string;
    title: string;
    status?: string;
    archiveJson?: unknown;
    productBindings?: unknown;
    metadata?: unknown;
    createdBy?: string | null;
  }) {
    return productConfigAgentRepository.upsertArchive(params);
  }

  async archiveDocument(params: {
    documentId: string | number;
    archiveKey?: string;
    title?: string;
    createdBy?: string | null;
  }) {
    const detail = await this.getDocument(params.documentId);
    const insertGate = buildAgentReadyInsertGate({
      normalizedExtractionJson: detail.extraction?.normalizedExtractionJson,
      dictionaryProposals: detail.extraction?.dictionaryProposals,
    });
    if (!insertGate.insertability.canInsert) {
      const reasons = insertGate.insertability.blockingReasons
        .map((reason) => reason.itemIndex ? `${reason.type}@item${reason.itemIndex}` : reason.type)
        .join(", ");
      throw new Error(`Archive insert blocked: ${reasons || "insertability_failed"}`);
    }
    const archive = await this.upsertArchive({
      documentId: params.documentId,
      extractionResultId: detail.extraction?.id,
      archiveKey: params.archiveKey,
      title: params.title ?? detail.document.fileName ?? `Document ${params.documentId}`,
      archiveJson: {
        document: detail.document,
        blocks: detail.blocks,
        extraction: detail.extraction,
      },
      productBindings: extractProductBindings(detail.extraction?.normalizedExtractionJson),
      metadata: extractArchiveMetadata(detail.extraction?.normalizedExtractionJson),
      createdBy: params.createdBy,
    });
    await createArchiveItemsFromExtraction({
      archiveId: archive.id,
      documentId: params.documentId,
      extractionResultId: detail.extraction?.id,
      normalizedExtractionJson: detail.extraction?.normalizedExtractionJson,
      insertGate,
    });
    await createArchiveVersionForCurrent(archive.id, params.createdBy);
    return contractArchiveService.getArchiveDetail(archive.id);
  }

  async checkArchiveReadiness(documentId: string | number) {
    return contractArchiveService.checkArchiveReadiness(documentId);
  }

  async getArchiveDetail(archiveId: string | number) {
    return contractArchiveService.getArchiveDetail(archiveId);
  }

  async getArchiveSnapshot(archiveId: string | number) {
    return contractArchiveService.getArchiveSnapshot(archiveId);
  }

  async patchArchive(params: { archiveId: string | number; changes: Array<{ path: string; value: unknown }>; editedBy?: string | null }) {
    return contractArchiveService.patchArchive(params);
  }

  async listArchiveVersions(archiveId: string | number) {
    return contractArchiveService.listVersions(archiveId);
  }

  async getArchiveVersion(archiveId: string | number, version: string | number) {
    return contractArchiveService.getVersion(archiveId, version);
  }

  async replaceArchiveItemProductBindings(params: {
    archiveId: string | number;
    itemId: string | number;
    bindings: Array<Record<string, unknown>>;
    editedBy?: string | null;
  }) {
    return contractArchiveService.replaceItemProductBindings(params);
  }

  async renormalizeDocument(documentId: string | number) {
    const latest = await productConfigAgentRepository.findLatestExtractionByDocumentId(documentId);
    if (!latest) throw new Error(`Extraction not found for document: ${documentId}`);
    const normalized = await normalizeExtractionWithDictionary(latest.extractionJson);
    return productConfigAgentRepository.createExtraction({
      documentId,
      extractionJson: latest.extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals,
      warnings: latest.warnings,
      llmPlanJson: latest.llmPlanJson,
      llmModel: latest.llmModel,
      promptVersion: `${latest.promptVersion ?? TWO_STAGE_PROMPT_VERSION}:renormalized`,
      dictionaryVersion: latest.dictionaryVersion,
      status: "normalized",
    });
  }

  async renormalizeExtractionResult(extractionResultId: string | number) {
    const extraction = await productConfigAgentRepository.findExtractionById(extractionResultId);
    if (!extraction) throw new Error(`Extraction not found: ${extractionResultId}`);
    const normalized = await normalizeExtractionWithDictionary(extraction.extractionJson);
    return productConfigAgentRepository.createExtraction({
      documentId: extraction.documentId,
      extractionJson: extraction.extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals,
      warnings: extraction.warnings,
      llmPlanJson: extraction.llmPlanJson,
      llmModel: extraction.llmModel,
      promptVersion: `${extraction.promptVersion ?? TWO_STAGE_PROMPT_VERSION}:renormalized`,
      dictionaryVersion: extraction.dictionaryVersion,
      status: "normalized",
    });
  }

  async renormalizeBatch(params?: { limit?: number; scope?: string }) {
    const extractions = await productConfigAgentRepository.listExtractions({
      pageSize: params?.limit ?? 20,
    });
    const results = [];
    for (const extraction of extractions.items) {
      results.push(await this.renormalizeExtractionResult(extraction.id));
    }
    return { scanned: extractions.items.length, processed: results.length, results };
  }

  async searchProductConfigs(params: {
    q?: string;
    termType?: string;
    page?: number;
    pageSize?: number;
  }) {
    return productConfigAgentRepository.searchProductConfigs(params);
  }

  async searchMasterDataModelBinding(params: {
    termType?: string;
    q?: string;
    model?: string;
    limit?: number;
  }) {
    return productConfigAgentMasterDataService.search(params);
  }

  async matchMasterDataModel(params: {
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
  }) {
    return productConfigAgentMasterDataService.matchModel(params);
  }

  async bindMasterDataModel(params: {
    documentId?: string | number;
    extractionResultId: string | number;
    itemIndex: number;
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    masterDataId: string | number;
  }) {
    return productConfigAgentMasterDataService.bindModel(params);
  }
}

export const productConfigAgentService = new ProductConfigAgentService();

export function normalizeDirtyRefreshConcurrency(value: unknown): number {
  const number = Number(value ?? 4);
  return Math.max(1, Math.min(8, Math.floor(Number.isFinite(number) ? number : 4)));
}

export function uniqueExtractionsByDocumentId<T extends { documentId: unknown }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.documentId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runDictionaryDirtyRefreshBatch<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await handler(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(normalizeDirtyRefreshConcurrency(concurrency), items.length) }, () => worker()));
}

export const calculateFileSha256 = (filePath: string) =>
  productConfigAgentService.calculateFileSha256(filePath);

function extractProductBindings(value: unknown): Array<Record<string, unknown>> {
  const bindings: Array<Record<string, unknown>> = [];
  visit(value, (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const record = node as Record<string, unknown>;
    const name =
      firstString(record.item_name, record.product_name, record.name, record["产品名称"]) ??
      firstString(record.model, record["型号"]);
    if (name) {
      bindings.push({
        name,
        model: firstString(record.model, record["型号"]),
        category: firstString(record.category, record.type, record["类型"]),
      });
    }
  });
  return bindings;
}

function extractArchiveMetadata(value: unknown): Record<string, unknown> {
  const root = value && typeof value === "object" ? (value as any) : {};
  const docInfo = root.document_info && typeof root.document_info === "object" ? root.document_info : {};
  return {
    docInfo,
    productNumber: firstString(docInfo.product_number, docInfo.productNumber, docInfo["产品编号"]),
    customerId: firstString(docInfo.customer_id, docInfo.customerId, docInfo["客户ID"]),
    contractNumber: firstString(docInfo.contract_number, docInfo.contractNumber, docInfo["合同号"], docInfo["合同编号"]),
    orderNumber: firstString(docInfo.order_number, docInfo.orderNumber, docInfo["订单号"]),
  };
}

function visit(value: unknown, callback: (value: unknown) => void) {
  callback(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) visit(item, callback);
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
