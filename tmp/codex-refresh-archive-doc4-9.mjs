import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const documentIds = [4, 6, 7, 8, 9];
const before = await snapshot();
const runs = [];

for (const documentId of documentIds) {
  runs.push(await productConfigAgentService.runDictionaryDirtyRefresh({
    documentId: String(documentId),
    source: "codex_doc4_9_archive_refresh_20260708",
  }));
}

const after = await snapshot();
const report = { before, runs, after };
fs.writeFileSync("tmp/codex-doc4-9-archive-refresh-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(summarize(report)), null, 2));

await prisma.$disconnect();

async function snapshot() {
  const ids = documentIds.map(BigInt);
  const docs = await prisma.productDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const latestExtractions = await Promise.all(documentIds.map(async (documentId) => {
    const row = await prisma.extractionResult.findFirst({
      where: { documentId: BigInt(documentId) },
      select: { id: true, documentId: true, status: true, promptVersion: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return row;
  }));
  const archives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids } },
    select: { id: true, documentId: true, extractionResultId: true, status: true, dirtyReason: true, version: true, updatedAt: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const items = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: ids } },
    _count: { _all: true },
  });
  return { docs, latestExtractions, archives, items };
}

function summarize(report) {
  return {
    beforeDirty: report.before.docs.map((item) => [item.id, item.dictionaryDirty]),
    afterDirty: report.after.docs.map((item) => [item.id, item.dictionaryDirty]),
    runs: report.runs.map((run, index) => ({
      documentId: documentIds[index],
      successCount: run.successCount,
      failedCount: run.failedCount,
      archiveIds: run.progress?.[0]?.archiveIds,
      archiveUpdatedCount: run.progress?.[0]?.archiveUpdatedCount,
      refreshedExtractionResultId: run.progress?.[0]?.refreshedExtractionResultId,
      error: run.progress?.[0]?.error,
    })),
    archives: report.after.archives.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      extractionResultId: item.extractionResultId,
      status: item.status,
      dirtyReason: item.dirtyReason,
      version: item.version,
    })),
    itemCounts: report.after.items.map((item) => ({
      documentId: item.documentId,
      archiveId: item.archiveId,
      count: item._count._all,
    })),
  };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
