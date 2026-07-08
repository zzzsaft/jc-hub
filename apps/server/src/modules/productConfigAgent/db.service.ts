import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma.js";
import { dictionaryMatcherService, normalizeAlias } from "./dictionary/matcher.service.js";
import { calculateDocumentContentHash } from "./workflow/documentDuplicateAnalysis.js";
import { summarizeArchiveColumns } from "./archive/archiveFields.js";
import { isLikelyMultiValue } from "./dictionary/multiValue.js";
import { matchQualifierText } from "./dictionary/qualifierMatcher.js";
import { detectValueLikeFieldName } from "./dictionary/valueLikeFieldName.js";
import {
  addSemanticTriageStats,
  buildGovernancePriority,
  emptySemanticTriageStats,
  getSemanticTriage,
  runSemanticTriageForPendingCandidates,
  semanticGroupMatches,
  semanticRiskFromTags,
  semanticRiskMatches,
  semanticTagMatches,
  semanticTagsFromEvidence,
} from "./dictionary/candidateSemanticTriage.js";

export type ProductConfigDocumentInput = {
  fileName?: string;
  fileHash?: string;
  filePath: string;
  source?: string;
  status?: string;
};

export class PrismaProductConfigAgentRepository {
  async calculateFileSha256(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  async createDocument(data: ProductConfigDocumentInput) {
    const fileHash = data.fileHash ?? (await this.calculateFileSha256(data.filePath));
    const existing = await prisma.productDocument.findMany({
      where: { fileHash },
      orderBy: { id: "asc" },
    });
    const document = await prisma.productDocument.create({
      data: {
        fileName: data.fileName ?? path.basename(data.filePath),
        fileHash,
        filePath: data.filePath,
        source: data.source ?? "upload",
        status: data.status ?? "uploaded",
      },
    });
    for (const duplicate of existing) {
      await this.recordDuplicate(document.id, duplicate.id, "file_hash", 1, {
        fileHash,
        policy: "preserve_duplicate_document",
      });
    }
    return mapDocument(document);
  }

  async listDocuments(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where: any = {};
    const archiveStatusFilter =
      params?.status === "archived" || params?.status === "dictionary_dirty"
        ? params.status
        : undefined;
    if (params?.status && !archiveStatusFilter) where.status = params.status;
    const archiveDocumentIds = await this.findArchiveDocumentIdsForContractList({
      q: params?.q,
      productNumber: params?.productNumber,
      customerId: params?.customerId,
      status: archiveStatusFilter,
    });
    const requiresArchiveMatch = Boolean(
      params?.productNumber || params?.customerId || archiveStatusFilter,
    );
    if (requiresArchiveMatch && archiveDocumentIds.length === 0) {
      return { page, pageSize, total: 0, items: [] };
    }
    if (requiresArchiveMatch) {
      where.id = { in: archiveDocumentIds };
    }
    if (params?.q) {
      where.OR = [
        { fileName: { contains: params.q, mode: "insensitive" } },
        { fileHash: { contains: params.q, mode: "insensitive" } },
      ];
      if (archiveDocumentIds.length > 0) {
        where.OR.push({ id: { in: archiveDocumentIds } });
      }
    }
    const [items, total] = await Promise.all([
      prisma.productDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productDocument.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: await this.attachArchiveColumnsToDocuments(items.map(mapDocument)),
    };
  }

  async findDocumentById(documentId: number | string) {
    const document = await prisma.productDocument.findUnique({
      where: { id: BigInt(documentId) },
    });
    return document ? mapDocument(document) : null;
  }

  async findDocumentByHash(fileHash: string) {
    const document = await prisma.productDocument.findFirst({
      where: { fileHash },
      orderBy: { id: "asc" },
    });
    return document ? mapDocument(document) : null;
  }

  async updateDocumentStatus(documentId: number | string, status: string) {
    await prisma.productDocument.update({
      where: { id: BigInt(documentId) },
      data: { status },
    });
  }

  async markDocumentsDictionaryClean(documentIds: Array<number | string | bigint>) {
    const ids = [...new Set(documentIds.map((id) => BigInt(id)))];
    if (ids.length === 0) return { count: 0 };
    return prisma.productDocument.updateMany({
      where: { id: { in: ids } },
      data: { dictionaryDirty: false },
    });
  }

  async markDocumentsDictionaryDirty(documentIds: Array<number | string | bigint>) {
    const ids = [...new Set(documentIds.map((id) => BigInt(id)))];
    if (ids.length === 0) return { count: 0 };
    return prisma.productDocument.updateMany({
      where: { id: { in: ids } },
      data: { dictionaryDirty: true },
    });
  }

  async getSummary() {
    const [documents, extractions, archives, candidates, jobs] = await Promise.all([
      prisma.productDocument.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.extractionResult.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.contractArchive.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.dictionaryCandidate.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.backgroundJob.groupBy({ by: ["status"], _count: { status: true } }),
    ]);
    return { documents, extractions, archives, candidates, jobs };
  }

  async upsertBlocks(data: {
    documentId: number | string;
    blocksJson: unknown;
    parserVersion?: string;
  }) {
    const block = await prisma.documentBlock.upsert({
        where: { documentId: BigInt(data.documentId) },
        create: {
          documentId: BigInt(data.documentId),
          blocksJson: toJson(data.blocksJson),
          parserVersion: data.parserVersion ?? "manual",
        },
        update: {
          blocksJson: toJson(data.blocksJson),
          parserVersion: data.parserVersion ?? "manual",
        },
      });
    await this.recordContentDuplicates(data.documentId, data.blocksJson);
    return mapBlock(block);
  }

  async findBlocksByDocumentId(documentId: number | string) {
    const blocks = await prisma.documentBlock.findUnique({
      where: { documentId: BigInt(documentId) },
    });
    return blocks ? mapBlock(blocks) : null;
  }

  async createExtraction(data: {
    documentId: number | string;
    extractionJson: unknown;
    normalizedExtractionJson?: unknown;
    dictionaryProposals?: unknown;
    warnings?: unknown;
    llmPlanJson?: unknown;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    status?: string;
  }) {
    return mapExtraction(
      await prisma.extractionResult.create({
        data: {
          documentId: BigInt(data.documentId),
          extractionJson: toJson(data.extractionJson),
          normalizedExtractionJson:
            data.normalizedExtractionJson === undefined
              ? undefined
              : toJson(data.normalizedExtractionJson),
          dictionaryProposals:
            data.dictionaryProposals === undefined
              ? undefined
              : toJson(data.dictionaryProposals),
          warnings: data.warnings === undefined ? undefined : toJson(data.warnings),
          llmPlanJson: data.llmPlanJson === undefined ? undefined : toJson(data.llmPlanJson),
          llmModel: data.llmModel,
          promptVersion: data.promptVersion,
          dictionaryVersion:
            data.dictionaryVersion === undefined
              ? undefined
              : BigInt(data.dictionaryVersion),
          status: data.status ?? "created",
        },
      }),
    );
  }

  async findLatestExtractionByDocumentId(documentId: number | string) {
    const extraction = await prisma.extractionResult.findFirst({
      where: { documentId: BigInt(documentId) },
      orderBy: { createdAt: "desc" },
    });
    return extraction ? mapExtraction(extraction) : null;
  }

  async findExtractionById(extractionResultId: number | string) {
    const extraction = await prisma.extractionResult.findUnique({
      where: { id: BigInt(extractionResultId) },
    });
    return extraction ? mapExtraction(extraction) : null;
  }

  async listExtractions(params?: { page?: number; pageSize?: number; documentId?: string }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where = params?.documentId ? { documentId: BigInt(params.documentId) } : {};
    const [items, total] = await Promise.all([
      prisma.extractionResult.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.extractionResult.count({ where }),
    ]);
    return { page, pageSize, total, items: items.map(mapExtraction) };
  }

  async listTermTypes() {
    return prisma.dictionaryTermType.findMany({
      orderBy: [{ isActive: "desc" }, { termType: "asc" }],
    });
  }

  async upsertTermType(data: {
    termType: string;
    displayName?: string;
    kind?: string;
    metadata?: unknown;
  }) {
    const metadata = objectRecord(data.metadata);
    const valueKind = String(metadata.valueKind ?? data.kind ?? "enum");
    const result = await prisma.dictionaryTermType.upsert({
      where: { termType: data.termType },
      create: {
        termType: data.termType,
        displayName: data.displayName ?? data.termType,
        valueKind,
        applicableProductTypes: toJson(arrayStrings(metadata.applicableProductTypes).length ? arrayStrings(metadata.applicableProductTypes) : ["common"]),
        category: typeof metadata.category === "string" ? metadata.category : undefined,
        description: typeof metadata.description === "string" ? metadata.description : undefined,
        metadata: toJson(metadata),
      } as any,
      update: {
        displayName: data.displayName ?? data.termType,
        valueKind,
        applicableProductTypes: toJson(arrayStrings(metadata.applicableProductTypes).length ? arrayStrings(metadata.applicableProductTypes) : ["common"]),
        category: typeof metadata.category === "string" ? metadata.category : undefined,
        description: typeof metadata.description === "string" ? metadata.description : undefined,
        metadata: toJson(metadata),
      } as any,
    });
    await this.bumpDictionaryVersion("upsert_term_type", "term_type", String(result.id), result);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async updateTermType(id: string | number, data: {
    termType?: string;
    displayName?: string;
    kind?: string;
    metadata?: unknown;
    isActive?: boolean;
  }) {
    const before = await prisma.dictionaryTermType.findUnique({ where: { id: BigInt(id) } });
    if (!before) throw new Error(`Term type not found: ${id}`);
    const metadata = objectRecord(data.metadata);
    const nextMetadata = data.metadata === undefined
      ? undefined
      : { ...objectRecord((before as any).metadata), ...metadata };
    const result = await prisma.dictionaryTermType.update({
      where: { id: BigInt(id) },
      data: {
        termType: data.termType ?? undefined,
        displayName: data.displayName ?? undefined,
        valueKind: data.kind ?? (typeof metadata.valueKind === "string" ? metadata.valueKind : undefined),
        applicableProductTypes:
          data.metadata === undefined || arrayStrings(metadata.applicableProductTypes).length === 0
            ? undefined
            : toJson(arrayStrings(metadata.applicableProductTypes)),
        category: typeof metadata.category === "string" ? metadata.category : undefined,
        description: typeof metadata.description === "string" ? metadata.description : undefined,
        metadata: nextMetadata === undefined ? undefined : toJson(nextMetadata),
        isActive: data.isActive ?? undefined,
      } as any,
    });
    await this.bumpDictionaryVersion("update_term_type", "term_type", String(result.id), result, before);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async deleteTermType(id: string | number) {
    const before = await prisma.dictionaryTermType.findUnique({ where: { id: BigInt(id) } });
    if (!before) throw new Error(`Term type not found: ${id}`);
    const result = await prisma.dictionaryTermType.update({ where: { id: BigInt(id) }, data: { isActive: false } });
    await this.bumpDictionaryVersion("delete_term_type", "term_type", String(result.id), result, before);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async listValues(termType?: string) {
    return prisma.dictionaryTerm.findMany({
      where: termType ? { termType } : undefined,
      orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
    });
  }

  async upsertValue(data: {
    termType: string;
    canonicalValue: string;
    displayName?: string;
    metadata?: unknown;
  }) {
    const result = await prisma.dictionaryTerm.upsert({
      where: {
        termType_canonicalValue: {
          termType: data.termType,
          canonicalValue: data.canonicalValue,
        },
      },
      create: {
        termType: data.termType,
        canonicalValue: data.canonicalValue,
        displayName: data.displayName ?? data.canonicalValue,
      },
      update: {
        displayName: data.displayName ?? data.canonicalValue,
      },
    });
    await this.bumpDictionaryVersion("upsert_value", "value", String(result.id), result);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async updateValue(id: string | number, data: {
    canonicalValue?: string;
    displayName?: string | null;
    metadata?: unknown;
    isActive?: boolean;
  }) {
    const before = await prisma.dictionaryTerm.findUnique({ where: { id: BigInt(id) } });
    if (!before) throw new Error(`Dictionary value not found: ${id}`);
    const result = await prisma.dictionaryTerm.update({
      where: { id: BigInt(id) },
      data: {
        canonicalValue: data.canonicalValue ?? undefined,
        displayName: data.displayName === undefined ? undefined : data.displayName,
        isActive: data.isActive ?? undefined,
      },
    });
    await this.bumpDictionaryVersion("update_value", "value", String(result.id), result, before);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async deleteValue(id: string | number) {
    const before = await prisma.dictionaryTerm.findUnique({ where: { id: BigInt(id) } });
    if (!before) throw new Error(`Dictionary value not found: ${id}`);
    const result = await prisma.dictionaryTerm.update({ where: { id: BigInt(id) }, data: { isActive: false } });
    await this.bumpDictionaryVersion("delete_value", "value", String(result.id), result, before);
    dictionaryMatcherService.invalidate();
    return result;
  }

  async listUnitAliases() {
    return mapBigInts(await prisma.dictionaryUnitAlias.findMany({ orderBy: [{ canonicalUnit: "asc" }, { aliasValue: "asc" }] }));
  }

  async upsertUnitAlias(data: { canonicalUnit: string; displayUnit?: string | null; aliasValue: string; source?: string; note?: string | null }) {
    const result = await prisma.dictionaryUnitAlias.upsert({
      where: { normalizedAlias: normalizeAlias(data.aliasValue) },
      create: {
        canonicalUnit: data.canonicalUnit,
        displayUnit: data.displayUnit ?? data.canonicalUnit,
        aliasValue: data.aliasValue,
        normalizedAlias: normalizeAlias(data.aliasValue),
        source: data.source ?? "manual",
        note: data.note ?? undefined,
      },
      update: {
        canonicalUnit: data.canonicalUnit,
        displayUnit: data.displayUnit ?? data.canonicalUnit,
        aliasValue: data.aliasValue,
        source: data.source ?? "manual",
        note: data.note ?? undefined,
        isActive: true,
      },
    });
    await this.bumpDictionaryVersion("upsert_unit_alias", "unit_alias", String(result.id), result);
    dictionaryMatcherService.invalidate();
    return mapBigInts(result);
  }

  async deleteUnitAlias(id: string | number) {
    const result = await prisma.dictionaryUnitAlias.update({ where: { id: BigInt(id) }, data: { isActive: false } });
    await this.bumpDictionaryVersion("delete_unit_alias", "unit_alias", String(result.id), result);
    dictionaryMatcherService.invalidate();
    return mapBigInts(result);
  }

  async recordDuplicate(
    documentId: number | bigint | string,
    duplicateDocumentId: number | bigint | string,
    duplicateType = "file_hash",
    confidence = 1,
    metadata: unknown = {},
  ) {
    return mapBigInts(
      await prisma.documentDuplicate.upsert({
        where: {
          documentId_duplicateDocumentId_duplicateType: {
            documentId: BigInt(documentId),
            duplicateDocumentId: BigInt(duplicateDocumentId),
            duplicateType,
          },
        },
        create: {
          documentId: BigInt(documentId),
          duplicateDocumentId: BigInt(duplicateDocumentId),
          duplicateType,
          confidence,
          metadata: toJson(metadata),
        },
        update: { confidence, metadata: toJson(metadata) },
      }),
    );
  }

  async enqueueJob(data: {
    jobType: string;
    payloadJson?: unknown;
    priority?: number;
    runAfter?: Date;
    maxAttempts?: number;
  }) {
    return mapBigInts(
      await prisma.backgroundJob.create({
        data: {
          jobType: data.jobType,
          payloadJson: toJson(data.payloadJson ?? {}),
          priority: data.priority ?? 0,
          runAfter: data.runAfter ?? new Date(),
          maxAttempts: data.maxAttempts ?? 3,
        },
      }),
    );
  }

  async listJobs(params?: { jobType?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where: any = {};
    if (params?.jobType) where.jobType = params.jobType;
    if (params?.status) where.status = params.status;
    const [items, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.backgroundJob.count({ where }),
    ]);
    return { page, pageSize, total, items: items.map(mapBigInts) };
  }

  async getJob(jobId: string | number) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: BigInt(jobId) } });
    return job ? mapBigInts(job) : null;
  }

  async claimNextJob(jobTypes: string[], workerId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `with candidate as (
         select id
         from agent.background_jobs
         where job_type = any($1::text[])
           and (
             (status = 'queued' and run_after <= now())
             or (status = 'running' and locked_at < now() - interval '15 minutes')
           )
         order by priority desc, created_at asc
         for update skip locked
         limit 1
       )
       update agent.background_jobs job
       set status = 'running',
           attempts = attempts + 1,
           locked_by = $2,
           locked_at = now(),
           started_at = coalesce(started_at, now()),
           updated_at = now()
       from candidate
       where job.id = candidate.id
       returning job.*`,
      jobTypes,
      workerId,
    );
    return rows[0] ? mapBigInts(rows[0]) : null;
  }

  async updateJobProgress(jobId: number | string, progress: number, resultJson?: unknown) {
    return mapBigInts(
      await prisma.backgroundJob.update({
        where: { id: BigInt(jobId) },
        data: {
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          resultJson: resultJson === undefined ? undefined : toJson(resultJson),
        },
      }),
    );
  }

  async completeJob(jobId: number | string, resultJson?: unknown) {
    return mapBigInts(
      await prisma.backgroundJob.update({
        where: { id: BigInt(jobId) },
        data: {
          status: "completed",
          progress: 100,
          resultJson: resultJson === undefined ? undefined : toJson(resultJson),
          completedAt: new Date(),
          lockedBy: null,
          lockedAt: null,
        },
      }),
    );
  }

  async failJob(jobId: number | string, errorJson: unknown, retryAfterMs = 60_000) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: BigInt(jobId) } });
    if (!job) throw new Error(`Background job not found: ${jobId}`);
    const willRetry = job.attempts < job.maxAttempts;
    return mapBigInts(
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: willRetry ? "queued" : "failed",
          errorJson: toJson(errorJson),
          runAfter: willRetry ? new Date(Date.now() + retryAfterMs) : job.runAfter,
          completedAt: willRetry ? null : new Date(),
          lockedBy: null,
          lockedAt: null,
        },
      }),
    );
  }

  async recordContentDuplicates(documentId: number | bigint | string, blocksJson: unknown) {
    const contentHash = calculateDocumentContentHash(blocksJson);
    if (!contentHash) return [];
    const rows = await prisma.documentBlock.findMany({
      where: { documentId: { not: BigInt(documentId) } },
    });
    const duplicates = [];
    for (const row of rows as any[]) {
      if (calculateDocumentContentHash(row.blocksJson) !== contentHash) continue;
      duplicates.push(
        await this.recordDuplicate(documentId, row.documentId, "blocks_content_hash", 1, {
          contentHash,
        }),
      );
    }
    return duplicates;
  }

  async refreshDictionaryCandidates(params?: { documentId?: string | number; source?: string }) {
    const where = params?.documentId ? { documentId: BigInt(params.documentId) } : {};
    const [extractions, termTypes] = await Promise.all([
      prisma.extractionResult.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params?.documentId ? 20 : 500,
      }),
      prisma.dictionaryTermType.findMany({ where: { isActive: true } }),
    ]);
    const collectPolicy = buildCandidateCollectPolicy(termTypes);
    const seen = new Set<string>();
    const touchedCandidateIds = new Set<bigint>();
    let createdOrUpdated = 0;
    for (const extraction of extractions) {
      const values = collectCandidateValues(
        extraction.normalizedExtractionJson ?? extraction.extractionJson,
      ).filter((value) => shouldCollectCandidateValue(value, collectPolicy));
      for (const value of values) {
        if (value.candidateType === "unit") {
          await prisma.dictionaryUnitCandidate.upsert({
            where: {
              normalizedRawUnit_status: {
                normalizedRawUnit: normalizeAlias(value.rawValue),
                status: "pending",
              },
            },
            create: {
              documentId: extraction.documentId,
              extractionResultId: extraction.id,
              termType: value.termType,
              rawValue: value.rawValue,
              rawUnit: value.rawValue,
              normalizedRawUnit: normalizeAlias(value.rawValue),
              reason: value.reason,
              evidence: toJson({ firstFieldPath: value.fieldPath, context: value.context ?? {}, source: params?.source ?? "extraction" }),
            },
            update: {
              evidence: toJson({ firstFieldPath: value.fieldPath, context: value.context ?? {}, source: params?.source ?? "extraction" }),
              updatedAt: new Date(),
            },
          });
          createdOrUpdated += 1;
          continue;
        }
        const key = `${value.termType}\u0000${value.rawValue}\u0000${value.itemIndex ?? ""}\u0000${value.fieldPath}`;
        if (seen.has(`${extraction.id}:${key}`)) continue;
        seen.add(`${extraction.id}:${key}`);
        const candidate = await prisma.dictionaryCandidate.upsert({
          where: {
            termType_normalizedRawValue_status: {
              termType: value.termType,
              normalizedRawValue: normalizeCandidateText(value.rawValue),
              status: "pending",
            },
          },
          create: {
            documentId: extraction.documentId,
            extractionResultId: extraction.id,
            termType: value.termType,
            rawValue: value.rawValue,
            normalizedRawValue: normalizeCandidateText(value.rawValue),
            proposedCanonicalValue: value.rawValue,
            reason: value.reason,
            evidence: toJson({ firstFieldPath: value.fieldPath, candidateType: value.candidateType ?? "value", context: value.context ?? {}, source: params?.source ?? "extraction" }),
            confidence: value.score,
            sourceProductType: sourceProductTypeFromContext(value.context),
            itemIndex: value.itemIndex,
          },
          update: {
            evidence: toJson({ firstFieldPath: value.fieldPath, candidateType: value.candidateType ?? "value", context: value.context ?? {}, source: params?.source ?? "extraction" }),
            updatedAt: new Date(),
          },
        });
        touchedCandidateIds.add(candidate.id);
        const rawValueHash = hashCandidateComponent(normalizeCandidateRawValue(value.rawValue));
        const occurrenceHash = hashCandidateComponent(
          [String(candidate.id), String(extraction.id), String(value.itemIndex ?? ""), value.fieldPath, rawValueHash].join("\u0000"),
        );
        const occurrenceCreated = await createDictionaryCandidateOccurrenceOnce({
          candidateId: candidate.id,
          documentId: extraction.documentId,
          extractionResultId: extraction.id,
          itemIndex: value.itemIndex,
          fieldName: value.fieldPath,
          rawValue: value.rawValue,
          rawValueHash,
          occurrenceHash,
          context: value.context ?? {},
        });
        if (occurrenceCreated) {
          createdOrUpdated += 1;
        }
      }
      await prisma.productDocument.update({
        where: { id: extraction.documentId },
        data: { dictionaryDirty: false },
      });
    }
    if (touchedCandidateIds.size > 0) {
      try {
        await runSemanticTriageForPendingCandidates({ candidateIds: [...touchedCandidateIds] });
      } catch {
        // Semantic triage is review-only metadata and must not affect candidate refresh.
      }
    }
    return { scannedExtractions: extractions.length, createdOrUpdated };
  }

  async generateCandidatesForDocument(documentId: string | number, source = "manual_generate") {
    return this.refreshDictionaryCandidates({ documentId, source });
  }

  async listCandidates(params?: {
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
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where: any = {};
    if (params?.termType) where.termType = params.termType;
    if (params?.status) where.status = params.status;
    if (params?.q) {
      where.OR = [
        { rawValue: { contains: params.q, mode: "insensitive" } },
        { proposedCanonicalValue: { contains: params.q, mode: "insensitive" } },
      ];
    }
    const requiresDerivedQuery = Boolean(
      params?.semanticTag ||
        params?.semanticGroup ||
        params?.semanticRisk ||
        params?.sort === "governance_priority" ||
        params?.sort === "frequency",
    );
    if (!requiresDerivedQuery) {
      const [items, total] = await Promise.all([
        prisma.dictionaryCandidate.findMany({
          where,
          orderBy: [{ status: "asc" }, { confidence: "desc" }, { updatedAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.dictionaryCandidate.count({ where }),
      ]);
      const occurrenceCounts = await loadCandidateOccurrenceCounts(items.map((candidate) => candidate.id));
      return {
        page,
        pageSize,
        total,
        items: items.map((candidate) => mapBigInts(enrichCandidateGovernance(candidate, occurrenceCounts.get(String(candidate.id)) ?? 0))),
      };
    }

    const scanLimit = Math.min(2000, Math.max(500, page * pageSize * 4));
    const candidates = await prisma.dictionaryCandidate.findMany({
      where,
      orderBy: [{ status: "asc" }, { confidence: "desc" }, { updatedAt: "desc" }],
      take: scanLimit,
    });
    const occurrenceCounts = await loadCandidateOccurrenceCounts(candidates.map((candidate) => candidate.id));
    const enriched = candidates
      .map((candidate) => enrichCandidateGovernance(candidate, occurrenceCounts.get(String(candidate.id)) ?? 0))
      .filter((candidate) => candidateMatchesSemanticFilters(candidate, params));
    sortGovernanceItems(enriched, params?.sort);
    const total = enriched.length;
    const items = enriched.slice((page - 1) * pageSize, page * pageSize).map(mapBigInts);
    return { page, pageSize, total, items };
  }

  async reviewCandidate(data: {
    candidateId: string | number;
    action: "approve" | "reject" | "merge";
    canonicalValue?: string;
    reviewedBy?: string | null;
  }) {
    const candidate = await prisma.dictionaryCandidate.findUnique({
      where: { id: BigInt(data.candidateId) },
    });
    if (!candidate) throw new Error(`Candidate not found: ${data.candidateId}`);
    if (data.action === "approve" || data.action === "merge") {
      await this.upsertValue({
        termType: candidate.termType,
        canonicalValue: data.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue,
        displayName: data.canonicalValue ?? candidate.proposedCanonicalValue ?? candidate.rawValue,
        metadata: {
          candidateId: Number(candidate.id),
          sourceRawValue: candidate.rawValue,
        },
      });
    }
    return mapBigInts(
      await prisma.dictionaryCandidate.update({
        where: { id: candidate.id },
        data: {
          status:
            data.action === "reject"
              ? "rejected"
              : data.action === "merge"
                ? "merged"
                : "approved",
        proposedCanonicalValue: data.canonicalValue ?? candidate.proposedCanonicalValue,
          reviewedBy: data.reviewedBy ?? undefined,
          reviewedAt: new Date(),
        },
      }),
    );
  }

  async createHealthReport(createdBy?: string | null) {
    const [termTypes, activeTerms, candidates, aliases, termTypeAliases, splitSuggestions, pendingValueCandidates, valueKindRows] = await Promise.all([
      prisma.dictionaryTermType.findMany(),
      prisma.dictionaryTerm.findMany({ where: { isActive: true } }),
      prisma.dictionaryCandidate.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.dictionaryAlias.findMany({ where: { isActive: true } }),
      prisma.dictionaryTermTypeAlias.findMany({ where: { isActive: true } }),
      prisma.dictionaryValueSplitSuggestion.findMany({ take: 50, orderBy: { updatedAt: "desc" } }),
      prisma.dictionaryCandidate.findMany({
        where: { status: "pending" },
        orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
        take: 200,
      }),
      prisma.dictionaryTermType.findMany({ where: { isActive: true } }),
    ]);
    const termTypeCount = termTypes.length;
    const pendingCandidates = candidates.find((item) => item.status === "pending")?._count.status ?? 0;
    const findings: Array<Record<string, unknown>> = [];
    const riskLabelCounts: Record<string, number> = {};
    if (termTypeCount === 0) findings.push({ severity: "warning", type: "empty_dictionary", message: "No dictionary term types" });
    if (pendingCandidates > 0) {
      findings.push({
        severity: "info",
        type: "pending_candidate_pressure",
        message: "Pending dictionary candidates need review",
        count: pendingCandidates,
        samples: pendingValueCandidates.slice(0, 10).map((candidate) => ({
          candidateId: Number(candidate.id),
          termType: candidate.termType,
          rawValue: candidate.rawValue,
          score: Number(candidate.confidence ?? 0),
          occurrenceCount: 0,
        })),
      });
    }
    for (const finding of detectDuplicateAliases(aliases, termTypeAliases)) findings.push(finding);
    const valueKindByTermType = new Map(valueKindRows.map((item) => [item.termType, dictionaryValueKind(item)]));
    const nonEnumValueCandidates = pendingValueCandidates.filter((candidate) => {
      const metadata = objectRecord(candidate.evidence);
      const candidateType = String(metadata.candidateType ?? inferCandidateType(candidate.termType));
      const valueKind = valueKindByTermType.get(candidate.termType) ?? "text";
      return candidateType === "value" && !["enum", "enums"].includes(valueKind);
    });
    if (nonEnumValueCandidates.length > 0) {
      findings.push({
        severity: "warning",
        type: "non_enum_value_candidate",
        message: "Pending value candidates target non-enum term types",
        count: nonEnumValueCandidates.length,
        samples: nonEnumValueCandidates.slice(0, 10).map((candidate) => ({
          candidateId: Number(candidate.id),
          termType: candidate.termType,
          rawValue: candidate.rawValue,
          valueKind: valueKindByTermType.get(candidate.termType) ?? "text",
        })),
      });
    }
    const valueLikeFieldCandidates = pendingValueCandidates
      .filter((candidate) => {
        const metadata = objectRecord(candidate.evidence);
        const candidateType = String(metadata.candidateType ?? inferCandidateType(candidate.termType));
        return candidateType === "term_type" && detectValueLikeFieldName(candidate.rawValue);
      })
      .slice(0, 20);
    if (valueLikeFieldCandidates.length > 0) {
      findings.push({
        severity: "warning",
        type: "value_like_field_name",
        message: "Some pending field-name candidates look like values and need concept review",
        count: valueLikeFieldCandidates.length,
        samples: valueLikeFieldCandidates.slice(0, 10).map((candidate) => ({
          candidateId: Number(candidate.id),
          termType: candidate.termType,
          rawValue: candidate.rawValue,
        })),
      });
    }
    const multiValueCandidates = pendingValueCandidates
      .filter((candidate) => isLikelyMultiValue(candidate.rawValue))
      .slice(0, 20);
    if (multiValueCandidates.length > 0) {
      findings.push({
        severity: "info",
        type: "multi_value_candidate",
        message: "Some pending values contain multiple business values and may need split review",
        count: multiValueCandidates.length,
        samples: multiValueCandidates.slice(0, 10).map((candidate) => ({
          candidateId: Number(candidate.id),
          termType: candidate.termType,
          rawValue: candidate.rawValue,
        })),
      });
    }
    const qualifierCandidates = pendingValueCandidates
      .map((candidate) => ({ candidate, qualifier: matchQualifierText(candidate.rawValue) }))
      .filter((item) => item.qualifier)
      .slice(0, 20);
    if (qualifierCandidates.length > 0) {
      findings.push({
        severity: "info",
        type: "qualifier_variant_candidate",
        message: "Some pending values include qualifier terms and may be variants of an existing concept",
        count: qualifierCandidates.length,
        samples: qualifierCandidates.slice(0, 10).map(({ candidate, qualifier }) => ({
          candidateId: Number(candidate.id),
          termType: candidate.termType,
          rawValue: candidate.rawValue,
          qualifier,
        })),
      });
    }
    const semanticTriageStats = emptySemanticTriageStats();
    for (const candidate of pendingValueCandidates) addSemanticTriageStats(semanticTriageStats, getSemanticTriage(candidate.evidence));
    if (
      semanticTriageStats.qualifier > 0 ||
      semanticTriageStats.composite > 0 ||
      semanticTriageStats.materialApplication > 0 ||
      semanticTriageStats.noiseDocumentNote > 0
    ) {
      findings.push({
        severity: "info",
        type: "semantic_triage_summary",
        message: "Phase 2 semantic triage labels are present on pending candidates",
        stats: semanticTriageStats,
      });
    }
    if (splitSuggestions.length > 0) {
      findings.push({
        severity: "info",
        type: "split_suggestion",
        message: "Pending dictionary split suggestions need audit",
        count: splitSuggestions.length,
        samples: splitSuggestions.slice(0, 10).map((split) => ({
          id: Number(split.id),
          termType: split.termType,
          sourceValue: split.rawValue,
          parts: split.suggestions,
        })),
      });
    }
    for (const alias of aliases) {
      for (const label of arrayStrings(alias.baselineRiskLabels)) {
        riskLabelCounts[label] = (riskLabelCounts[label] ?? 0) + 1;
      }
    }
    if (Object.keys(riskLabelCounts).length > 0) {
      findings.push({
        severity: "info",
        type: "risk_label_summary",
        message: "Dictionary alias risk labels are present",
        riskLabelCounts,
      });
    }
    const summary = {
      termTypes: termTypeCount,
      activeTerms: activeTerms.length,
      candidates,
      pendingCandidates,
      findingCount: findings.length,
      riskLabelCounts,
      semanticTriageStats,
    };
    const report = mapBigInts(
      await prisma.dictionaryHealthReport.create({
        data: {
          reportType: "dictionary",
          status: findings.some((finding) => finding.severity === "warning") ? "attention" : findings.length ? "review" : "healthy",
          summaryJson: toJson(summary),
          findingsJson: toJson(findings),
          createdBy: createdBy ?? undefined,
        },
      }),
    );
    return { report, summary, findings };
  }

  async listHealthReports(params?: { page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where = params?.status ? { status: params.status } : {};
    const [items, total] = await Promise.all([
      prisma.dictionaryHealthReport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.dictionaryHealthReport.count({ where }),
    ]);
    return { page, pageSize, total, items: items.map(mapBigInts) };
  }

  async listUnitCandidates(params?: { status?: string }) {
    return mapBigInts(
      await prisma.dictionaryUnitCandidate.findMany({
        where: params?.status ? { status: params.status } : undefined,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
    );
  }

  async approveUnitCandidate(params: { candidateId: string | number; canonicalUnit?: string; reviewedBy?: string | null }) {
    const candidate = await prisma.dictionaryUnitCandidate.findUnique({ where: { id: BigInt(params.candidateId) } });
    if (!candidate) throw new Error(`Unit candidate not found: ${params.candidateId}`);
    await this.upsertUnitAlias({
      canonicalUnit: params.canonicalUnit ?? candidate.proposedCanonicalUnit ?? candidate.rawUnit,
      aliasValue: candidate.rawUnit,
      source: "candidate_review",
    });
    return mapBigInts(
      await prisma.dictionaryUnitCandidate.update({
        where: { id: candidate.id },
        data: { status: "approved", proposedCanonicalUnit: params.canonicalUnit ?? candidate.proposedCanonicalUnit ?? candidate.rawUnit, reviewedBy: params.reviewedBy ?? undefined, reviewedAt: new Date() },
      }),
    );
  }

  async rejectUnitCandidate(params: { candidateId: string | number; reviewedBy?: string | null }) {
    return mapBigInts(
      await prisma.dictionaryUnitCandidate.update({
        where: { id: BigInt(params.candidateId) },
        data: { status: "rejected", reviewedBy: params.reviewedBy ?? undefined, reviewedAt: new Date() },
      }),
    );
  }

  async getLlmSummary() {
    const rows = await prisma.extractionResult.groupBy({
      by: ["llmModel", "promptVersion", "status"],
      _count: { status: true },
    });
    return { items: rows.map(mapBigInts) };
  }

  async getLlmDictionaryContext() {
    return dictionaryMatcherService.getLlmDictionaryContext();
  }

  async bumpDictionaryVersion(action: string, entityType: string, entityId?: string, after?: unknown, before?: unknown, createdBy?: string | null) {
    const version = await prisma.dictionaryVersion.upsert({
      where: { versionKey: "default" },
      create: { versionKey: "default", versionValue: 1, description: "ProductConfigAgent dictionary" },
      update: { versionValue: { increment: 1 } },
    });
    await prisma.dictionaryChangeLog.create({
      data: {
        dictionaryVersion: version.versionValue,
        source: "repository",
        versionKey: version.versionKey,
        versionValue: version.versionValue,
        action,
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
    return mapBigInts(version);
  }

  async listArchives(params?: {
    q?: string;
    status?: string;
    productNumber?: string;
    customerId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.q) {
      where.OR = [
        { title: { contains: params.q, mode: "insensitive" } },
        { archiveKey: { contains: params.q, mode: "insensitive" } },
        { productNumber: { contains: params.q, mode: "insensitive" } },
        { customerId: { contains: params.q, mode: "insensitive" } },
        { contractNumber: { contains: params.q, mode: "insensitive" } },
        { orderNumber: { contains: params.q, mode: "insensitive" } },
      ];
    }
    if (params?.productNumber) {
      where.productNumber = { contains: params.productNumber, mode: "insensitive" };
    }
    if (params?.customerId) {
      where.customerId = { contains: params.customerId, mode: "insensitive" };
    }
    const [items, total] = await Promise.all([
      prisma.contractArchive.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contractArchive.count({ where }),
    ]);
    return { page, pageSize, total, items: items.map(mapArchiveListItem) };
  }

  async upsertArchive(data: {
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
    const existingArchive = data.archiveKey || data.documentId === null || data.documentId === undefined
      ? null
      : await prisma.contractArchive.findFirst({
          where: { documentId: BigInt(data.documentId) },
          orderBy: { id: "asc" },
        });
    const archiveKey =
      data.archiveKey ??
      existingArchive?.archiveKey ??
      `doc-${data.documentId ?? "manual"}-${normalizeCandidateText(data.title).slice(0, 80)}`;
    const columns = summarizeArchiveColumns(extractNormalizedExtraction(data.archiveJson));
    const metadata = {
      ...(data.metadata && typeof data.metadata === "object" ? data.metadata : {}),
      productNumber: columns.productNumber,
      customerId: columns.customerId,
      contractNumber: columns.contractNumber,
      orderNumber: columns.orderNumber,
      docInfo: columns.docInfo,
    };
    return mapBigInts(
      await prisma.contractArchive.upsert({
        where: { archiveKey },
        create: {
          archiveKey,
          documentId: data.documentId === null || data.documentId === undefined ? undefined : BigInt(data.documentId),
          extractionResultId: data.extractionResultId === null || data.extractionResultId === undefined ? undefined : BigInt(data.extractionResultId),
          title: data.title,
          status: data.status ?? "archived",
          productNumber: columns.productNumber,
          contractNumber: columns.contractNumber,
          orderNumber: columns.orderNumber,
          customerId: columns.customerId,
          country: columns.country,
          orderDate: columns.orderDate,
          deliveryDate: columns.deliveryDate,
          docInfoJson: toJson(columns.docInfo),
          archiveJson: toJson(data.archiveJson ?? {}),
          productBindings: toJson(data.productBindings ?? []),
          metadata: toJson(metadata),
          createdBy: data.createdBy ?? undefined,
        },
        update: {
          title: data.title,
          extractionResultId: data.extractionResultId === null || data.extractionResultId === undefined ? undefined : BigInt(data.extractionResultId),
          status: data.status ?? undefined,
          productNumber: columns.productNumber,
          contractNumber: columns.contractNumber,
          orderNumber: columns.orderNumber,
          customerId: columns.customerId,
          country: columns.country,
          orderDate: columns.orderDate,
          deliveryDate: columns.deliveryDate,
          docInfoJson: toJson(columns.docInfo),
          archiveJson: toJson(data.archiveJson ?? {}),
          productBindings: toJson(data.productBindings ?? []),
          metadata: toJson(metadata),
          version: { increment: 1 },
        },
      }),
    );
  }

  private async findArchiveDocumentIdsForContractList(params: {
    q?: string;
    productNumber?: string;
    customerId?: string;
    status?: string;
  }): Promise<bigint[]> {
    if (!params.q && !params.productNumber && !params.customerId && !params.status) {
      return [];
    }
    const where: any = { documentId: { not: null } };
    if (params.status) where.status = params.status;
    if (params.productNumber) {
      where.productNumber = { contains: params.productNumber, mode: "insensitive" };
    }
    if (params.customerId) {
      where.customerId = { contains: params.customerId, mode: "insensitive" };
    }
    if (params.q) {
      where.OR = [
        { productNumber: { contains: params.q, mode: "insensitive" } },
        { customerId: { contains: params.q, mode: "insensitive" } },
        { contractNumber: { contains: params.q, mode: "insensitive" } },
        { orderNumber: { contains: params.q, mode: "insensitive" } },
        { title: { contains: params.q, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.contractArchive.findMany({
      where,
      select: { documentId: true },
      take: 1000,
    });
    return [...new Set(rows.map((row) => row.documentId).filter((id): id is bigint => id !== null))];
  }

  private async attachArchiveColumnsToDocuments(documents: any[]) {
    if (documents.length === 0) return documents;
    const archives = await prisma.contractArchive.findMany({
      where: { documentId: { in: documents.map((document) => BigInt(document.id)) } },
      orderBy: { updatedAt: "desc" },
    });
    const latestByDocumentId = new Map<string, any>();
    for (const archive of archives) {
      const key = String(archive.documentId);
      if (!latestByDocumentId.has(key)) latestByDocumentId.set(key, mapArchiveListItem(archive));
    }
    return documents.map((document) => {
      const archive = latestByDocumentId.get(String(document.id));
      return archive
        ? {
            ...document,
            archiveId: archive.id,
            extractionResultId: archive.extractionResultId,
            archiveStatus: archive.status,
            productNumber: archive.productNumber,
            contractNumber: archive.contractNumber,
            orderNumber: archive.orderNumber,
            customerId: archive.customerId,
            docInfo: archive.docInfo,
            currentVersion: archive.currentVersion,
            archiveUpdatedAt: archive.updatedAt,
          }
        : document;
    });
  }

  async searchProductConfigs(params?: { q?: string; termType?: string; page?: number; pageSize?: number }) {
    const [documents, archives, terms] = await Promise.all([
      this.listDocuments({ q: params?.q, page: params?.page, pageSize: params?.pageSize }),
      this.listArchives({ q: params?.q, page: params?.page, pageSize: params?.pageSize }),
      this.listValues(params?.termType),
    ]);
    return {
      documents: documents.items,
      archives: archives.items,
      dictionaryValues: params?.q
        ? terms.filter((term: any) =>
            `${term.canonicalValue ?? ""} ${term.displayName ?? ""}`
              .toLowerCase()
              .includes(params.q!.toLowerCase()),
          )
        : terms,
      total: documents.total + archives.total,
    };
  }
}

export const productConfigAgentRepository = new PrismaProductConfigAgentRepository();

async function loadCandidateOccurrenceCounts(candidateIds: bigint[]): Promise<Map<string, number>> {
  if (candidateIds.length === 0) return new Map();
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
    where: { candidateId: { in: candidateIds } },
    select: { candidateId: true },
  });
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) {
    const key = String(occurrence.candidateId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function enrichCandidateGovernance(candidate: any, occurrenceCount: number) {
  const semanticTriage = getSemanticTriage(candidate.evidence);
  const semanticTags = semanticTagsFromEvidence(candidate.evidence);
  const semanticRisk = semanticRiskFromTags(semanticTags);
  return {
    ...candidate,
    semanticTriage,
    semanticTags,
    semanticRisk,
    occurrenceCount,
    governancePriorityScore: buildGovernancePriority({
      tags: semanticTags,
      occurrenceCount,
      confidence: candidate.confidence,
    }),
  };
}

function candidateMatchesSemanticFilters(candidate: any, params?: {
  semanticTag?: string;
  semanticGroup?: string;
  semanticRisk?: string;
}) {
  return (
    semanticTagMatches(candidate.semanticTags ?? [], params?.semanticTag) &&
    semanticGroupMatches(candidate.semanticTags ?? [], params?.semanticGroup) &&
    semanticRiskMatches(candidate.semanticTags ?? [], params?.semanticRisk)
  );
}

function sortGovernanceItems(items: any[], sort?: string) {
  if (sort === "governance_priority") {
    items.sort((a, b) => {
      const priorityDelta = Number(b.governancePriorityScore ?? 0) - Number(a.governancePriorityScore ?? 0);
      if (priorityDelta) return priorityDelta;
      return timeValue(b.updatedAt) - timeValue(a.updatedAt);
    });
  } else if (sort === "frequency") {
    items.sort((a, b) => {
      const occurrenceDelta = Number(b.occurrenceCount ?? 0) - Number(a.occurrenceCount ?? 0);
      if (occurrenceDelta) return occurrenceDelta;
      const priorityDelta = Number(b.governancePriorityScore ?? 0) - Number(a.governancePriorityScore ?? 0);
      if (priorityDelta) return priorityDelta;
      return timeValue(b.updatedAt) - timeValue(a.updatedAt);
    });
  }
}

function timeValue(value: unknown): number {
  const time = value instanceof Date ? value.getTime() : new Date(String(value ?? 0)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mapDocument(document: any) {
  return {
    ...document,
    id: Number(document.id),
  };
}

function mapBlock(block: any) {
  return {
    ...block,
    id: Number(block.id),
    documentId: Number(block.documentId),
    blocksJson: block.blocksJson,
  };
}

function mapExtraction(extraction: any) {
  return {
    ...extraction,
    id: Number(extraction.id),
    documentId: Number(extraction.documentId),
    dictionaryVersion:
      extraction.dictionaryVersion === null || extraction.dictionaryVersion === undefined
        ? extraction.dictionaryVersion
        : Number(extraction.dictionaryVersion),
  };
}

function mapArchiveListItem(archive: any) {
  const mapped = mapBigInts(archive);
  return {
    ...mapped,
    currentVersion: mapped.version,
    docInfo: mapped.docInfoJson ?? {},
    boundItemCount: mapped.boundItemCount ?? 0,
  };
}

function extractNormalizedExtraction(archiveJson: unknown): unknown {
  const root = archiveJson && typeof archiveJson === "object" ? (archiveJson as any) : {};
  return root.extraction?.normalizedExtractionJson ?? root.normalizedExtractionJson ?? root;
}

function toJson(value: unknown): any {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)));
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function dictionaryValueKind(termType: { valueKind?: string | null }) {
  return String(termType.valueKind ?? "text");
}

function inferCandidateType(termType: string): "term_type" | "value" | "unit" {
  if (termType === "unit" || termType.endsWith("_unit")) return "unit";
  if (termType === "field" || termType === "term_type" || termType.startsWith("unknown_field")) return "term_type";
  return "value";
}

function detectDuplicateAliases(aliases: any[], termTypeAliases: any[]) {
  const findings: Array<Record<string, unknown>> = [];
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const alias of aliases) {
    const normalized = String(alias.normalizedAlias ?? "").trim();
    if (!normalized) continue;
    grouped.set(normalized, [
      ...(grouped.get(normalized) ?? []),
      {
        aliasKind: "value",
        aliasId: Number(alias.id),
        termType: alias.termType,
        termId: Number(alias.termId),
        aliasValue: alias.aliasValue,
      },
    ]);
  }
  for (const alias of termTypeAliases) {
    const normalized = String(alias.normalizedAlias ?? "").trim();
    if (!normalized) continue;
    grouped.set(normalized, [
      ...(grouped.get(normalized) ?? []),
      {
        aliasKind: "term_type",
        aliasId: Number(alias.id),
        termType: alias.termType,
        aliasValue: alias.aliasValue,
      },
    ]);
  }
  const collisions = [...grouped.entries()]
    .filter(([, items]) => new Set(items.map((item) => `${item.aliasKind}:${item.termType}:${item.termId ?? ""}`)).size > 1)
    .slice(0, 20);
  if (collisions.length > 0) {
    findings.push({
      severity: "warning",
      type: "duplicate_alias",
      message: "Alias text maps to multiple dictionary targets",
      count: collisions.length,
      samples: collisions.map(([normalizedAlias, items]) => ({ normalizedAlias, items })),
    });
  }
  return findings;
}

function normalizeCandidateText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

type CandidateCollectValue = {
  candidateType?: string;
  termType: string;
  rawValue: string;
  fieldPath: string;
  itemIndex?: number;
  score: number;
  reason?: string;
  context?: unknown;
};

type CandidateCollectPolicy = Map<string, { valueKind: string; collectCandidates: boolean }>;

function collectCandidateValues(value: unknown, fieldPath = "$"): Array<{
  candidateType?: string;
  termType: string;
  rawValue: string;
  fieldPath: string;
  itemIndex?: number;
  score: number;
  reason?: string;
  context?: unknown;
}> {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return collectProposalCandidateValues(record, fieldPath);
}

function collectProposalCandidateValues(record: Record<string, unknown>, fieldPath: string) {
  const proposalsRoot = record.dictionaryProposals;
  const proposals = Array.isArray((proposalsRoot as any)?.proposals)
    ? (proposalsRoot as any).proposals
    : [];
  return proposals
    .map((proposal: any, index: number) => ({
      candidateType: String(proposal.candidateType ?? "value"),
      termType: String(proposal.termType ?? "unknown"),
      rawValue: String(proposal.rawValue ?? "").trim(),
      fieldPath: String(proposal.fieldPath ?? `${fieldPath}.dictionaryProposals.proposals[${index}]`),
      itemIndex: Number.isFinite(Number(proposal.itemIndex ?? proposal.item_index)) ? Number(proposal.itemIndex ?? proposal.item_index) : undefined,
      score: scoreForReason(String(proposal.reason ?? "")),
      reason: String(proposal.reason ?? "normalization_proposal"),
      context: proposal,
    }))
    .filter((proposal: { rawValue: string; termType: string }) => proposal.rawValue.length >= 1 && proposal.termType);
}

function scoreForReason(reason: string): number {
  if (reason.includes("missing_field")) return 0.8;
  if (reason.includes("missing_unit")) return 0.7;
  if (reason.includes("missing_value")) return 0.65;
  return 0.5;
}

function buildCandidateCollectPolicy(termTypes: Array<{ termType: string; valueKind?: string | null }>): CandidateCollectPolicy {
  return new Map(
    termTypes.map((termType) => {
      return [
        termType.termType,
        {
          valueKind: String(termType.valueKind ?? "text"),
          collectCandidates: false,
        },
      ];
    }),
  );
}

function shouldCollectCandidateValue(value: CandidateCollectValue, policy: CandidateCollectPolicy): boolean {
  const candidateType = value.candidateType ?? "value";
  if (candidateType === "unit") return true;
  if (candidateType === "term_type") return true;
  if (candidateType !== "value") return false;
  if (isDocumentInfoCandidate(value)) return false;
  if (isNoisyValueCandidate(value)) return false;
  const termPolicy = policy.get(value.termType);
  const valueKind = termPolicy?.valueKind ?? "text";
  if (valueKind === "enum" || valueKind === "enums") return true;
  return valueKind === "text" && termPolicy?.collectCandidates === true;
}

function isNoisyValueCandidate(value: CandidateCollectValue): boolean {
  const rawValue = value.rawValue.trim();
  const normalized = rawValue.toLowerCase();
  if (!rawValue) return true;
  if (["at", "hz", "v", "kg", "min", "mfi"].includes(normalized)) return true;
  if (/^[0-9.\-~～至到\s]+(?:°c|℃|kg|g|mm|cm|m|min|hz|v)?$/iu.test(rawValue)) return true;
  if (value.termType === "plastic_material" && /(?:\bmfi|\bat\s*\d|g\s*\/?\s*10\s*min|°c|℃)/iu.test(rawValue)) return true;
  if (/(?:提供图纸日期|图纸接收人签名|^\s*国家\s*[（(])/u.test(rawValue)) return true;
  return false;
}

function isDocumentInfoCandidate(value: CandidateCollectValue): boolean {
  const text = [
    value.termType,
    value.rawValue,
    value.fieldPath,
    JSON.stringify(value.context ?? {}),
  ].join(" ");
  return /(document_info|客户|合同|订单|图纸|日期|交期|备注|说明|产品名称|产品规格|规格)/iu.test(text);
}

function normalizeCandidateRawValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashCandidateComponent(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function createDictionaryCandidateOccurrenceOnce(params: {
  candidateId: bigint;
  documentId: bigint;
  extractionResultId: bigint;
  itemIndex?: number;
  fieldName?: string | null;
  rawValue: string;
  rawValueHash: string;
  occurrenceHash: string;
  context: unknown;
}): Promise<boolean> {
  const itemIndex = params.itemIndex ?? 0;
  const fieldName = params.fieldName ?? "$";
  const existing = await prisma.dictionaryCandidateOccurrence.findFirst({
    where: {
      OR: [
        { occurrenceHash: params.occurrenceHash },
        {
          candidateType: "value",
          candidateId: params.candidateId,
          extractionResultId: params.extractionResultId,
          itemIndex,
          fieldName,
        },
      ],
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.dictionaryCandidateOccurrence.create({
    data: {
      candidateType: "value",
      candidateId: params.candidateId,
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex,
      fieldName,
      rawValue: params.rawValue,
      rawValueHash: params.rawValueHash,
      occurrenceHash: params.occurrenceHash,
      evidence: toJson(params.context ?? {}),
      sourceProductType: sourceProductTypeFromContext(params.context),
    },
  });
  return true;
}

function sourceProductTypeFromContext(context: unknown): string {
  const record = objectRecord(context);
  const direct = record.sourceProductType ?? record.productTypeHint ?? record.itemProductTypeHint;
  return typeof direct === "string" && direct.trim() ? direct.trim() : "unknown";
}
