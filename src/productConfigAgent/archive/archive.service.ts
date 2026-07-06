import { prisma } from "../../lib/prisma.js";
import {
  firstFieldValue,
  normalizeDocInfo,
  summarizeArchiveColumns,
  summarizeArchiveItems,
} from "./archiveFields.js";
import {
  assertAllowedArchivePatchChanges,
  assertAllowedArchivePatchChangesAgainstSnapshot,
  collapseArchivePatchArrayChanges,
  writePath,
} from "./jsonPatch.js";
import {
  buildAgentReadyInsertGate,
  getGateItemResult,
  type InsertGateResult,
} from "./insertGate.js";

export type ContractArchivePatchChange = {
  path: string;
  value: unknown;
};

export class ContractArchiveService {
  async checkArchiveReadiness(documentId: string | number) {
    const [document, blocks, extraction] = await Promise.all([
      prisma.productDocument.findUnique({ where: { id: BigInt(documentId) } }),
      prisma.documentBlock.findUnique({ where: { documentId: BigInt(documentId) } }),
      prisma.extractionResult.findFirst({
        where: { documentId: BigInt(documentId), status: "normalized" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const blockers: Array<{ type: string; message: string; details?: Record<string, unknown> }> = [];
    const warnings: Array<{ type: string; message: string; details?: Record<string, unknown> }> = [];
    if (!document) blockers.push({ type: "document_missing", message: "Document not found" });
    if (!blocks) warnings.push({ type: "blocks_missing", message: "Document blocks are missing; archive readiness is based on extraction only" });
    if (!extraction) {
      blockers.push({
        type: "normalized_extraction_not_found",
        message: "没有找到 items 非空的 normalized extraction",
      });
    }
    const normalized = extraction?.normalizedExtractionJson as any;
    const items = Array.isArray(normalized?.items) ? normalized.items : [];
    const candidateCounts = extraction
      ? await countPendingCandidatesForExtraction(extraction.id, extraction.dictionaryProposals, normalized)
      : { termTypeCandidateCount: 0, valueCandidateCount: 0 };
    const gate = extraction
      ? buildAgentReadyInsertGate({
          normalizedExtractionJson: normalized,
          dictionaryProposals: extraction.dictionaryProposals,
        })
      : null;
    if (gate && !gate.insertability.canInsert) {
      blockers.push(
        ...gate.insertability.blockingReasons.map((blocker) => ({
          type: blocker.type,
          message: blocker.message,
          details: { ...blocker.details, itemIndex: blocker.itemIndex },
        })),
      );
    }
    const { docInfo, source: docInfoSource } = getDocInfoWithSource(extraction);
    const productNumber = firstFieldValue(docInfo, "product_number", "die_number", "contract_number");
    if (candidateCounts.termTypeCandidateCount > 0) {
      warnings.push({
        type: "term_type_candidates",
        message: "存在字段名候选，归档后会保留为 unresolvedFields，不阻塞入库",
        details: { termTypeCandidateCount: candidateCounts.termTypeCandidateCount },
      });
    }
    if (candidateCounts.valueCandidateCount > 0) {
      warnings.push({
        type: "value_candidates",
        message: "存在值候选，归档后仍需在候选审核中处理",
        details: { valueCandidateCount: candidateCounts.valueCandidateCount },
      });
    }
    if (gate) {
      warnings.push(
        ...gate.insertability.warnings.map((warning) => ({
          type: warning.type,
          message: warning.message,
          details: { ...warning.details, itemIndex: warning.itemIndex },
        })),
      );
    }
    if (docInfoSource === "llm_plan_json") {
      warnings.push({ type: "doc_info_from_plan", message: "docInfo 来自 llm_plan_json.document_info" });
    }
    if (docInfoSource === "none") {
      warnings.push({ type: "missing_doc_info", message: "没有可用 docInfo，归档后需人工补录" });
    }
    return {
      documentId: Number(documentId),
      extractionResultId: extraction ? Number(extraction.id) : null,
      canArchive: blockers.length === 0,
      forceRequired: blockers.length > 0,
      blockers,
      warnings,
      summary: {
        itemCount: items.length,
        termTypeCandidateCount: candidateCounts.termTypeCandidateCount,
        valueCandidateCount: candidateCounts.valueCandidateCount,
        productNumber,
        docInfoSource,
        insertability: gate?.insertability ?? null,
        agentReadiness: gate?.agentReadiness ?? null,
      },
    };
  }

  async getArchiveDetail(archiveId: string | number | bigint) {
    const archive = await prisma.contractArchive.findUnique({ where: { id: BigInt(archiveId) } });
    if (!archive) throw new Error(`Archive not found: ${archiveId}`);
    const [items, versions] = await Promise.all([
      getArchiveItems(archive.id),
      this.listVersions(archive.id),
    ]);
    return mapArchiveDetail({ ...archive, items, versions: versions.items });
  }

  async getArchiveSnapshot(archiveId: string | number | bigint) {
    return buildArchiveSnapshot(BigInt(archiveId));
  }

  async patchArchive(params: {
    archiveId: string | number;
    changes: ContractArchivePatchChange[];
    editedBy?: string | null;
  }) {
    const archive = await prisma.contractArchive.findUnique({ where: { id: BigInt(params.archiveId) } });
    if (!archive) throw new Error(`Archive not found: ${params.archiveId}`);
    const snapshot = await buildArchiveSnapshot(archive.id);
    assertAllowedArchivePatchChanges(params.changes);
    assertAllowedArchivePatchChangesAgainstSnapshot(snapshot, params.changes);
    const changes = collapseArchivePatchArrayChanges(snapshot, params.changes);
    const nextArchiveJson = applyPatch(archive.archiveJson, changes);
    const columns = summarizeArchiveColumns(extractNormalizedExtraction(nextArchiveJson));
    const updated = await prisma.contractArchive.update({
      where: { id: archive.id },
      data: {
        archiveJson: toJson(nextArchiveJson),
        productNumber: columns.productNumber,
        contractNumber: columns.contractNumber,
        orderNumber: columns.orderNumber,
        customerId: columns.customerId,
        country: columns.country,
        orderDate: columns.orderDate,
        deliveryDate: columns.deliveryDate,
        docInfoJson: toJson(columns.docInfo),
        version: { increment: 1 },
        metadata: mergeMetadata(archive.metadata, {
          editedBy: params.editedBy,
          lastPatch: changes,
          productNumber: columns.productNumber,
          customerId: columns.customerId,
          contractNumber: columns.contractNumber,
          orderNumber: columns.orderNumber,
          docInfo: columns.docInfo,
        }),
      },
    });
    await createVersion(updated.id, updated.version, await buildArchiveSnapshot(updated.id), changes, params.editedBy);
    return this.getArchiveDetail(updated.id);
  }

  async listVersions(archiveId: string | number | bigint) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `select * from agent.contract_archive_versions
       where archive_id = $1::bigint order by version desc`,
      String(archiveId),
    );
    return { items: mapBigInts(rows) };
  }

  async getVersion(archiveId: string | number, version: string | number) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `select * from agent.contract_archive_versions
       where archive_id = $1::bigint and version = $2::int`,
      String(archiveId),
      Number(version),
    );
    if (!rows[0]) throw new Error(`Archive version not found: ${archiveId}/${version}`);
    return mapBigInts(rows[0]);
  }

  async replaceItemProductBindings(params: {
    archiveId: string | number;
    itemId: string | number;
    bindings: Array<Record<string, unknown>>;
    editedBy?: string | null;
  }) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `delete from agent.contract_archive_item_products
         where archive_id = $1::bigint and archive_item_id = $2::bigint`,
        String(params.archiveId),
        String(params.itemId),
      );
      for (const binding of params.bindings) {
        await tx.$executeRawUnsafe(
          `insert into agent.contract_archive_item_products
           (archive_id, archive_item_id, product_number, role, quantity, binding_source, confidence, evidence_json)
           values ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8::jsonb)`,
          String(params.archiveId),
          String(params.itemId),
          String(binding.productNumber ?? binding.product_number ?? ""),
          String(binding.role ?? "unknown"),
          binding.quantity === undefined || binding.quantity === null ? null : String(binding.quantity),
          String(binding.bindingSource ?? binding.binding_source ?? "manual"),
          binding.confidence === undefined || binding.confidence === null ? null : Number(binding.confidence),
          JSON.stringify(binding.evidence ?? {}),
        );
      }
    });
    const archive = await prisma.contractArchive.update({
      where: { id: BigInt(params.archiveId) },
      data: { version: { increment: 1 }, metadata: { editedBy: params.editedBy ?? null } },
    });
    await prisma.contractArchiveItem.updateMany({
      where: { id: BigInt(params.itemId), archiveId: BigInt(params.archiveId) },
      data: { productNumberStatus: params.bindings.length > 0 ? "bound" : "missing" },
    });
    await createVersion(archive.id, archive.version, await buildArchiveSnapshot(archive.id), [{ path: `/items/${params.itemId}/productBindings`, value: params.bindings }], params.editedBy);
    return this.getArchiveDetail(params.archiveId);
  }

  async refreshArchivesForDocument(params: {
    documentId: string | number;
    editedBy?: string | null;
  }) {
    const extraction = await prisma.extractionResult.findFirst({
      where: { documentId: BigInt(params.documentId), status: "normalized" },
      orderBy: { createdAt: "desc" },
    });
    if (!extraction?.normalizedExtractionJson) {
      return { updatedCount: 0, versionCount: 0, archiveIds: [], results: [] };
    }

    const archives = await prisma.contractArchive.findMany({
      where: { documentId: BigInt(params.documentId) },
      orderBy: { id: "asc" },
    });
    const results = [];
    for (const archive of archives) {
      const before = await buildArchiveSnapshot(archive.id);
      const columns = summarizeArchiveColumns(extraction.normalizedExtractionJson);
      const archiveJson = mergeArchiveExtraction(archive.archiveJson, extraction);
      const updated = await prisma.contractArchive.update({
        where: { id: archive.id },
        data: {
          extractionResultId: extraction.id,
          archiveJson: toJson(archiveJson),
          productNumber: columns.productNumber,
          contractNumber: columns.contractNumber,
          orderNumber: columns.orderNumber,
          customerId: columns.customerId,
          country: columns.country,
          orderDate: columns.orderDate,
          deliveryDate: columns.deliveryDate,
          docInfoJson: toJson(columns.docInfo),
          status: "archived",
          dirtyReason: null,
          dirtySourceRunId: null,
          dirtyDictionaryVersion: null,
          dirtyNormalizationRuleVersion: null,
          dirtyResolverVersion: null,
          version: { increment: 1 },
          metadata: mergeMetadata(archive.metadata, {
            productNumber: columns.productNumber,
            customerId: columns.customerId,
            contractNumber: columns.contractNumber,
            orderNumber: columns.orderNumber,
            docInfo: columns.docInfo,
          }),
        },
      });
      await createArchiveItemsFromExtraction({
        archiveId: updated.id,
        documentId: updated.documentId,
        extractionResultId: extraction.id,
        normalizedExtractionJson: extraction.normalizedExtractionJson,
      });
      const after = await buildArchiveSnapshot(updated.id);
      const version = await createVersion(
        updated.id,
        updated.version,
        after,
        [{ path: "dictionary_refresh", before, after }],
        params.editedBy ?? "system",
        "dictionary_dirty_refresh",
      );
      results.push({ archive: mapArchiveDetail(after), version });
    }
    return {
      updatedCount: results.length,
      versionCount: results.length,
      archiveIds: results.map((result) => result.archive.id),
      results,
    };
  }
}

export const contractArchiveService = new ContractArchiveService();

export async function createArchiveItemsFromExtraction(params: {
  archiveId: string | number | bigint;
  documentId?: string | number | bigint | null;
  extractionResultId?: string | number | bigint | null;
  normalizedExtractionJson: unknown;
  insertGate?: InsertGateResult;
}) {
  const items = summarizeArchiveItems(params.normalizedExtractionJson);
  const archiveColumns = summarizeArchiveColumns(params.normalizedExtractionJson);
  const insertGate = params.insertGate ?? buildAgentReadyInsertGate({ normalizedExtractionJson: params.normalizedExtractionJson });
  await prisma.$executeRawUnsafe(`delete from agent.contract_archive_item_products where archive_id = $1::bigint`, String(params.archiveId));
  await prisma.$executeRawUnsafe(`delete from agent.contract_archive_items where archive_id = $1::bigint`, String(params.archiveId));
  for (const item of items) {
    const gateItem = getGateItemResult(insertGate, item.itemIndex);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `insert into agent.contract_archive_items
       (archive_id, document_id, extraction_result_id, item_index, item_name, item_quantity,
        product_type_hint, product_type_raw_value, product_type_display_name,
        source_product_number, product_number_status, fields_json, warnings_json,
        confirmed_fields_json, unresolved_fields_json, agent_readiness_json,
        searchable_text, config_signature, similarity_features_json)
       values ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
               $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb)
       returning *`,
      String(params.archiveId),
      params.documentId === null || params.documentId === undefined ? null : String(params.documentId),
      params.extractionResultId === null || params.extractionResultId === undefined ? null : String(params.extractionResultId),
      item.itemIndex,
      item.itemName,
      item.itemQuantity,
      item.productTypeHint,
      item.productTypeRawValue,
      item.productTypeDisplayName,
      item.sourceProductNumber,
      item.productNumberStatus,
      JSON.stringify(item.fieldsJson ?? []),
      JSON.stringify(item.warningsJson ?? []),
      JSON.stringify(gateItem?.confirmedFields ?? {}),
      JSON.stringify(gateItem?.unresolvedFields ?? []),
      JSON.stringify(gateItem?.agentReadiness ?? {}),
      gateItem?.searchableText ?? null,
      gateItem?.configSignature ?? null,
      JSON.stringify(gateItem?.similarityFeatures ?? {}),
    );
    if (item.sourceProductNumber) {
      await prisma.$executeRawUnsafe(
        `insert into agent.contract_archive_item_products
         (archive_id, archive_item_id, product_number, role, quantity, binding_source, evidence_json)
         values ($1::bigint, $2::bigint, $3, 'primary', $4, $5, $6::jsonb)
         on conflict (archive_item_id, product_number) do update
           set quantity = excluded.quantity,
               binding_source = excluded.binding_source,
               evidence_json = excluded.evidence_json,
               updated_at = now()`,
        String(params.archiveId),
        String(rows[0].id),
        item.sourceProductNumber,
        item.itemQuantity,
        items.length > 1 ? "inherited" : "document",
        JSON.stringify({ docInfo: archiveColumns.docInfo.product_number ?? null }),
      );
    }
  }
}

export async function createArchiveVersionForCurrent(archiveId: string | number | bigint, editedBy?: string | null) {
  const archive = await prisma.contractArchive.findUnique({ where: { id: BigInt(archiveId) } });
  if (!archive) return null;
  return createVersion(archive.id, archive.version, await buildArchiveSnapshot(archive.id), [{ path: "/", value: "snapshot" }], editedBy);
}

async function getArchiveItems(archiveId: bigint) {
  const items = await prisma.$queryRawUnsafe<any[]>(
    `select * from agent.contract_archive_items where archive_id = $1::bigint order by item_index asc, id asc`,
    String(archiveId),
  );
  const bindings = await prisma.$queryRawUnsafe<any[]>(
    `select * from agent.contract_archive_item_products where archive_id = $1::bigint order by id asc`,
    String(archiveId),
  );
  const byItemId = new Map<string, any[]>();
  for (const binding of bindings) {
    const key = String(binding.archive_item_id);
    byItemId.set(key, [...(byItemId.get(key) ?? []), mapBigInts(binding)]);
  }
  return items.map((item) => ({
    ...mapArchiveItem(item),
    productBindings: byItemId.get(String(item.id)) ?? [],
  }));
}

async function createVersion(
  archiveId: bigint,
  version: number,
  snapshot: unknown,
  changes: unknown,
  editedBy?: string | null,
  editReason?: string | null,
) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `insert into agent.contract_archive_versions
     (archive_id, version, snapshot_json, change_summary_json, edited_by, edit_reason)
     values ($1::bigint, $2::int, $3::jsonb, $4::jsonb, $5, $6)
     on conflict (archive_id, version) do update
       set snapshot_json = excluded.snapshot_json,
           change_summary_json = excluded.change_summary_json,
           edited_by = excluded.edited_by,
           edit_reason = excluded.edit_reason
     returning *`,
    String(archiveId),
    version,
    JSON.stringify(snapshot ?? {}),
    JSON.stringify(changes ?? []),
    editedBy ?? null,
    editReason ?? null,
  );
  return mapBigInts(rows[0]);
}

function applyPatch(source: unknown, changes: ContractArchivePatchChange[]): unknown {
  const root = JSON.parse(JSON.stringify(source ?? {}));
  for (const change of changes) {
    if (!change.path.trim()) return change.value;
    writePath(root, change.path, change.value);
  }
  return root;
}

function mergeMetadata(existing: unknown, patch: Record<string, unknown>): any {
  return toJson({ ...(existing && typeof existing === "object" ? existing : {}), ...patch });
}

async function buildArchiveSnapshot(archiveId: bigint) {
  const archive = await prisma.contractArchive.findUnique({ where: { id: archiveId } });
  if (!archive) throw new Error(`Archive not found: ${archiveId}`);
  const items = await getArchiveItems(archive.id);
  return mapArchiveDetail({ ...archive, items });
}

function mapArchiveDetail(archive: any) {
  const mapped = mapBigInts(archive);
  return {
    ...mapped,
    extractionResultId: mapped.extractionResultId ?? null,
    productNumber: mapped.productNumber ?? null,
    contractNumber: mapped.contractNumber ?? null,
    orderNumber: mapped.orderNumber ?? null,
    customerId: mapped.customerId ?? null,
    docInfo: mapped.docInfoJson ?? {},
    currentVersion: mapped.version,
    boundItemCount: Array.isArray(mapped.items)
      ? mapped.items.filter((item: any) => Array.isArray(item.productBindings) && item.productBindings.length > 0).length
      : 0,
  };
}

function mapArchiveItem(item: any) {
  const mapped = mapBigInts(item);
  return {
    ...mapped,
    itemIndex: mapped.item_index ?? mapped.itemIndex,
    itemName: mapped.item_name ?? mapped.itemName,
    itemQuantity: mapped.item_quantity ?? mapped.itemQuantity,
    productTypeHint: mapped.product_type_hint ?? mapped.productTypeHint,
    productTypeRawValue: mapped.product_type_raw_value ?? mapped.productTypeRawValue,
    productTypeDisplayName: mapped.product_type_display_name ?? mapped.productTypeDisplayName,
    sourceProductNumber: mapped.source_product_number ?? mapped.sourceProductNumber,
    productNumberStatus: mapped.product_number_status ?? mapped.productNumberStatus,
    fieldsJson: mapped.fields_json ?? mapped.fieldsJson,
    warningsJson: mapped.warnings_json ?? mapped.warningsJson,
    confirmedFields: mapped.confirmed_fields_json ?? mapped.confirmedFieldsJson ?? mapped.confirmedFields ?? {},
    unresolvedFields: mapped.unresolved_fields_json ?? mapped.unresolvedFieldsJson ?? mapped.unresolvedFields ?? [],
    agentReadiness: mapped.agent_readiness_json ?? mapped.agentReadinessJson ?? mapped.agentReadiness ?? {},
    searchableText: mapped.searchable_text ?? mapped.searchableText ?? null,
    configSignature: mapped.config_signature ?? mapped.configSignature ?? null,
    similarityFeatures: mapped.similarity_features_json ?? mapped.similarityFeaturesJson ?? mapped.similarityFeatures ?? {},
  };
}

function extractNormalizedExtraction(archiveJson: unknown): unknown {
  const root = archiveJson && typeof archiveJson === "object" ? (archiveJson as any) : {};
  return root.extraction?.normalizedExtractionJson ?? root.normalizedExtractionJson ?? root;
}

function mergeArchiveExtraction(archiveJson: unknown, extraction: any) {
  const root = toJson(archiveJson ?? {});
  return {
    ...root,
    extraction: {
      ...(root.extraction && typeof root.extraction === "object" ? root.extraction : {}),
      ...mapBigInts(extraction),
    },
  };
}

async function countPendingCandidatesForExtraction(
  extractionId: bigint,
  dictionaryProposals: unknown,
  normalizedExtraction: unknown,
) {
  const occurrences = await prisma.dictionaryCandidateOccurrence.findMany({
    where: { extractionResultId: extractionId },
    select: { candidateId: true },
  });
  const candidateIds = [...new Set(occurrences.map((item) => item.candidateId).filter(Boolean))];
  if (candidateIds.length > 0) {
    const candidates = await prisma.dictionaryCandidate.findMany({
      where: { id: { in: candidateIds }, status: "pending" },
      select: { evidence: true },
    });
    let termTypeCandidateCount = 0;
    let valueCandidateCount = 0;
    for (const candidate of candidates) {
      if (objectRecord(candidate.evidence).candidateType === "term_type") termTypeCandidateCount += 1;
      else valueCandidateCount += 1;
    }
    return { termTypeCandidateCount, valueCandidateCount };
  }
  return {
    termTypeCandidateCount: summaryNumber(dictionaryProposals, normalizedExtraction, "term_type_candidate_count"),
    valueCandidateCount: summaryNumber(dictionaryProposals, normalizedExtraction, "value_candidate_count"),
  };
}

function summaryNumber(dictionaryProposals: unknown, normalizedExtraction: unknown, key: string): number {
  const value = objectRecord(objectRecord(dictionaryProposals).summary)[key] ?? objectRecord(objectRecord(normalizedExtraction).summary)[key] ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getDocInfoWithSource(extraction: any): {
  docInfo: Record<string, unknown>;
  source: "normalized_extraction_json" | "llm_plan_json" | "none";
} {
  const normalized = objectRecord(extraction?.normalizedExtractionJson);
  const plan = objectRecord(extraction?.llmPlanJson);
  if (isNonEmptyRecord(normalized.document_info)) {
    return { docInfo: normalizeDocInfo(normalized.document_info), source: "normalized_extraction_json" };
  }
  if (isNonEmptyRecord(plan.document_info)) {
    return { docInfo: normalizeDocInfo(plan.document_info), source: "llm_plan_json" };
  }
  return { docInfo: {}, source: "none" };
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function mapBigInts(value: any): any {
  if (Array.isArray(value)) return value.map(mapBigInts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "bigint" ? Number(item) : item instanceof Date ? item.toISOString() : mapBigInts(item),
    ]),
  );
}
