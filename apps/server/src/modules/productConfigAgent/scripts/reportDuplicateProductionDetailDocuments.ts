import "../../../config/env.js";
import { prisma } from "../../../lib/prisma.js";
import { buildDuplicateDocumentReport } from "../workflow/documentDuplicateAnalysis.js";
import { productConfigAgentRepository } from "../db.service.js";

const documents = await prisma.productDocument.findMany({ orderBy: { id: "asc" } });
const blocks = await prisma.documentBlock.findMany();
const blockByDocumentId = new Map(blocks.map((block) => [String(block.documentId), block]));
const report = buildDuplicateDocumentReport(
  documents.map((document) => {
    const block = blockByDocumentId.get(String(document.id));
    return {
      documentId: Number(document.id),
      fileName: document.fileName,
      fileHash: document.fileHash,
      filePath: document.filePath,
      status: document.status,
      createdAt: document.createdAt,
      blocksId: block ? Number(block.id) : null,
      blocksJson: block?.blocksJson,
    };
  }),
);
if (process.argv.includes("--apply")) {
  for (const group of report) {
    for (const mapping of group.duplicateMappings) {
      await productConfigAgentRepository.recordDuplicate(
        mapping.duplicateDocumentId,
        mapping.canonicalDocumentId,
        mapping.reason,
        1,
        { contentHash: mapping.contentHash },
      );
    }
  }
}
console.log(JSON.stringify(report, null, 2));
