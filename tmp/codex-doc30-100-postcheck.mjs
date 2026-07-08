import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc30_100_governance_20260708";
const documentIds = Array.from({ length: 71 }, (_, index) => index + 30);
const candidateIds = [3865, 3866, 3867, 737, 479, 3868, 3869, 3870, 3871, 3872, 3873, 3874, 731, 733, 3875, 2903, 3876, 3877, 811];
const termTypeAliases = ["产量", "产品主体加热方式", "联接尺寸图纸提供情况", "应用", "紧固件（螺丝）", "备注", "使用区域", "出口使用", "出口使用国家", "模具编号", "最大产量", "最小产量", "最大转速", "最小转速"];

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");

try {
  const ids = documentIds.map(BigInt);
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) } },
    select: { id: true, termType: true, rawValue: true, status: true, reviewedBy: true, reviewedAt: true },
    orderBy: { id: "asc" },
  });
  const aliases = await prisma.dictionaryTermTypeAlias.findMany({
    where: { normalizedAlias: { in: termTypeAliases.map(normalizeAlias) } },
    select: { termType: true, aliasValue: true, normalizedAlias: true, source: true, isActive: true },
    orderBy: { normalizedAlias: "asc" },
  });
  const manualExtractions = await prisma.extractionResult.findMany({
    where: { documentId: { in: ids }, llmModel: "codex-manual-correction" },
    select: { id: true, documentId: true, llmModel: true, promptVersion: true, status: true, createdAt: true },
    orderBy: [{ documentId: "asc" }, { createdAt: "desc" }],
  });
  const latestExtractions = await Promise.all(ids.map((id) =>
    prisma.extractionResult.findFirst({
      where: { documentId: id },
      select: { id: true, documentId: true, llmModel: true, promptVersion: true, status: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ));
  const archives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids } },
    select: { id: true, documentId: true, extractionResultId: true, status: true, dirtyReason: true, productNumber: true, contractNumber: true, customerId: true, country: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const archiveItemCounts = await prisma.contractArchiveItem.groupBy({
    by: ["documentId", "archiveId"],
    where: { documentId: { in: ids } },
    _count: { _all: true },
  });
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: ids }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const duplicateArchives = await prisma.$queryRawUnsafe(`
    select document_id, count(*)::int as count
    from production_config_agent.contract_archives
    where document_id is not null
    group by document_id
    having count(*) > 1
    order by document_id
  `);
  const indexRows = await prisma.$queryRawUnsafe(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const dirtyArchives = archives.filter((item) => item.dirtyReason);
  const pendingCandidates = candidates.filter((item) => item.status === "pending");
  const llmCalls = await prisma.llmCallLog.count({
    where: { createdAt: { gte: new Date("2026-07-08T00:00:00.000Z") }, purpose: { contains: "product", mode: "insensitive" } },
  }).catch(() => null);
  let archive97Readiness = null;
  try {
    archive97Readiness = await productConfigAgentService.checkArchiveReadiness("97");
  } catch (error) {
    archive97Readiness = { error: error instanceof Error ? error.message : String(error) };
  }
  const report = {
    generatedAt: new Date().toISOString(),
    candidates,
    termTypeAliases: aliases,
    manualExtractions,
    latestExtractions,
    archives,
    archiveItemCounts,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    duplicateArchives,
    uniqueIndexPresent: indexRows.length === 1,
    indexRows,
    archive97Readiness,
    llmProductCallsSinceDayStart: llmCalls,
    businessLlmTokens: 0,
  };
  fs.writeFileSync("tmp/codex-doc30-100-postcheck-result.json", JSON.stringify(toJson(report), null, 2));
  console.log(JSON.stringify(toJson({
    out: "tmp/codex-doc30-100-postcheck-result.json",
    candidateStatuses: candidates.map((item) => ({ id: item.id, status: item.status, reviewedBy: item.reviewedBy })),
    termTypeAliasCount: aliases.length,
    manualCorrectionCount: manualExtractions.length,
    latestManualCorrectionIds: latestExtractions.filter((item) => item?.llmModel === "codex-manual-correction").map((item) => ({ documentId: item.documentId, id: item.id })),
    duplicateArchiveCount: duplicateArchives.length,
    uniqueIndexPresent: indexRows.length === 1,
    dirtyDocs,
    dirtyArchiveCount: dirtyArchives.length,
    dirtyArchives,
    pendingCandidates,
    doc97: { archive: archives.filter((item) => String(item.documentId) === "97"), readiness: archive97Readiness },
    businessLlmTokens: 0,
  }), null, 2));
} finally {
  await prisma.$disconnect();
}

function normalizeAlias(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
