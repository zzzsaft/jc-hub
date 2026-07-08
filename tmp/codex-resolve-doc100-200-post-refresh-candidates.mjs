import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc100_200_residual_candidates_20260708";
const docs = Array.from({ length: 101 }, (_, index) => index + 100);
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentRepository } = await import("../apps/server/src/modules/productConfigAgent/db.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { dictionaryGovernanceService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/governance.service.ts");
const { normalizeAlias, dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");

const startedAt = new Date();

try {
  const valueResults = [
    await productConfigAgentRepository.upsertValue({ termType: "lip_adjustment_method", canonicalValue: "手动", displayName: "手动" }),
    await productConfigAgentRepository.upsertValue({ termType: "lip_adjustment_method", canonicalValue: "自动", displayName: "自动" }),
  ];
  const aliasResults = [
    await upsertAlias("lip_adjustment_method", "manual_push_fine_adjustment", "上模手动推式微调"),
    await upsertAlias("lip_adjustment_method", "quick_opening", "下模配快速开口装置"),
  ];

  dictionaryMatcherService.invalidate();

  const refreshRuns = [];
  for (const documentId of docs) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }

  const pending = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { in: docs.map(BigInt) }, status: "pending" },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const reviews = [];
  for (const candidate of pending) {
    const action = reviewAction(candidate);
    reviews.push({
      candidateId: candidate.id,
      termType: candidate.termType,
      rawValue: candidate.rawValue,
      action,
      result: await dictionaryGovernanceService.reviewCandidate({
        candidateId: candidate.id,
        action,
        reviewedBy,
      }),
    });
  }

  const checks = await runChecks();
  console.log(json({
    valueCount: valueResults.length,
    aliasCount: aliasResults.length,
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
    },
    reviewedCandidateCount: reviews.length,
    reviewedCandidates: reviews.map((item) => ({
      candidateId: item.candidateId,
      termType: item.termType,
      rawValue: item.rawValue,
      action: item.action,
    })),
    checks,
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

async function upsertAlias(termType, canonicalValue, aliasValue) {
  const term = await prisma.dictionaryTerm.findUnique({ where: { termType_canonicalValue: { termType, canonicalValue } } });
  if (!term) throw new Error(`Missing canonical term ${termType}:${canonicalValue}`);
  const before = await prisma.dictionaryAlias.findUnique({
    where: { termType_normalizedAlias: { termType, normalizedAlias: normalizeAlias(aliasValue) } },
  });
  const row = await prisma.dictionaryAlias.upsert({
    where: { termType_normalizedAlias: { termType, normalizedAlias: normalizeAlias(aliasValue) } },
    create: {
      termId: term.id,
      termType,
      aliasValue,
      normalizedAlias: normalizeAlias(aliasValue),
      source: reviewedBy,
      isActive: true,
    },
    update: {
      termId: term.id,
      aliasValue,
      source: reviewedBy,
      isActive: true,
    },
  });
  await productConfigAgentRepository.bumpDictionaryVersion("upsert_value_alias", "value_alias", String(row.id), row, before, reviewedBy);
  return row;
}

function reviewAction(candidate) {
  const raw = String(candidate.rawValue ?? "");
  if (/^(?:形状|进料口|.*图纸.*签名|.*螺纹套.*|.*检查短路.*)$/u.test(raw)) return "reject";
  if (/；|;|\n|，|,|（.*mm|特殊：|客户|要求|范围|装置|护罩|航空插头/u.test(raw)) return "needs-human-review";
  return "reject";
}

async function runChecks() {
  const duplicateArchives = await prisma.$queryRawUnsafe(`
    select document_id, count(*)::int as count
    from production_config_agent.contract_archives
    where document_id is not null
    group by document_id
    having count(*) > 1
    order by document_id
  `);
  const indexRows = await prisma.$queryRawUnsafe(`
    select indexname
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: docs.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, dictionaryDirty: true },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: docs.map(BigInt) }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true },
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { in: docs.map(BigInt) }, status: "pending" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return {
    duplicateArchiveCount: duplicateArchives.length,
    uniqueIndexPresent: indexRows.length === 1,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    llmCallsSinceStart,
  };
}
