import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { doc9ManualExtraction } = await import("./codex-doc9-manual-correction.mjs");
const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { normalizeExtractionWithDictionary } = await import("../apps/server/build/modules/productConfigAgent/normalization/index.js");
const { summarizeArchiveColumns } = await import("../apps/server/build/modules/productConfigAgent/archive/archiveFields.js");
const {
  createArchiveItemsFromExtraction,
  createArchiveVersionForCurrent,
} = await import("../apps/server/build/modules/productConfigAgent/archive/archive.service.js");

const documentId = 9n;
const archiveId = 154n;
const duplicateArchiveId = 206n;
const editedBy = "codex_doc9_manual_blocks_correction_20260708";

const before = await snapshot();
const normalized = await normalizeExtractionWithDictionary(doc9ManualExtraction);
const extraction = await prisma.extractionResult.create({
  data: {
    documentId,
    extractionJson: doc9ManualExtraction.extraction,
    normalizedExtractionJson: normalized,
    dictionaryProposals: normalized.dictionaryProposals ?? {},
    warnings: doc9ManualExtraction.warnings,
    llmPlanJson: { source: "codex_manual_blocks_read", businessLlmCalled: false },
    llmModel: "codex-manual-correction",
    promptVersion: "codex-manual-blocks-correction-20260708",
    status: "normalized",
  },
});

const archive = await prisma.contractArchive.findUnique({ where: { id: archiveId } });
if (!archive) throw new Error(`Archive not found: ${archiveId}`);
const columns = summarizeArchiveColumns(normalized);
const updatedArchive = await prisma.contractArchive.update({
  where: { id: archiveId },
  data: {
    extractionResultId: extraction.id,
    archiveJson: mergeArchiveExtraction(archive.archiveJson, extraction, normalized),
    productNumber: columns.productNumber,
    contractNumber: columns.contractNumber,
    orderNumber: columns.orderNumber,
    customerId: columns.customerId,
    country: columns.country,
    orderDate: columns.orderDate,
    deliveryDate: columns.deliveryDate,
    docInfoJson: columns.docInfo,
    status: "archived",
    dirtyReason: null,
    dirtySourceRunId: null,
    dirtyDictionaryVersion: null,
    dirtyNormalizationRuleVersion: null,
    dirtyResolverVersion: null,
    version: { increment: 1 },
    metadata: {
      ...(archive.metadata && typeof archive.metadata === "object" ? archive.metadata : {}),
      editedBy,
      manualCorrection: true,
      manualCorrectionSource: "document_blocks",
      productNumber: columns.productNumber,
      customerId: columns.customerId,
      contractNumber: columns.contractNumber,
      orderNumber: columns.orderNumber,
      docInfo: columns.docInfo,
    },
  },
});
await createArchiveItemsFromExtraction({
  archiveId,
  documentId,
  extractionResultId: extraction.id,
  normalizedExtractionJson: normalized,
});
const archiveVersion = await createArchiveVersionForCurrent(archiveId, editedBy);

await prisma.contractArchive.update({
  where: { id: duplicateArchiveId },
  data: { dirtyReason: "duplicate_archive_not_refreshed_after_doc9_manual_correction" },
});
await prisma.productDocument.update({
  where: { id: documentId },
  data: { dictionaryDirty: false },
});

const after = await snapshot();
const report = { editedBy, extraction, updatedArchive, archiveVersion, before, after };
fs.writeFileSync("tmp/codex-doc9-manual-correction-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(summarize(report)), null, 2));
await prisma.$disconnect();

async function snapshot() {
  const [document, archives, items, products] = await Promise.all([
    prisma.productDocument.findUnique({
      where: { id: documentId },
      select: { id: true, status: true, dictionaryDirty: true },
    }),
    prisma.contractArchive.findMany({
      where: { id: { in: [archiveId, duplicateArchiveId] } },
      orderBy: { id: "asc" },
    }),
    prisma.contractArchiveItem.findMany({
      where: { archiveId: { in: [archiveId, duplicateArchiveId] } },
      orderBy: [{ archiveId: "asc" }, { itemIndex: "asc" }],
    }),
    prisma.contractArchiveItemProduct.findMany({
      where: { archiveId: { in: [archiveId, duplicateArchiveId] } },
      orderBy: [{ archiveId: "asc" }, { id: "asc" }],
    }),
  ]);
  return { document, archives, items, products };
}

function mergeArchiveExtraction(archiveJson, extraction, normalizedExtractionJson) {
  return {
    ...(archiveJson && typeof archiveJson === "object" ? archiveJson : {}),
    extraction: {
      id: String(extraction.id),
      documentId: String(extraction.documentId),
      extractionJson: doc9ManualExtraction.extraction,
      normalizedExtractionJson,
      dictionaryProposals: normalizedExtractionJson.dictionaryProposals ?? {},
      warnings: doc9ManualExtraction.warnings,
      llmModel: extraction.llmModel,
      promptVersion: extraction.promptVersion,
      status: extraction.status,
    },
  };
}

function summarize(report) {
  return {
    extractionId: report.extraction.id,
    archiveId: report.updatedArchive.id,
    archiveVersion: report.updatedArchive.version,
    archiveVersionRow: report.archiveVersion?.id ?? null,
    beforeItemCount: report.before.items.filter((item) => item.archiveId === archiveId).length,
    afterItemCount: report.after.items.filter((item) => item.archiveId === archiveId).length,
    afterDocument: report.after.document,
    afterArchives: report.after.archives.map((item) => ({
      id: item.id,
      extractionResultId: item.extractionResultId,
      dirtyReason: item.dirtyReason,
      productNumber: item.productNumber,
      contractNumber: item.contractNumber,
      customerId: item.customerId,
      country: item.country,
      version: item.version,
    })),
    afterItems: report.after.items.map((item) => ({
      archiveId: item.archiveId,
      itemIndex: item.itemIndex,
      itemName: item.itemName,
      itemQuantity: item.itemQuantity,
      productTypeHint: item.productTypeHint,
      productNumberStatus: item.productNumberStatus,
      confirmedCount: Object.keys(item.confirmedFieldsJson ?? {}).length,
      unresolvedCount: Array.isArray(item.unresolvedFieldsJson) ? item.unresolvedFieldsJson.length : 0,
    })),
  };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
