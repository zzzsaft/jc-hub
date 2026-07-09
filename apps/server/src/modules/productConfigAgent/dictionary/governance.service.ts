import { prisma } from "../../../lib/prisma.js";
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
    return prisma.$transaction((tx) => this.reviewCandidatesBatchOptimized(params, tx));
  }

  private async reviewCandidatesBatchOptimized(
    params: {
      reviews: Array<Record<string, unknown>>;
      reviewedBy?: string | null;
    },
    db: any,
  ) {
    const rows = params.reviews.slice(0, 200).map((review, index) => parseBatchReview(review, index));
    const fallbackRows = rows.filter((row) => !row.parseError && isBatchFallbackAction(row.requestedAction));
    const batchRows = rows.filter((row) => !row.parseError && !isBatchFallbackAction(row.requestedAction));
    const affectedDocumentIds = new Set<number>();
    const results = rows.map((row) => ({
      candidateId: row.candidateId === null ? null : String(row.candidateId),
      action: row.requestedAction,
      success: false,
      error: row.parseError,
    })) as any[];

    const candidates: any[] = batchRows.length
      ? await db.dictionaryCandidate.findMany({ where: { id: { in: batchRows.map((row) => row.candidateId as bigint) } } })
      : [];
    const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]));
    const occurrences: any[] = batchRows.length
      ? await db.dictionaryCandidateOccurrence.findMany({
          where: { candidateId: { in: batchRows.map((row) => row.candidateId as bigint) } },
          select: { candidateId: true, documentId: true },
        })
      : [];
    const documentsByCandidate = groupBy(occurrences, (item) => String(item.candidateId));
    const prepared: BatchPreparedReview[] = [];

    for (const row of batchRows) {
      try {
        const candidate = candidateById.get(String(row.candidateId));
        if (!candidate) throw new Error(`Candidate not found: ${String(row.candidateId)}`);
        const metadata = objectRecord(candidate.evidence);
        const candidateType = row.candidateType ?? String(metadata.candidateType ?? inferCandidateType(candidate.termType));
        const action = normalizeActionForCandidateType(row.requestedAction, candidateType);
        assertAllowedAction(candidateType, action);
        const targetTermType = row.targetTermType ?? candidate.termType;
        const canonicalValue = row.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue;
        const status = batchReviewStatus(action);
        const affected = uniqueNumbers(
          (documentsByCandidate.get(String(candidate.id)) ?? []).map((item) =>
            item.documentId === null ? null : Number(item.documentId),
          ),
        );
        prepared.push({
          row,
          candidate,
          candidateType,
          action,
          targetTermType,
          canonicalValue,
          status,
          affectedDocumentIds: affected,
        });
      } catch (error) {
        results[row.index] = batchErrorResult(row, error);
      }
    }

    const writable = await prepareBatchDictionaryWrites(db, prepared, results);
    await batchUpdateCandidates(db, writable, params.reviewedBy);

    const dictionaryChanged = writable.some((item) => isDictionaryChangingReviewAction(item.action));
    const dictionaryVersion = dictionaryChanged
      ? await afterBatchDictionaryReview(db, writable, params.reviewedBy)
      : null;
    for (const item of writable) {
      for (const documentId of item.affectedDocumentIds) affectedDocumentIds.add(documentId);
      results[item.row.index] = {
        candidateId: String(item.candidate.id),
        action: item.action,
        success: true,
        result: {
          candidate: mapBigInts(batchUpdatedCandidate(item, params.reviewedBy)),
          result: mapBigInts(item.result),
          affectedDocumentIds: item.affectedDocumentIds,
          refreshDeferred: isDictionaryChangingReviewAction(item.action),
          candidateRecheckDeferred: isDictionaryChangingReviewAction(item.action),
          dictionaryVersion,
        },
        affectedDocumentIds: item.affectedDocumentIds,
        refreshDeferred: isDictionaryChangingReviewAction(item.action),
        candidateRecheckDeferred: isDictionaryChangingReviewAction(item.action),
      };
    }

    for (const row of fallbackRows) {
      const result = await this.reviewCandidate({
        candidateId: String(row.candidateId),
        action: row.requestedAction as CandidateAction,
        candidateType: row.candidateType,
        canonicalValue: row.canonicalValue,
        targetTermType: row.targetTermType,
        kind: row.kind,
        parts: row.parts,
        reviewedBy: params.reviewedBy,
      });
      results[row.index] = {
        candidateId: String(row.candidateId),
        action: row.requestedAction,
        success: true,
        result,
        affectedDocumentIds: result.affectedDocumentIds ?? [],
        refreshDeferred: result.refreshDeferred ?? false,
        candidateRecheckDeferred: result.candidateRecheckDeferred ?? false,
      };
      for (const documentId of result.affectedDocumentIds ?? []) affectedDocumentIds.add(Number(documentId));
    }

    const changed = results.some((item) => item.success && item.refreshDeferred);
    return {
      requestedCount: params.reviews.length,
      processedCount: results.length,
      successCount: results.filter((item) => item.success).length,
      failedCount: results.filter((item) => !item.success).length,
      affectedDocumentIds: [...affectedDocumentIds].sort((a, b) => a - b),
      refreshDeferred: changed,
      candidateRecheckDeferred: changed,
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
    const existing = await prisma.dictionarySplit.findFirst({
      where: { termType: candidate.termType, sourceValue: candidate.rawValue },
    });
    const data = {
      termType: candidate.termType,
      sourceValue: candidate.rawValue,
      partsJson: toJson(params.parts ?? []),
      status: "approved",
      metadata: toJson({ reviewedBy: params.reviewedBy, candidateId: Number(candidate.id) }),
    };
    const split = existing
      ? await prisma.dictionarySplit.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.dictionarySplit.create({
          data: {
            ...data,
            termType: candidate.termType,
            sourceValue: candidate.rawValue,
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

type BatchReviewRow = {
  index: number;
  candidateId: bigint | null;
  requestedAction: string;
  candidateType?: string;
  canonicalValue?: string;
  targetTermType?: string;
  kind?: string;
  parts?: unknown;
  parseError?: string;
};

type BatchPreparedReview = {
  row: BatchReviewRow;
  candidate: any;
  candidateType: string;
  action: string;
  targetTermType: string;
  canonicalValue: string;
  status: string;
  affectedDocumentIds: number[];
  result?: unknown;
};

function parseBatchReview(review: Record<string, unknown>, index: number): BatchReviewRow {
  const rawCandidateId = review.candidateId ?? review.candidate_id;
  try {
    if (rawCandidateId === undefined || rawCandidateId === null) throw new Error("candidateId is required");
    return {
      index,
      candidateId: BigInt(String(rawCandidateId)),
      requestedAction: normalizeAction((typeof review.action === "string" ? review.action : "approve") as CandidateAction),
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
    };
  } catch (error) {
    return {
      index,
      candidateId: null,
      requestedAction: typeof review.action === "string" ? review.action : "approve",
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function isBatchFallbackAction(action: string) {
  return ["create-term-type", "split", "split-suggest", "update-term-type-kind"].includes(action);
}

function batchReviewStatus(action: string) {
  if (action === "reject") return "rejected";
  if (action === "move-to-term-type") return "moved";
  if (action === "mark-as-doc-info") return "doc_info";
  if (action === "needs-human-review") return "needs_human_review";
  if (action === "merge") return "merged";
  return "approved";
}

function batchErrorResult(row: BatchReviewRow, error: unknown) {
  return {
    candidateId: row.candidateId === null ? null : String(row.candidateId),
    action: row.requestedAction,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function prepareBatchDictionaryWrites(db: any, prepared: BatchPreparedReview[], results: any[]) {
  const termRows = dedupeBy(
    prepared.filter((item) => ["create-value", "move-to-term-type", "merge"].includes(item.action)),
    (item) => `${item.targetTermType}\u0000${item.canonicalValue}`,
  );
  if (termRows.length > 0) {
    await db.dictionaryTerm.createMany({
      data: termRows.map((item) => ({
        termType: item.targetTermType,
        canonicalValue: item.canonicalValue,
        displayName: item.canonicalValue,
      })),
      skipDuplicates: true,
    });
  }
  const terms: any[] = termRows.length
    ? await db.dictionaryTerm.findMany({
        where: { OR: termRows.map((item) => ({ termType: item.targetTermType, canonicalValue: item.canonicalValue })) },
      })
    : [];
  const termByKey = new Map(terms.map((term) => [`${term.termType}\u0000${term.canonicalValue}`, term]));
  for (const item of prepared) {
    if (!["create-value", "move-to-term-type", "merge"].includes(item.action)) continue;
    const term = termByKey.get(`${item.targetTermType}\u0000${item.canonicalValue}`);
    if (!term) {
      results[item.row.index] = batchErrorResult(item.row, new Error("Dictionary term create/readback failed"));
    } else {
      item.result = term;
    }
  }

  const aliasRows = prepared.filter((item) => item.action === "approve-as-alias" && item.candidateType !== "term_type");
  const termTypeAliasRows = prepared.filter((item) => item.action === "approve-as-alias" && item.candidateType === "term_type");
  const termTypeAliasCreates = termTypeAliasRows.map((item) => ({
    termType: item.targetTermType,
    aliasValue: item.candidate.rawValue,
    normalizedAlias: normalizeAliasForDb(item.candidate.rawValue),
    source: "candidate_review",
    item,
  }));
  const existingTermTypeAliases: any[] = termTypeAliasCreates.length
    ? await db.dictionaryTermTypeAlias.findMany({
        where: { normalizedAlias: { in: termTypeAliasCreates.map((alias) => alias.normalizedAlias) } },
      })
    : [];
  const termTypeAliasByKey = new Map(existingTermTypeAliases.map((alias) => [alias.normalizedAlias, alias]));
  const termTypeAliasData = [];
  for (const alias of termTypeAliasCreates) {
    const existing = termTypeAliasByKey.get(alias.normalizedAlias);
    if (existing && existing.termType !== alias.termType) {
      results[alias.item.row.index] = batchErrorResult(alias.item.row, new Error("Term type alias already points to another term type"));
      continue;
    }
    const { item: _item, ...result } = alias;
    alias.item.result = existing ?? result;
    if (!existing) {
      const { item, ...data } = alias;
      termTypeAliasData.push(data);
    }
  }
  if (termTypeAliasData.length > 0) {
    await db.dictionaryTermTypeAlias.createMany({ data: termTypeAliasData, skipDuplicates: true });
  }

  const aliasTermRows = dedupeBy(aliasRows, (item) => `${item.targetTermType}\u0000${item.canonicalValue}`);
  if (aliasTermRows.length > 0) {
    await db.dictionaryTerm.createMany({
      data: aliasTermRows.map((item) => ({
        termType: item.targetTermType,
        canonicalValue: item.canonicalValue,
        displayName: item.canonicalValue,
      })),
      skipDuplicates: true,
    });
  }
  const aliasTerms: any[] = aliasTermRows.length
    ? await db.dictionaryTerm.findMany({
        where: { OR: aliasTermRows.map((item) => ({ termType: item.targetTermType, canonicalValue: item.canonicalValue })) },
      })
    : [];
  for (const term of aliasTerms) termByKey.set(`${term.termType}\u0000${term.canonicalValue}`, term);
  const aliasCreates = [];
  for (const item of aliasRows) {
    const term = termByKey.get(`${item.targetTermType}\u0000${item.canonicalValue}`);
    if (!term) {
      results[item.row.index] = batchErrorResult(item.row, new Error("Alias target term create/readback failed"));
      continue;
    }
    aliasCreates.push({
      termId: term.id,
      termType: item.targetTermType,
      aliasValue: item.candidate.rawValue,
      normalizedAlias: normalizeAliasForDb(item.candidate.rawValue),
      source: "candidate_review",
      item,
    });
  }
  const existingAliases: any[] = aliasCreates.length
    ? await db.dictionaryAlias.findMany({
        where: {
          OR: aliasCreates.map((alias) => ({
            termType: alias.termType,
            normalizedAlias: alias.normalizedAlias,
          })),
        },
      })
    : [];
  const aliasByKey = new Map(existingAliases.map((alias) => [`${alias.termType}\u0000${alias.normalizedAlias}`, alias]));
  const aliasData = [];
  for (const alias of aliasCreates) {
    const existing = aliasByKey.get(`${alias.termType}\u0000${alias.normalizedAlias}`);
    if (existing && String(existing.termId) !== String(alias.termId)) {
      results[alias.item.row.index] = batchErrorResult(alias.item.row, new Error("Alias already points to another term"));
      continue;
    }
    const { item: _item, ...result } = alias;
    alias.item.result = existing ?? result;
    if (!existing) {
      const { item, ...data } = alias;
      aliasData.push(data);
    }
  }
  if (aliasData.length > 0) {
    await db.dictionaryAlias.createMany({ data: aliasData, skipDuplicates: true });
  }

  return resolveCandidateStatusConflicts(db,
    prepared.filter((item) => !results[item.row.index].error),
    results,
  );
}

async function resolveCandidateStatusConflicts(db: any, prepared: BatchPreparedReview[], results: any[]) {
  const seen = new Set<string>();
  const keys = prepared.map((item) => ({
    termType: item.targetTermType,
    normalizedRawValue: item.candidate.normalizedRawValue ?? normalizeText(item.candidate.rawValue),
    status: item.status,
  }));
  const conflicts: any[] = keys.length
    ? await db.dictionaryCandidate.findMany({ where: { OR: keys } })
    : [];
  const conflictIds = new Set(prepared.map((item) => String(item.candidate.id)));
  const conflictKeys = new Set(
    conflicts
      .filter((item) => !conflictIds.has(String(item.id)))
      .map((item) => `${item.termType}\u0000${item.normalizedRawValue}\u0000${item.status}`),
  );
  for (const item of prepared) {
    const key = `${item.targetTermType}\u0000${item.candidate.normalizedRawValue ?? normalizeText(item.candidate.rawValue)}\u0000${item.status}`;
    if (seen.has(key) || conflictKeys.has(key)) item.status = "merged";
    seen.add(key);
  }
  return prepared.filter((item) => !results[item.row.index].error);
}

async function batchUpdateCandidates(db: any, prepared: BatchPreparedReview[], reviewedBy?: string | null) {
  if (prepared.length === 0) return;
  const reviewedAt = new Date();
  const params: unknown[] = [];
  const values = prepared.map((item, index) => {
    const metadata = objectRecord(item.candidate.evidence);
    params.push(
      item.candidate.id,
      item.status,
      item.targetTermType,
      item.row.canonicalValue ?? item.candidate.proposedCanonicalValue,
      JSON.stringify(toJson({ ...metadata, candidateType: item.candidateType, reviewAction: item.action, reviewResult: item.result })),
      reviewedBy ?? null,
      reviewedAt,
    );
    const offset = index * 7;
    return `($${offset + 1}::bigint,$${offset + 2}::varchar,$${offset + 3}::varchar,$${offset + 4}::text,$${offset + 5}::jsonb,$${offset + 6}::text,$${offset + 7}::timestamp)`;
  });
  await db.$executeRawUnsafe(
    `
      UPDATE production_config_agent.dictionary_candidates AS candidate
      SET status = data.status,
          term_type = data.term_type,
          proposed_canonical_value = data.proposed_canonical_value,
          evidence = data.evidence,
          reviewed_by = data.reviewed_by,
          reviewed_at = data.reviewed_at,
          updated_at = now()
      FROM (VALUES ${values.join(",")}) AS data(id, status, term_type, proposed_canonical_value, evidence, reviewed_by, reviewed_at)
      WHERE candidate.id = data.id
    `,
    ...params,
  );
}

function batchUpdatedCandidate(item: BatchPreparedReview, reviewedBy?: string | null) {
  return {
    ...item.candidate,
    termType: item.targetTermType,
    status: item.status,
    proposedCanonicalValue: item.row.canonicalValue ?? item.candidate.proposedCanonicalValue,
    reviewedBy: reviewedBy ?? item.candidate.reviewedBy,
  };
}

async function afterBatchDictionaryReview(db: any, prepared: BatchPreparedReview[], reviewedBy?: string | null) {
  const affectedDocumentIds = uniqueNumbers(prepared.flatMap((item) => item.affectedDocumentIds));
  const version = await db.dictionaryVersion.upsert({
    where: { versionKey: "default" },
    create: { versionKey: "default", versionValue: 1, description: "ProductConfigAgent dictionary" },
    update: { versionValue: { increment: 1 } },
  });
  await db.dictionaryChangeLog.createMany({
    data: prepared
      .filter((item) => isDictionaryChangingReviewAction(item.action))
      .map((item) => ({
        dictionaryVersion: version.versionValue,
        source: "governance",
        versionKey: version.versionKey,
        versionValue: version.versionValue,
        action: item.action,
        candidateType: item.candidateType,
        candidateId: item.candidate.id,
        entityType: "candidate",
        entityId: String(item.candidate.id),
        beforeJson: toJson(item.candidate),
        afterJson: toJson({ candidate: batchUpdatedCandidate(item, reviewedBy), result: item.result }),
        beforeJsonb: toJson(item.candidate),
        afterJsonb: toJson({ candidate: batchUpdatedCandidate(item, reviewedBy), result: item.result }),
        createdBy: reviewedBy ?? undefined,
        changedBy: reviewedBy ?? undefined,
      })),
  });
  dictionaryMatcherService.invalidate();
  await markDocumentsDictionaryDirtyWithClient(db, affectedDocumentIds);
  return Number(version.versionValue);
}

async function markDocumentsDictionaryDirtyWithClient(db: any, documentIds: number[]) {
  if (documentIds.length === 0) return;
  await db.productDocument.updateMany({
    where: { id: { in: documentIds.map((id) => BigInt(id)) } },
    data: { dictionaryDirty: true },
  });
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      dictionaryVersion: version.versionValue,
      source: "governance",
      versionKey: version.versionKey,
      versionValue: version.versionValue,
      action,
      candidateType: entityType === "candidate" ? "value" : undefined,
      candidateId: entityType === "candidate" && entityId && /^\d+$/.test(entityId) ? BigInt(entityId) : undefined,
      entityType,
      entityId,
      beforeJson: before === undefined ? undefined : toJson(before),
      afterJson: after === undefined ? undefined : toJson(after),
      beforeJsonb: before === undefined ? undefined : toJson(before),
      afterJsonb: after === undefined ? undefined : toJson(after),
      createdBy: createdBy ?? undefined,
      changedBy: createdBy ?? undefined,
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
  return [
    "create-term-type",
    "approve-as-alias",
    "create-value",
    "move-to-term-type",
    "merge",
    "split",
    "split-suggest",
    "update-term-type-kind",
  ].includes(action);
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
