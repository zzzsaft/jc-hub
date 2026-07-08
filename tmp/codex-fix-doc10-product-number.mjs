import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { normalizeExtractionWithDictionary } = await import("../apps/server/build/modules/productConfigAgent/normalization/index.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const documentId = 10n;
const source = "codex_doc10_product_number_restore_20260708";
const latest = await prisma.extractionResult.findFirst({
  where: { documentId },
  orderBy: { createdAt: "desc" },
});
if (!latest) throw new Error("Missing latest extraction for doc 10");

const extractionJson = JSON.parse(JSON.stringify(latest.extractionJson ?? {}));
const root = extractionJson.extraction && typeof extractionJson.extraction === "object" ? extractionJson.extraction : extractionJson;
root.document_info = {
  ...(root.document_info ?? {}),
  product_number: "2018-371-E & 2018-372-E & 2018-373-E",
};
const normalized = await normalizeExtractionWithDictionary(extractionJson);
const created = await prisma.extractionResult.create({
  data: {
    documentId,
    extractionJson,
    normalizedExtractionJson: normalized,
    dictionaryProposals: normalized.dictionaryProposals ?? {},
    warnings: [
      ...(Array.isArray(latest.warnings) ? latest.warnings : []),
      { type: "codex_manual_docinfo_correction", source, basedOnExtractionResultId: String(latest.id) },
    ],
    llmPlanJson: { source: "codex_manual_blocks_and_filename_read", businessLlmCalled: false, basedOnExtractionResultId: String(latest.id) },
    llmModel: "codex-manual-correction",
    promptVersion: "codex-doc10-product-number-20260708",
    dictionaryVersion: latest.dictionaryVersion,
    status: "normalized",
  },
});
await prisma.productDocument.update({ where: { id: documentId }, data: { dictionaryDirty: true } });
const refresh = await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: "10", source });
const archive = await prisma.contractArchive.findFirst({
  where: { documentId },
  select: { id: true, documentId: true, extractionResultId: true, productNumber: true, contractNumber: true, customerId: true, country: true, dirtyReason: true },
});
const report = { createdExtractionResultId: String(created.id), refresh, archive, businessLlmTokens: 0 };
fs.writeFileSync("tmp/codex-doc10-product-number-fix-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(report), null, 2));
await prisma.$disconnect();

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
