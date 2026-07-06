import type { Request, Response } from "express";
import { productConfigAgentService } from "../../service.js";
import { getProductConfigAgentUserId } from "../auth.js";
import { optionalNumber, optionalString, requireString } from "../params.js";

export const listContractArchives = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listArchives({
      q: optionalString(request.query.q) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      productNumber: optionalString(request.query.productNumber ?? request.query.product_number) ?? undefined,
      customerId: optionalString(request.query.customerId ?? request.query.customer_id) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

export const createContractArchive = async (request: Request, response: Response) => {
  const documentId = optionalString(request.body?.documentId);
  if (documentId) {
    response.json(
      await productConfigAgentService.archiveDocument({
        documentId,
        archiveKey: optionalString(request.body?.archiveKey) ?? undefined,
        title: optionalString(request.body?.title) ?? undefined,
        createdBy: await getProductConfigAgentUserId(request),
      }),
    );
    return;
  }
  response.json(
    await productConfigAgentService.upsertArchive({
      archiveKey: optionalString(request.body?.archiveKey) ?? undefined,
      title: requireString(request.body?.title, "title"),
      archiveJson: request.body?.archiveJson ?? request.body?.archive ?? {},
      productBindings: request.body?.productBindings ?? [],
      metadata: request.body?.metadata ?? {},
      createdBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const archiveDocument = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.archiveDocument({
      documentId: requireString(request.params.documentId, "documentId"),
      archiveKey: optionalString(request.body?.archiveKey) ?? undefined,
      title: optionalString(request.body?.title) ?? undefined,
      createdBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const searchProductConfigs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.searchProductConfigs({
      q: optionalString(request.query.q) ?? optionalString(request.query.query) ?? undefined,
      termType: optionalString(request.query.termType) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

export const checkArchiveReadiness = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.checkArchiveReadiness(requireString(request.params.documentId, "documentId")));
};

export const getContractArchive = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getArchiveDetail(requireString(request.params.archiveId, "archiveId")));
};

export const getContractArchiveSnapshot = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getArchiveSnapshot(requireString(request.params.archiveId, "archiveId")));
};

export const patchContractArchive = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.patchArchive({
      archiveId: requireString(request.params.archiveId, "archiveId"),
      changes: Array.isArray(request.body?.changes) ? request.body.changes : [],
      editedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const listContractArchiveVersions = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listArchiveVersions(requireString(request.params.archiveId, "archiveId")));
};

export const getContractArchiveVersion = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.getArchiveVersion(
      requireString(request.params.archiveId, "archiveId"),
      requireString(request.params.version, "version"),
    ),
  );
};

export const replaceArchiveItemProductBindings = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.replaceArchiveItemProductBindings({
      archiveId: requireString(request.params.archiveId, "archiveId"),
      itemId: requireString(request.params.itemId, "itemId"),
      bindings: Array.isArray(request.body?.bindings) ? request.body.bindings : [],
      editedBy: await getProductConfigAgentUserId(request),
    }),
  );
};
