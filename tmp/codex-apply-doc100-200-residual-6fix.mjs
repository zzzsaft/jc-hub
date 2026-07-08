import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc100_200_residual_6fix_20260708";
const docs = Array.from({ length: 101 }, (_, index) => index + 100);
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentRepository } = await import("../apps/server/src/modules/productConfigAgent/db.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeAlias, dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");

const startedAt = new Date();

try {
  const beforeLatest = await latestExtractionIds();
  const termResults = [
    await productConfigAgentRepository.upsertValue({
      termType: "wiring_method",
      canonicalValue: "customer_drawing_wiring",
      displayName: "按客户提供的图纸接线",
      description: "按客户提供的图纸进行接线",
    }),
  ];
  const aliasResults = [];
  for (const alias of [
    ["product_material", "1.2311_Forged", "1.2311A"],
    ["feed_inlet_method", "other_feed_shape_or_position", "形状或不同位置进料"],
    ["extrusion_fine_adjustment_direction", "downward", "45°挤出微调朝下"],
    ["lip_adjustment_method", "integral_structure", "整体结构"],
    ["lip_adjustment_method", "force_reduction_push_pull_mechanism", "手动减力推、拉式微调"],
    ["lip_adjustment_method", "quick_opening", "配快速开口装置"],
    [
      "wiring_method",
      "fully_enclosed_guarded_wiring",
      "带护罩全封闭接线（接线端采用铜螺栓，螺母及垫片，联结导线插头处要焊接牢固，焊后检查短路情况）",
    ],
    ["wiring_method", "customer_drawing_wiring", "按客户提供的图纸接线"],
  ]) {
    aliasResults.push(await upsertAlias(...alias));
  }

  dictionaryMatcherService.invalidate();

  const refreshRuns = [];
  for (const documentId of docs) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }

  const checks = await runChecks();
  const afterLatest = await latestExtractionIds();
  console.log(json({
    reviewedBy,
    termCount: termResults.length,
    aliasCount: aliasResults.length,
    beforeLatest: sampleLatest(beforeLatest),
    afterLatest: sampleLatest(afterLatest),
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
    },
    checks,
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

async function upsertAlias(termType, canonicalValue, aliasValue) {
  const term = await prisma.dictionaryTerm.findUnique({ where: { termType_canonicalValue: { termType, canonicalValue } } });
  if (!term) throw new Error(`Missing canonical term ${termType}:${canonicalValue}`);
  const normalizedAlias = normalizeAlias(aliasValue);
  const before = await prisma.dictionaryAlias.findUnique({ where: { termType_normalizedAlias: { termType, normalizedAlias } } });
  const row = await prisma.dictionaryAlias.upsert({
    where: { termType_normalizedAlias: { termType, normalizedAlias } },
    create: { termId: term.id, termType, aliasValue, normalizedAlias, source: reviewedBy, isActive: true },
    update: { termId: term.id, aliasValue, source: reviewedBy, isActive: true },
  });
  await productConfigAgentRepository.bumpDictionaryVersion("upsert_value_alias", "value_alias", String(row.id), row, before, reviewedBy);
  return row;
}

async function latestExtractionIds() {
  const rows = await prisma.$queryRaw`
    select d.id as "documentId", er.id as "extractionResultId"
    from production_config_agent.documents d
    join lateral (
      select id
      from production_config_agent.extraction_results er
      where er.document_id = d.id
      order by er.created_at desc, er.id desc
      limit 1
    ) er on true
    where d.id between 100 and 200
    order by d.id asc
  `;
  return rows.map((row) => ({ documentId: Number(row.documentId), extractionResultId: Number(row.extractionResultId) }));
}

function sampleLatest(rows) {
  return {
    first: rows.slice(0, 3),
    last: rows.slice(-3),
  };
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
  const archiveItems = await prisma.$queryRaw`
    select count(*)::int as count
    from production_config_agent.contract_archive_items
    where document_id between 100 and 200
  `;
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return {
    duplicateArchiveCount: duplicateArchives.length,
    uniqueIndexPresent: indexRows.length === 1,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    archiveItemCount: archiveItems[0]?.count ?? 0,
    llmCallsSinceStart,
  };
}
