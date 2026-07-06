import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { productConfigAgentService } from "../../service.js";
import { optionalNumber, optionalString, requireString } from "../params.js";

export const uploadContract = async (request: Request, response: Response) => {
  const filePath = requireString(request.body?.filePath, "filePath");
  await fs.access(filePath);
  const result = await productConfigAgentService.registerDocument({
    filePath,
    fileName: optionalString(request.body?.fileName) ?? path.basename(filePath),
    source: optionalString(request.body?.source) ?? "manual",
    blocksJson: request.body?.blocksJson,
  });
  response.json(result);
};

export const listDocuments = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listDocuments({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      status: optionalString(request.query.status) ?? undefined,
      q: optionalString(request.query.q) ?? undefined,
      productNumber: optionalString(request.query.productNumber ?? request.query.product_number) ?? undefined,
      customerId: optionalString(request.query.customerId ?? request.query.customer_id) ?? undefined,
    }),
  );
};

export const contractsSummary = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.getSummary());
};

export const getDocument = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getDocument(requireString(request.params.documentId, "documentId")));
};

export const saveBlocks = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.saveBlocks({
      documentId: requireString(request.params.documentId, "documentId"),
      blocksJson: request.body?.blocksJson ?? request.body,
      parserVersion: optionalString(request.body?.parserVersion) ?? undefined,
    }),
  );
};

export const getExtraction = async (request: Request, response: Response) => {
  const detail = await productConfigAgentService.getDocument(
    requireString(request.params.documentId, "documentId"),
  );
  response.json(detail.extraction ?? null);
};

export const reextract = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.extractDocument({
      documentId: requireString(request.params.documentId, "documentId"),
      llmModel: optionalString(request.body?.llmModel) ?? undefined,
      force: true,
    }),
  );
};

export const listExtractions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listExtractions({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      documentId: optionalString(request.query.documentId) ?? undefined,
    }),
  );
};

export const pendingLlmStatus = async (_request: Request, response: Response) => {
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.pendingLlmStatus()),
  });
};

export const startPendingLlmBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.startPendingLlmBatch({
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
      llmModel: optionalString(request.body?.llmModel) ?? optionalString(request.query.llmModel) ?? undefined,
      concurrency: optionalNumber(request.body?.concurrency) ?? optionalNumber(request.query.concurrency),
    }),
  );
};

export const listBackgroundJobs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listJobs({
      jobType: optionalString(request.query.jobType ?? request.query.job_type) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize ?? request.query.page_size),
    }),
  );
};

export const parseBlocksBatch = async (request: Request, response: Response) => {
  const files = Array.isArray(request.body?.files)
    ? request.body.files
    : Array.isArray(request.body?.filePaths)
      ? request.body.filePaths.map((filePath: unknown) => ({ filePath }))
      : [];
  response.json(
    await productConfigAgentService.parseBlocksBatch(
      files.map((item: any) => ({
        filePath: requireString(item?.filePath ?? item, "filePath"),
        fileName: optionalString(item?.fileName) ?? undefined,
        source: optionalString(item?.source) ?? optionalString(request.body?.source) ?? "batch_parse",
        parserVersion: optionalString(item?.parserVersion) ?? optionalString(request.body?.parserVersion) ?? undefined,
        forceReparse: item?.forceReparse === true || request.body?.forceReparse === true,
      })),
    ),
  );
};

export const dictionaryDirtyRefreshStatus = async (_request: Request, response: Response) => {
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.dictionaryDirtyRefreshStatus()),
  });
};

export const startDictionaryDirtyRefresh = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.startDictionaryDirtyRefresh({
      documentId:
        optionalString(request.body?.documentId) ??
        optionalString(request.query.documentId) ??
        undefined,
      source: optionalString(request.body?.source) ?? "manual_refresh",
    }),
  );
};

export const llmSummary = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.getLlmSummary());
};

export const getJob = async (request: Request, response: Response) => {
  const job = await productConfigAgentService.getJob(requireString(request.params.jobId, "jobId"));
  if (!job) {
    response.status(404).json({ error: "job not found" });
    return;
  }
  response.json(job);
};

export const openDocumentFile = async (request: Request, response: Response) => {
  const detail = await productConfigAgentService.getDocument(requireString(request.params.documentId, "documentId"));
  await fs.access(detail.document.filePath);
  response.json({
    documentId: detail.document.id,
    fileName: detail.document.fileName,
    filePath: detail.document.filePath,
    exists: true,
  });
};

export const renormalizeExtraction = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.renormalizeDocument(requireString(request.params.documentId, "documentId")));
};

export const renormalizeExtractionResult = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.renormalizeExtractionResult(
      requireString(request.params.extractionResultId, "extractionResultId"),
    ),
  );
};

export const renormalizeExtractionsBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.renormalizeBatch({
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
      scope: optionalString(request.body?.scope) ?? optionalString(request.query.scope) ?? undefined,
    }),
  );
};
