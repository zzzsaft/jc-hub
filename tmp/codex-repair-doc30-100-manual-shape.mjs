import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc30_100_manual_shape_repair_20260708";
const manualDocumentIds = [30, 31, 32, 33, 34, 35, 36, 37, 40, 45, 48, 49, 55, 56, 57, 59, 61, 62, 63, 64, 65, 66, 68, 69, 71, 73, 76, 79, 85, 86, 87, 89, 93, 94, 95, 97, 98, 100];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

const result = { repaired: [], refreshRuns: [], archive97: null };
try {
  for (const documentId of manualDocumentIds) {
    result.repaired.push(await repairDocument(documentId));
  }
  for (const documentId of manualDocumentIds) {
    result.refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({
        documentId: String(documentId),
        source: reviewedBy,
      }),
    });
  }
  const existing97 = await prisma.contractArchive.findFirst({ where: { documentId: BigInt(97) } });
  if (existing97) {
    result.archive97 = { skipped: true, archiveId: String(existing97.id) };
  } else {
    const archived = await productConfigAgentService.archiveDocument({ documentId: "97", createdBy: reviewedBy });
    result.archive97 = { skipped: false, archiveId: String(archived.id ?? archived.archive?.id) };
  }
  fs.writeFileSync("tmp/codex-doc30-100-manual-shape-repair-result.json", JSON.stringify(toJson(result), null, 2));
  console.log(JSON.stringify(toJson({
    repaired: result.repaired.map((item) => ({ documentId: item.documentId, createdExtractionResultId: item.createdExtractionResultId, itemCount: item.itemCount })),
    refreshFailed: result.refreshRuns.filter((item) => item.result.failedCount > 0),
    archive97: result.archive97,
  }), null, 2));
} finally {
  await prisma.$disconnect();
}

async function repairDocument(documentId) {
  const latest = await prisma.extractionResult.findFirst({
    where: { documentId: BigInt(documentId) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!latest) throw new Error(`Missing latest extraction for ${documentId}`);
  const extractionJson = clone(latest.extractionJson);
  const root = extractionJson.extraction && typeof extractionJson.extraction === "object"
    ? extractionJson.extraction
    : (extractionJson.extraction = {});
  if (!Array.isArray(root.items) || root.items.length === 0) {
    root.items = Array.isArray(extractionJson.items) ? extractionJson.items : [];
  }
  root.document_info = {
    ...(extractionJson.document_info && typeof extractionJson.document_info === "object" ? extractionJson.document_info : {}),
    ...(root.document_info && typeof root.document_info === "object" ? root.document_info : {}),
  };
  const normalized = await normalizeExtractionWithDictionary(extractionJson);
  const created = await prisma.extractionResult.create({
    data: {
      documentId: BigInt(documentId),
      extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals ?? {},
      warnings: [
        ...array(latest.warnings),
        {
          type: "codex_manual_shape_repair",
          source: reviewedBy,
          documentId,
          basedOnExtractionResultId: String(latest.id),
          businessLlmCalled: false,
        },
      ],
      llmPlanJson: {
        source: "codex_manual_blocks_read",
        repair: "copy_top_level_items_to_extraction_items",
        businessLlmCalled: false,
        basedOnExtractionResultId: String(latest.id),
      },
      llmModel: "codex-manual-correction",
      promptVersion: "codex-manual-shape-repair-20260708",
      dictionaryVersion: latest.dictionaryVersion,
      status: "normalized",
    },
  });
  await prisma.productDocument.update({
    where: { id: BigInt(documentId) },
    data: { status: "normalized", dictionaryDirty: true },
  });
  return { documentId, basedOnExtractionResultId: String(latest.id), createdExtractionResultId: String(created.id), itemCount: normalized.items?.length ?? 0 };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
