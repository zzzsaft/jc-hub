import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { agentRuntimeService } from "../../agentRuntime/defaultRuntime.js";
import { authService } from "../../services/authService.js";
import {
  isLocalDevRoute,
  resolveUserIdOrLocalDev,
} from "../../routes/routeAuth.js";
import { productConfigAgentService } from "../service.js";

type RouteAction = (request: Request, response: Response) => Promise<void>;

async function getProductConfigAgentUserId(request: Request): Promise<string | null> {
  const resolvedUserId = (request as Request & { userId?: string }).userId;
  if (resolvedUserId) return resolvedUserId;
  return resolveUserIdOrLocalDev(request);
}

function productConfigAgentAdminUserIds(): Set<string> {
  return new Set(
    String(
      process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS ??
        process.env.QUOTE_AGENT_ADMIN_USER_IDS ??
        "",
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function requireProductConfigAgentAdmin(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) return true;

  const adminUserIds = productConfigAgentAdminUserIds();
  if (adminUserIds.size === 0) {
    response.status(403).json({
      error:
        "PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS is required for production productConfigAgent writes",
    });
    return false;
  }

  const user = await authService.verifyToken(request);
  if (!user?.userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!adminUserIds.has(user.userId)) {
    response.status(403).json({ error: "Forbidden" });
    return false;
  }
  (request as Request & { userId?: string }).userId = user.userId;
  return true;
}

export async function requireProductConfigAgentToken(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) return true;

  const userId = await getProductConfigAgentUserId(request);
  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  (request as Request & { userId?: string }).userId = userId;
  return true;
}

function withProductConfigAgentAdmin(action: RouteAction): RouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentAdmin(request, response))) return;
    await action(request, response);
  };
}

function withProductConfigAgentToken(action: RouteAction): RouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentToken(request, response))) return;
    await action(request, response);
  };
}

const listAgentSessions = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.listSessions({
      ownerUserId: await getProductConfigAgentUserId(request),
      agentType: "productConfigAgent",
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

const runAgent = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.run({
      sessionId: optionalString(request.body?.sessionId) ?? undefined,
      agentType: "productConfigAgent",
      message: requireString(request.body?.message, "message"),
      confirmed: request.body?.confirmed === true,
      referenceConfigId: optionalString(request.body?.referenceConfigId) ?? undefined,
      llmModel: optionalString(request.body?.llmModel) ?? undefined,
      context:
        request.body?.context && typeof request.body.context === "object"
          ? request.body.context
          : undefined,
      ownerUserId: await getProductConfigAgentUserId(request),
    }),
  );
};

const getAgentSession = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.getSessionDetail({
      sessionId: requireString(request.params.sessionId, "sessionId"),
      ownerUserId: await getProductConfigAgentUserId(request),
    }),
  );
};

const createShareToken = async (request: Request, response: Response) => {
  const id = BigInt(requireString(request.params.id, "id"));
  const token = cryptoRandomToken();
  const config = await prisma.agentGeneratedConfig.update({
    where: { id },
    data: {
      shareToken: token,
      shareTokenRevokedAt: null,
      shareTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  response.json(mapGeneratedConfig(config));
};

const revokeShareToken = async (request: Request, response: Response) => {
  const id = BigInt(requireString(request.params.id, "id"));
  const config = await prisma.agentGeneratedConfig.update({
    where: { id },
    data: { shareTokenRevokedAt: new Date() },
  });
  response.json(mapGeneratedConfig(config));
};

const getGeneratedConfig = async (request: Request, response: Response) => {
  const config = await prisma.agentGeneratedConfig.findUnique({
    where: { id: BigInt(requireString(request.params.id, "id")) },
  });
  if (!config) {
    response.status(404).json({ error: "Config not found" });
    return;
  }
  response.json(mapGeneratedConfig(config));
};

const getSharedGeneratedConfig = async (request: Request, response: Response) => {
  const config = await prisma.agentGeneratedConfig.findFirst({
    where: {
      shareToken: requireString(request.params.shareToken, "shareToken"),
      shareTokenRevokedAt: null,
      OR: [{ shareTokenExpiresAt: null }, { shareTokenExpiresAt: { gt: new Date() } }],
    },
  });
  if (!config) {
    response.status(404).json({ error: "Shared config not found or expired" });
    return;
  }
  response.json(mapGeneratedConfig(config));
};

const uploadContract = async (request: Request, response: Response) => {
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

const listDocuments = async (request: Request, response: Response) => {
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

const contractsSummary = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.getSummary());
};

const getDocument = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getDocument(requireString(request.params.documentId, "documentId")));
};

const saveBlocks = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.saveBlocks({
      documentId: requireString(request.params.documentId, "documentId"),
      blocksJson: request.body?.blocksJson ?? request.body,
      parserVersion: optionalString(request.body?.parserVersion) ?? undefined,
    }),
  );
};

const getExtraction = async (request: Request, response: Response) => {
  const detail = await productConfigAgentService.getDocument(
    requireString(request.params.documentId, "documentId"),
  );
  response.json(detail.extraction ?? null);
};

const reextract = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.extractDocument({
      documentId: requireString(request.params.documentId, "documentId"),
      llmModel: optionalString(request.body?.llmModel) ?? undefined,
      force: true,
    }),
  );
};

const listExtractions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listExtractions({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      documentId: optionalString(request.query.documentId) ?? undefined,
    }),
  );
};

const listTermTypes = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.listTermTypes());
};

const createTermType = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.upsertTermType({
      termType: requireString(request.body?.termType, "termType"),
      displayName: optionalString(request.body?.displayName) ?? undefined,
      kind: optionalString(request.body?.kind) ?? undefined,
      metadata: request.body?.metadata,
    }),
  );
};

const updateTermType = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.updateTermType(requireString(request.params.id, "id"), {
      termType: optionalString(request.body?.termType) ?? undefined,
      displayName: optionalString(request.body?.displayName) ?? undefined,
      kind: optionalString(request.body?.kind) ?? undefined,
      metadata: request.body?.metadata,
      isActive: typeof request.body?.isActive === "boolean" ? request.body.isActive : undefined,
    }),
  );
};

const deleteTermType = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteTermType(requireString(request.params.id, "id")));
};

const listValues = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listValues(optionalString(request.query.termType) ?? undefined));
};

const createValue = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.upsertValue({
      termType: requireString(request.body?.termType, "termType"),
      canonicalValue: requireString(request.body?.canonicalValue, "canonicalValue"),
      displayName: optionalString(request.body?.displayName) ?? undefined,
      metadata: request.body?.metadata,
    }),
  );
};

const updateValue = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.updateValue(requireString(request.params.id, "id"), {
      canonicalValue: optionalString(request.body?.canonicalValue) ?? undefined,
      displayName: optionalString(request.body?.displayName),
      metadata: request.body?.metadata,
      isActive: typeof request.body?.isActive === "boolean" ? request.body.isActive : undefined,
    }),
  );
};

const deleteValue = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteValue(requireString(request.params.id, "id")));
};

const listUnitAliases = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.listUnitAliases());
};

const createUnitAlias = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.upsertUnitAlias({
      canonicalUnit: requireString(request.body?.canonicalUnit ?? request.body?.canonical_unit, "canonicalUnit"),
      displayUnit: optionalString(request.body?.displayUnit ?? request.body?.display_unit),
      aliasValue: requireString(request.body?.aliasValue ?? request.body?.alias_value, "aliasValue"),
      source: optionalString(request.body?.source) ?? "manual",
      note: optionalString(request.body?.note),
    }),
  );
};

const deleteUnitAlias = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteUnitAlias(requireString(request.params.id, "id")));
};

const pendingLlmStatus = async (_request: Request, response: Response) => {
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.pendingLlmStatus()),
  });
};

const startPendingLlmBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.startPendingLlmBatch({
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
      llmModel: optionalString(request.body?.llmModel) ?? optionalString(request.query.llmModel) ?? undefined,
      concurrency: optionalNumber(request.body?.concurrency) ?? optionalNumber(request.query.concurrency),
    }),
  );
};

const listBackgroundJobs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listJobs({
      jobType: optionalString(request.query.jobType ?? request.query.job_type) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize ?? request.query.page_size),
    }),
  );
};

const parseBlocksBatch = async (request: Request, response: Response) => {
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

const startDictionaryDirtyRefresh = async (request: Request, response: Response) => {
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

const dictionaryDirtyRefreshStatus = async (_request: Request, response: Response) => {
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.dictionaryDirtyRefreshStatus()),
  });
};

const listCandidates = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listCandidates({
      termType: optionalString(request.query.termType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      q: optionalString(request.query.q) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      semanticTag: optionalString(request.query.semanticTag ?? request.query.semantic_tag) ?? undefined,
      semanticGroup: optionalString(request.query.semanticGroup ?? request.query.semantic_group) ?? undefined,
      semanticRisk: optionalString(request.query.semanticRisk ?? request.query.semantic_risk) ?? undefined,
      sort: optionalString(request.query.sort) ?? undefined,
    }),
  );
};

const generateCandidates = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.generateCandidatesForDocument(requireString(request.params.documentId, "documentId")));
};

const reviewCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.reviewCandidate({
      candidateId: requireString(request.params.candidateId ?? request.body?.candidateId, "candidateId"),
      action: requireCandidateAction(request.body?.action),
      candidateType: optionalString(request.body?.candidateType) ?? optionalString(request.params.type) ?? undefined,
      canonicalValue: optionalString(request.body?.canonicalValue) ?? undefined,
      targetTermType: optionalString(request.body?.targetTermType) ?? optionalString(request.body?.termType) ?? undefined,
      kind: optionalString(request.body?.kind) ?? undefined,
      parts: request.body?.parts ?? request.body?.splits,
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const rejectCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.reviewCandidate({
      candidateId: requireString(request.params.candidateId ?? request.body?.candidateId, "candidateId"),
      action: "reject",
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const createDictionaryHealthReport = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.createDictionaryHealthReport(
      await getProductConfigAgentUserId(request),
    ),
  );
};

const listDictionaryHealthReports = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listDictionaryHealthReports({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

const dictionaryHealthAuditJobs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listDictionaryHealthReports({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

const llmSummary = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.getLlmSummary());
};

const getJob = async (request: Request, response: Response) => {
  const job = await productConfigAgentService.getJob(requireString(request.params.jobId, "jobId"));
  if (!job) {
    response.status(404).json({ error: "job not found" });
    return;
  }
  response.json(job);
};

const listUnitCandidates = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listUnitCandidates({ status: optionalString(request.query.status) ?? undefined }));
};

const unitCandidatesReviewPrompt = async (_request: Request, response: Response) => {
  response.json({
    prompt: "Review unit candidates by approving a canonical unit alias or rejecting noisy units.",
  });
};

const approveUnitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.approveUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      canonicalUnit: optionalString(request.body?.canonicalUnit ?? request.body?.canonical_unit) ?? undefined,
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const rejectUnitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.rejectUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const candidateReviewPrompt = async (request: Request, response: Response) => {
  response.json({
    candidateType: optionalString(request.query.candidateType) ?? "all",
    prompt: "Review clustered candidates and choose create, alias, split, move, doc-info, or reject actions.",
  });
};

const reviewCandidatesBatch = async (request: Request, response: Response) => {
  const reviews = Array.isArray(request.body?.reviews) ? request.body.reviews : [];
  response.json(
    await productConfigAgentService.reviewCandidatesBatch({
      reviews,
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const masterDataModelBinding = async (request: Request, response: Response) => {
  const termType = optionalString(request.query.termType ?? request.query.term_type) ?? undefined;
  const rawValue = optionalString(request.query.rawValue ?? request.query.raw_value);
  if (rawValue && (termType === "filter_model" || termType === "metering_pump_model")) {
    response.json(
      await productConfigAgentService.matchMasterDataModel({
        termType,
        rawValue,
      }),
    );
    return;
  }
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.searchMasterDataModelBinding({
      termType,
      q: optionalString(request.query.q ?? request.query.query) ?? undefined,
      model: optionalString(request.query.model) ?? undefined,
      limit: optionalNumber(request.query.limit),
    })),
  });
};

const masterDataModelBindingPost = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.bindMasterDataModel({
      documentId: optionalString(request.body?.documentId) ?? undefined,
      extractionResultId: requireString(request.body?.extractionResultId, "extractionResultId"),
      itemIndex: optionalNumber(request.body?.itemIndex) ?? Number(requireString(request.body?.item_index, "itemIndex")),
      termType: requireModelTermType(request.body?.termType ?? request.body?.term_type),
      rawValue: requireString(request.body?.rawValue ?? request.body?.raw_value, "rawValue"),
      masterDataId: requireString(request.body?.masterDataId ?? request.body?.master_data_id, "masterDataId"),
    }),
  );
};

const candidateAction = (action: ReturnType<typeof requireCandidateAction>) => async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.reviewCandidate({
    candidateId: requireString(request.params.candidateId, "candidateId"),
    action,
    candidateType: optionalString(request.params.type) ?? undefined,
    canonicalValue: optionalString(request.body?.canonicalValue) ?? undefined,
    targetTermType: optionalString(request.body?.targetTermType) ?? optionalString(request.body?.termType) ?? undefined,
    kind: optionalString(request.body?.kind) ?? undefined,
    parts: request.body?.parts ?? request.body?.splits,
    reviewedBy: await getProductConfigAgentUserId(request),
  }));
};

const createTermTypeFromCandidate = candidateAction("create-term-type");
const createValueFromCandidate = candidateAction("create-value");
const approveCandidateAsAlias = candidateAction("approve-as-alias");
const moveCandidateToTermType = candidateAction("move-to-term-type");
const markCandidateAsDocInfo = candidateAction("mark-as-doc-info");
const updateCandidateTermTypeKind = candidateAction("update-term-type-kind");

const listContractArchives = async (request: Request, response: Response) => {
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

const createContractArchive = async (request: Request, response: Response) => {
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

const archiveDocument = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.archiveDocument({
      documentId: requireString(request.params.documentId, "documentId"),
      archiveKey: optionalString(request.body?.archiveKey) ?? undefined,
      title: optionalString(request.body?.title) ?? undefined,
      createdBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const searchProductConfigs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.searchProductConfigs({
      q: optionalString(request.query.q) ?? optionalString(request.query.query) ?? undefined,
      termType: optionalString(request.query.termType) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

const openDocumentFile = async (request: Request, response: Response) => {
  const detail = await productConfigAgentService.getDocument(requireString(request.params.documentId, "documentId"));
  await fs.access(detail.document.filePath);
  response.json({
    documentId: detail.document.id,
    fileName: detail.document.fileName,
    filePath: detail.document.filePath,
    exists: true,
  });
};

const renormalizeExtraction = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.renormalizeDocument(requireString(request.params.documentId, "documentId")));
};

const renormalizeExtractionResult = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.renormalizeExtractionResult(
      requireString(request.params.extractionResultId, "extractionResultId"),
    ),
  );
};

const renormalizeExtractionsBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.renormalizeBatch({
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
      scope: optionalString(request.body?.scope) ?? optionalString(request.query.scope) ?? undefined,
    }),
  );
};

const listCandidateSuggestions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listSuggestions({
      termType: optionalString(request.query.termType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

const suggestCandidatesBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.suggestCandidatesBatch({
      candidateIds: Array.isArray(request.body?.candidateIds) ? request.body.candidateIds : undefined,
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
    }),
  );
};

const listCandidateClusters = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listCandidateClusters({
      status: optionalString(request.query.status) ?? undefined,
      limit: optionalNumber(request.query.limit),
      semanticTag: optionalString(request.query.semanticTag ?? request.query.semantic_tag) ?? undefined,
      semanticGroup: optionalString(request.query.semanticGroup ?? request.query.semantic_group) ?? undefined,
      semanticRisk: optionalString(request.query.semanticRisk ?? request.query.semantic_risk) ?? undefined,
      sort: optionalString(request.query.sort) ?? undefined,
      groupBy: optionalString(request.query.groupBy ?? request.query.group_by) ?? undefined,
    }),
  );
};

const splitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.splitCandidate({
      candidateId: requireString(request.params.candidateId ?? request.body?.candidateId, "candidateId"),
      parts: request.body?.parts ?? request.body?.splits ?? [],
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const listSplits = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listSplits({
      termType: optionalString(request.query.termType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

const runConceptResolver = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.runConceptResolver({
      conceptType: optionalString(request.body?.conceptType ?? request.query.conceptType) ?? undefined,
      sourceValue: optionalString(request.body?.sourceValue ?? request.query.sourceValue) ?? undefined,
      dryRun: request.body?.apply === true ? false : true,
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
    }),
  );
};

const getConceptResolverRun = async (request: Request, response: Response) => {
  const run = await productConfigAgentService.getConceptResolverRun(requireString(request.params.runId, "runId"));
  if (!run) {
    response.status(404).json({ error: "concept resolver run not found" });
    return;
  }
  response.json(run);
};

const listConceptResolutions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listConceptResolutions({
      conceptType: optionalString(request.query.conceptType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

const listConceptPatterns = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listConceptPatterns({
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

const reviewConceptPattern = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.reviewConceptPattern({
      id: requireString(request.params.id, "id"),
      status: requireString(request.body?.status, "status"),
      reviewedBy: await getProductConfigAgentUserId(request),
      note: optionalString(request.body?.note) ?? undefined,
    }),
  );
};

const applyConceptPatternCandidates = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.applyConceptPatternCandidates({
      id: requireString(request.params.id, "id"),
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const checkArchiveReadiness = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.checkArchiveReadiness(requireString(request.params.documentId, "documentId")));
};

const getContractArchive = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getArchiveDetail(requireString(request.params.archiveId, "archiveId")));
};

const getContractArchiveSnapshot = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.getArchiveSnapshot(requireString(request.params.archiveId, "archiveId")));
};

const patchContractArchive = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.patchArchive({
      archiveId: requireString(request.params.archiveId, "archiveId"),
      changes: Array.isArray(request.body?.changes) ? request.body.changes : [],
      editedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

const listContractArchiveVersions = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listArchiveVersions(requireString(request.params.archiveId, "archiveId")));
};

const getContractArchiveVersion = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.getArchiveVersion(
      requireString(request.params.archiveId, "archiveId"),
      requireString(request.params.version, "version"),
    ),
  );
};

const replaceArchiveItemProductBindings = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.replaceArchiveItemProductBindings({
      archiveId: requireString(request.params.archiveId, "archiveId"),
      itemId: requireString(request.params.itemId, "itemId"),
      bindings: Array.isArray(request.body?.bindings) ? request.body.bindings : [],
      editedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const ProductConfigAgentRoutes = [
  { path: "/productConfigAgent/agent/sessions", method: "get", action: withProductConfigAgentToken(listAgentSessions) },
  { path: "/productConfigAgent/agent/run", method: "post", action: withProductConfigAgentToken(runAgent) },
  { path: "/productConfigAgent/agent/sessions/:sessionId", method: "get", action: withProductConfigAgentToken(getAgentSession) },
  { path: "/productConfigAgent/agent/configs/:id/share-token", method: "post", action: withProductConfigAgentToken(createShareToken) },
  { path: "/productConfigAgent/agent/configs/:id/share-token/revoke", method: "post", action: withProductConfigAgentToken(revokeShareToken) },
  { path: "/productConfigAgent/agent/configs/:id", method: "get", action: withProductConfigAgentToken(getGeneratedConfig) },
  { path: "/productConfigAgent/agent/shared/:shareToken", method: "get", action: getSharedGeneratedConfig },
  { path: "/productConfigAgent/contracts/upload", method: "post", action: withProductConfigAgentAdmin(uploadContract) },
  { path: "/productConfigAgent/contracts/summary", method: "get", action: withProductConfigAgentToken(contractsSummary) },
  { path: "/productConfigAgent/contracts", method: "get", action: withProductConfigAgentToken(listDocuments) },
  { path: "/productConfigAgent/contracts/:documentId/candidates/generate", method: "post", action: withProductConfigAgentAdmin(generateCandidates) },
  { path: "/productConfigAgent/contracts/:documentId", method: "get", action: withProductConfigAgentToken(getDocument) },
  { path: "/productConfigAgent/contracts/:documentId/blocks", method: "put", action: withProductConfigAgentAdmin(saveBlocks) },
  { path: "/productConfigAgent/documents/:documentId/open-file", method: "get", action: withProductConfigAgentToken(openDocumentFile) },
  { path: "/productConfigAgent/extractions", method: "get", action: withProductConfigAgentToken(listExtractions) },
  { path: "/productConfigAgent/extractions/llm-summary", method: "get", action: withProductConfigAgentToken(llmSummary) },
  { path: "/api/extractions", method: "get", action: withProductConfigAgentToken(listExtractions) },
  { path: "/api/extractions/llm-summary", method: "get", action: withProductConfigAgentToken(llmSummary) },
  { path: "/productConfigAgent/extractions/renormalize-batch", method: "post", action: withProductConfigAgentAdmin(renormalizeExtractionsBatch) },
  { path: "/productConfigAgent/extractions/:documentId", method: "get", action: withProductConfigAgentToken(getExtraction) },
  { path: "/api/extractions/:documentId", method: "get", action: withProductConfigAgentToken(getExtraction) },
  { path: "/productConfigAgent/extractions/:documentId/reextract", method: "post", action: withProductConfigAgentAdmin(reextract) },
  { path: "/api/extractions/:documentId/reextract", method: "post", action: withProductConfigAgentAdmin(reextract) },
  { path: "/productConfigAgent/extractions/:documentId/renormalize", method: "post", action: withProductConfigAgentAdmin(renormalizeExtraction) },
  { path: "/api/extractions/:documentId/renormalize", method: "post", action: withProductConfigAgentAdmin(renormalizeExtraction) },
  { path: "/productConfigAgent/extraction-results/:extractionResultId/renormalize", method: "post", action: withProductConfigAgentAdmin(renormalizeExtractionResult) },
  { path: "/api/extraction-results/:extractionResultId/renormalize", method: "post", action: withProductConfigAgentAdmin(renormalizeExtractionResult) },
  { path: "/productConfigAgent/dictionary/term-types", method: "get", action: withProductConfigAgentToken(listTermTypes) },
  { path: "/productConfigAgent/dictionary/term-types", method: "post", action: withProductConfigAgentAdmin(createTermType) },
  { path: "/productConfigAgent/dictionary/term-types/:id", method: "put", action: withProductConfigAgentAdmin(updateTermType) },
  { path: "/productConfigAgent/dictionary/term-types/:id", method: "delete", action: withProductConfigAgentAdmin(deleteTermType) },
  { path: "/productConfigAgent/dictionary/values", method: "get", action: withProductConfigAgentToken(listValues) },
  { path: "/productConfigAgent/dictionary/values", method: "post", action: withProductConfigAgentAdmin(createValue) },
  { path: "/productConfigAgent/dictionary/values/:id", method: "put", action: withProductConfigAgentAdmin(updateValue) },
  { path: "/productConfigAgent/dictionary/values/:id", method: "delete", action: withProductConfigAgentAdmin(deleteValue) },
  { path: "/productConfigAgent/dictionary/unit-aliases", method: "get", action: withProductConfigAgentToken(listUnitAliases) },
  { path: "/productConfigAgent/dictionary/unit-aliases", method: "post", action: withProductConfigAgentAdmin(createUnitAlias) },
  { path: "/productConfigAgent/dictionary/unit-aliases/:id", method: "delete", action: withProductConfigAgentAdmin(deleteUnitAlias) },
  { path: "/api/dictionary/product-types", method: "get", action: withProductConfigAgentToken(listTermTypes) },
  { path: "/productConfigAgent/documents/pending-llm-upload/status", method: "get", action: withProductConfigAgentToken(pendingLlmStatus) },
  { path: "/productConfigAgent/documents/pending-llm-upload/start", method: "post", action: withProductConfigAgentAdmin(startPendingLlmBatch) },
  { path: "/productConfigAgent/workflows/parse-blocks-batch", method: "post", action: withProductConfigAgentAdmin(parseBlocksBatch) },
  { path: "/productConfigAgent/dictionary-dirty/refresh/start", method: "post", action: withProductConfigAgentAdmin(startDictionaryDirtyRefresh) },
  { path: "/productConfigAgent/dictionary-dirty/refresh/status", method: "get", action: withProductConfigAgentToken(dictionaryDirtyRefreshStatus) },
  { path: "/productConfigAgent/candidates", method: "get", action: withProductConfigAgentToken(listCandidates) },
  { path: "/productConfigAgent/candidates/suggestions", method: "get", action: withProductConfigAgentToken(listCandidateSuggestions) },
  { path: "/productConfigAgent/candidates/suggestions/batch", method: "post", action: withProductConfigAgentAdmin(suggestCandidatesBatch) },
  { path: "/productConfigAgent/candidates/clusters/review-prompt", method: "get", action: withProductConfigAgentToken(candidateReviewPrompt) },
  { path: "/productConfigAgent/candidates/clusters", method: "get", action: withProductConfigAgentToken(listCandidateClusters) },
  { path: "/productConfigAgent/candidates/clusters/suggestions/batch", method: "post", action: withProductConfigAgentAdmin(suggestCandidatesBatch) },
  { path: "/productConfigAgent/candidates/reviews/batch", method: "post", action: withProductConfigAgentAdmin(reviewCandidatesBatch) },
  { path: "/productConfigAgent/candidates/splits", method: "get", action: withProductConfigAgentToken(listSplits) },
  { path: "/productConfigAgent/candidates/units", method: "get", action: withProductConfigAgentToken(listUnitCandidates) },
  { path: "/productConfigAgent/candidates/units/review-prompt", method: "get", action: withProductConfigAgentToken(unitCandidatesReviewPrompt) },
  { path: "/productConfigAgent/candidates/units/:candidateId/approve", method: "post", action: withProductConfigAgentAdmin(approveUnitCandidate) },
  { path: "/productConfigAgent/candidates/units/:candidateId/reject", method: "post", action: withProductConfigAgentAdmin(rejectUnitCandidate) },
  { path: "/productConfigAgent/candidates/:candidateId/review", method: "post", action: withProductConfigAgentAdmin(reviewCandidate) },
  { path: "/productConfigAgent/candidates/term-type/:candidateId/create-term-type", method: "post", action: withProductConfigAgentAdmin(createTermTypeFromCandidate) },
  { path: "/productConfigAgent/candidates/term-type/:candidateId/suggest", method: "post", action: withProductConfigAgentAdmin(createTermTypeFromCandidate) },
  { path: "/productConfigAgent/candidates/term-type/:candidateId/approve-as-alias", method: "post", action: withProductConfigAgentAdmin(approveCandidateAsAlias) },
  { path: "/productConfigAgent/candidates/value/:candidateId/split", method: "post", action: withProductConfigAgentAdmin(splitCandidate) },
  { path: "/productConfigAgent/candidates/term-type/:candidateId/split", method: "post", action: withProductConfigAgentAdmin(splitCandidate) },
  { path: "/productConfigAgent/candidates/term-type/:candidateId/mark-as-doc-info", method: "post", action: withProductConfigAgentAdmin(markCandidateAsDocInfo) },
  { path: "/productConfigAgent/candidates/value/:candidateId/create-value", method: "post", action: withProductConfigAgentAdmin(createValueFromCandidate) },
  { path: "/productConfigAgent/candidates/value/:candidateId/split-suggest", method: "post", action: withProductConfigAgentAdmin(splitCandidate) },
  { path: "/productConfigAgent/candidates/value/:candidateId/move-to-term-type", method: "post", action: withProductConfigAgentAdmin(moveCandidateToTermType) },
  { path: "/productConfigAgent/candidates/value/:candidateId/approve-as-alias", method: "post", action: withProductConfigAgentAdmin(approveCandidateAsAlias) },
  { path: "/productConfigAgent/candidates/value/:candidateId/update-term-type-kind", method: "post", action: withProductConfigAgentAdmin(updateCandidateTermTypeKind) },
  { path: "/productConfigAgent/candidates/:type/:candidateId/reject", method: "post", action: withProductConfigAgentAdmin(rejectCandidate) },
  { path: "/productConfigAgent/concept-resolver/run", method: "post", action: withProductConfigAgentAdmin(runConceptResolver) },
  { path: "/productConfigAgent/concept-resolver/runs/:runId", method: "get", action: withProductConfigAgentToken(getConceptResolverRun) },
  { path: "/productConfigAgent/concept-resolver/resolutions", method: "get", action: withProductConfigAgentToken(listConceptResolutions) },
  { path: "/productConfigAgent/concept-resolver/patterns", method: "get", action: withProductConfigAgentToken(listConceptPatterns) },
  { path: "/productConfigAgent/concept-resolver/patterns/:id/review", method: "post", action: withProductConfigAgentAdmin(reviewConceptPattern) },
  { path: "/productConfigAgent/concept-resolver/patterns/:id/apply-candidates", method: "post", action: withProductConfigAgentAdmin(applyConceptPatternCandidates) },
  { path: "/productConfigAgent/dictionary/health/audit", method: "post", action: withProductConfigAgentAdmin(createDictionaryHealthReport) },
  { path: "/productConfigAgent/dictionary/health-audit/jobs", method: "get", action: withProductConfigAgentToken(dictionaryHealthAuditJobs) },
  { path: "/productConfigAgent/dictionary/health-report", method: "get", action: withProductConfigAgentToken(listDictionaryHealthReports) },
  { path: "/productConfigAgent/jobs/:jobId", method: "get", action: withProductConfigAgentToken(getJob) },
  { path: "/productConfigAgent/background-jobs", method: "get", action: withProductConfigAgentToken(listBackgroundJobs) },
  { path: "/productConfigAgent/background-jobs/:jobId", method: "get", action: withProductConfigAgentToken(getJob) },
  { path: "/productConfigAgent/master-data/model-binding", method: "get", action: withProductConfigAgentToken(masterDataModelBinding) },
  { path: "/productConfigAgent/master-data/model-binding", method: "post", action: withProductConfigAgentAdmin(masterDataModelBindingPost) },
  { path: "/productConfigAgent/contract-archives", method: "get", action: withProductConfigAgentToken(listContractArchives) },
  { path: "/productConfigAgent/contract-archives", method: "post", action: withProductConfigAgentAdmin(createContractArchive) },
  { path: "/productConfigAgent/contracts/:documentId/archive", method: "post", action: withProductConfigAgentAdmin(archiveDocument) },
  { path: "/productConfigAgent/contracts/:documentId/archive-readiness", method: "get", action: withProductConfigAgentToken(checkArchiveReadiness) },
  { path: "/productConfigAgent/contract-archives/:archiveId", method: "get", action: withProductConfigAgentToken(getContractArchive) },
  { path: "/productConfigAgent/contract-archives/:archiveId/snapshot", method: "get", action: withProductConfigAgentToken(getContractArchiveSnapshot) },
  { path: "/productConfigAgent/contract-archives/:archiveId", method: "patch", action: withProductConfigAgentAdmin(patchContractArchive) },
  { path: "/productConfigAgent/contract-archives/:archiveId/versions", method: "get", action: withProductConfigAgentToken(listContractArchiveVersions) },
  { path: "/productConfigAgent/contract-archives/:archiveId/versions/:version", method: "get", action: withProductConfigAgentToken(getContractArchiveVersion) },
  { path: "/productConfigAgent/contract-archives/:archiveId/items/:itemId/product-bindings", method: "put", action: withProductConfigAgentAdmin(replaceArchiveItemProductBindings) },
  { path: "/productConfigAgent/product-configs/search", method: "get", action: withProductConfigAgentToken(searchProductConfigs) },
];

export const LegacyProductConfigAgentRoutes = ProductConfigAgentRoutes.map((route) => ({
  ...route,
  path: legacyProductConfigAgentRoutePath(route.path),
}));

function legacyProductConfigAgentRoutePath(routePath: string): string {
  if (routePath.startsWith("/productConfigAgent")) {
    return routePath.replace("/productConfigAgent", "/quoteAgent");
  }
  return routePath;
}

function sendError(response: Response, error: unknown) {
  response.status(400).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function optionalNumber(value: unknown): number | undefined {
  const stringValue = optionalString(value);
  if (!stringValue) return undefined;
  const numberValue = Number(stringValue);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function requireCandidateAction(value: unknown): any {
  const action = String(value ?? "").trim();
  const allowed = new Set([
    "approve",
    "reject",
    "merge",
    "create-term-type",
    "create_term_type",
    "approve-as-alias",
    "approve_as_alias",
    "approve_term_type_as_alias",
    "approve_value_as_alias",
    "create-value",
    "create_value",
    "move-to-term-type",
    "move_to_other_term_type",
    "move_value_to_other_term_type",
    "mark-as-doc-info",
    "mark_as_doc_info",
    "mark_term_type_as_doc_info",
    "update-term-type-kind",
    "update_term_type_kind",
    "update_term_type_value_kind",
    "split-suggest",
    "split_suggest",
    "split",
    "split_term_type",
    "split_value",
    "needs-human-review",
    "needs_human_review",
  ]);
  if (allowed.has(action)) return action;
  throw new Error("unsupported candidate action");
}

function requireModelTermType(value: unknown): "filter_model" | "metering_pump_model" {
  if (value === "filter_model" || value === "metering_pump_model") return value;
  throw new Error("termType must be filter_model or metering_pump_model");
}

function cryptoRandomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
}

function mapGeneratedConfig(config: any) {
  return {
    ...config,
    id: String(config.id),
    runId: String(config.runId),
    sessionId: String(config.sessionId),
  };
}
