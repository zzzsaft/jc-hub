import type { Request, Response } from "express";
import { productConfigAgentService } from "../../service.js";
import { getProductConfigAgentUserId } from "../auth.js";
import { optionalNumber, optionalString, requireCandidateAction, requireString } from "../params.js";

export const listTermTypes = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.listTermTypes());
};

export const createTermType = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.upsertTermType({
      termType: requireString(request.body?.termType, "termType"),
      displayName: optionalString(request.body?.displayName) ?? undefined,
      kind: optionalString(request.body?.kind) ?? undefined,
      metadata: request.body?.metadata,
    }),
  );
};

export const updateTermType = async (request: Request, response: Response) => {
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

export const deleteTermType = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteTermType(requireString(request.params.id, "id")));
};

export const listValues = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listValues(optionalString(request.query.termType) ?? undefined));
};

export const createValue = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.upsertValue({
      termType: requireString(request.body?.termType, "termType"),
      canonicalValue: requireString(request.body?.canonicalValue, "canonicalValue"),
      displayName: optionalString(request.body?.displayName) ?? undefined,
      metadata: request.body?.metadata,
    }),
  );
};

export const updateValue = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.updateValue(requireString(request.params.id, "id"), {
      canonicalValue: optionalString(request.body?.canonicalValue) ?? undefined,
      displayName: optionalString(request.body?.displayName),
      metadata: request.body?.metadata,
      isActive: typeof request.body?.isActive === "boolean" ? request.body.isActive : undefined,
    }),
  );
};

export const deleteValue = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteValue(requireString(request.params.id, "id")));
};

export const listUnitAliases = async (_request: Request, response: Response) => {
  response.json(await productConfigAgentService.listUnitAliases());
};

export const createUnitAlias = async (request: Request, response: Response) => {
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

export const deleteUnitAlias = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.deleteUnitAlias(requireString(request.params.id, "id")));
};

export const listCandidates = async (request: Request, response: Response) => {
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

export const generateCandidates = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.generateCandidatesForDocument(requireString(request.params.documentId, "documentId")));
};

export const reviewCandidate = async (request: Request, response: Response) => {
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

export const rejectCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.reviewCandidate({
      candidateId: requireString(request.params.candidateId ?? request.body?.candidateId, "candidateId"),
      action: "reject",
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const createDictionaryHealthReport = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.createDictionaryHealthReport(
      await getProductConfigAgentUserId(request),
    ),
  );
};

export const listDictionaryHealthReports = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listDictionaryHealthReports({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

export const dictionaryHealthAuditJobs = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listDictionaryHealthReports({
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

export const listUnitCandidates = async (request: Request, response: Response) => {
  response.json(await productConfigAgentService.listUnitCandidates({ status: optionalString(request.query.status) ?? undefined }));
};

export const unitCandidatesReviewPrompt = async (_request: Request, response: Response) => {
  response.json({
    prompt: "Review unit candidates by approving a canonical unit alias or rejecting noisy units.",
  });
};

export const approveUnitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.approveUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      canonicalUnit: optionalString(request.body?.canonicalUnit ?? request.body?.canonical_unit) ?? undefined,
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const rejectUnitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.rejectUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const candidateReviewPrompt = async (request: Request, response: Response) => {
  response.json({
    candidateType: optionalString(request.query.candidateType) ?? "all",
    prompt: "Review clustered candidates and choose create, alias, split, move, doc-info, or reject actions.",
  });
};

export const reviewCandidatesBatch = async (request: Request, response: Response) => {
  const reviews = Array.isArray(request.body?.reviews) ? request.body.reviews : [];
  response.json(
    await productConfigAgentService.reviewCandidatesBatch({
      reviews,
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const listCandidateSuggestions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listSuggestions({
      termType: optionalString(request.query.termType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

export const suggestCandidatesBatch = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.suggestCandidatesBatch({
      candidateIds: Array.isArray(request.body?.candidateIds) ? request.body.candidateIds : undefined,
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
    }),
  );
};

export const listCandidateClusters = async (request: Request, response: Response) => {
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

export const splitCandidate = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.splitCandidate({
      candidateId: requireString(request.params.candidateId ?? request.body?.candidateId, "candidateId"),
      parts: request.body?.parts ?? request.body?.splits ?? [],
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const listSplits = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listSplits({
      termType: optionalString(request.query.termType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

export const runConceptResolver = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.runConceptResolver({
      conceptType: optionalString(request.body?.conceptType ?? request.query.conceptType) ?? undefined,
      sourceValue: optionalString(request.body?.sourceValue ?? request.query.sourceValue) ?? undefined,
      dryRun: request.body?.apply === true ? false : true,
      limit: optionalNumber(request.body?.limit) ?? optionalNumber(request.query.limit),
    }),
  );
};

export const getConceptResolverRun = async (request: Request, response: Response) => {
  const run = await productConfigAgentService.getConceptResolverRun(requireString(request.params.runId, "runId"));
  if (!run) {
    response.status(404).json({ error: "concept resolver run not found" });
    return;
  }
  response.json(run);
};

export const listConceptResolutions = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listConceptResolutions({
      conceptType: optionalString(request.query.conceptType) ?? undefined,
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

export const listConceptPatterns = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.listConceptPatterns({
      status: optionalString(request.query.status) ?? undefined,
    }),
  );
};

export const reviewConceptPattern = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.reviewConceptPattern({
      id: requireString(request.params.id, "id"),
      status: requireString(request.body?.status, "status"),
      reviewedBy: await getProductConfigAgentUserId(request),
      note: optionalString(request.body?.note) ?? undefined,
    }),
  );
};

export const applyConceptPatternCandidates = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.applyConceptPatternCandidates({
      id: requireString(request.params.id, "id"),
      reviewedBy: await getProductConfigAgentUserId(request),
    }),
  );
};

export const candidateAction = (action: ReturnType<typeof requireCandidateAction>) => async (request: Request, response: Response) => {
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

export const createTermTypeFromCandidate = candidateAction("create-term-type");

export const createValueFromCandidate = candidateAction("create-value");

export const approveCandidateAsAlias = candidateAction("approve-as-alias");

export const moveCandidateToTermType = candidateAction("move-to-term-type");

export const markCandidateAsDocInfo = candidateAction("mark-as-doc-info");

export const updateCandidateTermTypeKind = candidateAction("update-term-type-kind");
