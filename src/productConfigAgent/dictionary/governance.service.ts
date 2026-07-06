import { prisma } from "../../lib/prisma.js";
import { dictionaryMatcherService } from "./matcher.service.js";
import {
  buildGovernancePriority,
  semanticGroupMatches,
  semanticRiskFromTags,
  semanticRiskMatches,
  semanticTagMatches,
  semanticTagsFromEvidence,
  summarizeSemanticTriage,
} from "./candidateSemanticTriage.js";

export type CandidateAction =
  | "approve"
  | "reject"
  | "merge"
  | "create-term-type"
  | "create_term_type"
  | "approve-as-alias"
  | "approve_as_alias"
  | "approve_term_type_as_alias"
  | "approve_value_as_alias"
  | "create-value"
  | "create_value"
  | "move-to-term-type"
  | "move_to_other_term_type"
  | "move_value_to_other_term_type"
  | "mark-as-doc-info"
  | "mark_as_doc_info"
  | "mark_term_type_as_doc_info"
  | "update-term-type-kind"
  | "update_term_type_kind"
  | "update_term_type_value_kind"
  | "split-suggest"
  | "split_suggest"
  | "split"
  | "split_term_type"
  | "split_value"
  | "needs-human-review"
  | "needs_human_review";

export class DictionaryGovernanceService {
  async listSuggestions(params?: {
    termType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = normalizePage(params?.page);
    const pageSize = normalizePageSize(params?.pageSize);
    const where: any = {};
    if (params?.termType) where.termType = params.termType;
    if (params?.status) where.status = params.status;
    const [items, total] = await Promise.all([
      prisma.dictionarySuggestion.findMany({
        where,
        orderBy: [{ status: "asc" }, { score: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dictionarySuggestion.count({ where }),
    ]);
    return { page, pageSize, total, items: mapBigInts(items) };
  }

  async suggestBatchCandidateReviews(params: { candidateIds?: Array<string | number>; limit?: number }) {
    const candidates = await prisma.dictionaryCandidate.findMany({
      where: params.candidateIds?.length
        ? { id: { in: params.candidateIds.map((id) => BigInt(id)) } }
        : { status: "pending" },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: Math.min(200, Math.max(1, params.limit ?? 50)),
    });
    const suggestions = [];
    for (const candidate of candidates) {
      const existing = await prisma.dictionaryTerm.findFirst({
        where: {
          termType: candidate.termType,
          canonicalValue: { equals: candidate.rawValue, mode: "insensitive" },
        },
      });
      suggestions.push(
        await prisma.dictionarySuggestion.create({
          data: {
            termType: candidate.termType,
            candidateId: candidate.id,
            suggestedValue: candidate.proposedCanonicalValue ?? candidate.rawValue,
            suggestionType: existing ? "approve_as_alias" : "create_value",
            score: Number(candidate.confidence ?? 0),
            metadata: toJson({
              candidateId: Number(candidate.id),
              rawValue: candidate.rawValue,
              reason: existing ? "matched existing value text" : "pending high-score candidate",
            }),
          },
        }),
      );
    }
    return { count: suggestions.length, suggestions: mapBigInts(suggestions) };
  }

  async listClusters(params?: {
    status?: string;
    limit?: number;
    semanticTag?: string;
    semanticGroup?: string;
    semanticRisk?: string;
    sort?: string;
    groupBy?: string;
  }) {
    const candidates = await prisma.dictionaryCandidate.findMany({
      where: params?.status ? { status: params.status } : undefined,
      orderBy: [{ termType: "asc" }, { normalizedRawValue: "asc" }, { confidence: "desc" }],
      take: Math.min(500, Math.max(1, params?.limit ?? 200)),
    });
    const filteredCandidates = candidates.filter((candidate) => {
      const semanticTags = semanticTagsFromEvidence(candidate.evidence);
      return candidateMatchesSemanticFilters(semanticTags, params);
    });
    const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
      where: { candidateId: { in: filteredCandidates.map((candidate) => candidate.id) } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    const occurrencesByCandidate = groupBy(occurrences, (item) => String(item.candidateId));
    const clusters = new Map<string, any>();
    for (const candidate of filteredCandidates) {
      const normalized = candidate.normalizedRawValue ?? normalizeText(candidate.rawValue);
      const key = `${candidate.termType}:${normalized}`;
      const metadata = objectRecord(candidate.evidence);
      const semanticTriage = summarizeSemanticTriage(metadata);
      const semanticTags = semanticTagsFromEvidence(metadata);
      const candidateType = String(metadata.candidateType ?? inferCandidateType(candidate.termType));
      const sourceProductType = stringOrNull(
        candidate.sourceProductType ?? metadata.sourceProductType ?? metadata.itemProductTypeHint ?? metadata.productTypeHint,
      );
      const cluster = clusters.get(key) ?? {
        clusterId: Buffer.from(key).toString("base64url"),
        candidateType,
        termType: candidate.termType,
        sourceProductType,
        normalizedValue: normalized,
        candidateIds: [],
        rawValues: [],
        documentCount: 0,
        occurrenceCount: 0,
        sampleOccurrences: [],
        batchOperationsPreview: [],
        semanticTriage: null,
        semanticTags: [],
        semanticRisk: "low",
        governancePriorityScore: 0,
        recommendedReviewAction: null,
        score: 0,
        _maxConfidence: 0,
        _semanticTags: new Set<string>(),
      };
      cluster.candidateIds.push(String(candidate.id));
      cluster.rawValues.push(candidate.rawValue);
      if (!cluster.sourceProductType && sourceProductType) cluster.sourceProductType = sourceProductType;
      if (!cluster.semanticTriage && semanticTriage) {
        cluster.semanticTriage = semanticTriage;
        cluster.recommendedReviewAction = semanticTriage.recommendedReviewAction;
      }
      for (const tag of semanticTags) cluster._semanticTags.add(tag);
      const candidateOccurrences = occurrencesByCandidate.get(String(candidate.id)) ?? [];
      cluster.occurrenceCount += candidateOccurrences.length;
      cluster.score += Number(candidate.confidence ?? 0);
      cluster._maxConfidence = Math.max(cluster._maxConfidence, Number(candidate.confidence ?? 0));
      const documentIds = new Set([
        ...(cluster._documentIds ?? []),
        ...candidateOccurrences.map((item) => String(item.documentId ?? "")).filter(Boolean),
      ]);
      cluster._documentIds = [...documentIds];
      cluster.documentCount = documentIds.size;
      cluster.sampleOccurrences.push(
        ...candidateOccurrences.slice(0, Math.max(0, 5 - cluster.sampleOccurrences.length)).map((item) => ({
          documentId: item.documentId ? Number(item.documentId) : null,
          extractionId: item.extractionResultId ? Number(item.extractionResultId) : null,
          fieldPath: item.fieldName,
          rawValue: item.rawValue,
          context: item.evidence,
        })),
      );
      cluster.batchOperationsPreview = cluster.candidateIds.map((candidateId: string) => ({
        candidateType,
        candidateId,
        action: candidateType === "term_type" ? "create_term_type" : "create_value",
        payload: {
          targetTermType: candidateType === "term_type" ? undefined : candidate.termType,
          canonicalValue: candidate.proposedCanonicalValue ?? candidate.rawValue,
        },
      }));
      clusters.set(key, cluster);
    }
    const items = [...clusters.values()].map(finalizeClusterGovernance);
    sortClusterItems(items, params?.sort);
    if (params?.groupBy) {
      return { groups: groupClusterItems(items, params.groupBy) };
    }
    return {
      items: items.map(({ _documentIds, _maxConfidence, _semanticTags, ...cluster }) => cluster),
    };
  }

  async reviewCandidate(params: {
    candidateId: string | number;
    action: CandidateAction;
    candidateType?: string;
    canonicalValue?: string;
    targetTermType?: string;
    termType?: string;
    kind?: string;
    parts?: unknown;
    reviewedBy?: string | null;
  }) {
    const candidate = await prisma.dictionaryCandidate.findUnique({
      where: { id: BigInt(params.candidateId) },
    });
    if (!candidate) throw new Error(`Candidate not found: ${params.candidateId}`);
    const requestedAction = normalizeAction(params.action);
    const metadata = objectRecord(candidate.evidence);
    const candidateType = params.candidateType ?? String(metadata.candidateType ?? inferCandidateType(candidate.termType));
    const action = normalizeActionForCandidateType(requestedAction, candidateType);
    assertAllowedAction(candidateType, action);
    const targetTermType = params.targetTermType ?? params.termType ?? candidate.termType;
    const reviewedAt = new Date();
    let status = action.replaceAll("-", "_");
    let result: unknown = null;
    const affectedBefore = await findAffectedDocumentIdsForCandidate(candidate.id);
    const dictionaryChanged = isDictionaryChangingReviewAction(action);

    if (action === "reject") {
      status = "rejected";
    } else if (action === "create-term-type") {
      result = await prisma.dictionaryTermType.upsert({
        where: { termType: targetTermType },
        create: {
          termType: targetTermType,
          displayName: params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue,
          valueKind: params.kind ?? "enum",
        },
        update: {
          displayName: params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue,
          valueKind: params.kind ?? undefined,
          isActive: true,
        },
      });
      await upsertTermTypeAlias(targetTermType, candidate.rawValue);
      status = "approved";
    } else if (action === "approve-as-alias") {
      if (candidateType === "term_type") {
        result = await upsertTermTypeAlias(targetTermType, candidate.rawValue);
      } else {
        const term = await upsertDictionaryTerm(targetTermType, params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue);
        result = await upsertValueAlias(term.id, targetTermType, candidate.rawValue);
      }
      status = "approved_alias";
    } else if (action === "create-value" || action === "approve" || action === "merge") {
      result = await upsertDictionaryTerm(targetTermType, params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue);
      status = action === "merge" ? "merged" : "approved";
    } else if (action === "move-to-term-type") {
      result = await upsertDictionaryTerm(targetTermType, params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue);
      status = "moved";
    } else if (action === "mark-as-doc-info") {
      status = "doc_info";
      result = { field: params.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue };
    } else if (action === "update-term-type-kind") {
      result = await prisma.dictionaryTermType.update({
        where: { termType: targetTermType },
        data: { valueKind: params.kind ?? "enum" },
      });
      status = "kind_updated";
    } else if (action === "split-suggest") {
      result = await prisma.dictionaryValueSplitSuggestion.create({
        data: {
          candidateId: candidate.id,
          termType: targetTermType,
          rawValue: candidate.rawValue,
          suggestions: toJson(params.parts ?? []),
          prompt: "candidate_review_split_suggest",
          model: "manual",
          rawResponse: toJson({ reviewedBy: params.reviewedBy ?? null }),
        },
      });
      status = "split_suggested";
    } else if (action === "split") {
      result = await this.splitCandidate({
        candidateId: String(candidate.id),
        parts: params.parts ?? [],
        reviewedBy: params.reviewedBy,
      });
      const affectedAfter = await findAffectedDocumentIdsForCandidate(candidate.id);
      const affectedDocumentIds = uniqueNumbers([...affectedBefore, ...affectedAfter]);
      const dictionaryVersion = await afterDictionaryReview(action, dictionaryChanged, affectedDocumentIds, params.reviewedBy);
      return {
        candidate: await getCandidate(candidate.id),
        result,
        affectedDocumentIds,
        refreshDeferred: dictionaryChanged,
        candidateRecheckDeferred: dictionaryChanged,
        dictionaryVersion,
      };
    } else {
      status = "needs_human_review";
    }

    const updated = await prisma.dictionaryCandidate.update({
      where: { id: candidate.id },
      data: {
        termType: targetTermType,
        status,
        proposedCanonicalValue: params.canonicalValue ?? candidate.proposedCanonicalValue,
        evidence: toJson({
          ...metadata,
          candidateType,
          reviewAction: action,
          reviewResult: result,
        }),
        reviewedBy: params.reviewedBy ?? undefined,
        reviewedAt,
      },
    });
    const affectedAfter = await findAffectedDocumentIdsForCandidate(candidate.id);
    const affectedDocumentIds = uniqueNumbers([...affectedBefore, ...affectedAfter]);
    const dictionaryVersion = await afterDictionaryReview(
      action,
      dictionaryChanged,
      affectedDocumentIds,
      params.reviewedBy,
      String(candidate.id),
      { candidate: updated, result },
      candidate,
    );
    return {
      candidate: mapBigInts(updated),
      result: mapBigInts(result),
      affectedDocumentIds,
      refreshDeferred: dictionaryChanged,
      candidateRecheckDeferred: dictionaryChanged,
      dictionaryVersion,
    };
  }

  async reviewCandidatesBatch(params: {
    reviews: Array<Record<string, unknown>>;
    reviewedBy?: string | null;
  }) {
    const results = [];
    const affectedDocumentIds = new Set<number>();
    let dictionaryChanged = false;
    for (const review of params.reviews.slice(0, 200)) {
      const candidateId = review.candidateId ?? review.candidate_id;
      const action = review.action;
      try {
        if (candidateId === undefined || candidateId === null) throw new Error("candidateId is required");
        const result = await this.reviewCandidate({
          candidateId: String(candidateId),
          action: (typeof action === "string" ? action : "approve") as CandidateAction,
          candidateType: typeof review.candidateType === "string" ? review.candidateType : undefined,
          canonicalValue: typeof review.canonicalValue === "string" ? review.canonicalValue : undefined,
          targetTermType:
            typeof review.targetTermType === "string"
              ? review.targetTermType
              : typeof review.termType === "string"
                ? review.termType
                : undefined,
          kind: typeof review.kind === "string" ? review.kind : undefined,
          parts: review.parts ?? review.splits,
          reviewedBy: params.reviewedBy,
        });
        results.push({
          candidateId: String(candidateId),
          action: normalizeAction((typeof action === "string" ? action : "approve") as CandidateAction),
          success: true,
          result,
          affectedDocumentIds: result.affectedDocumentIds ?? [],
          refreshDeferred: result.refreshDeferred ?? false,
          candidateRecheckDeferred: result.candidateRecheckDeferred ?? false,
        });
        for (const documentId of result.affectedDocumentIds ?? []) affectedDocumentIds.add(Number(documentId));
        dictionaryChanged = dictionaryChanged || Boolean(result.refreshDeferred);
      } catch (error) {
        results.push({
          candidateId: candidateId === undefined || candidateId === null ? null : String(candidateId),
          action: typeof action === "string" ? action : "approve",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      requestedCount: params.reviews.length,
      processedCount: results.length,
      successCount: results.filter((item) => item.success).length,
      failedCount: results.filter((item) => !item.success).length,
      affectedDocumentIds: [...affectedDocumentIds].sort((a, b) => a - b),
      refreshDeferred: dictionaryChanged,
      candidateRecheckDeferred: dictionaryChanged,
      results,
    };
  }

  async splitCandidate(params: {
    candidateId: string | number;
    parts: unknown;
    reviewedBy?: string | null;
  }) {
    const candidate = await prisma.dictionaryCandidate.findUnique({
      where: { id: BigInt(params.candidateId) },
    });
    if (!candidate) throw new Error(`Candidate not found: ${params.candidateId}`);
    const split = await prisma.dictionarySplit.upsert({
      where: {
        termType_sourceValue: {
          termType: candidate.termType,
          sourceValue: candidate.rawValue,
        },
      },
      create: {
        termType: candidate.termType,
        sourceValue: candidate.rawValue,
        partsJson: toJson(params.parts ?? []),
        status: "approved",
        metadata: toJson({ reviewedBy: params.reviewedBy, candidateId: Number(candidate.id) }),
      },
      update: {
        partsJson: toJson(params.parts ?? []),
        status: "approved",
        metadata: toJson({ reviewedBy: params.reviewedBy, candidateId: Number(candidate.id) }),
      },
    });
    await prisma.dictionaryCandidate.update({
      where: { id: candidate.id },
      data: { status: "split", reviewedBy: params.reviewedBy ?? undefined, reviewedAt: new Date() },
    });
    return mapBigInts(split);
  }

  async listSplits(params?: { termType?: string; status?: string }) {
    return mapBigInts(
      await prisma.dictionarySplit.findMany({
        where: {
          ...(params?.termType ? { termType: params.termType } : {}),
          ...(params?.status ? { status: params.status } : {}),
        },
        orderBy: { updatedAt: "desc" },
      }),
    );
  }
}

export const dictionaryGovernanceService = new DictionaryGovernanceService();

function normalizePage(value?: number) {
  return Math.max(1, Number(value ?? 1) || 1);
}

function normalizePageSize(value?: number) {
  return Math.min(100, Math.max(1, Number(value ?? 20) || 20));
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function candidateMatchesSemanticFilters(tags: string[], params?: {
  semanticTag?: string;
  semanticGroup?: string;
  semanticRisk?: string;
}) {
  return (
    semanticTagMatches(tags, params?.semanticTag) &&
    semanticGroupMatches(tags, params?.semanticGroup) &&
    semanticRiskMatches(tags, params?.semanticRisk)
  );
}

function finalizeClusterGovernance(cluster: any) {
  const semanticTags = [...(cluster._semanticTags as Set<string>)].sort();
  const semanticRisk = semanticRiskFromTags(semanticTags);
  const governancePriorityScore = buildGovernancePriority({
    tags: semanticTags,
    occurrenceCount: cluster.occurrenceCount,
    confidence: cluster._maxConfidence,
  });
  return {
    ...cluster,
    semanticTags,
    semanticRisk,
    governancePriorityScore,
  };
}

function sortClusterItems(items: any[], sort?: string) {
  if (sort === "governance_priority") {
    items.sort((a, b) => {
      const priorityDelta = Number(b.governancePriorityScore ?? 0) - Number(a.governancePriorityScore ?? 0);
      if (priorityDelta) return priorityDelta;
      return Number(b.score ?? 0) - Number(a.score ?? 0);
    });
  } else if (sort === "frequency") {
    items.sort((a, b) => {
      const occurrenceDelta = Number(b.occurrenceCount ?? 0) - Number(a.occurrenceCount ?? 0);
      if (occurrenceDelta) return occurrenceDelta;
      const priorityDelta = Number(b.governancePriorityScore ?? 0) - Number(a.governancePriorityScore ?? 0);
      if (priorityDelta) return priorityDelta;
      return Number(b.score ?? 0) - Number(a.score ?? 0);
    });
  } else {
    items.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  }
}

function groupClusterItems(items: any[], groupBy: string) {
  const groups = new Map<string, any>();
  for (const item of items) {
    for (const groupKey of clusterGroupKeys(item, groupBy)) {
      const group = groups.get(groupKey) ?? {
        groupKey,
        groupLabel: groupKey,
        count: 0,
        occurrenceCount: 0,
        items: [],
      };
      group.count += 1;
      group.occurrenceCount += Number(item.occurrenceCount ?? 0);
      group.items.push(stripClusterInternals(item));
      groups.set(groupKey, group);
    }
  }
  return [...groups.values()].sort((a, b) => {
    const occurrenceDelta = Number(b.occurrenceCount ?? 0) - Number(a.occurrenceCount ?? 0);
    if (occurrenceDelta) return occurrenceDelta;
    return String(a.groupKey).localeCompare(String(b.groupKey));
  });
}

function clusterGroupKeys(item: any, groupBy: string): string[] {
  if (groupBy === "semanticTag") return item.semanticTags?.length ? item.semanticTags : ["untagged"];
  if (groupBy === "semanticRisk") return [item.semanticRisk ?? "low"];
  if (groupBy === "termType") return [item.termType ?? "unknown"];
  return ["all"];
}

function stripClusterInternals(cluster: any) {
  const { _documentIds, _maxConfidence, _semanticTags, ...clean } = cluster;
  return clean;
}

function toJson(value: unknown): any {
  return JSON.parse(
    JSON.stringify(value ?? null, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  );
}

function mapBigInts(value: any): any {
  if (Array.isArray(value)) return value.map(mapBigInts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "bigint" ? Number(item) : mapBigInts(item),
    ]),
  );
}

function normalizeAction(action: CandidateAction): string {
  const normalized = String(action).replaceAll("_", "-");
  const aliases: Record<string, string> = {
    "create-term-type": "create-term-type",
    "approve-term-type-as-alias": "approve-as-alias",
    "approve-value-as-alias": "approve-as-alias",
    "approve-as-alias": "approve-as-alias",
    "create-value": "create-value",
    "move-to-other-term-type": "move-to-term-type",
    "move-value-to-other-term-type": "move-to-term-type",
    "move-to-term-type": "move-to-term-type",
    "mark-as-doc-info": "mark-as-doc-info",
    "mark-term-type-as-doc-info": "mark-as-doc-info",
    "update-term-type-kind": "update-term-type-kind",
    "update-term-type-value-kind": "update-term-type-kind",
    "split-suggest": "split-suggest",
    "split-term-type": "split",
    "split-value": "split",
    split: "split",
    reject: "reject",
    approve: "approve",
    merge: "merge",
    "needs-human-review": "needs-human-review",
  };
  return aliases[normalized] ?? normalized;
}

function inferCandidateType(termType: string): "term_type" | "value" | "unit" {
  if (termType === "unit" || termType.endsWith("_unit")) return "unit";
  if (termType === "field" || termType === "term_type" || termType.startsWith("unknown_field")) return "term_type";
  return "value";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function upsertDictionaryTerm(termType: string, canonicalValue: string) {
  return prisma.dictionaryTerm.upsert({
    where: { termType_canonicalValue: { termType, canonicalValue } },
    create: { termType, canonicalValue, displayName: canonicalValue },
    update: { displayName: canonicalValue, isActive: true },
  });
}

async function upsertValueAlias(termId: bigint, termType: string, aliasValue: string) {
  return prisma.dictionaryAlias.upsert({
    where: { termType_normalizedAlias: { termType, normalizedAlias: normalizeAliasForDb(aliasValue) } },
    create: {
      termId,
      termType,
      aliasValue,
      normalizedAlias: normalizeAliasForDb(aliasValue),
      source: "candidate_review",
    },
    update: {
      termId,
      aliasValue,
      source: "candidate_review",
      isActive: true,
    },
  });
}

async function upsertTermTypeAlias(termType: string, aliasValue: string) {
  const normalizedAlias = normalizeAliasForDb(aliasValue);
  return prisma.dictionaryTermTypeAlias.upsert({
    where: { normalizedAlias },
    create: {
      termType,
      aliasValue,
      normalizedAlias,
      source: "candidate_review",
    },
    update: {
      aliasValue,
      source: "candidate_review",
      isActive: true,
    },
  });
}

async function getCandidate(candidateId: bigint) {
  return mapBigInts(await prisma.dictionaryCandidate.findUnique({ where: { id: candidateId } }));
}

async function bumpDictionaryVersion(
  action: string,
  entityType: string,
  entityId?: string,
  after?: unknown,
  before?: unknown,
  createdBy?: string | null,
) {
  const version = await prisma.dictionaryVersion.upsert({
    where: { versionKey: "default" },
    create: { versionKey: "default", versionValue: 1, description: "ProductConfigAgent dictionary" },
    update: { versionValue: { increment: 1 } },
  });
  await prisma.dictionaryChangeLog.create({
    data: {
      versionKey: version.versionKey,
      versionValue: version.versionValue,
      action,
      entityType,
      entityId,
      beforeJson: before === undefined ? undefined : toJson(before),
      afterJson: after === undefined ? undefined : toJson(after),
      createdBy: createdBy ?? undefined,
    },
  });
  return version.versionValue;
}

async function afterDictionaryReview(
  action: string,
  dictionaryChanged: boolean,
  affectedDocumentIds: number[],
  reviewedBy?: string | null,
  entityId?: string,
  after?: unknown,
  before?: unknown,
) {
  if (!dictionaryChanged) return null;
  const dictionaryVersion = await bumpDictionaryVersion(action, "candidate", entityId, after, before, reviewedBy);
  dictionaryMatcherService.invalidate();
  await markDocumentsDictionaryDirty(affectedDocumentIds);
  return Number(dictionaryVersion);
}

async function findAffectedDocumentIdsForCandidate(candidateId: bigint) {
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
    where: { candidateId },
    select: { documentId: true },
  });
  return uniqueNumbers(occurrences.map((item) => (item.documentId === null ? null : Number(item.documentId))));
}

async function markDocumentsDictionaryDirty(documentIds: number[]) {
  if (documentIds.length === 0) return;
  await prisma.productDocument.updateMany({
    where: { id: { in: documentIds.map((id) => BigInt(id)) } },
    data: { dictionaryDirty: true },
  });
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))].sort((a, b) => a - b);
}

function normalizeActionForCandidateType(action: string, candidateType: string) {
  if (action === "approve" || action === "merge") return candidateType === "term_type" ? "approve-as-alias" : "create-value";
  return action;
}

function assertAllowedAction(candidateType: string, action: string) {
  const allowed =
    candidateType === "term_type"
      ? new Set(["create-term-type", "approve-as-alias", "split", "mark-as-doc-info", "reject", "needs-human-review"])
      : candidateType === "value"
        ? new Set(["create-value", "approve-as-alias", "move-to-term-type", "split", "reject", "needs-human-review"])
        : new Set(["reject", "needs-human-review"]);
  if (!allowed.has(action)) {
    throw new Error(`Action ${action} is not allowed for candidateType ${candidateType}`);
  }
}

function isDictionaryChangingReviewAction(action: string) {
  return ["create-term-type", "approve-as-alias", "create-value", "split", "split-suggest", "update-term-type-kind"].includes(action);
}

function normalizeAliasForDb(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:，,、;；/\\_-]+/g, "");
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}
